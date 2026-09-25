/**
 * Injected RPC v2 迁移类型。
 *
 * 这些类型描述 injected 能力请求与响应，新的 register 只负责统一通信边界。
 */

import type { IMediaSource } from '@/core/protocol/injected'
import type { VimeoCapturedConfigSnapshot } from '@/sites/vimeo/shared'
import type { VimeoConfig } from '@/sites/vimeo/runtimeConfig'
import type { RuntimeConfig } from '@/core/runtimeConfig'

/** Content 向 MAIN world 同步运行时配置的请求。 */
export type InjectedApplyRuntimeConfigRequest = RuntimeConfig

/** MAIN world 应用运行时配置的响应。 */
export interface InjectedApplyRuntimeConfigResponse {
  /** 是否已应用配置。 */
  applied: boolean
}

/** Content 向 MAIN world 同步当前站点配置的请求。 */
export type InjectedApplySiteConfigRequest = VimeoConfig

/** MAIN world 应用站点配置的响应。 */
export interface InjectedApplySiteConfigResponse {
  /** 是否已应用配置。 */
  applied: boolean
}

/** 查询 Vimeo MAIN world 原生 config 捕获。 */
export interface InjectedGetCapturedVimeoConfigRequest {
  /** 当前 DOM 已明确识别的 Vimeo video id。 */
  videoId: string
}

/** 查询 Vimeo MAIN world 原生 config 捕获响应。 */
export interface InjectedGetCapturedVimeoConfigResponse {
  /** 捕获结果；原生播放器尚未请求 config 时为 null。 */
  snapshot: VimeoCapturedConfigSnapshot | null
}

/** MAIN world 已捕获 Vimeo config 的概要。 */
export interface InjectedCapturedVimeoConfigSummary {
  /** Vimeo video id。 */
  videoId: string
  /** 视频标题；config 未提供时为解析层占位标题。 */
  title: string
  /** 视频时长（秒）；config 未提供时省略。 */
  durationSeconds?: number
  /** 最高分辨率封面 URL；config 未提供时省略。 */
  thumbnailUrl?: string
}

/** 枚举 Vimeo MAIN world 已捕获 config 概要的响应。 */
export interface InjectedListCapturedVimeoConfigsResponse {
  /** 已捕获概要，按捕获先后排序；条数受 MAIN world 捕获上限约束。 */
  videos: InjectedCapturedVimeoConfigSummary[]
}

/** 下载单个媒体请求。 */
export interface InjectedDownloadMediaRequest {
  /** 当前页面下载管理器分配的唯一任务 ID。 */
  taskId: string
  /** 待下载媒体源。 */
  source: IMediaSource
}

/** downloadMedia 响应。 */
export interface InjectedDownloadMediaResponse {
  /** MAIN world 已结束本次长调用。 */
  success: true
}
