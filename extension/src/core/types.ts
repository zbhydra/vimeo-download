/**
 * 统一类型定义
 *
 * 设计原则：只定义跨模块通信的"契约"类型，内部实现细节不导出
 * 参考: @docs/analysis/04-event-communication.md - 事件通信机制
 */

import {
  RESOURCE_TYPES,
  RESOURCE_SOURCE_KINDS,
  type ResourceType,
  type ResourceSourceKind,
  MIME_TYPE_MAP,
  RESOURCE_EXTENSION_MAP,
  getDefaultResourceExtension,
  getExtensionFromMimeType
} from './constants/resource'

// ============================================================================
// 资源类型（重新导出）
// ============================================================================
export {
  RESOURCE_TYPES,
  RESOURCE_SOURCE_KINDS,
  type ResourceType,
  type ResourceSourceKind,
  MIME_TYPE_MAP,
  RESOURCE_EXTENSION_MAP,
  getDefaultResourceExtension,
  getExtensionFromMimeType
}

// ============================================================================
// 数据结构（跨模块传递）
// ============================================================================

/**
 * 下载元数据
 */
export interface DownloadMetadata {
  /** 所属消息 ID */
  messageId: string
}

/**
 * 站点媒体资源
 */
export interface MediaResource {
  /** 跨 URL、来源与扫描轮次保持稳定的资源唯一 lookup key。 */
  id: string
  /** 所属消息ID */
  messageId: string
  /** 在消息中的索引（0-based） */
  index: number
  /** 媒体URL */
  url: string
  /** 资源类型 */
  type: ResourceType
  /** 资源来源类型 */
  sourceKind: ResourceSourceKind
  /** 文件名 */
  filename?: string
  /** 站点解析出的媒体标题，Popup 信息区展示；缺失时回退到文件名。 */
  title?: string
  /** 站点解析出的作者/上传者名称，Popup 信息区展示；缺失时整行不渲染。 */
  author?: string
  /** 文件大小 */
  size?: number
  /** 缩略图URL */
  thumbnail?: string
  /** MIME 类型，优先来自站点解析出的元数据 */
  mimeType?: string
  /** 站点内部文档/下载描述符，Vimeo 用它恢复 DASH track 与 config 信息。 */
  documentId?: string
  /** 视频编码信息 */
  codec?: string
  /** 媒体宽度 */
  width?: number
  /** 媒体高度 */
  height?: number
  /** 媒体时长（秒） */
  duration?: number
  /** 所属站点实体 ID */
  chatId?: string
  /** 下载元数据（下载时必填） */
  metadata: DownloadMetadata
}

/** 下载管理入口可见的未完成任务状态。 */
export type DownloadTaskStatus = 'waiting' | 'downloading' | 'failed'

/**
 * 单个未完成下载任务的只读快照。
 *
 * taskId 区分同一资源的重复点击；resourceId 只用于匹配来自页面下载器的进度事件。
 */
export interface DownloadTaskSnapshot {
  /** 本次下载任务 ID，同一资源重复下载时仍保持唯一。 */
  taskId: string
  /** 原始媒体资源 ID。 */
  resourceId: string
  /** 已确认的最终保存文件名。 */
  filename?: string
  /** 媒体类型。 */
  type: ResourceType
  /** 媒体在所属消息中的 0-based 索引。 */
  resourceIndex: number
  /** 当前未完成状态；取消完成后任务直接从快照移除。 */
  status: DownloadTaskStatus
  /** 当前下载百分比；总大小未知或尚未开始报告时为 null。 */
  progress: number | null
  /** 已接收字节；没有可靠来源时为 null。 */
  receivedBytes: number | null
  /** 总字节；优先使用传输响应大小，其次使用资源声明大小。 */
  totalBytes: number | null
  /** 每秒接收字节；至少两个有效字节样本后才有值。 */
  bytesPerSecond: number | null
  /** 字节与速度是否由百分比和声明大小估算。 */
  bytesAreEstimated: boolean
}

/** 当前页面全部未完成下载任务的版本化快照。 */
export interface DownloadQueueSnapshot {
  /** 页面 content 生命周期唯一 ID，用于隔离不同标签页和页面重载。 */
  scopeId: string
  /** 每次任务或进度变化递增，用于丢弃乱序事件。 */
  revision: number
  /** 按任务创建顺序排列的未完成任务。 */
  tasks: DownloadTaskSnapshot[]
}

// ============================================================================
// 认证相关类型
// ============================================================================

/**
 * 用户信息
 */
export interface UserInfo {
  /** 用户ID */
  user_id: number
  /** 邮箱 */
  email: string | null
  /** 全名 */
  full_name: string | null
  /** 头像URL */
  avatar_url: string | null
  /** 创建时间戳 */
  created_at: number
}
