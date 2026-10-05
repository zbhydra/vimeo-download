/**
 * 通用下载工作区类型定义。
 *
 * 统一 Vimeo 资源的解析与下载数据结构。
 */

/** 支持的平台类型。 */
export type MediaPlatform = 'vimeo'

/** 下载方法 ID。 */
export type DownloadMode = 'direct' | 'client_mux'

/** 下载临时数据存储类型。 */
export type DownloadStorageType = 'opfs' | 'indexeddb' | 'memory'

/** 下载恢复能力。 */
export type DownloadRecoveryMode = 'resumable' | 'restartable' | 'current_page'

/** 下载本地存储操作，用于存储错误定位。 */
export type DownloadStorageOperation =
  | 'preflight'
  | 'probe'
  | 'save_status'
  | 'write_temp'
  | 'read_temp'
  | 'clear'
  | 'restore'

/** 资源能力声明，控制 UI 展示。 */
export interface MediaCapabilities {
  /** 是否可下载。 */
  download: boolean
  /** 是否允许进入 Download all 串行队列；未声明时由下载方法默认值决定。 */
  downloadQueue?: boolean
}

/** 解析后的媒体资源。 */
export interface MediaPost {
  /** 资源唯一标识符，用于下载请求。 */
  sourceId: string
  /** 服务端签发的资源 token，download-anonymous-pre-v2 只信任该 token 内的资源字段。 */
  resourceToken: string
  /** 文件名，用于下载时命名。 */
  filename: string
  /** 资源类型，如 "video"、"photo"、"document"。 */
  type: string
  /** 文件大小（字节），null 表示未知。 */
  size: number | null
  /** 来源链接（规范化后的链接）。 */
  link: string
  /** MIME 类型。 */
  mimeType?: string
  /** 视频/音频时长（秒）。 */
  duration?: number
  /** 宽度。 */
  width?: number
  /** 高度。 */
  height?: number
  /** 来源消息 ID。 */
  messageId?: number | string
  /** 平台类型。 */
  platform: MediaPlatform
  /** 下载模式，direct 走客户端授权直连，client_mux 走客户端多轨合成。 */
  downloadMode: DownloadMode
  /** V2 解析成功节点 ID，下载授权时仅作为节点亲和 hint。 */
  preferredNodeId?: number
  /** 缩略图地址，Vimeo 等平台会提供。 */
  thumbnailUrl?: string
  /** 资源能力声明。 */
  capabilities: MediaCapabilities
}

/** 解析响应。 */
export interface MediaParseResult {
  /** 解析出的资源列表。 */
  resources: MediaPost[]
  /** 后端规范化后的链接。 */
  canonicalLink: string
  /** 用户输入的原始链接。 */
  originalLink: string
  /** 平台类型。 */
  platform: MediaPlatform
}

/** 后端直连下载授权结果。 */
export interface DirectDownloadIntent {
  /** 资源 ID。 */
  sourceId: string
  /** 平台类型。 */
  platform: 'vimeo'
  /** 下载模式，固定为 direct。 */
  downloadMode: 'direct'
  /** 当前可用的 CDN 直链。 */
  downloadUrl: string
  /** 后端建议文件名。 */
  filename: string
  /** MIME 类型。 */
  mimeType?: string
  /** 文件大小，null 表示未知。 */
  size: number | null
  /** 直链过期时间戳，null 表示未知。 */
  expiresAt?: number | null
}

/** 客户端合成下载轨道。 */
interface ClientMuxTrackBase {
  /** 轨道类型。 */
  kind: 'video' | 'audio'
  /** 轨道 MIME 类型。 */
  mimeType: string
  /** 轨道大小，null 表示未知。 */
  size: number | null
}

export type ClientMuxTrackIntent = ClientMuxTrackBase & (
  | { delivery: 'file'; url: string }
  | {
      delivery: 'segments'
      /** Base64 编码的初始化分片。 */
      initSegment: string
      segments: { url: string; size: number | null }[]
    }
)

/** 后端多轨合成下载授权结果。 */
export interface ClientMuxDownloadIntent {
  /** 资源 ID。 */
  sourceId: string
  /** 平台类型。 */
  platform: 'vimeo'
  /** 下载模式，固定为 client_mux。 */
  downloadMode: 'client_mux'
  /** 合成后文件名。 */
  filename: string
  /** 合成后 MIME 类型。 */
  mimeType: string
  /** 合计文件大小，null 表示未知。 */
  size: number | null
  /** 直链过期时间戳，null 表示未知。 */
  expiresAt?: number | null
  /** 视频轨道。 */
  videoTrack: ClientMuxTrackIntent
  /** 音频轨道。 */
  audioTrack: ClientMuxTrackIntent
}

/** 下载中断后可恢复的待办任务。 */
export interface PendingDownloadTask {
  /** 资源来源链接。 */
  link: string
  /** 资源 ID。 */
  sourceId: string
  /** 文件名。 */
  filename: string
  /** 已下载字节。 */
  downloadedBytes: number
  /** 总字节数，null 表示未知。 */
  totalBytes: number | null
  /** MIME 类型。 */
  mimeType: string
  /** 更新时间戳。 */
  updatedAt: number
  /** 是否持久化存储。 */
  persistent: boolean
  /** 当前下载使用的本地存储类型。 */
  storageType: DownloadStorageType
  /** 当前任务的恢复能力。 */
  recoveryMode: DownloadRecoveryMode
  /** 平台类型。 */
  platform: MediaPlatform
  /** 下载模式，恢复时用于判断走直连还是多轨合成。 */
  downloadMode: DownloadMode
  /** 已授权的直连下载地址，仅 direct 模式恢复时使用。 */
  downloadUrl?: string
}

/** 下载进度快照。 */
export interface DownloadProgressSnapshot {
  /** 百分比进度，undefined 表示未知大小。 */
  progress?: number
  /** 已下载字节。 */
  downloadedBytes: number
  /** 总字节数。 */
  totalBytes: number | null
  /** 下载速度（字节/秒）。 */
  speedBytesPerSecond: number | null
}

/** Download all 批量结果。 */
export type BatchDownloadResult = 'allSuccess' | 'partialFailed' | 'allFailed'
