/**
 * RPC 系统统一导出
 */

// RPC v2 类型定义
export type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RpcCallOptions,
  RpcCaller,
  RpcChannel,
  RpcContext,
  RpcErrorCode,
  RpcEventDom,
  RpcMethodParams,
  RpcMethodResult,
  RpcServeHandler,
  RpcServeHandlers,
  RpcServeRegistration,
  RpcServeResult,
  RpcTransport,
  RpcTransportName,
  ServeOptions
} from './types'
export { getDefaultRpcEventDom } from './types'
export {
  DEFAULT_RPC_REQUEST_LIMIT,
  DEFAULT_RPC_RESPONSE_LIMIT,
  DEFAULT_RPC_TIMEOUT,
  RPC_EVENT_FRAME_OVERHEAD_LIMIT,
  RPC_EVENT_REQUEST_PREFIX,
  RPC_EVENT_RESPONSE_FRAME_LIMIT,
  RPC_EVENT_RESPONSE_PREFIX,
  RPC_PROTOCOL_VERSION,
  createRpcRequestEventName,
  createRpcResponseEventName,
  measureRpcTextBytes
} from './constants'
export {
  RpcDuplicateChannelError,
  RpcError,
  RpcInvalidRequestError,
  RpcMethodNotFoundError,
  RpcPayloadTooLargeError,
  RpcSerializationError,
  RpcServerError,
  RpcTargetNotFoundError,
  RpcTimeoutError,
  RpcTransportDestroyedError,
  RpcTransportError,
  RpcTransportForbiddenError,
  RpcUnauthorizedError,
  createRpcErrorFromResponse
} from './errors'
export { serve } from './serve'
export { ChromeRpcTransport } from './transports/ChromeRpcTransport'
export { EventRpcTransport } from './transports/EventRpcTransport'

// Chrome 扩展事件
export { ChromeEventEmitter, ChromeEventSubscriber } from './ChromeEventBus'

// DOM CustomEvent 事件
export { DomEventEmitter, DomEventSubscriber } from './DomEventBus'
