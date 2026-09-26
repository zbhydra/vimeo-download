/**
 * Background RPC v2 迁移类型。
 *
 * 这些类型描述 background 对 content/popup 暴露的状态与扩展能力。
 */

import type { LoginSource, MarkType } from '@/core/api/mark/types'
import type { RemoteConfig } from '@/core/api/remote-config/types'
import type { BrowserManagedSourceKind, ResourceType } from '@/core/constants/resource'
import type { RuntimeConfig } from '@/core/runtimeConfig'
import type { DownloadQueueSnapshot, MediaResource } from '@/core/types'
import type { VimeoCapturedConfigSnapshot, VimeoSourceDescriptor } from '@/sites/vimeo/shared'

/** background ping 响应。 */
export interface BackgroundPingResponse {
  /** 是否收到 background 响应。 */
  pong: boolean
  /** 响应来源。 */
  from: string
}

/** background 状态响应。 */
export interface BackgroundGetStateResponse {
  /** background 当前状态。 */
  state: string
}

/** background 读取扩展运行时配置的响应。 */
export type BackgroundGetRuntimeConfigResponse = RuntimeConfig

/** background 更新徽标请求。 */
export interface BackgroundUpdateBadgeRequest {
  /** 徽标显示数量。 */
  count: number
}

/** background 更新徽标响应。 */
export interface BackgroundUpdateBadgeResponse {
  /** 是否已更新徽标。 */
  updated: boolean
}

/** background 记录打点请求。 */
export interface BackgroundRecordMarkRequest {
  /** 打点类型。 */
  mark_type: MarkType
  /** 打点附加信息。 */
  mark_msg: string
}

/** background 记录打点响应。 */
export interface BackgroundRecordMarkResponse {
  /** 是否已成功记录打点。 */
  recorded: boolean
}

/** Background 读取远端顶层分组稀疏覆盖的响应。 */
export type BackgroundGetRemoteConfigResponse = RemoteConfig

/** background 发起 Google 授权登录的请求。 */
export interface BackgroundStartGoogleLoginRequest {
  /** 登录按钮的业务入口，用于打点归因。 */
  source: LoginSource
}

/**
 * background 发起 Google 授权登录的结果。
 *
 * 兑换与令牌写入都由 background 完成，`completed` 只表示「登录态已落 storage」；
 * 这个返回值只是 popup 仍存活时的附加信息（刷新界面 / 展开验证码步骤），
 * 不承担完成语义——popup 可能在授权窗口获焦时就被销毁。
 */
export type BackgroundStartGoogleLoginResponse =
  | { status: 'completed' }
  | { status: 'email_verification'; email: string }
  | { status: 'cancelled'; reason: string }
  | { status: 'failed'; reason: string }

/** background 直连 Vimeo 播放页取回原生 config 的请求。 */
export interface BackgroundGetVimeoPlayerConfigRequest {
  /** 需要取回 config 的 Vimeo video id。 */
  videoId: string
}

/**
 * background 直连 Vimeo 播放页取回原生 config 的响应。
 *
 * 播放页本身没有可用内嵌 config（未列出/私有视频、页面形态变化）时为 null；请求失败按 RPC 错误
 * 返回，不伪装成 null。
 */
export interface BackgroundGetVimeoPlayerConfigResponse {
  /** 已校验的原生 config 快照；播放页给不出时为 null。 */
  snapshot: VimeoCapturedConfigSnapshot | null
}

/** 可由 Chrome 下载管理器直接保存的媒体来源。 */
export interface BackgroundBrowserDownloadSource {
  /** 资源唯一 ID，用于刷新后找回同一个 Vimeo 选项。 */
  source_id: string
  /** 完整 HTTPS 媒体 URL。 */
  url: string
  /** 资源语义类型。 */
  type: ResourceType
  /** 资源来源类型；background 只接受已声明的直连来源。 */
  source_kind: BrowserManagedSourceKind
  /** 下载目录内使用的文件名。 */
  filename: string
  /** 解析阶段声明的 MIME 类型。 */
  mime_type: string
  /** Vimeo 下载描述符，用于校验来源并在 signed URL 过期后刷新。 */
  document_id: string
}

// ============================================================================
// offscreen 下载任务回传（offscreen → background）
// ============================================================================

/** offscreen 上报下载进度请求。 */
export interface BackgroundTaskProgressRequest {
  /** 编排任务 ID。 */
  taskId: string
  /** 原始媒体资源 ID。 */
  sourceId: string
  /** 当前下载百分比；总大小未知时为 null。 */
  progress: number | null
  /** 已接收字节。 */
  receivedBytes: number | null
  /** 估算总字节；未知时为 null。 */
  totalBytes: number | null
}

/** offscreen 上报进度响应。 */
export interface BackgroundTaskProgressResponse {
  /** 进度是否已写入编排投影。 */
  recorded: boolean
}

/** offscreen 交付 remux 产物请求；落盘由 background 用 chrome.downloads 完成。 */
export interface BackgroundTaskCompleteRequest {
  /** 编排任务 ID。 */
  taskId: string
  /** offscreen document 创建的 blob URL；确认落盘前必须保持有效。 */
  blobUrl: string
  /** 产物文件名。 */
  filename: string
  /** 产物 MIME 类型。 */
  mimeType: string
}

/** offscreen 交付产物响应。 */
export interface BackgroundTaskCompleteResponse {
  /** background 是否已接手落盘。 */
  accepted: boolean
}

/** offscreen 上报任务失败请求。 */
export interface BackgroundTaskFailedRequest {
  /** 编排任务 ID。 */
  taskId: string
  /** 已脱敏的失败原因。 */
  message: string
}

/** offscreen 上报失败响应。 */
export interface BackgroundTaskFailedResponse {
  /** 失败是否已写入编排投影。 */
  accepted: boolean
}

/** offscreen 确认任务已取消请求。 */
export interface BackgroundTaskCancelledRequest {
  /** 编排任务 ID。 */
  taskId: string
}

/** offscreen 确认取消响应。 */
export interface BackgroundTaskCancelledResponse {
  /** 取消是否已写入编排投影。 */
  accepted: boolean
}

/** offscreen 请求重签 Vimeo 签名 URL。 */
export interface BackgroundRefreshSignatureRequest {
  /** 编排任务 ID。 */
  taskId: string
  /** 当前任务携带的下载描述符；重签与 track 一致性守卫都以它为基准。 */
  descriptor: VimeoSourceDescriptor
}

/**
 * 重签响应。
 *
 * `continue` 表示新快照与原任务 track 一致，offscreen 按分片游标续跑；`restart` 表示
 * best 回落换 track，offscreen 以新快照整任务重跑。
 */
export interface BackgroundRefreshSignatureResponse {
  /** 续跑或重跑。 */
  mode: 'continue' | 'restart'
  /** 刷新后的完整资源（含新签名 playlist URL 的描述符）。 */
  resource: MediaResource
}

/** offscreen 心跳响应。 */
export interface BackgroundKeepAliveResponse {
  /** background 存活确认。 */
  alive: boolean
}

// ============================================================================
// background 下载编排（popup/content → background）
// ============================================================================

/** popup/content 委托 background 发起批量下载请求。 */
export interface BackgroundDownloadBatchRequest {
  /** 待下载的完整资源列表，顺序即执行顺序。 */
  resources: MediaResource[]
  /** 发起下载的站点标签页；配额不足时用于让该页 content 显示升级弹窗。 */
  tabId?: number
}

/** background 批量下载受理响应。 */
export interface BackgroundDownloadBatchResponse {
  /** 是否至少受理了一个资源（含已入队去重合并）。 */
  accepted: boolean
  /** 受理的资源数量。 */
  count: number
}

/** popup 取消编排任务请求。 */
export interface BackgroundCancelDownloadTaskRequest {
  /** 编排任务 ID。 */
  taskId: string
}

/** 取消受理响应。 */
export interface BackgroundCancelDownloadTaskResponse {
  /** 任务是否存在且已请求取消。 */
  accepted: boolean
}

/** popup 重试编排任务请求。 */
export interface BackgroundRetryDownloadTaskRequest {
  /** 编排任务 ID。 */
  taskId: string
}

/** 重试受理响应。 */
export interface BackgroundRetryDownloadTaskResponse {
  /** 失败任务是否已重新入队。 */
  accepted: boolean
}

/** background 下载编排队列快照响应。 */
export type BackgroundGetDownloadQueueResponse = DownloadQueueSnapshot
