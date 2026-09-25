/**
 * RPC v2 统一错误类型。
 *
 * 所有 transport 与 serve 层错误都落到固定错误码，调用方可以按 code 做明确分支。
 */

import type { RpcErrorCode, RpcResponse } from './types'

/** RPC 错误基类。 */
export class RpcError extends Error {
  /** RPC 响应错误码。 */
  readonly code: RpcErrorCode

  /** 创建带错误码的 RPC 错误。 */
  constructor(code: RpcErrorCode, message: string) {
    super(message)
    this.name = new.target.name
    this.code = code
  }

  /** 转换为 RPC 响应对象。 */
  toResponse(id: string): RpcResponse {
    return {
      id,
      success: false,
      code: this.code,
      error: this.message
    }
  }
}

/** 重复注册同一 channel 时抛出。 */
export class RpcDuplicateChannelError extends Error {
  /** 创建重复 channel 错误。 */
  constructor(channel: string) {
    super(`[rpc] duplicate channel registration: ${channel}`)
    this.name = 'RpcDuplicateChannelError'
  }
}

/** RPC 调用超时错误。 */
export class RpcTimeoutError extends RpcError {
  /** 创建超时错误。 */
  constructor(message: string) {
    super('TIMEOUT', message)
  }
}

/** RPC 目标不存在错误。 */
export class RpcTargetNotFoundError extends RpcError {
  /** 创建目标不存在错误。 */
  constructor(message: string) {
    super('TARGET_NOT_FOUND', message)
  }
}

/** RPC 方法不存在错误。 */
export class RpcMethodNotFoundError extends RpcError {
  /** 创建方法不存在错误。 */
  constructor(message: string) {
    super('METHOD_NOT_FOUND', message)
  }
}

/** RPC 传输方向非法错误。 */
export class RpcTransportForbiddenError extends RpcError {
  /** 创建传输非法错误。 */
  constructor(message: string) {
    super('TRANSPORT_FORBIDDEN', message)
  }
}

/** RPC 权限错误。 */
export class RpcUnauthorizedError extends RpcError {
  /** 创建权限错误。 */
  constructor(message: string) {
    super('UNAUTHORIZED', message)
  }
}

/** RPC payload 大小超限错误。 */
export class RpcPayloadTooLargeError extends RpcError {
  /** 创建 payload 大小超限错误。 */
  constructor(message: string) {
    super('PAYLOAD_TOO_LARGE', message)
  }
}

/** RPC server 执行错误。 */
export class RpcServerError extends RpcError {
  /** 创建 server 执行错误。 */
  constructor(message: string) {
    super('SERVER_ERROR', message)
  }
}

/** RPC 序列化错误。 */
export class RpcSerializationError extends RpcError {
  /** 创建序列化错误。 */
  constructor(message: string) {
    super('SERIALIZATION_ERROR', message)
  }
}

/** RPC transport 错误。 */
export class RpcTransportError extends RpcError {
  /** 创建 transport 错误。 */
  constructor(message: string) {
    super('TRANSPORT_ERROR', message)
  }
}

/** RPC 请求非法错误。 */
export class RpcInvalidRequestError extends RpcError {
  /** 创建请求非法错误。 */
  constructor(message: string) {
    super('INVALID_REQUEST', message)
  }
}

/** RPC transport 已销毁错误。 */
export class RpcTransportDestroyedError extends RpcError {
  /** 创建 transport 已销毁错误。 */
  constructor(message: string) {
    super('TRANSPORT_DESTROYED', message)
  }
}

/** 根据失败响应还原 RPC 错误。 */
export function createRpcErrorFromResponse<TData>(response: RpcResponse<TData>): RpcError {
  const message =
    response.error ?? `[rpc] request failed with code: ${response.code ?? 'SERVER_ERROR'}`

  switch (response.code) {
    case 'TIMEOUT':
      return new RpcTimeoutError(message)
    case 'TARGET_NOT_FOUND':
      return new RpcTargetNotFoundError(message)
    case 'METHOD_NOT_FOUND':
      return new RpcMethodNotFoundError(message)
    case 'TRANSPORT_FORBIDDEN':
      return new RpcTransportForbiddenError(message)
    case 'UNAUTHORIZED':
      return new RpcUnauthorizedError(message)
    case 'PAYLOAD_TOO_LARGE':
      return new RpcPayloadTooLargeError(message)
    case 'SERIALIZATION_ERROR':
      return new RpcSerializationError(message)
    case 'TRANSPORT_ERROR':
      return new RpcTransportError(message)
    case 'INVALID_REQUEST':
      return new RpcInvalidRequestError(message)
    case 'TRANSPORT_DESTROYED':
      return new RpcTransportDestroyedError(message)
    case 'SERVER_ERROR':
    default:
      return new RpcServerError(message)
  }
}
