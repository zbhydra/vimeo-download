/**
 * RPC v2 核心类型。
 *
 * 新协议用上下文级 channel 描述 provider，用 caller 描述调用方身份，用 transport 描述消息承载方式。
 */

import type { DEFAULT_RPC_TIMEOUT } from './constants'

/** 可通过 RPC 安全序列化传输的基础值。 */
export type JsonPrimitive = string | number | boolean | null

/** 可通过 RPC 安全序列化传输的对象。 */
export interface JsonObject {
  /** JSON 对象字段。 */
  readonly [key: string]: JsonValue
}

/** 可通过 RPC 安全序列化传输的数组。 */
export type JsonArray = readonly JsonValue[]

/** 可通过 RPC 安全序列化传输的值。 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray

/** RPC 传输实现名称。 */
export type RpcTransportName = 'chrome' | 'event'

/** RPC provider 所在上下文。 */
export type RpcChannel = 'content' | 'injected' | 'background'

/** RPC 调用方上下文。 */
export type RpcCaller = 'content' | 'injected' | 'background' | 'popup'

/** RPC 统一错误码。 */
export type RpcErrorCode =
  | 'TIMEOUT'
  | 'TARGET_NOT_FOUND'
  | 'METHOD_NOT_FOUND'
  | 'TRANSPORT_FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVER_ERROR'
  | 'SERIALIZATION_ERROR'
  | 'TRANSPORT_ERROR'
  | 'INVALID_REQUEST'
  | 'TRANSPORT_DESTROYED'

/** RPC v2 请求消息。 */
export interface RpcRequest<TParams = never> {
  /** 协议版本，固定为 2。 */
  protocolVersion: 2
  /** 请求 ID，用于匹配响应。 */
  id: string
  /** provider channel。 */
  channel: RpcChannel
  /** 能力方法名。 */
  method: string
  /** 请求参数。 */
  params?: TParams
}

/** RPC v2 响应消息。 */
export interface RpcResponse<TData = never> {
  /** 请求 ID。 */
  id: string
  /** 成功标记。 */
  success: boolean
  /** 成功响应数据。 */
  data?: TData
  /** 失败错误码。 */
  code?: RpcErrorCode
  /** 可定位错误信息。 */
  error?: string
}

/** RPC handler 执行上下文。 */
export interface RpcContext {
  /** 当前使用的传输类型。 */
  transport: RpcTransportName
  /** 接收方推导出的调用方身份。 */
  caller: RpcCaller
  /** Chrome tab ID。 */
  tabId?: number
  /** Chrome frame ID。 */
  frameId?: number
  /** 调用来源 origin 或 URL。 */
  origin?: string
}

/** 单次 RPC 调用选项。 */
export interface RpcCallOptions {
  /** 目标 tab ID，调用 content provider 时必填。 */
  tabId?: number
  /** 单次调用超时时间，单位毫秒。 */
  timeout?: typeof DEFAULT_RPC_TIMEOUT | number
}

/** RPC transport 统一接口。 */
export interface RpcTransport {
  /** 发起一次 request-response RPC 调用。 */
  call<TResponse = void, TParams = never>(
    method: string,
    params?: TParams,
    options?: RpcCallOptions
  ): Promise<TResponse>

  /** 销毁 transport 并清理 pending 请求。 */
  destroy(): void
}

/** EventRpc 使用的原生 DOM 方法句柄。 */
export interface RpcEventDom {
  /** 事件目标，通常为 document。 */
  target: EventTarget
  /** document_start 捕获的 addEventListener。 */
  addEventListener: EventTarget['addEventListener']
  /** document_start 捕获的 removeEventListener。 */
  removeEventListener: EventTarget['removeEventListener']
  /** document_start 捕获的 dispatchEvent。 */
  dispatchEvent: EventTarget['dispatchEvent']
  /** document_start 捕获的 CustomEvent 构造函数。 */
  CustomEventCtor: typeof CustomEvent
}

/** RPC server handler 返回值。 */
export type RpcServeResult = object | string | number | boolean | null | void

/** RPC server handler 函数。 */
export type RpcServeHandler = (
  params: JsonValue | undefined,
  context: RpcContext
) => RpcServeResult | Promise<RpcServeResult>

/** RPC server handler 字典。 */
export type RpcServeHandlers = Record<string, RpcServeHandler>

/** serve 注册配置。 */
export interface ServeOptions {
  /** 当前 server 启用的传输。 */
  transports: readonly RpcTransportName[]
  /** 每个方法允许的 caller。 */
  methodTargets: Record<string, readonly RpcCaller[]>
  /** 每个方法允许的 transport。 */
  methodTransports: Record<string, readonly RpcTransportName[]>
  /** 每个方法请求体大小限制。 */
  requestLimits: Record<string, number>
  /** 每个方法响应体大小限制。 */
  responseLimits: Record<string, number>
  /** EventRpc 使用的原生 DOM 句柄。 */
  eventDom?: RpcEventDom
}

/** serve 返回的注册句柄。 */
export interface RpcServeRegistration {
  /** 当前 provider channel。 */
  channel: RpcChannel
  /** 停止监听并清理 channel 注册。 */
  stop(): void
}

/** 从 register Handler 提取方法参数类型。 */
export type RpcMethodParams<THandler, TMethod extends keyof THandler> = THandler[TMethod] extends (
  ...args: infer TArgs
) => Promise<RpcServeResult>
  ? TArgs extends [infer TParams]
    ? TParams
    : never
  : never

/** 从 register Handler 提取方法返回类型。 */
export type RpcMethodResult<THandler, TMethod extends keyof THandler> = Awaited<
  THandler[TMethod] extends (...args: infer _TArgs) => infer TResult ? TResult : never
>

/** 捕获当前上下文的默认 DOM 句柄。 */
export function getDefaultRpcEventDom(): RpcEventDom {
  return {
    target: document,
    addEventListener: document.addEventListener,
    removeEventListener: document.removeEventListener,
    dispatchEvent: document.dispatchEvent,
    CustomEventCtor: CustomEvent
  }
}
