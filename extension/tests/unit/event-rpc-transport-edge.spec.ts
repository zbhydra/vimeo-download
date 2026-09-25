/** EventRpc transport 的销毁、超时、异常 dispatch 与响应 frame 测试。 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createRpcRequestEventName,
  createRpcResponseEventName
} from '../../src/core/rpc/constants'
import { EventRpcTransport } from '../../src/core/rpc/transports/EventRpcTransport'
import type {
  JsonObject,
  JsonValue,
  RpcErrorCode,
  RpcEventDom
} from '../../src/core/rpc/types'

describe('EventRpcTransport edge cases', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects calls after destroy and ignores repeated destroy', async () => {
    const transport = new EventRpcTransport('injected', {
      eventDom: createEventDom(),
      timeout: 100
    })

    transport.destroy()
    transport.destroy()

    await expect(transport.call('ping')).rejects.toMatchObject({
      code: 'TRANSPORT_DESTROYED'
    })
  })

  it('uses a per-call timeout and removes the pending request', async () => {
    vi.useFakeTimers()
    const transport = new EventRpcTransport('injected', {
      eventDom: createEventDom(),
      timeout: 100
    })

    const request = transport.call('ping', undefined, { timeout: 5 })
    const assertion = expect(request).rejects.toMatchObject({
      code: 'TIMEOUT',
      message: '[rpc] event call timeout after 5ms: injected.ping'
    })
    await vi.advanceTimersByTimeAsync(5)
    await assertion
    transport.destroy()
  })

  it.each([
    [new Error('dispatch unavailable'), 'dispatch unavailable'],
    ['non-error dispatch failure', 'non-error dispatch failure']
  ])('wraps a dispatch failure without leaving a pending request', async (failure, message) => {
    const eventDom = createEventDom()
    eventDom.dispatchEvent = function dispatchFailure(): boolean {
      throw failure
    }
    const transport = new EventRpcTransport('injected', { eventDom, timeout: 100 })

    await expect(transport.call('ping')).rejects.toMatchObject({
      code: 'TRANSPORT_ERROR',
      message: `[rpc] event dispatch failed for injected.ping: ${message}`
    })
    transport.destroy()
  })

  it('ignores malformed and unrelated response frames before accepting the matching frame', async () => {
    const eventDom = createEventDom()
    const requestListener = (event: Event): void => {
      const request = JSON.parse((event as CustomEvent<string>).detail) as JsonObject
      const id = request.id
      if (typeof id !== 'string') {
        return
      }

      dispatchDetail(eventDom, 42)
      for (const detail of [
        '{',
        'null',
        '[]',
        JSON.stringify({ id: '', success: true }),
        JSON.stringify({ id, success: 'true' }),
        JSON.stringify({ id, success: false, code: 'NOT_AN_RPC_CODE' }),
        JSON.stringify({ id, success: false, error: 42 }),
        JSON.stringify({ id: 'unrelated', success: true, data: { forged: true } })
      ]) {
        dispatchDetail(eventDom, detail)
      }

      dispatchDetail(
        eventDom,
        JSON.stringify({
          id,
          success: true,
          data: { ok: true },
          code: 'SERVER_ERROR',
          error: 'ignored on success'
        })
      )
    }
    eventDom.addEventListener.call(
      eventDom.target,
      createRpcRequestEventName('injected'),
      requestListener
    )
    const transport = new EventRpcTransport('injected', { eventDom, timeout: 100 })

    await expect(transport.call<JsonValue>('ping')).resolves.toEqual({ ok: true })

    transport.destroy()
    eventDom.removeEventListener.call(
      eventDom.target,
      createRpcRequestEventName('injected'),
      requestListener
    )
  })

  it.each([
    'TIMEOUT',
    'TARGET_NOT_FOUND',
    'METHOD_NOT_FOUND',
    'TRANSPORT_FORBIDDEN',
    'UNAUTHORIZED',
    'PAYLOAD_TOO_LARGE',
    'SERVER_ERROR',
    'SERIALIZATION_ERROR',
    'TRANSPORT_ERROR',
    'INVALID_REQUEST',
    'TRANSPORT_DESTROYED'
  ] as const)('accepts the fixed %s error code from a valid response frame', async code => {
    const eventDom = createEventDom()
    respondWithError(eventDom, code)
    const transport = new EventRpcTransport('injected', { eventDom, timeout: 100 })

    await expect(transport.call('ping')).rejects.toMatchObject({
      code,
      message: `failure:${code}`
    })

    transport.destroy()
  })
})

function createEventDom(): RpcEventDom {
  return {
    target: new EventTarget(),
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    dispatchEvent: EventTarget.prototype.dispatchEvent,
    CustomEventCtor: CustomEvent
  }
}

function dispatchDetail(eventDom: RpcEventDom, detail: string | number): void {
  eventDom.dispatchEvent.call(
    eventDom.target,
    new CustomEvent(createRpcResponseEventName('injected'), { detail })
  )
}

function respondWithError(eventDom: RpcEventDom, code: RpcErrorCode): void {
  const listener = (event: Event): void => {
    const request = JSON.parse((event as CustomEvent<string>).detail) as JsonObject
    if (typeof request.id !== 'string') {
      return
    }
    dispatchDetail(
      eventDom,
      JSON.stringify({
        id: request.id,
        success: false,
        code,
        error: `failure:${code}`
      })
    )
  }
  eventDom.addEventListener.call(
    eventDom.target,
    createRpcRequestEventName('injected'),
    listener,
    { once: true }
  )
}
