/**
 * RPC v2 DOM Event transport。
 *
 * 用于 content 与 injected 之间的固定 CustomEvent request-response 调用。
 */

import {
  DEFAULT_RPC_TIMEOUT,
  RPC_EVENT_RESPONSE_FRAME_LIMIT,
  RPC_PROTOCOL_VERSION,
  createRpcRequestEventName,
  createRpcResponseEventName,
  measureRpcTextBytes
} from '../constants'
import {
  RpcError,
  RpcTimeoutError,
  RpcTransportDestroyedError,
  RpcTransportError,
  createRpcErrorFromResponse
} from '../errors'
import type {
  JsonObject,
  JsonValue,
  RpcCallOptions,
  RpcChannel,
  RpcErrorCode,
  RpcEventDom,
  RpcRequest,
  RpcResponse,
  RpcTransport
} from '../types'
import { getDefaultRpcEventDom } from '../types'

/** EventRpcTransport 构造参数。 */
export interface EventRpcTransportOptions extends RpcCallOptions {
  /** EventRpc 使用的 DOM 句柄。 */
  eventDom?: RpcEventDom
  /** 默认超时时间。 */
  timeout?: number
}

/** EventRpc pending 请求记录。 */
interface PendingEventRequest {
  /** 响应处理函数。 */
  resolveResponse(response: RpcResponse<JsonValue>): void
  /** 失败处理函数。 */
  reject(error: Error): void
  /** 超时计时器。 */
  timer: ReturnType<typeof setTimeout>
}

/** DOM Event RPC transport。 */
export class EventRpcTransport implements RpcTransport {
  /** provider channel。 */
  private readonly channel: RpcChannel

  /** transport 配置。 */
  private readonly options: EventRpcTransportOptions

  /** 原生 DOM 句柄。 */
  private readonly eventDom: RpcEventDom

  /** 请求事件名。 */
  private readonly requestEventName: string

  /** 响应事件名。 */
  private readonly responseEventName: string

  /** pending 请求表。 */
  private readonly pendingRequests = new Map<string, PendingEventRequest>()

  /** 自增消息序号。 */
  private messageId = 0

  /** transport 销毁标记。 */
  private destroyed = false

  /** 创建 EventRpc transport。 */
  constructor(channel: RpcChannel, options: EventRpcTransportOptions) {
    this.channel = channel
    this.options = options
    this.eventDom = options.eventDom ?? getDefaultRpcEventDom()
    this.requestEventName = createRpcRequestEventName(channel)
    this.responseEventName = createRpcResponseEventName(channel)
    this.eventDom.addEventListener.call(
      this.eventDom.target,
      this.responseEventName,
      this.handleResponse
    )
  }

  /** 发起一次 EventRpc 调用。 */
  call<TResponse = void, TParams = never>(
    method: string,
    params?: TParams,
    options: RpcCallOptions = {}
  ): Promise<TResponse> {
    if (this.destroyed) {
      return Promise.reject(
        new RpcTransportDestroyedError(`[rpc] event transport destroyed: ${this.channel}.${method}`)
      )
    }

    const id = this.createRequestId(method)
    const request: RpcRequest<TParams> = {
      protocolVersion: RPC_PROTOCOL_VERSION,
      id,
      channel: this.channel,
      method,
      params
    }
    const timeout = options.timeout ?? this.options.timeout ?? DEFAULT_RPC_TIMEOUT

    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(
          new RpcTimeoutError(
            `[rpc] event call timeout after ${timeout}ms: ${this.channel}.${method}`
          )
        )
      }, timeout)

      this.pendingRequests.set(id, {
        resolveResponse: response => {
          if (!response.success) {
            reject(createRpcErrorFromResponse(response))
            return
          }

          resolve(response.data as TResponse)
        },
        reject,
        timer
      })

      try {
        const detail = JSON.stringify(request)
        this.eventDom.dispatchEvent.call(
          this.eventDom.target,
          new this.eventDom.CustomEventCtor(this.requestEventName, { detail })
        )
      } catch (error) {
        console.error(error)
        clearTimeout(timer)
        this.pendingRequests.delete(id)

        if (error instanceof Error) {
          reject(
            new RpcTransportError(
              `[rpc] event dispatch failed for ${this.channel}.${method}: ${error.message}`
            )
          )
          return
        }

        reject(
          new RpcTransportError(
            `[rpc] event dispatch failed for ${this.channel}.${method}: ${String(error)}`
          )
        )
      }
    })
  }

  /** 销毁 transport 并拒绝所有 pending 请求。 */
  destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.eventDom.removeEventListener.call(
      this.eventDom.target,
      this.responseEventName,
      this.handleResponse
    )

    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer)
      pending.reject(
        new RpcTransportDestroyedError(`[rpc] event transport destroyed while waiting: ${id}`)
      )
    }

    this.pendingRequests.clear()
  }

  /** 处理响应事件。 */
  private handleResponse = (event: Event): void => {
    const customEvent = event as CustomEvent<string>
    if (typeof customEvent.detail !== 'string') {
      return
    }

    // DOM transport 不可信；超大伪造响应不能进入 JSON.parse。
    if (measureRpcTextBytes(customEvent.detail) > RPC_EVENT_RESPONSE_FRAME_LIMIT) {
      return
    }

    const response = parseResponseText(customEvent.detail)
    if (!response) {
      return
    }

    const pending = this.pendingRequests.get(response.id)
    if (!pending) {
      return
    }

    this.pendingRequests.delete(response.id)
    clearTimeout(pending.timer)

    try {
      pending.resolveResponse(response)
    } catch (error) {
      console.error(error)

      if (error instanceof RpcError) {
        pending.reject(error)
        return
      }

      if (error instanceof Error) {
        pending.reject(
          new RpcTransportError(
            `[rpc] event response handling failed for ${this.channel}: ${error.message}`
          )
        )
        return
      }

      pending.reject(
        new RpcTransportError(
          `[rpc] event response handling failed for ${this.channel}: ${String(error)}`
        )
      )
    }
  }

  /** 创建请求 ID。 */
  private createRequestId(method: string): string {
    this.messageId += 1
    return `rpc:${this.channel}:${method}:${Date.now()}:${this.messageId}`
  }
}

/** 解析并校验 EventRpc 响应基础 frame。 */
function parseResponseText(responseText: string): RpcResponse<JsonValue> | null {
  let message: JsonValue
  try {
    message = JSON.parse(responseText) as JsonValue
  } catch (error) {
    console.error(error)
    return null
  }

  if (!isJsonObject(message)) {
    return null
  }

  const id = message.id
  const success = message.success
  const code = message.code
  const error = message.error
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof success !== 'boolean' ||
    (code !== undefined && !isRpcErrorCode(code)) ||
    (error !== undefined && typeof error !== 'string')
  ) {
    return null
  }

  const response: RpcResponse<JsonValue> = { id, success }
  if (message.data !== undefined) {
    response.data = message.data
  }
  if (code !== undefined) {
    response.code = code
  }
  if (error !== undefined) {
    response.error = error
  }
  return response
}

/** 判断值是否为 JSON 对象。 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 判断响应错误码是否属于 RPC v2。 */
function isRpcErrorCode(value: JsonValue): value is RpcErrorCode {
  switch (value) {
    case 'TIMEOUT':
    case 'TARGET_NOT_FOUND':
    case 'METHOD_NOT_FOUND':
    case 'TRANSPORT_FORBIDDEN':
    case 'UNAUTHORIZED':
    case 'PAYLOAD_TOO_LARGE':
    case 'SERVER_ERROR':
    case 'SERIALIZATION_ERROR':
    case 'TRANSPORT_ERROR':
    case 'INVALID_REQUEST':
    case 'TRANSPORT_DESTROYED':
      return true
    default:
      return false
  }
}
