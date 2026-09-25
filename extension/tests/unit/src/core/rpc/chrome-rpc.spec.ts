/**
 * ChromeRpc v2 单元测试。
 *
 * 覆盖 MV3 async 响应、caller 推导、target 不可用和权限拒绝。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHANNEL,
  METHOD_REQUEST_LIMITS,
  METHOD_RESPONSE_LIMITS,
  METHOD_TARGETS,
  METHOD_TRANSPORTS
} from '@/background/background-register'
import { serve } from '@/core/rpc/serve'
import { ChromeRpcTransport } from '@/core/rpc/transports/ChromeRpcTransport'
import type {
  JsonValue,
  RpcCaller,
  RpcRequest,
  RpcResponse,
  RpcServeHandlers
} from '@/core/rpc/types'

type RuntimeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0]

interface RuntimeAddListenerMock {
  /** addListener 调用参数。 */
  mock: {
    /** addListener 调用列表。 */
    calls: Array<[RuntimeListener]>
  }
}

describe('ChromeRpc v2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serve 在 MV3 async handler 下保持 message channel 打开并返回响应', async () => {
    const handlers: RpcServeHandlers = {
      ping: async () => {
        await Promise.resolve()
        return { pong: true, from: 'background' }
      }
    }
    const registration = serve(CHANNEL, handlers, {
      transports: ['chrome'],
      methodTargets: METHOD_TARGETS,
      methodTransports: METHOD_TRANSPORTS,
      requestLimits: METHOD_REQUEST_LIMITS,
      responseLimits: METHOD_RESPONSE_LIMITS
    })

    try {
      const listener = getLatestRuntimeListener()
      const responses: Array<RpcResponse<JsonValue>> = []
      const keepOpen = listener(
        createRequest('background', 'ping'),
        createPopupSender(),
        response => responses.push(response as RpcResponse<JsonValue>)
      )

      expect(keepOpen).toBe(true)
      await vi.waitFor(() => {
        expect(responses).toHaveLength(1)
      })
      expect(responses).toEqual([
        {
          id: 'rpc-test-id',
          success: true,
          data: { pong: true, from: 'background' }
        }
      ])
    } finally {
      registration.stop()
    }
  })

  it('serve 把扩展 page tab 识别为 popup，外部 tab 识别为 content', async () => {
    const callers: RpcCaller[] = []
    const handlers: RpcServeHandlers = {
      ping: (_params, context) => {
        callers.push(context.caller)
        return { pong: true, from: 'background' }
      },
      updateBadge: (_params, context) => {
        callers.push(context.caller)
        return { updated: true }
      }
    }
    const registration = serve(CHANNEL, handlers, {
      transports: ['chrome'],
      methodTargets: METHOD_TARGETS,
      methodTransports: METHOD_TRANSPORTS,
      requestLimits: METHOD_REQUEST_LIMITS,
      responseLimits: METHOD_RESPONSE_LIMITS
    })

    try {
      const listener = getLatestRuntimeListener()
      listener(createRequest('background', 'ping'), createPopupSender(), () => {})
      listener(createRequest('background', 'ping'), createPopupTabSender(), () => {})
      listener(
        createRequest('background', 'updateBadge', { count: 3 }),
        createContentSender(),
        () => {}
      )
      await Promise.resolve()

      expect(callers).toEqual(['popup', 'popup', 'content'])
    } finally {
      registration.stop()
    }
  })

  it('ChromeRpcTransport 在 content 目标不存在时返回 TARGET_NOT_FOUND', async () => {
    vi.mocked(chrome.tabs.sendMessage).mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.')
    )

    const transport = new ChromeRpcTransport('content')

    await expect(transport.call('getResources', undefined, { tabId: 99 })).rejects.toMatchObject({
      code: 'TARGET_NOT_FOUND'
    })
  })

  it('serve 拒绝 popup 调用 content-only 方法', async () => {
    const handlers: RpcServeHandlers = {
      updateBadge: () => ({ updated: true })
    }
    const registration = serve(CHANNEL, handlers, {
      transports: ['chrome'],
      methodTargets: METHOD_TARGETS,
      methodTransports: METHOD_TRANSPORTS,
      requestLimits: METHOD_REQUEST_LIMITS,
      responseLimits: METHOD_RESPONSE_LIMITS
    })

    try {
      const listener = getLatestRuntimeListener()
      const responses: Array<RpcResponse<JsonValue>> = []
      const keepOpen = listener(
        createRequest('background', 'updateBadge', { count: 3 }),
        createPopupSender(),
        response => responses.push(response as RpcResponse<JsonValue>)
      )

      expect(keepOpen).toBe(true)
      await vi.waitFor(() => {
        expect(responses).toHaveLength(1)
      })
      expect(responses[0]).toMatchObject({
        id: 'rpc-test-id',
        success: false,
        code: 'UNAUTHORIZED'
      })
    } finally {
      registration.stop()
    }
  })
})

function getLatestRuntimeListener(): RuntimeListener {
  const addListener = chrome.runtime.onMessage
    .addListener as typeof chrome.runtime.onMessage.addListener & RuntimeAddListenerMock
  const latestCall = addListener.mock.calls.at(-1)
  if (!latestCall) {
    throw new Error('[chrome-rpc.spec] runtime.onMessage listener not registered')
  }
  return latestCall[0]
}

function createRequest(
  channel: 'background' | 'content' | 'injected',
  method: string,
  params?: JsonValue
): RpcRequest<JsonValue> {
  return {
    protocolVersion: 2,
    id: 'rpc-test-id',
    channel,
    method,
    params
  }
}

function createPopupSender(): chrome.runtime.MessageSender {
  return {
    id: chrome.runtime.id,
    url: `chrome-extension://${chrome.runtime.id}/src/popup.html`,
    origin: `chrome-extension://${chrome.runtime.id}`
  }
}

function createPopupTabSender(): chrome.runtime.MessageSender {
  return {
    ...createPopupSender(),
    tab: {
      id: 9,
      url: `chrome-extension://${chrome.runtime.id}/src/popup.html`
    } as chrome.tabs.Tab
  }
}

function createContentSender(): chrome.runtime.MessageSender {
  return {
    id: chrome.runtime.id,
    tab: { id: 7, url: 'https://web.telegram.org/a/' } as chrome.tabs.Tab,
    frameId: 0,
    url: 'https://web.telegram.org/a/',
    origin: 'https://web.telegram.org'
  }
}
