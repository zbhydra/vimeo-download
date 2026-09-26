/**
 * Offscreen RPC 请求与响应类型。
 *
 * 这些类型描述 background 可调用的 offscreen 能力：启动/取消 DASH/HLS 下载任务、
 * 查询活跃任务（SW 冷启动对账的执行真相源）与释放已确认落盘的 blob 产物。
 */

import type { MediaResource } from '@/core/types'

/** background 启动 offscreen 下载任务请求。 */
export interface OffscreenStartTaskRequest {
  /** 编排器分配的全局唯一任务 ID，进度/交付/取消消息都按它回传。 */
  taskId: string
  /** 完整媒体资源；DASH/HLS 描述符在 documentId 内。 */
  resource: MediaResource
}

/** offscreen 受理下载任务响应。 */
export interface OffscreenStartTaskResponse {
  /** 任务已被 offscreen 接受并在后台执行。 */
  started: boolean
}

/** background 取消 offscreen 下载任务请求。 */
export interface OffscreenCancelTaskRequest {
  /** 目标任务 ID。 */
  taskId: string
}

/** offscreen 取消受理响应。 */
export interface OffscreenCancelTaskResponse {
  /** 任务存在且已请求中止。 */
  accepted: boolean
}

/** offscreen 活跃任务摘要；SW 冷启动对账以它为准重建编排表。 */
export interface OffscreenActiveTaskInfo {
  /** 任务 ID。 */
  taskId: string
  /** 原始媒体资源 ID。 */
  resourceId: string
  /** 当前下载百分比；总大小未知时为 null。 */
  progress: number | null
  /** 已接收字节。 */
  receivedBytes: number | null
  /** 估算总字节；未知时为 null。 */
  totalBytes: number | null
  /** 执行中的完整资源；编排表重建需要它继续交付与重试。 */
  resource: MediaResource
}

/** offscreen 活跃任务清单响应。 */
export interface OffscreenListActiveTasksResponse {
  /** 仍在执行（未交付、未取消）的任务。 */
  tasks: OffscreenActiveTaskInfo[]
}

/** background 通知 offscreen 释放已落盘产物请求。 */
export interface OffscreenReleaseTaskArtifactRequest {
  /** 产物所属任务 ID。 */
  taskId: string
  /** 待 revoke 的 blob URL。 */
  blobUrl: string
}

/** offscreen 释放产物响应。 */
export interface OffscreenReleaseTaskArtifactResponse {
  /** blob URL 是否已被 revoke。 */
  released: boolean
}
