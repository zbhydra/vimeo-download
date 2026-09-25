/**
 * RPC v2 Chrome message transport。
 *
 * 用于 popup/background/content 之间的 request-response 调用，并统一处理 v2 响应错误码。
 */

import { DEFAULT_RPC_TIMEOUT, RPC_PROTOCOL_VERSION } from '../constants'
import {
  RpcError,
  RpcTargetNotFoundError,
  RpcTimeoutError,
  RpcTransportDestroyedError,
  RpcTransportError,
  createRpcErrorFromResponse
} from '../errors'
import type { RpcCallOptions, RpcChannel, RpcRequest, RpcResponse, RpcTransport } from '../types'

/** ChromeRpcTransport 构造参数。 */
export interface ChromeRpcTransportOptions extends RpcCallOptions {
  /** 默认目标 tab ID。 */
  tabId?: number
  /** 默认超时时间。 */
  timeout?: number
}

/** Chrome runtime/tabs message transport。 */
export class ChromeRpcTransport implements RpcTransport {
  /** provider channel。 */
  private readonly channel: RpcChannel

  /** 默认调用配置。 */
  private readonly options: ChromeRpcTransportOptions

  /** 自增消息序号。 */
  private messageId = 0

  /** transport 销毁标记。 */
  private destroyed = false

  /** 创建 Chrome RPC transport。 */
  constructor(channel: RpcChannel, options: ChromeRpcTransportOptions = {}) {
    this.channel = channel
    this.options = options
  }

  /** 发起一次 Chrome RPC 调用。 */
  async call<TResponse = void, TParams = never>(
    method: string,
    params?: TParams,
    options: RpcCallOptions = {}
  ): Promise<TResponse> {
    if (this.destroyed) {
      throw new RpcTransportDestroyedError(
        `[rpc] chrome transport destroyed: ${this.channel}.${method}`
      )
    }

    const request: RpcRequest<TParams> = {
      protocolVersion: RPC_PROTOCOL_VERSION,
      id: this.createRequestId(method),
      channel: this.channel,
      method,
      params
    }

    try {
      const response = await this.withTimeout(
        this.sendRequest<TResponse, TParams>(request, options),
        options.timeout ?? this.options.timeout ?? DEFAULT_RPC_TIMEOUT,
        method
      )

      if (!response) {
        throw new RpcTargetNotFoundError(
          `[rpc] chrome target returned empty response for ${this.channel}.${method}`
        )
      }

      if (!response.success) {
        throw createRpcErrorFromResponse(response)
      }

      return response.data as TResponse
    } catch (error) {
      console.error(error)

      if (error instanceof RpcError) {
        throw error
      }

      if (error instanceof Error && error.message.includes('Could not establish connection')) {
        throw new RpcTargetNotFoundError(
          `[rpc] chrome target not found for ${this.channel}.${method}: ${error.message}`
        )
      }

      if (error instanceof Error) {
        throw new RpcTransportError(
          `[rpc] chrome transport failed for ${this.channel}.${method}: ${error.message}`
        )
      }

      throw new RpcTransportError(
        `[rpc] chrome transport failed for ${this.channel}.${method}: ${String(error)}`
      )
    }
  }

  /** 销毁 transport。 */
  destroy(): void {
    this.destroyed = true
  }

  /** 发送 Chrome message。 */
  private sendRequest<TResponse, TParams>(
    request: RpcRequest<TParams>,
    options: RpcCallOptions
  ): Promise<RpcResponse<TResponse>> {
    if (this.channel === 'content') {
      const tabId = options.tabId ?? this.options.tabId
      if (tabId === undefined) {
        throw new RpcTargetNotFoundError(
          `[rpc] missing tabId for content method: ${request.method}`
        )
      }
      return chrome.tabs.sendMessage(tabId, request) as Promise<RpcResponse<TResponse>>
    }

    return chrome.runtime.sendMessage(request) as Promise<RpcResponse<TResponse>>
  }

  /** 为一次调用添加超时。 */
  private withTimeout<TResponse>(
    task: Promise<RpcResponse<TResponse>>,
    timeout: number,
    method: string
  ): Promise<RpcResponse<TResponse>> {
    return new Promise<RpcResponse<TResponse>>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new RpcTimeoutError(
            `[rpc] chrome call timeout after ${timeout}ms: ${this.channel}.${method}`
          )
        )
      }, timeout)

      task
        .then(response => {
          clearTimeout(timer)
          resolve(response)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  /** 创建请求 ID。 */
  private createRequestId(method: string): string {
    this.messageId += 1
    return `rpc:${this.channel}:${method}:${Date.now()}:${this.messageId}`
  }
}
