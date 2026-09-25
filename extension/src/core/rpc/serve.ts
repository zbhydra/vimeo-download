/**
 * RPC v2 provider 注册入口。
 *
 * serve 负责统一监听 Chrome/Event 请求，并按 target、transport、payload 限制执行校验。
 */

import {
  DEFAULT_RPC_REQUEST_LIMIT,
  DEFAULT_RPC_RESPONSE_LIMIT,
  RPC_EVENT_FRAME_OVERHEAD_LIMIT,
  RPC_PROTOCOL_VERSION,
  createRpcRequestEventName,
  createRpcResponseEventName,
  measureRpcTextBytes
} from './constants'
import {
  RpcDuplicateChannelError,
  RpcError,
  RpcInvalidRequestError,
  RpcMethodNotFoundError,
  RpcPayloadTooLargeError,
  RpcSerializationError,
  RpcServerError,
  RpcTransportForbiddenError,
  RpcUnauthorizedError
} from './errors'
import type {
  JsonObject,
  JsonValue,
  RpcCaller,
  RpcChannel,
  RpcContext,
  RpcEventDom,
  RpcRequest,
  RpcResponse,
  RpcServeHandlers,
  RpcServeRegistration,
  RpcServeResult,
  RpcTransportName,
  ServeOptions
} from './types'
import { getDefaultRpcEventDom } from './types'

/** 已启动的 provider channel。 */
const activeChannels = new Set<RpcChannel>()

/** EventRpc 不可信页面可见响应使用的固定服务端错误文案。 */
const EVENT_SERVER_ERROR_MESSAGE = '[rpc] event handler failed'

/** 注册 RPC provider。 */
export function serve(
  channel: RpcChannel,
  handlers: RpcServeHandlers,
  options: ServeOptions
): RpcServeRegistration {
  if (activeChannels.has(channel)) {
    throw new RpcDuplicateChannelError(channel)
  }

  activeChannels.add(channel)

  const cleanupTasks: Array<() => void> = []

  if (options.transports.includes('chrome')) {
    cleanupTasks.push(registerChromeServer(channel, handlers, options))
  }

  if (options.transports.includes('event')) {
    cleanupTasks.push(registerEventServer(channel, handlers, options))
  }

  return {
    channel,
    stop() {
      for (const cleanup of cleanupTasks.splice(0)) {
        cleanup()
      }
      activeChannels.delete(channel)
    }
  }
}

/** 注册 Chrome message server。 */
function registerChromeServer(
  channel: RpcChannel,
  handlers: RpcServeHandlers,
  options: ServeOptions
): () => void {
  const listener = (
    message: JsonValue | undefined,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: RpcResponse<RpcServeResult>) => void
  ): boolean => {
    const request = parseRequest(channel, message)
    if (!request) {
      return false
    }

    const context = inferChromeContext(channel, sender)

    handleRpcRequest(channel, handlers, options, request, context)
      .then(sendResponse)
      .catch(error => {
        console.error(error)
        sendResponse(
          toFailureResponse(request.id, error instanceof Error ? error : String(error), 'chrome')
        )
      })

    return true
  }

  chrome.runtime.onMessage.addListener(listener)

  return () => {
    chrome.runtime.onMessage.removeListener(listener)
  }
}

/** 注册 EventRpc server。 */
function registerEventServer(
  channel: RpcChannel,
  handlers: RpcServeHandlers,
  options: ServeOptions
): () => void {
  const eventDom = options.eventDom ?? getDefaultRpcEventDom()
  const requestEventName = createRpcRequestEventName(channel)
  const responseEventName = createRpcResponseEventName(channel)
  const frameLimit = getEventFrameLimit(handlers, options)
  const listener = (event: Event): void => {
    const customEvent = event as CustomEvent<string>
    if (typeof customEvent.detail !== 'string') {
      return
    }

    // DOM transport 不可信；先限制原始字符串，避免页面在 JSON.parse 前塞入超大 frame。
    if (measureRpcTextBytes(customEvent.detail) > frameLimit) {
      return
    }

    const request = parseRequestText(channel, customEvent.detail)
    if (!request) {
      return
    }

    const context: RpcContext = {
      transport: 'event',
      // caller 只描述本通道的预期路由，不证明事件确实由 content 发出。
      caller: 'content',
      origin: location.origin
    }

    handleRpcRequest(channel, handlers, options, request, context)
      .then(response => {
        dispatchEventResponse(eventDom, responseEventName, response)
      })
      .catch(error => {
        logRpcFailure(channel, request.method, error, 'event')
        dispatchEventResponse(
          eventDom,
          responseEventName,
          toFailureResponse(request.id, error instanceof Error ? error : String(error), 'event')
        )
      })
  }

  eventDom.addEventListener.call(eventDom.target, requestEventName, listener)

  return () => {
    eventDom.removeEventListener.call(eventDom.target, requestEventName, listener)
  }
}

/** 执行 RPC 请求并返回响应。 */
async function handleRpcRequest(
  channel: RpcChannel,
  handlers: RpcServeHandlers,
  options: ServeOptions,
  request: RpcRequest<JsonValue>,
  context: RpcContext
): Promise<RpcResponse<RpcServeResult>> {
  try {
    validateRequest(channel, request)

    if (!Object.prototype.hasOwnProperty.call(handlers, request.method)) {
      throw new RpcMethodNotFoundError(`[rpc] method not found: ${channel}.${request.method}`)
    }

    validateMethodAccess(request.method, context, options)
    ensurePayloadSize(request.params ?? null, getRequestLimit(request.method, options))

    const handler = handlers[request.method]
    const result = await handler(request.params, context)
    ensureSerializable(result)
    ensurePayloadSize(result ?? null, getResponseLimit(request.method, options))

    const response: RpcResponse<RpcServeResult> = {
      id: request.id,
      success: true
    }

    if (result !== undefined) {
      response.data = result
    }

    return response
  } catch (error) {
    logRpcFailure(channel, request.method, error, context.transport)
    return toFailureResponse(
      request.id,
      error instanceof Error ? error : String(error),
      context.transport
    )
  }
}

/** 校验请求基础字段。 */
function validateRequest(channel: RpcChannel, request: RpcRequest<JsonValue>): void {
  if (request.protocolVersion !== RPC_PROTOCOL_VERSION) {
    throw new RpcInvalidRequestError(
      `[rpc] invalid protocol version for ${channel}.${request.method}: ${request.protocolVersion}`
    )
  }

  if (request.channel !== channel) {
    throw new RpcInvalidRequestError(
      `[rpc] invalid channel for ${channel}.${request.method}: ${request.channel}`
    )
  }

  if (typeof request.id !== 'string' || request.id.length === 0) {
    throw new RpcInvalidRequestError(`[rpc] missing request id for ${channel}.${request.method}`)
  }

  if (typeof request.method !== 'string' || request.method.length === 0) {
    throw new RpcInvalidRequestError(`[rpc] missing method for channel: ${channel}`)
  }
}

/** 校验方法权限和传输方向。 */
function validateMethodAccess(method: string, context: RpcContext, options: ServeOptions): void {
  const allowedTargets = options.methodTargets[method]
  if (!allowedTargets?.includes(context.caller)) {
    throw new RpcUnauthorizedError(
      `[rpc] caller ${context.caller} cannot call method: ${method}, allowed=${allowedTargets?.join(',') ?? 'none'}`
    )
  }

  const allowedTransports = options.methodTransports[method]
  if (!allowedTransports?.includes(context.transport)) {
    throw new RpcTransportForbiddenError(
      `[rpc] transport ${context.transport} cannot call method: ${method}`
    )
  }
}

/** 推导 Chrome 调用方上下文。 */
function inferChromeContext(channel: RpcChannel, sender: chrome.runtime.MessageSender): RpcContext {
  return {
    transport: 'chrome',
    caller: inferChromeCaller(channel, sender),
    tabId: sender.tab?.id,
    frameId: sender.frameId,
    origin: sender.origin ?? sender.url
  }
}

/** 根据 sender 推导 Chrome 调用方。 */
function inferChromeCaller(channel: RpcChannel, sender: chrome.runtime.MessageSender): RpcCaller {
  const senderUrl = sender.url ?? sender.origin ?? ''
  const extensionPrefix = chrome.runtime.id ? `chrome-extension://${chrome.runtime.id}/` : ''
  const fromExtensionPage = extensionPrefix.length > 0 && senderUrl.startsWith(extensionPrefix)

  if (fromExtensionPage) {
    return 'popup'
  }

  if (channel === 'background' && sender.tab?.id !== undefined) {
    return 'content'
  }

  if (channel === 'content' && sender.id === chrome.runtime.id) {
    return 'background'
  }

  return 'content'
}

/** 解析 Chrome message 请求。 */
function parseRequest(
  channel: RpcChannel,
  message: JsonValue | undefined
): RpcRequest<JsonValue> | null {
  if (!isJsonObject(message)) {
    return null
  }

  const id = message.id
  const method = message.method

  if (
    message.protocolVersion !== RPC_PROTOCOL_VERSION ||
    message.channel !== channel ||
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof method !== 'string' ||
    method.length === 0
  ) {
    return null
  }

  return {
    protocolVersion: RPC_PROTOCOL_VERSION,
    id,
    channel,
    method,
    params: message.params
  }
}

/** 解析 Event detail 请求。 */
function parseRequestText(channel: RpcChannel, requestText: string): RpcRequest<JsonValue> | null {
  try {
    const message = JSON.parse(requestText) as JsonValue
    return parseRequest(channel, message)
  } catch {
    return null
  }
}

/** 判断值是否为 JSON 对象。 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 获取请求体限制。 */
function getRequestLimit(method: string, options: ServeOptions): number {
  return options.requestLimits[method] ?? DEFAULT_RPC_REQUEST_LIMIT
}

/** 计算 EventRpc 原始 frame 上限，只考虑当前 provider 实际拥有的 handler。 */
function getEventFrameLimit(handlers: RpcServeHandlers, options: ServeOptions): number {
  const maxRequestLimit = Object.keys(handlers).reduce(
    (currentMax, method) => Math.max(currentMax, getRequestLimit(method, options)),
    0
  )
  return maxRequestLimit + RPC_EVENT_FRAME_OVERHEAD_LIMIT
}

/** 获取响应体限制。 */
function getResponseLimit(method: string, options: ServeOptions): number {
  return options.responseLimits[method] ?? DEFAULT_RPC_RESPONSE_LIMIT
}

/** 检查 payload 序列化大小。 */
function ensurePayloadSize(value: JsonValue | RpcServeResult, limit: number): void {
  const size = measureJsonBytes(value)
  if (size > limit) {
    throw new RpcPayloadTooLargeError(`[rpc] payload size ${size} exceeds limit ${limit}`)
  }
}

/** 检查返回值可被 JSON 序列化。 */
function ensureSerializable(value: RpcServeResult): void {
  if (value === undefined) {
    return
  }

  const text = JSON.stringify(value)
  if (typeof text !== 'string') {
    throw new RpcSerializationError('[rpc] response serialization returned empty JSON text')
  }
}

/** 计算 JSON 序列化后的 UTF-8 字节数。 */
function measureJsonBytes(value: JsonValue | RpcServeResult): number {
  const text = JSON.stringify(value)
  if (typeof text !== 'string') {
    return 0
  }
  return new TextEncoder().encode(text).length
}

/** 转换失败响应。 */
function toFailureResponse(
  id: string,
  error: Error | string | number | boolean | null,
  transport: RpcTransportName
): RpcResponse<RpcServeResult> {
  if (error instanceof RpcError) {
    return error.toResponse(id) as RpcResponse<RpcServeResult>
  }

  if (transport === 'event') {
    return new RpcServerError(EVENT_SERVER_ERROR_MESSAGE).toResponse(
      id
    ) as RpcResponse<RpcServeResult>
  }

  if (error instanceof Error) {
    return new RpcServerError(error.message).toResponse(id) as RpcResponse<RpcServeResult>
  }

  return new RpcServerError(String(error)).toResponse(id) as RpcResponse<RpcServeResult>
}

/**
 * 记录 RPC 失败。
 *
 * EventRpc 面向不可信 DOM，不能把 handler 原始错误对象写入页面控制台；Chrome
 * transport 保留原有详细错误，便于扩展自身上下文定位问题。
 */
function logRpcFailure(
  channel: RpcChannel,
  method: string,
  error: unknown,
  transport: RpcTransportName
): void {
  if (transport === 'chrome') {
    console.error(error)
    return
  }

  const classification = error instanceof RpcError ? 'protocol' : 'handler'
  const code = error instanceof RpcError ? error.code : 'SERVER_ERROR'
  console.error(
    `[rpc] event request failed: channel=${channel}, method=${method}, classification=${classification}, code=${code}`
  )
  if (__DEV__) {
    console.error(error)
  }
}

/** 序列化响应。 */
function stringifyResponse(response: RpcResponse<RpcServeResult>): string {
  return JSON.stringify(response)
}

/** 通过固定响应事件返回 EventRpc 结果。 */
function dispatchEventResponse(
  eventDom: RpcEventDom,
  responseEventName: string,
  response: RpcResponse<RpcServeResult>
): void {
  eventDom.dispatchEvent.call(
    eventDom.target,
    new eventDom.CustomEventCtor(responseEventName, { detail: stringifyResponse(response) })
  )
}
