/**
 * Content RPC v2 register。
 *
 * register 只声明上下文级能力、调用方、传输方式和大小限制，业务由各站点 provider 实现。
 */

import type {
  ContentCancelDownloadTaskRequest,
  ContentCancelDownloadTaskResponse,
  ContentDownloadBatchRequest,
  ContentDownloadBatchResponse,
  ContentGetDownloadQueueResponse,
  ContentGetResourcesResponse,
  ContentRetryDownloadTaskRequest,
  ContentRetryDownloadTaskResponse
} from './types'

/** content provider channel。 */
export const CHANNEL = 'content' as const

/** content 生成客户端类名。 */
export const CLASS_NAME = 'ContentChannel' as const

/** Content RPC 方法签名声明。 */
export const Handler = {
  /** 获取当前缓存资源。 */
  getResources(): Promise<ContentGetResourcesResponse> {
    return declarationOnly('content.getResources')
  },

  /** 查询当前页面未完成下载任务。 */
  getDownloadQueue(): Promise<ContentGetDownloadQueueResponse> {
    return declarationOnly('content.getDownloadQueue')
  },

  /** 启动批量下载。 */
  downloadBatch(_params: ContentDownloadBatchRequest): Promise<ContentDownloadBatchResponse> {
    return declarationOnly('content.downloadBatch')
  },

  /** 按唯一任务 ID 取消当前页面下载。 */
  cancelDownloadTask(
    _params: ContentCancelDownloadTaskRequest
  ): Promise<ContentCancelDownloadTaskResponse> {
    return declarationOnly('content.cancelDownloadTask')
  },

  /** 按唯一任务 ID 人工重试失败下载。 */
  retryDownloadTask(
    _params: ContentRetryDownloadTaskRequest
  ): Promise<ContentRetryDownloadTaskResponse> {
    return declarationOnly('content.retryDownloadTask')
  }
}

/** content register handler 类型。 */
export type ContentHandler = typeof Handler

/** content 方法允许调用方。 */
export const METHOD_TARGETS = {
  /** popup/background 可读取资源。 */
  getResources: ['popup', 'background'],
  /** popup/background 可读取当前页面下载任务。 */
  getDownloadQueue: ['popup', 'background'],
  /** popup/background 可启动下载。 */
  downloadBatch: ['popup', 'background'],
  /** 取消入口只由 Popup 调用；页面入口在 content 内直接调用 manager。 */
  cancelDownloadTask: ['popup'],
  /** 重试入口只由 Popup 调用；页面入口在 content 内直接调用 manager。 */
  retryDownloadTask: ['popup']
} as const satisfies Record<keyof ContentHandler, readonly ('popup' | 'background')[]>

/** content 方法允许传输。 */
export const METHOD_TRANSPORTS = {
  /** getResources 使用 Chrome message。 */
  getResources: ['chrome'],
  /** getDownloadQueue 使用 Chrome message。 */
  getDownloadQueue: ['chrome'],
  /** downloadBatch 使用 Chrome message。 */
  downloadBatch: ['chrome'],
  /** cancelDownloadTask 使用 Chrome message。 */
  cancelDownloadTask: ['chrome'],
  /** retryDownloadTask 使用 Chrome message。 */
  retryDownloadTask: ['chrome']
} as const satisfies Record<keyof ContentHandler, readonly ['chrome']>

/** content 方法请求体限制，单位字节。 */
export const METHOD_REQUEST_LIMITS = {
  /** getResources 无业务参数。 */
  getResources: 1024,
  /** getDownloadQueue 无业务参数。 */
  getDownloadQueue: 1024,
  /** downloadBatch 携带有序资源 ID 列表。 */
  downloadBatch: 16384,
  /** cancelDownloadTask 只携带唯一任务 ID。 */
  cancelDownloadTask: 4096,
  /** retryDownloadTask 只携带唯一任务 ID。 */
  retryDownloadTask: 4096
} as const satisfies Record<keyof ContentHandler, number>

/** content 方法响应体限制，单位字节。 */
export const METHOD_RESPONSE_LIMITS = {
  /**
   * getResources 返回完整资源缓存。
   *
   * 聚合页回退按视频分组缓存（上限 8 个视频，单视频约 30 条资源、2.7KB 序列化体积），
   * 实测 8 视频 113 条资源约 305KB，已超单视频时代的 256KB；对齐 getVimeoPlayerConfig 的
   * 768KB 上界，覆盖最坏组合（8 视频 × 约 30 条 × 2.7KB ≈ 650KB）。
   */
  getResources: 786432,
  /** getDownloadQueue 只返回未完成任务的轻量展示字段。 */
  getDownloadQueue: 65536,
  /** downloadBatch 返回资源回查与入队受理结果。 */
  downloadBatch: 16384,
  /** cancelDownloadTask 返回是否接受。 */
  cancelDownloadTask: 4096,
  /** retryDownloadTask 返回是否接受。 */
  retryDownloadTask: 4096
} as const satisfies Record<keyof ContentHandler, number>

/** register 占位函数，避免声明被业务代码误调用。 */
function declarationOnly(methodName: string): never {
  throw new Error(`[rpc-register] ${methodName} is declaration only`)
}
