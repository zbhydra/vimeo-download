/**
 * Content RPC v2 register。
 *
 * register 只声明上下文级能力、调用方、传输方式和大小限制，业务由各站点 provider 实现。
 * 下载发起、取消与队列快照统一走 background 编排器；content 只暴露资源查询。
 */

import type { ContentGetResourcesResponse } from './types'

/** content provider channel。 */
export const CHANNEL = 'content' as const

/** content 生成客户端类名。 */
export const CLASS_NAME = 'ContentChannel' as const

/** Content RPC 方法签名声明。 */
export const Handler = {
  /** 获取当前缓存资源。 */
  getResources(): Promise<ContentGetResourcesResponse> {
    return declarationOnly('content.getResources')
  }
}

/** content register handler 类型。 */
export type ContentHandler = typeof Handler

/** content 方法允许调用方。 */
export const METHOD_TARGETS = {
  /** popup/background 可读取资源。 */
  getResources: ['popup', 'background']
} as const satisfies Record<keyof ContentHandler, readonly ('popup' | 'background')[]>

/** content 方法允许传输。 */
export const METHOD_TRANSPORTS = {
  /** getResources 使用 Chrome message。 */
  getResources: ['chrome']
} as const satisfies Record<keyof ContentHandler, readonly ['chrome']>

/** content 方法请求体限制，单位字节。 */
export const METHOD_REQUEST_LIMITS = {
  /** getResources 无业务参数。 */
  getResources: 1024
} as const satisfies Record<keyof ContentHandler, number>

/** content 方法响应体限制，单位字节。 */
export const METHOD_RESPONSE_LIMITS = {
  /**
   * getResources 返回完整资源缓存。
   *
   * 每条 DASH 视频资源都带完整分片时间线（约 28 字节/秒），19 分钟视频的单视频响应实测
   * 429KB，随时长线性增长；旧 1.5MiB 上限约 65 分钟视频就会撑破。8MiB 可覆盖约 6 小时
   * 视频（聚合页 16 个短视频的最坏组合也在内），超过时显式报错而不是静默截断。
   */
  getResources: 8388608
} as const satisfies Record<keyof ContentHandler, number>

/** register 占位函数，避免声明被业务代码误调用。 */
function declarationOnly(methodName: string): never {
  throw new Error(`[rpc-register] ${methodName} is declaration only`)
}
