/**
 * RPC v2 共享常量。
 *
 * 集中定义协议版本、默认超时和事件名前缀，避免 client、server、generator 各自维护魔法值。
 */

/** RPC v2 协议版本号。 */
export const RPC_PROTOCOL_VERSION = 2

/** 默认 RPC 超时时间，单位毫秒。 */
export const DEFAULT_RPC_TIMEOUT = 30000

/** 默认请求体大小限制，单位字节。 */
export const DEFAULT_RPC_REQUEST_LIMIT = 65536

/** 默认响应体大小限制，单位字节。 */
export const DEFAULT_RPC_RESPONSE_LIMIT = 262144

/** 固定 EventRpc 请求事件前缀。 */
export const RPC_EVENT_REQUEST_PREFIX = '__vdl_rpc_request__'

/** 固定 EventRpc 响应事件前缀。 */
export const RPC_EVENT_RESPONSE_PREFIX = '__vdl_rpc_response__'

/** EventRpc frame 除 params 外允许的最大字节余量。 */
export const RPC_EVENT_FRAME_OVERHEAD_LIMIT = 4096

/** EventRpc 客户端接受的最大原始响应 frame，单位字节。 */
export const RPC_EVENT_RESPONSE_FRAME_LIMIT = 1048576

/** 生成固定 EventRpc 请求事件名。 */
export function createRpcRequestEventName(channel: string): string {
  return `${RPC_EVENT_REQUEST_PREFIX}:${channel}`
}

/** 生成固定 EventRpc 响应事件名。 */
export function createRpcResponseEventName(channel: string): string {
  return `${RPC_EVENT_RESPONSE_PREFIX}:${channel}`
}

/** 计算 DOM transport 原始字符串的 UTF-8 字节数。 */
export function measureRpcTextBytes(value: string): number {
  return new TextEncoder().encode(value).length
}
