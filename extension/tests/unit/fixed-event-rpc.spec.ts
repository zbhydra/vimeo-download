/**
 * 固定 EventRpc 通道单元测试。
 *
 * 覆盖不可信 DOM transport 的原始大小限制、基础 frame 校验和 handler 自有键白名单。
 */

import { describe, expect, it, vi } from 'vitest'
import {
  RPC_EVENT_FRAME_OVERHEAD_LIMIT,
  RPC_EVENT_RESPONSE_FRAME_LIMIT,
  RPC_PROTOCOL_VERSION,
  createRpcRequestEventName,
  createRpcResponseEventName
} from '@/core/rpc/constants'
import { serve } from '@/core/rpc/serve'
import { EventRpcTransport } from '@/core/rpc/transports/EventRpcTransport'
import type {
  JsonObject,
  JsonValue,
  RpcEventDom,
  RpcResponse,
  ServeOptions
} from '@/core/rpc/types'

describe('fixed EventRpc', () => {
  it('通过唯一固定事件名完成 request-response', async () => {
    const eventDom = createEventDom()
    const handler = vi.fn((_params: JsonValue | undefined) => ({ ok: true }))
    const registration = serve('injected', { ping: handler }, createServeOptions(eventDom))
    const transport = new EventRpcTransport('injected', { eventDom, timeout: 1000 })

    try {
      await expect(transport.call<JsonValue>('ping')).resolves.toEqual({ ok: true })
      expect(handler).toHaveBeenCalledOnce()
      expect(createRpcRequestEventName('injected')).toBe('__vdl_rpc_request__:injected')
      expect(createRpcResponseEventName('injected')).toBe('__vdl_rpc_response__:injected')
    } finally {
      transport.destroy()
      registration.stop()
    }
  })

  it('销毁 transport 时拒绝 pending 请求', async () => {
    const eventDom = createEventDom()
    const transport = new EventRpcTransport('injected', { eventDom, timeout: 1000 })
    const pending = transport.call<JsonValue>('missing')

    transport.destroy()

    await expect(pending).rejects.toMatchObject({ code: 'TRANSPORT_DESTROYED' })
  })

  it('停止 provider 后固定 request listener 已移除', async () => {
    const eventDom = createEventDom()
    const handler = vi.fn(() => ({ ok: true }))
    const registration = serve('injected', { ping: handler }, createServeOptions(eventDom))
    const transport = new EventRpcTransport('injected', { eventDom, timeout: 20 })

    registration.stop()

    try {
      await expect(transport.call<JsonValue>('ping')).rejects.toMatchObject({ code: 'TIMEOUT' })
      expect(handler).not.toHaveBeenCalled()
    } finally {
      transport.destroy()
    }
  })

  it('在 JSON.parse 前丢弃超大 request frame', async () => {
    const eventDom = createEventDom()
    const handler = vi.fn(() => ({ ok: true }))
    const registration = serve(
      'injected',
      { ping: handler },
      createServeOptions(eventDom, { ping: 8 })
    )
    const parseSpy = vi.spyOn(JSON, 'parse')

    try {
      dispatchDetail(
        eventDom,
        createRpcRequestEventName('injected'),
        'x'.repeat(RPC_EVENT_FRAME_OVERHEAD_LIMIT + 9)
      )
      await settleEventHandler()

      expect(parseSpy).not.toHaveBeenCalled()
      expect(handler).not.toHaveBeenCalled()
    } finally {
      parseSpy.mockRestore()
      registration.stop()
    }
  })

  it.each([
    ['malformed JSON', '{'],
    ['null', 'null'],
    ['array', '[]'],
    ['wrong protocol', createRequestText({ protocolVersion: 1 })],
    ['wrong channel', createRequestText({ channel: 'content' })],
    ['empty id', createRequestText({ id: '' })],
    ['numeric id', createRequestText({ id: 1 })],
    ['empty method', createRequestText({ method: '' })],
    ['numeric method', createRequestText({ method: 1 })]
  ])('非法基础 frame 不执行 handler: %s', async (_caseName, detail) => {
    const eventDom = createEventDom()
    const handler = vi.fn(() => ({ ok: true }))
    const registration = serve('injected', { ping: handler }, createServeOptions(eventDom))

    try {
      dispatchDetail(eventDom, createRpcRequestEventName('injected'), detail)
      await settleEventHandler()
      expect(handler).not.toHaveBeenCalled()
    } finally {
      registration.stop()
    }
  })

  it('只允许调用 handler 的自有键', async () => {
    const eventDom = createEventDom()
    const handler = vi.fn(() => ({ ok: true }))
    const registration = serve('injected', { ping: handler }, createServeOptions(eventDom))

    try {
      const response = await dispatchRequest(eventDom, createRequestText({ method: 'toString' }))
      expect(response).toMatchObject({ success: false, code: 'METHOD_NOT_FOUND' })
      expect(handler).not.toHaveBeenCalled()
    } finally {
      registration.stop()
    }
  })

  it('基础 frame 通过后再应用 method-specific params 上限', async () => {
    const eventDom = createEventDom()
    const handler = vi.fn(() => ({ ok: true }))
    const registration = serve(
      'injected',
      { ping: handler },
      createServeOptions(eventDom, { ping: 8 })
    )

    try {
      const response = await dispatchRequest(
        eventDom,
        createRequestText({ params: { value: '123456789' } })
      )
      expect(response).toMatchObject({ success: false, code: 'PAYLOAD_TOO_LARGE' })
      expect(handler).not.toHaveBeenCalled()
    } finally {
      registration.stop()
    }
  })

  it('Event handler 异常只返回固定 SERVER_ERROR，不泄露本地 sentinel', async () => {
    const eventDom = createEventDom()
    const sentinel = 'secret-token=https://private.example/payload'
    const errorSpy = vi.mocked(console.error)
    errorSpy.mockClear()
    const registration = serve(
      'injected',
      {
        ping() {
          throw new Error(`[InjectedHandler] ${sentinel}`)
        }
      },
      createServeOptions(eventDom)
    )

    try {
      const response = await dispatchRequest(eventDom, createRequestText())
      expect(response).toEqual({
        id: 'request-id',
        success: false,
        code: 'SERVER_ERROR',
        error: '[rpc] event handler failed'
      })
      expect(JSON.stringify(response)).not.toContain(sentinel)
      expect(errorSpy).toHaveBeenCalledWith(
        '[rpc] event request failed: channel=injected, method=ping, classification=handler, code=SERVER_ERROR'
      )
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sentinel)

      const transport = new EventRpcTransport('injected', { eventDom, timeout: 1000 })
      try {
        await expect(transport.call<JsonValue>('ping')).rejects.toMatchObject({
          code: 'SERVER_ERROR',
          message: '[rpc] event handler failed'
        })
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sentinel)
      } finally {
        transport.destroy()
      }

      vi.stubGlobal('__DEV__', true)
      errorSpy.mockClear()
      const developmentResponse = await dispatchRequest(eventDom, createRequestText())
      expect(developmentResponse).toEqual(response)
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(sentinel) }))
    } finally {
      vi.stubGlobal('__DEV__', false)
      registration.stop()
    }
  })

  it('客户端在 JSON.parse 前忽略超大 response，并过滤非法基础 frame', async () => {
    const eventDom = createEventDom()
    const transport = new EventRpcTransport('injected', { eventDom, timeout: 1000 })
    const requestListener = (event: Event): void => {
      const request = JSON.parse((event as CustomEvent<string>).detail) as JsonObject
      const id = request.id
      if (typeof id !== 'string') {
        return
      }

      const parseSpy = vi.spyOn(JSON, 'parse')
      dispatchDetail(
        eventDom,
        createRpcResponseEventName('injected'),
        'x'.repeat(RPC_EVENT_RESPONSE_FRAME_LIMIT + 1)
      )
      expect(parseSpy).not.toHaveBeenCalled()
      parseSpy.mockRestore()

      dispatchDetail(
        eventDom,
        createRpcResponseEventName('injected'),
        JSON.stringify({ id, success: 'true', data: { forged: true } })
      )
      dispatchDetail(
        eventDom,
        createRpcResponseEventName('injected'),
        JSON.stringify({ id, success: true, data: { ok: true } })
      )
    }
    eventDom.addEventListener.call(
      eventDom.target,
      createRpcRequestEventName('injected'),
      requestListener
    )

    try {
      await expect(transport.call<JsonValue>('ping')).resolves.toEqual({ ok: true })
    } finally {
      eventDom.removeEventListener.call(
        eventDom.target,
        createRpcRequestEventName('injected'),
        requestListener
      )
      transport.destroy()
    }
  })
})

/** 创建隔离的 EventRpc DOM。 */
function createEventDom(): RpcEventDom {
  return {
    target: new EventTarget(),
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    dispatchEvent: EventTarget.prototype.dispatchEvent,
    CustomEventCtor: CustomEvent
  }
}

/** 创建 EventRpc server 配置。 */
function createServeOptions(
  eventDom: RpcEventDom,
  requestLimits: Record<string, number> = { ping: 1024 }
): ServeOptions {
  return {
    transports: ['event'],
    methodTargets: { ping: ['content'] },
    methodTransports: { ping: ['event'] },
    requestLimits,
    responseLimits: { ping: 1024 },
    eventDom
  }
}

/** 创建默认合法 request，并覆盖指定字段。 */
function createRequestText(overrides: JsonObject = {}): string {
  return JSON.stringify({
    protocolVersion: RPC_PROTOCOL_VERSION,
    id: 'request-id',
    channel: 'injected',
    method: 'ping',
    ...overrides
  })
}

/** 发送原始 DOM detail。 */
function dispatchDetail(eventDom: RpcEventDom, eventName: string, detail: string): void {
  eventDom.dispatchEvent.call(
    eventDom.target,
    new eventDom.CustomEventCtor(eventName, { detail })
  )
}

/** 发送请求并等待固定响应事件。 */
function dispatchRequest(eventDom: RpcEventDom, detail: string): Promise<RpcResponse<JsonValue>> {
  return new Promise(resolve => {
    const responseEventName = createRpcResponseEventName('injected')
    const listener = (event: Event): void => {
      eventDom.removeEventListener.call(eventDom.target, responseEventName, listener)
      resolve(JSON.parse((event as CustomEvent<string>).detail) as RpcResponse<JsonValue>)
    }
    eventDom.addEventListener.call(eventDom.target, responseEventName, listener)
    dispatchDetail(eventDom, createRpcRequestEventName('injected'), detail)
  })
}

/** 等待同步 listener 启动的 Promise 回调完成。 */
async function settleEventHandler(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
