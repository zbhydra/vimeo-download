/**
 * BackgroundMessageRouter - Background Script 消息路由器
 *
 * 使用新的 RPC 系统处理来自 content/popup 的消息
 */

import { logger } from '@/core/utils/logger'
import { serve } from '@/core/rpc/serve'
import type {
  JsonObject,
  JsonValue,
  RpcContext,
  RpcServeHandlers,
  RpcServeRegistration
} from '@/core/rpc/types'
import {
  CHANNEL,
  METHOD_REQUEST_LIMITS,
  METHOD_RESPONSE_LIMITS,
  METHOD_TARGETS,
  METHOD_TRANSPORTS
} from '@/background/background-register'
import { BadgeManager } from './BadgeManager'
import { quotaApi } from '@/core/api/quota'
import type { QuotaCheckResponse } from '@/core/api/quota/types'
import { remoteConfigApi } from '@/core/api/remote-config'
import type { RemoteConfig } from '@/core/api/remote-config/types'
import { recordBackgroundMark } from './ExtensionMarkReporter'
import { LOGIN_SOURCES, MARK_TYPE, type LoginSource, type MarkType } from '@/core/api/mark/types'
import {
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  type BrowserManagedSourceKind,
  type ResourceType
} from '@/core/constants/resource'
import type {
  BackgroundGetBrowserDownloadStatusRequest,
  BackgroundStartBrowserDownloadRequest,
  BackgroundStartGoogleLoginRequest
} from '@/background/types'
import { browserDownloadService } from './BrowserDownloadService'
import { googleLoginService } from './GoogleLoginService'
import { loadVimeoCapturedConfigFromPlayerPage } from '@/sites/vimeo/config'
import { isVimeoHostname } from '@/sites/vimeo/shared'
import { getRuntimeConfig } from '../runtimeConfig'

const MARK_TYPE_VALUES: readonly string[] = Object.values(MARK_TYPE)
const LOGIN_SOURCE_VALUES: readonly string[] = LOGIN_SOURCES

// ============ 消息路由器 ============

/**
 * BackgroundMessageRouter - Background Script 消息处理器
 */
export class BackgroundMessageRouter {
  private rpcRegistration: RpcServeRegistration | null = null

  /**
   * 注册 RPC v2 方法处理器。
   */
  private createRpcHandlers(): RpcServeHandlers {
    return {
      ping: () => this.ping(),
      getState: () => this.getState(),
      getRuntimeConfig: () => getRuntimeConfig(),
      updateBadge: params => {
        const request = parseUpdateBadgeRequest(params)
        return this.updateBadge(request.count)
      },
      getRemoteConfig: () => this.getRemoteConfig(),
      getVimeoPlayerConfig: async (params, context) => {
        const request = parseGetVimeoPlayerConfigRequest(params)
        assertVimeoCaller(context)
        return { snapshot: await loadVimeoCapturedConfigFromPlayerPage(request.videoId) }
      },
      recordMark: (params, context) => {
        const request = parseRecordMarkRequest(params)
        return recordBackgroundMark(request.mark_type, request.mark_msg, {
          pageUrl: context.origin
        })
      },
      checkQuota: params => {
        const request = parseCheckQuotaRequest(params)
        return this.checkQuota(request.count)
      },
      startBrowserDownload: (params, context) =>
        browserDownloadService.start(parseStartBrowserDownloadRequest(params), context),
      getBrowserDownloadStatus: (params, context) =>
        browserDownloadService.getStatus(parseGetBrowserDownloadStatusRequest(params), context),
      startGoogleLogin: params => googleLoginService.start(parseStartGoogleLoginRequest(params))
    }
  }

  /**
   * background 连通性检查。
   */
  private ping(): { pong: boolean; from: string } {
    logger.info('[BackgroundMessageRouter] 收到 PING')
    return { pong: true, from: 'background' }
  }

  /**
   * 获取 background 状态。
   */
  private getState(): { state: string } {
    logger.info('[BackgroundMessageRouter] 获取状态')
    return { state: 'active' }
  }

  /**
   * 更新扩展徽标。
   */
  private updateBadge(count: number): { updated: boolean } {
    logger.info('[BackgroundMessageRouter] 更新徽章', { count })
    BadgeManager.updateBadge(count)
    return { updated: true }
  }

  /**
   * 由 background 代 content script 检查并消耗配额。
   */
  private async checkQuota(count: number): Promise<QuotaCheckResponse> {
    return quotaApi.checkAndConsume({ count })
  }

  /** 由 background 代 content script 读取远端顶层分组稀疏覆盖。 */
  private async getRemoteConfig(): Promise<RemoteConfig> {
    return remoteConfigApi.getConfig()
  }

  /**
   * 设置消息监听器
   */
  setupListener(): void {
    this.rpcRegistration = serve(CHANNEL, this.createRpcHandlers(), {
      transports: ['chrome'],
      methodTargets: METHOD_TARGETS,
      methodTransports: METHOD_TRANSPORTS,
      requestLimits: METHOD_REQUEST_LIMITS,
      responseLimits: METHOD_RESPONSE_LIMITS
    })
    logger.info('[BackgroundMessageRouter] 消息监听器已设置')
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.rpcRegistration?.stop()
    this.rpcRegistration = null
    logger.info('[BackgroundMessageRouter] 消息监听器已移除')
  }
}

/**
 * 解析 updateBadge 请求参数。
 */
function parseUpdateBadgeRequest(params: JsonValue | undefined): { count: number } {
  if (!isJsonObject(params) || typeof params.count !== 'number') {
    throw new Error('[BackgroundMessageRouter] updateBadge 请求缺少 count')
  }

  return { count: params.count }
}

/**
 * 解析 recordMark 请求参数。
 */
function parseRecordMarkRequest(params: JsonValue | undefined): {
  mark_type: MarkType
  mark_msg: string
} {
  if (!isJsonObject(params) || !isMarkType(params.mark_type)) {
    throw new Error('[BackgroundMessageRouter] recordMark 请求缺少合法 mark_type')
  }

  if (params.mark_msg !== undefined && typeof params.mark_msg !== 'string') {
    throw new Error('[BackgroundMessageRouter] recordMark 请求 mark_msg 必须是字符串')
  }

  return { mark_type: params.mark_type, mark_msg: params.mark_msg ?? '' }
}

/**
 * 解析 checkQuota 请求参数。
 */
export function parseCheckQuotaRequest(params: JsonValue | undefined): { count: number } {
  if (
    !isJsonObject(params) ||
    typeof params.count !== 'number' ||
    !Number.isInteger(params.count)
  ) {
    throw new Error('[BackgroundMessageRouter] checkQuota 请求缺少整数 count')
  }

  if (params.count <= 0) {
    throw new Error('[BackgroundMessageRouter] checkQuota 请求 count 必须大于 0')
  }

  return { count: params.count }
}

/** 解析创建浏览器原生下载请求。 */
function parseStartBrowserDownloadRequest(
  params: JsonValue | undefined
): BackgroundStartBrowserDownloadRequest {
  if (!isJsonObject(params) || !isJsonObject(params.source)) {
    throw new Error('[BackgroundMessageRouter] startBrowserDownload 请求缺少 source')
  }
  if (typeof params.refresh_source !== 'boolean') {
    throw new Error('[BackgroundMessageRouter] startBrowserDownload 请求缺少 refresh_source')
  }

  const source = params.source
  const sourceKind = parseBrowserManagedSourceKind(source.source_kind)
  const resourceType = parseResourceType(source.type)
  return {
    source: {
      source_id: requireString(source, 'source_id', 'startBrowserDownload.source'),
      url: requireString(source, 'url', 'startBrowserDownload.source'),
      type: resourceType,
      source_kind: sourceKind,
      filename: requireString(source, 'filename', 'startBrowserDownload.source'),
      mime_type: requireString(source, 'mime_type', 'startBrowserDownload.source'),
      document_id: requireString(source, 'document_id', 'startBrowserDownload.source')
    },
    refresh_source: params.refresh_source
  }
}

/** 解析直连 Vimeo 播放页取回原生 config 的请求。 */
function parseGetVimeoPlayerConfigRequest(params: JsonValue | undefined): { videoId: string } {
  if (!isJsonObject(params)) {
    throw new Error('[BackgroundMessageRouter] getVimeoPlayerConfig 请求体必须是对象')
  }

  const videoId = requireString(params, 'videoId', 'getVimeoPlayerConfig')
  if (!/^\d+$/.test(videoId)) {
    throw new Error(
      `[BackgroundMessageRouter] getVimeoPlayerConfig.videoId 必须是数字 ID: value=${videoId}`
    )
  }

  return { videoId }
}

/** 校验请求来自 Vimeo content script：兜底只为 Vimeo 页面代取播放页 config。 */
function assertVimeoCaller(context: RpcContext): void {
  let origin: URL
  try {
    origin = new URL(context.origin ?? '')
  } catch (_error) {
    throw new Error('[BackgroundMessageRouter] getVimeoPlayerConfig 调用缺少合法 Vimeo origin')
  }

  if (origin.protocol !== 'https:' || !isVimeoHostname(origin.hostname)) {
    throw new Error(
      `[BackgroundMessageRouter] 拒绝非 Vimeo 页面调用 getVimeoPlayerConfig: origin=${origin.origin}`
    )
  }
}

/** 解析 Google 授权登录请求。 */
export function parseStartGoogleLoginRequest(
  params: JsonValue | undefined
): BackgroundStartGoogleLoginRequest {
  if (!isJsonObject(params) || !isLoginSource(params.source)) {
    throw new Error('[BackgroundMessageRouter] startGoogleLogin 请求缺少合法 source')
  }

  return { source: params.source }
}

/** 判断值是否为已声明登录来源。 */
function isLoginSource(value: JsonValue | undefined): value is LoginSource {
  return typeof value === 'string' && LOGIN_SOURCE_VALUES.includes(value)
}

/** 解析浏览器原生下载状态请求。 */
function parseGetBrowserDownloadStatusRequest(
  params: JsonValue | undefined
): BackgroundGetBrowserDownloadStatusRequest {
  if (
    !isJsonObject(params) ||
    typeof params.download_id !== 'number' ||
    !Number.isInteger(params.download_id) ||
    params.download_id < 0
  ) {
    throw new Error('[BackgroundMessageRouter] getBrowserDownloadStatus 请求缺少合法 download_id')
  }

  return {
    download_id: params.download_id,
    source_kind: parseBrowserManagedSourceKind(params.source_kind)
  }
}

/** 要求 JSON 对象字段为非空字符串。 */
function requireString(body: JsonObject, field: string, label: string): string {
  const value = body[field]
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw new Error(`[BackgroundMessageRouter] ${label}.${field} 必须是非空字符串`)
}

/** 解析 background 当前支持的浏览器原生下载来源。 */
function parseBrowserManagedSourceKind(value: JsonValue | undefined): BrowserManagedSourceKind {
  if (
    value === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4 ||
    value === RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL ||
    value === RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL
  ) {
    return value
  }
  throw new Error('[BackgroundMessageRouter] 浏览器原生下载 source_kind 不受支持')
}

/** 解析资源语义类型。 */
function parseResourceType(value: JsonValue | undefined): ResourceType {
  if (
    value === RESOURCE_TYPES.IMAGE ||
    value === RESOURCE_TYPES.VIDEO ||
    value === RESOURCE_TYPES.AUDIO ||
    value === RESOURCE_TYPES.SUBTITLE
  ) {
    return value
  }
  throw new Error('[BackgroundMessageRouter] 浏览器原生下载 type 不受支持')
}

/**
 * 判断值是否为已声明打点类型。
 */
function isMarkType(value: JsonValue | undefined): value is MarkType {
  return typeof value === 'string' && MARK_TYPE_VALUES.includes(value)
}

/**
 * 判断值是否为 JSON 对象。
 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
