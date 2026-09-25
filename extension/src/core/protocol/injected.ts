/**
 * Content 交给 MAIN world 下载的媒体源协议。
 */

import { type ResourceType, type ResourceSourceKind } from '../constants/resource'

// ============================================================================
// 媒体下载相关类型
// ============================================================================

/** content 与 MAIN world 下载进度 DOM 事件的固定前缀。 */
export const DOWNLOAD_EVENT_PREFIX = 'vdl_'

/** MAIN world 向 content 报告瞬时下载进度的固定 DOM 事件。 */
export const DOWNLOAD_PROGRESS_EVENT = `${DOWNLOAD_EVENT_PREFIX}downloadProgress`

/**
 * 单项下载的瞬时进度。
 *
 * DOM 事件不可信；content 只能用它更新按钮文案，不能据此扣额度或执行下载。
 */
export interface DownloadProgressDetail {
  /** 当前页面下载管理器分配的唯一任务 ID。 */
  taskId: string
  /** 与下载请求媒体源一致的资源 ID。 */
  sourceId: string
  /** 当前完成百分比；null 表示当前无法计算。 */
  progress: number | null
  /** 当前已接收字节；没有可靠来源时为 null。 */
  receivedBytes: number | null
  /** 传输确认的总字节；未知时为 null。 */
  totalBytes: number | null
  /** 字节是否由百分比和资源声明大小估算。 */
  bytesAreEstimated: boolean
  /** 下载器确认的实际保存文件名。 */
  filename?: string
}

/**
 * 单个媒体源数据
 */
export interface IMediaSource {
  /** 媒体 URL */
  url: string
  /** 媒体 ID */
  id: string
  /** 媒体类型 */
  type: ResourceType
  /** 资源来源类型 */
  sourceKind?: ResourceSourceKind
  /** 页面标识 */
  page: string
  /** 消息 ID */
  messageId: string
  /** 站点内部文档/下载描述符，Vimeo 用它恢复 DASH track 与 config 信息。 */
  documentId?: string
  /** 视频编码信息 */
  codec?: string
  /** 所属站点实体 ID */
  chatId?: string
  /** 文件名（可选，从扫描器解析） */
  filename?: string
  /** 文件大小（可选） */
  size?: number
  /** MIME 类型 */
  mimeType?: string
}
