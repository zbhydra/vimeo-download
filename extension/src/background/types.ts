/**
 * Background RPC v2 迁移类型。
 *
 * 这些类型描述 background 对 content/popup 暴露的状态与扩展能力。
 */

import type { LoginSource, MarkType } from '@/core/api/mark/types'
import type { QuotaCheckResponse } from '@/core/api/quota/types'
import type { RemoteConfig } from '@/core/api/remote-config/types'
import type { BrowserManagedSourceKind, ResourceType } from '@/core/constants/resource'
import type { RuntimeConfig } from '@/core/runtimeConfig'
import type { VimeoCapturedConfigSnapshot } from '@/sites/vimeo/shared'

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

/** background 配额检查请求。 */
export interface BackgroundCheckQuotaRequest {
  /** 需要消耗的配额数量。 */
  count: number
}

/** background 配额检查响应。 */
export type BackgroundCheckQuotaResponse = QuotaCheckResponse

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

/** 创建浏览器原生下载请求。 */
export interface BackgroundStartBrowserDownloadRequest {
  /** 待下载的完整直连来源。 */
  source: BackgroundBrowserDownloadSource
  /** 是否先从 Vimeo 原生 refresh config 恢复一次新 signed URL。 */
  refresh_source: boolean
}

/** 创建浏览器原生下载响应。 */
export interface BackgroundStartBrowserDownloadResponse {
  /** Chrome 下载管理器分配的持久下载 ID。 */
  download_id: number
}

/** 查询浏览器原生下载状态请求。 */
export interface BackgroundGetBrowserDownloadStatusRequest {
  /** Chrome 下载管理器分配的下载 ID。 */
  download_id: number
  /** 初始来源类型，用于校验最终重定向和 MIME。 */
  source_kind: BrowserManagedSourceKind
}

/** 浏览器原生下载状态。 */
export type BackgroundBrowserDownloadState = 'in_progress' | 'complete' | 'interrupted'

/** 查询浏览器原生下载状态响应。 */
export interface BackgroundGetBrowserDownloadStatusResponse {
  /** Chrome 当前下载状态。 */
  state: BackgroundBrowserDownloadState
  /** 已写入下载任务的字节数。 */
  bytes_received: number
  /** 总字节数；Chrome 尚未获知时为 null。 */
  total_bytes: number | null
  /** 中断原因；未中断时省略。 */
  error?: string
}
