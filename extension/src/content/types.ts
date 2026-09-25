/**
 * Content RPC 请求与响应类型。
 *
 * 这些类型描述 Popup/background 可调用的 content 能力，站点 provider 负责具体资源。
 */

import type { DownloadQueueSnapshot, MediaResource, VideoGroupSummary } from '@/core/types'

/** content 获取资源响应。 */
export interface ContentGetResourcesResponse {
  /** 当前缓存资源列表。 */
  resources: MediaResource[]
  /** 当前缓存资源数量。 */
  count: number
  /** 每个视频组的展示元数据（标题/作者/时长/封面），顺序与资源分组序一致。 */
  videoGroups: VideoGroupSummary[]
}

/** content 批量下载请求。 */
export interface ContentDownloadBatchRequest {
  /** 待下载资源 ID 列表，顺序就是执行顺序。 */
  resourceIds: string[]
}

/** content 批量下载响应。 */
export interface ContentDownloadBatchResponse {
  /** 是否至少有一个输入资源成功回查并交给下载管理器。 */
  accepted: boolean
  /** 成功回查的输入资源数量。 */
  count: number
}

/** content 当前未完成下载队列响应。 */
export type ContentGetDownloadQueueResponse = DownloadQueueSnapshot

/** content 取消单个下载任务请求。 */
export interface ContentCancelDownloadTaskRequest {
  /** 当前 document 内唯一任务 ID。 */
  taskId: string
}

/** content 取消单个下载任务响应。 */
export interface ContentCancelDownloadTaskResponse {
  /** 是否找到仍可取消的等待中任务。 */
  accepted: boolean
}

/** Popup 按任务 ID 重试失败下载。 */
export interface ContentRetryDownloadTaskRequest {
  taskId: string
}

/** 失败任务是否已重新加入共享 FIFO。 */
export interface ContentRetryDownloadTaskResponse {
  accepted: boolean
}
