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
   * 聚合页回退按视频分组缓存（上限 16 个视频，单视频约 30 条资源、2.7KB 序列化体积），
   * 实测 8 视频 113 条资源约 305KB；对齐检测上限 16 后最坏组合为
   * 16 视频 × 约 30 条 × 2.7KB ≈ 1.3MB，超出原 768KB 上界，取 1.5MB 覆盖并留余量。
   * 组元数据随每条资源多带 groupMetadata（标题/作者/时长/封面约 0.25KB/条）：最坏组合
   * 再加 16 × 30 × 0.25KB ≈ 120KB → 约 1.42MB，videoGroups 本身仅 16 组约 3KB，上限不调。
   */
  getResources: 1572864
} as const satisfies Record<keyof ContentHandler, number>

/** register 占位函数，避免声明被业务代码误调用。 */
function declarationOnly(methodName: string): never {
  throw new Error(`[rpc-register] ${methodName} is declaration only`)
}
