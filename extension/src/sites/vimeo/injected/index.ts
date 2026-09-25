/**
 * Vimeo injected MAIN world 入口。
 *
 * 提供本地下载 RPC provider；解析和按钮渲染在 content 侧完成。
 */

import {
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  type ResourceSourceKind,
  type ResourceType
} from '@/core/constants/resource'
import type { IMediaSource } from '@/core/protocol/injected'
import { applyInjectedRuntimeConfig } from '@/core/injected/runtimeConfig'
import { serve } from '@/core/rpc/serve'
import type {
  JsonObject,
  JsonValue,
  RpcServeHandlers,
  RpcServeRegistration
} from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'
import {
  CHANNEL,
  METHOD_REQUEST_LIMITS,
  METHOD_RESPONSE_LIMITS,
  METHOD_TARGETS,
  METHOD_TRANSPORTS
} from '@/injected/injected-register'
import { pickVimeoConfig, vimeoConfig } from '@/sites/vimeo/runtimeConfig'
import { vimeoDownloadService } from './download'
import {
  installVimeoConfigCapture,
  listCapturedVimeoConfigs,
  waitForCapturedVimeoConfig
} from './configCapture'

/** Vimeo injected 是否已启动。 */
let injectedStarted = false

/** 当前 RPC provider。 */
let rpcRegistration: RpcServeRegistration | null = null

/** 启动 Vimeo injected。 */
export function startVimeoInjected(): void {
  if (injectedStarted) {
    logger.warn('[VimeoInjected] 已启动，跳过重复启动')
    return
  }

  installVimeoConfigCapture()
  rpcRegistration = serve(CHANNEL, createInjectedRpcHandlers(), {
    transports: ['event'],
    methodTargets: METHOD_TARGETS,
    methodTransports: METHOD_TRANSPORTS,
    requestLimits: METHOD_REQUEST_LIMITS,
    responseLimits: METHOD_RESPONSE_LIMITS
  })

  injectedStarted = true
  logger.info('[VimeoInjected] 固定 EventRpc provider 已启动')
}

/** 停止 Vimeo injected。 */
export function stopVimeoInjected(): void {
  rpcRegistration?.stop()
  rpcRegistration = null
  injectedStarted = false
}

/** 创建 Vimeo injected RPC handler。 */
function createInjectedRpcHandlers(): RpcServeHandlers {
  return {
    applyRuntimeConfig: params => applyInjectedRuntimeConfig(params),
    applySiteConfig: params => applySiteConfig(params),
    getCapturedVimeoConfig: async params => {
      const videoId = parseCapturedConfigRequest(params)
      return { snapshot: await waitForCapturedVimeoConfig(videoId) }
    },
    listCapturedVimeoConfigs: () => ({ videos: listCapturedVimeoConfigs() }),
    downloadMedia: async params => {
      const { taskId, source } = parseDownloadMediaRequest(params)
      try {
        await vimeoDownloadService.handleSingleDownload(taskId, source)
        return { success: true }
      } catch (error) {
        logger.error(
          `[VimeoInjected] downloadMedia handler 失败: id=${source.id}, sourceKind=${source.sourceKind ?? 'missing'}, type=${source.type}, stage=download`,
          error
        )
        throw error
      }
    }
  }
}

/**
 * 应用 content 下发的站点配置。
 *
 * EventRpc 是页面可伪造的通道，因此逐字段取回已知且合法的值：非法字段直接丢弃并保留当前值，
 * 不让远端脏类型进入内存上限判定。
 */
function applySiteConfig(params: JsonValue | undefined): { applied: boolean } {
  Object.assign(vimeoConfig, pickVimeoConfig(params))
  return { applied: true }
}

/** 解析 getCapturedVimeoConfig 请求。 */
function parseCapturedConfigRequest(params: JsonValue | undefined): string {
  const body = requireJsonObject(params, 'getCapturedVimeoConfig')
  const videoId = requireStringField(body, 'videoId', 'getCapturedVimeoConfig.videoId')
  if (!/^\d+$/.test(videoId)) {
    throw new Error(
      `[VimeoInjected] getCapturedVimeoConfig.videoId 必须是数字 ID: value=${videoId}`
    )
  }
  return videoId
}

/** 解析 downloadMedia 请求。 */
function parseDownloadMediaRequest(params: JsonValue | undefined): {
  taskId: string
  source: IMediaSource
} {
  const body = requireJsonObject(params, 'downloadMedia')
  return {
    taskId: requireStringField(body, 'taskId', 'downloadMedia.taskId'),
    source: parseMediaSource(body.source, 'downloadMedia.source')
  }
}

/** 解析单个媒体源。 */
function parseMediaSource(value: JsonValue, label: string): IMediaSource {
  const body = requireJsonObject(value, label)
  const source: IMediaSource = {
    url: requireStringField(body, 'url', `${label}.url`),
    id: requireStringField(body, 'id', `${label}.id`),
    type: requireResourceTypeField(body, 'type', `${label}.type`),
    page: requireStringField(body, 'page', `${label}.page`),
    messageId: requireStringField(body, 'messageId', `${label}.messageId`)
  }

  const filename = readOptionalStringField(body, 'filename', `${label}.filename`)
  if (filename !== undefined) {
    source.filename = filename
  }

  const mimeType = readOptionalStringField(body, 'mimeType', `${label}.mimeType`)
  if (mimeType !== undefined) {
    source.mimeType = mimeType
  }

  const documentId = readOptionalStringField(body, 'documentId', `${label}.documentId`)
  if (documentId !== undefined) {
    source.documentId = documentId
  }

  const size = readOptionalNumberField(body, 'size', `${label}.size`)
  if (size !== undefined) {
    source.size = size
  }

  const sourceKind = readOptionalSourceKindField(body, 'sourceKind', `${label}.sourceKind`)
  if (sourceKind !== undefined) {
    source.sourceKind = sourceKind
  }

  return source
}

/** 要求值为 JSON 对象。 */
function requireJsonObject(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonObject
  }

  throw new Error(`[VimeoInjected] ${label} 请求体必须是对象`)
}

/** 要求对象字段为字符串。 */
function requireStringField(body: JsonObject, field: string, label: string): string {
  const value = body[field]

  if (typeof value === 'string') {
    return value
  }

  throw new Error(`[VimeoInjected] ${label} 必须是字符串`)
}

/** 读取可选字符串字段。 */
function readOptionalStringField(
  body: JsonObject,
  field: string,
  label: string
): string | undefined {
  const value = body[field]

  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  throw new Error(`[VimeoInjected] ${label} 必须是字符串`)
}

/** 读取可选数字字段。 */
function readOptionalNumberField(
  body: JsonObject,
  field: string,
  label: string
): number | undefined {
  const value = body[field]

  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'number') {
    return value
  }

  throw new Error(`[VimeoInjected] ${label} 必须是数字`)
}

/** 要求合法资源类型。 */
function requireResourceTypeField(body: JsonObject, field: string, label: string): ResourceType {
  const value = body[field]

  if (
    value === RESOURCE_TYPES.VIDEO ||
    value === RESOURCE_TYPES.AUDIO ||
    value === RESOURCE_TYPES.IMAGE ||
    value === RESOURCE_TYPES.SUBTITLE
  ) {
    return value
  }

  throw new Error(`[VimeoInjected] ${label} 必须是合法资源类型`)
}

/** 读取 Vimeo 下载来源。 */
function readOptionalSourceKindField(
  body: JsonObject,
  field: string,
  label: string
): ResourceSourceKind | undefined {
  const value = body[field]
  if (value === undefined) {
    return undefined
  }
  if (
    value === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO ||
    value === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO ||
    value === RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO
  ) {
    return value
  }
  throw new Error(`[VimeoInjected] ${label} 必须是 Vimeo 资源来源`)
}
