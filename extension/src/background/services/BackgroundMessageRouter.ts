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
import { remoteConfigApi } from '@/core/api/remote-config'
import type { RemoteConfig } from '@/core/api/remote-config/types'
import { recordBackgroundMark } from './ExtensionMarkReporter'
import { LOGIN_SOURCES, MARK_TYPE, type LoginSource, type MarkType } from '@/core/api/mark/types'
import type {
  BackgroundStartGoogleLoginRequest,
  BackgroundTaskCompleteRequest,
  BackgroundTaskFailedRequest,
  BackgroundTaskProgressRequest,
  BackgroundRefreshSignatureRequest
} from '@/background/types'
import { googleLoginService } from './GoogleLoginService'
import { downloadOrchestrator } from './DownloadOrchestrator'
import { refreshVimeoTaskResource } from './vimeoSignatureRefresh'
import { parseMediaResource } from '@/core/utils/mediaResource'
import { loadVimeoCapturedConfigFromPlayerPage } from '@/sites/vimeo/config'
import { isVimeoHostname, type VimeoSourceDescriptor } from '@/sites/vimeo/shared'
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
      startGoogleLogin: params => googleLoginService.start(parseStartGoogleLoginRequest(params)),
      taskProgress: params =>
        downloadOrchestrator.handleTaskProgress(parseTaskProgressRequest(params)),
      taskComplete: params =>
        downloadOrchestrator.handleTaskComplete(parseTaskCompleteRequest(params)),
      taskFailed: params => downloadOrchestrator.handleTaskFailed(parseTaskFailedRequest(params)),
      taskCancelled: params =>
        downloadOrchestrator.handleTaskCancelled(parseTaskCancelledRequest(params)),
      refreshSignatureRequest: params =>
        refreshVimeoTaskResource(parseRefreshSignatureRequest(params).descriptor),
      keepAlive: () => Promise.resolve({ alive: true }),
      downloadBatch: (params, context) => {
        const request = parseDownloadBatchRequest(params)
        // 页面按钮发起时不携带 tabId（content 侧拿不到自身 tab），回退到 sender 推导的
        // context.tabId，配额不足时才能通知发起 tab 的 content 弹升级窗。
        return downloadOrchestrator.enqueueBatch(
          request.resources,
          request.tabId ?? context.tabId ?? null
        )
      },
      cancelDownloadTask: async params => {
        const { taskId } = parseTaskScopedRequest(params, 'cancelDownloadTask')
        return { accepted: await downloadOrchestrator.cancelTask(taskId) }
      },
      retryDownloadTask: params => {
        const { taskId } = parseTaskScopedRequest(params, 'retryDownloadTask')
        return Promise.resolve({ accepted: downloadOrchestrator.retryTask(taskId) })
      },
      getDownloadQueue: () => Promise.resolve(downloadOrchestrator.getSnapshot())
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

  /** 由 background 代 content/popup 读取远端顶层分组稀疏覆盖。 */
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

/** 解析 offscreen 进度回传请求。 */
function parseTaskProgressRequest(params: JsonValue | undefined): BackgroundTaskProgressRequest {
  if (!isJsonObject(params)) {
    throw new Error('[BackgroundMessageRouter] taskProgress 请求体必须是对象')
  }

  const progress = params.progress
  const receivedBytes = params.receivedBytes
  const totalBytes = params.totalBytes
  if (
    !isNullableNumber(progress) ||
    !isNullableNumber(receivedBytes) ||
    !isNullableNumber(totalBytes)
  ) {
    throw new Error('[BackgroundMessageRouter] taskProgress 进度字段必须是数字或 null')
  }

  return {
    taskId: requireString(params, 'taskId', 'taskProgress'),
    sourceId: requireString(params, 'sourceId', 'taskProgress'),
    progress,
    receivedBytes,
    totalBytes
  }
}

/** 解析 offscreen 产物交付请求。 */
function parseTaskCompleteRequest(params: JsonValue | undefined): BackgroundTaskCompleteRequest {
  if (!isJsonObject(params)) {
    throw new Error('[BackgroundMessageRouter] taskComplete 请求体必须是对象')
  }

  return {
    taskId: requireString(params, 'taskId', 'taskComplete'),
    blobUrl: requireString(params, 'blobUrl', 'taskComplete'),
    filename: requireString(params, 'filename', 'taskComplete'),
    mimeType: requireString(params, 'mimeType', 'taskComplete')
  }
}

/** 解析 offscreen 失败回传请求。 */
function parseTaskFailedRequest(params: JsonValue | undefined): BackgroundTaskFailedRequest {
  if (!isJsonObject(params)) {
    throw new Error('[BackgroundMessageRouter] taskFailed 请求体必须是对象')
  }

  return {
    taskId: requireString(params, 'taskId', 'taskFailed'),
    message: requireString(params, 'message', 'taskFailed')
  }
}

/** 解析 offscreen 取消确认请求。 */
function parseTaskCancelledRequest(params: JsonValue | undefined): { taskId: string } {
  if (!isJsonObject(params)) {
    throw new Error('[BackgroundMessageRouter] taskCancelled 请求体必须是对象')
  }

  return { taskId: requireString(params, 'taskId', 'taskCancelled') }
}

/** 解析 offscreen 重签请求。 */
function parseRefreshSignatureRequest(
  params: JsonValue | undefined
): BackgroundRefreshSignatureRequest {
  if (!isJsonObject(params)) {
    throw new Error('[BackgroundMessageRouter] refreshSignatureRequest 请求体必须是对象')
  }

  return {
    taskId: requireString(params, 'taskId', 'refreshSignatureRequest'),
    descriptor: parseVimeoDescriptorIdentity(
      params.descriptor,
      'refreshSignatureRequest.descriptor'
    )
  }
}

/**
 * 校验重签请求携带的下载描述符身份字段。
 *
 * 重签只消费身份、守卫与展示字段（videoId/sourceId/optionId/kind/delivery/track/区间/
 * labelKey/labelParams），不消费 playlist URL，因此这里不套用 decodeVimeoSourceDescriptor
 * 的完整结构规则。
 */
function parseVimeoDescriptorIdentity(
  value: JsonValue | undefined,
  label: string
): VimeoSourceDescriptor {
  if (!isJsonObject(value) || value.version !== 2) {
    throw new Error(`[BackgroundMessageRouter] ${label} 必须是 version=2 的描述符对象`)
  }

  const kind = value.kind
  const delivery = value.delivery
  if (kind !== 'video' && kind !== 'audio' && kind !== 'image' && kind !== 'subtitle') {
    throw new Error(`[BackgroundMessageRouter] ${label}.kind 不受支持: ${String(kind)}`)
  }
  if (
    delivery !== 'progressive' &&
    delivery !== 'dash' &&
    delivery !== 'hls' &&
    delivery !== 'thumbnail' &&
    delivery !== 'subtitle'
  ) {
    throw new Error(`[BackgroundMessageRouter] ${label}.delivery 不受支持: ${String(delivery)}`)
  }

  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId: requireString(value, 'videoId', label),
    sourceId: requireString(value, 'sourceId', label),
    optionId: requireString(value, 'optionId', label),
    kind,
    delivery,
    label: requireString(value, 'label', label),
    configUrl: requireString(value, 'configUrl', label)
  }

  if (typeof value.videoTrackId === 'string' && value.videoTrackId.length > 0) {
    descriptor.videoTrackId = value.videoTrackId
  }
  if (typeof value.audioTrackId === 'string' && value.audioTrackId.length > 0) {
    descriptor.audioTrackId = value.audioTrackId
  }
  if (typeof value.labelKey === 'string' && value.labelKey.length > 0) {
    descriptor.labelKey = value.labelKey
  }
  const labelParams = value.labelParams
  if (isJsonObject(labelParams)) {
    const params: Record<string, string> = {}
    for (const [key, entry] of Object.entries(labelParams)) {
      if (typeof entry === 'string') {
        params[key] = entry
      }
    }
    // 与 shared 的 readStringRecord 同语义：空 record 视为未提供。
    if (Object.keys(params).length > 0) {
      descriptor.labelParams = params
    }
  }
  const startSeconds = value.startSeconds
  const endSeconds = value.endSeconds
  if (startSeconds !== undefined || endSeconds !== undefined) {
    if (typeof startSeconds !== 'number' || typeof endSeconds !== 'number') {
      throw new Error(`[BackgroundMessageRouter] ${label}.startSeconds/endSeconds 必须同时是数字`)
    }
    descriptor.startSeconds = startSeconds
    descriptor.endSeconds = endSeconds
  }

  return descriptor
}

/** 要求字段为数字或 null。 */
function isNullableNumber(value: JsonValue | undefined): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

/** 解析批量下载请求：完整资源列表 + 可选发起 tab。 */
function parseDownloadBatchRequest(params: JsonValue | undefined): {
  resources: ReturnType<typeof parseMediaResource>[]
  tabId: number | null
} {
  if (!isJsonObject(params) || !Array.isArray(params.resources)) {
    throw new Error('[BackgroundMessageRouter] downloadBatch 请求缺少 resources 数组')
  }

  const tabId = params.tabId
  if (tabId !== undefined && (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId < 0)) {
    throw new Error('[BackgroundMessageRouter] downloadBatch.tabId 必须是非负整数')
  }

  return {
    resources: params.resources.map(resource =>
      parseMediaResource(resource, 'downloadBatch.resources')
    ),
    tabId: typeof tabId === 'number' ? tabId : null
  }
}

/** 解析只携带任务 ID 的编排请求。 */
function parseTaskScopedRequest(params: JsonValue | undefined, method: string): { taskId: string } {
  if (!isJsonObject(params)) {
    throw new Error(`[BackgroundMessageRouter] ${method} 请求体必须是对象`)
  }

  return { taskId: requireString(params, 'taskId', method) }
}

/** 要求 JSON 对象字段为非空字符串。 */
function requireString(body: JsonObject, field: string, label: string): string {
  const value = body[field]
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw new Error(`[BackgroundMessageRouter] ${label}.${field} 必须是非空字符串`)
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
