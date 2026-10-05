/**
 * 通用媒体 API 模块。
 *
 * 解析链路为：
 * parse-pre-v2 -> 按节点顺序 parse-v2 -> 记录成功节点 preferredNodeId。
 * 下载链路为：
 * download-anonymous-pre-v2 -> 按节点顺序 download-v2。
 */

import {
  HomepageApiError,
  getApiBaseUrl,
  postJson,
  reportBackendConnectFailureToSls,
  type BackendConnectFailureReason,
  type JsonObject,
  type RequestContext
} from '../runtime/api'
import { assertDownloadMode } from './download-methods'
import type {
  ClientMuxDownloadIntent,
  ClientMuxTrackIntent,
  DirectDownloadIntent,
  MediaCapabilities,
  MediaParseResult,
  MediaPlatform,
  MediaPost
} from './types'

/** parse-pre-v2 业务接口超时时间；只查节点列表，不应长时间阻塞解析按钮。 */
const MEDIA_PARSE_PRE_V2_TIMEOUT_MS = 10000

/** 节点解析及 JSON 下载材料预算，覆盖浏览器采集总预算并留出响应传输余量。 */
const MEDIA_NODE_PREPARATION_TIMEOUT_MS = 70000

/** download-anonymous-pre-v2 业务接口超时时间；该接口会签 token。 */
const MEDIA_DOWNLOAD_PRE_V2_TIMEOUT_MS = 10000

/** download-v2 节点 POST 超时缺省值；调用方未给有效超时时回退到该值。 */
const MEDIA_DOWNLOAD_V2_CONNECT_TIMEOUT_MS = 10000

/** 后端统一成功码，非 10000 都按业务错误处理。 */
const API_SUCCESS_CODE = 10000

/** V2 解析节点临时不可用；parse-v2 收到后可以继续换节点。 */
const CODE_MEDIA_PARSE_NODE_UNAVAILABLE = 24034

/** Pre 控制面没有可用服务节点；前端停止本轮 V2 流程。 */
const CODE_MEDIA_SERVICE_NODE_UNAVAILABLE = 24042

/** 后端返回的资源能力声明。 */
interface BackendCapabilities {
  /** 是否可下载。 */
  download?: boolean
  /** 是否可播放。 */
  play?: boolean
  /** 是否允许进入 Download all 串行队列。 */
  download_queue?: boolean
  /** 是否允许进入 Download all 串行队列，兼容后端 camelCase 序列化。 */
  downloadQueue?: boolean
}

/** 后端资源扩展字段。 */
interface BackendMediaExtra {
  /** 平台消息 ID。 */
  message_id?: number | string
  /** 平台缩略图地址。 */
  thumbnail_url?: string
  /** 相册/合集展示顺序。 */
  position?: number
  /** 媒体 pk。 */
  media_pk?: string | null
}

/** 后端返回的单个资源。 */
interface BackendMediaSource {
  /** 资源 ID。 */
  source_id: string
  /** 服务端签发的资源 token，前端只透传给 download-anonymous-pre-v2。 */
  resource_token?: string
  /** 旧接口的“可下载”标记。 */
  downloadable?: boolean
  /** 文件名。 */
  filename?: string
  /** 资源类型（photo/video/document 等）。 */
  type?: string
  /** 新版资源类型字段。 */
  kind?: string
  /** MIME 类型。 */
  mime_type?: string
  /** 文件大小（字节），可能为 null。 */
  size?: number | null
  /** 时长（秒）。 */
  duration?: number
  /** 宽度。 */
  width?: number
  /** 高度。 */
  height?: number
  /** 来源消息 ID。 */
  message_id?: number | string
  /** 平台字段。 */
  platform?: string
  /** 下载模式；缺失或已下线模式都按不支持的下载方法处理，不回退到其它模式。 */
  download_mode?: string
  /** V2 解析成功节点 ID，旧接口不会返回，前端在节点调用成功后补入。 */
  preferred_node_id?: number
  /** 所属内容 ID。 */
  content_id?: string
  /** 平台扩展字段。 */
  extra?: BackendMediaExtra
  /** 资源能力声明。 */
  capabilities?: BackendCapabilities
}

/** 后端直连下载授权响应。 */
interface BackendDirectDownloadIntentResponse {
  /** 资源 ID。 */
  source_id: string
  /** 平台字段，前端统一规范化为 vimeo。 */
  platform?: string
  /** 下载模式。 */
  download_mode: 'direct'
  /** 当前可用的 CDN 直链。 */
  download_url: string
  /** 后端建议文件名。 */
  filename: string
  /** MIME 类型。 */
  mime_type?: string | null
  /** 文件大小。 */
  size?: number | null
  /** 直链过期时间戳。 */
  expires_at?: number | null
}

/** 后端 client_mux 轨道授权响应。 */
type BackendClientMuxTrackResponse = {
  /** 轨道类型。 */
  kind: 'video' | 'audio'
  /** 轨道 MIME 类型。 */
  mime_type: string
  /** 轨道大小。 */
  size?: number | null
} & (
  | { delivery: 'file'; url: string }
  | {
      delivery: 'segments'
      init_segment: string
      segments: { url: string; size?: number | null }[]
    }
)

/** 后端 client_mux 下载授权响应。 */
interface BackendClientMuxDownloadIntentResponse {
  /** 资源 ID。 */
  source_id: string
  /** 平台字段，前端统一规范化为 vimeo。 */
  platform?: string
  /** 下载模式。 */
  download_mode: 'client_mux'
  /** 合成后文件名。 */
  filename: string
  /** 合成后 MIME 类型。 */
  mime_type: string
  /** 合计文件大小。 */
  size?: number | null
  /** 直链过期时间戳。 */
  expires_at?: number | null
  /** 视频轨道。 */
  video_track: BackendClientMuxTrackResponse
  /** 音频轨道。 */
  audio_track: BackendClientMuxTrackResponse
}

/** 后端返回的消息数据。 */
interface BackendMediaMessage {
  /** 消息包含的资源列表。 */
  sources?: BackendMediaSource[]
  /** 消息 ID。 */
  message_id?: number | string
}

/** 后端解析响应。 */
interface BackendMediaParseResponse {
  /** 解析状态。 */
  status?: string
  /** 状态原因。 */
  reason?: string
  /** 规范化后的链接。 */
  canonical_link?: string
  /** 原始输入链接。 */
  original_link?: string
  /** 识别到的平台。 */
  platform?: string
  /** 解析出的消息列表。 */
  messages?: BackendMediaMessage[]
  /** 统一 API 返回的资源列表。 */
  resources?: BackendMediaSource[]
}

/** 后端标准信封。 */
interface BackendApiEnvelope<T> {
  /** 业务状态码，10000 表示成功。 */
  code?: number
  /** 响应数据。 */
  data?: T | JsonObject
  /** 错误消息。 */
  msg?: string
  /** 错误消息。 */
  message?: string
}

/** V2 Pre 返回的节点入口。 */
export interface MediaV2Node {
  /** 业务数据库 service_nodes 主键。 */
  node_id: number
  /** 节点完整 API URL。 */
  url: string
}

/** parse-pre-v2 响应。 */
interface BackendMediaParsePreV2Response {
  /** 有序 parse-v2 节点列表。 */
  nodes: MediaV2Node[]
}

/** 匿名授权响应。 */
export interface MediaDownloadAuthorization {
  /** media_download JWT。 */
  token: string
  /** token 过期 Unix 秒。 */
  expiresAt: number
  /** 本授权的下载模式。 */
  downloadMode: MediaPost['downloadMode']
  /** 有序 download-v2 节点列表。 */
  nodes: MediaV2Node[]
}

function getAcceptLanguage(): string {
  return document.documentElement.lang || navigator.language || 'en-US'
}

function buildMediaV2NodeHeaders(context: RequestContext): Headers {
  const headers = new Headers()
  headers.set('Accept-Language', getAcceptLanguage())
  headers.set('X-Device-Id', context.deviceId)
  headers.set('X-Client-Product', 'web')
  headers.set('Content-Type', 'application/json')
  return headers
}

function resolveMediaApiUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, getApiBaseUrl()).toString()
}

function normalizeApiErrorData<T>(value: T | JsonObject | undefined): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as JsonObject
}

function normalizeTimeoutMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : MEDIA_DOWNLOAD_V2_CONNECT_TIMEOUT_MS
}

async function fetchMediaV2Node(
  url: string,
  context: RequestContext,
  body: JsonObject,
  timeoutMs: number,
  errorContext: string
): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const normalizedTimeoutMs = normalizeTimeoutMs(timeoutMs)
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, normalizedTimeoutMs)

  try {
    return await fetch(resolveMediaApiUrl(url), {
      method: 'POST',
      headers: buildMediaV2NodeHeaders(context),
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (error) {
    console.error(error)
    const errorName = error instanceof Error ? error.name || 'Error' : 'NonError'
    const errorMessage = error instanceof Error ? error.message : String(error)
    const code: BackendConnectFailureReason = timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR'
    const timeoutText = timedOut ? ` after ${normalizedTimeoutMs}ms` : ''
    reportBackendConnectFailureToSls(
      'POST',
      url,
      context,
      code,
      errorName,
      errorMessage,
      normalizedTimeoutMs
    )
    throw new HomepageApiError(
      `${errorContext}: ${timedOut ? `timed out${timeoutText}` : `network failed: ${errorName}: ${errorMessage}`}`,
      0,
      code,
      {
        failure_reason: `${errorContext}: reason=${code}${timeoutText}, error=${errorName}: ${errorMessage}`
      }
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

async function parseMediaV2Envelope<T>(
  response: Response,
  errorContext: string
): Promise<T> {
  let body: BackendApiEnvelope<T> | null = null

  try {
    body = (await response.json()) as BackendApiEnvelope<T>
  } catch (error) {
    console.error(error)
    throw new HomepageApiError(
      `${errorContext}: response JSON parse failed, status=${response.status}`,
      response.status
    )
  }

  if (!response.ok) {
    throw new HomepageApiError(
      body?.msg || body?.message || `${errorContext}: HTTP ${response.status}`,
      response.status,
      body?.code,
      normalizeApiErrorData(body?.data)
    )
  }

  if (body && typeof body === 'object' && 'code' in body) {
    if (body.code === API_SUCCESS_CODE) {
      return body.data as T
    }

    throw new HomepageApiError(
      body.msg || body.message || `${errorContext}: request failed`,
      response.status,
      body.code,
      normalizeApiErrorData(body.data)
    )
  }

  return body as T
}

function isGatewayStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function isTemporaryParseNodeError(error: Error): boolean {
  if (!(error instanceof HomepageApiError)) {
    return false
  }

  const code = typeof error.code === 'string' ? Number(error.code) : error.code
  return (
    error.status === 0 ||
    isGatewayStatus(error.status) ||
    code === CODE_MEDIA_PARSE_NODE_UNAVAILABLE
  )
}

function nodeListOrThrow(nodes: MediaV2Node[], context: string): MediaV2Node[] {
  if (nodes.length > 0) {
    return nodes
  }

  throw new HomepageApiError(
    `${context}: node list is empty`,
    200,
    CODE_MEDIA_SERVICE_NODE_UNAVAILABLE,
    {
      failure_reason: `${context}: empty_node_list`
    }
  )
}

async function postMediaV2NodeJson<T>(
  url: string,
  context: RequestContext,
  body: JsonObject,
  timeoutMs: number,
  errorContext: string
): Promise<T> {
  const response = await fetchMediaV2Node(url, context, body, timeoutMs, errorContext)
  return parseMediaV2Envelope<T>(response, errorContext)
}

/**
 * 推断资源类型。
 */
function inferSourceType(source: BackendMediaSource): string {
  const explicitType = source.kind || source.type
  if (explicitType) {
    return explicitType
  }

  const mimeType = source.mime_type?.toLowerCase() || ''
  if (mimeType.startsWith('video/')) {
    return 'video'
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }
  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  return 'file'
}

/**
 * 规范化后端平台字段为前端枚举。
 *
 * 当前只支持 Vimeo；后端返回其他平台值时降级为 vimeo 并告警。
 */
function normalizePlatform(raw: string | undefined): MediaPlatform {
  if (raw && raw !== 'vimeo') {
    console.warn(`[media-api] normalizePlatform: unknown platform "${raw}", using vimeo fallback`)
  }

  return 'vimeo'
}

/**
 * 规范化资源能力声明。
 *
 * 后端未声明时默认 download=true。
 */
function normalizeCapabilities(source: BackendMediaSource): MediaCapabilities {
  const caps = source.capabilities

  return {
    download: caps?.download ?? (source.downloadable !== false),
    downloadQueue: caps?.download_queue ?? caps?.downloadQueue
  }
}

function normalizeSource(
  source: BackendMediaSource,
  canonicalLink: string,
  fallbackPlatform: MediaPlatform,
  fallbackMessageId?: number | string,
  preferredNodeId?: number
): MediaPost {
  const resourceToken = source.resource_token?.trim()
  if (!resourceToken) {
    throw new Error(
      `[media-api] normalizeSource: parse-v2 resource missing resource_token, sourceId=${source.source_id}`
    )
  }

  const resolvedType = inferSourceType(source)
  const platform = normalizePlatform(source.platform || fallbackPlatform)
  const capabilities = normalizeCapabilities(source)
  const downloadMode = assertDownloadMode(
    source.download_mode,
    `[media-api] normalizeSource sourceId=${source.source_id}`
  )
  return {
    sourceId: source.source_id,
    resourceToken,
    filename: source.filename || source.source_id,
    type: resolvedType,
    size: typeof source.size === 'number' && source.size >= 0 ? source.size : null,
    link: canonicalLink,
    mimeType: source.mime_type,
    duration: source.duration,
    width: source.width,
    height: source.height,
    messageId: source.message_id ?? source.extra?.message_id ?? fallbackMessageId,
    platform,
    downloadMode,
    preferredNodeId:
      typeof preferredNodeId === 'number' && Number.isInteger(preferredNodeId) && preferredNodeId > 0
        ? preferredNodeId
        : undefined,
    thumbnailUrl: source.extra?.thumbnail_url || undefined,
    capabilities
  }
}

function normalizeMediaParseResponse(
  response: BackendMediaParseResponse,
  link: string,
  preferredNodeId?: number
): MediaParseResult {
  const canonicalLink = response.canonical_link || response.original_link || link
  const originalLink = response.original_link || link
  const platform = normalizePlatform(response.platform)

  const flatResources = response.resources || []
  const resources: MediaPost[] =
    flatResources.length > 0
      ? flatResources.map(source => normalizeSource(source, canonicalLink, platform, undefined, preferredNodeId))
      : (response.messages || []).flatMap(message =>
          (message.sources || []).map(source =>
            normalizeSource(source, canonicalLink, platform, message.message_id, preferredNodeId)
          )
        )

  return {
    resources,
    canonicalLink,
    originalLink,
    platform
  }
}

async function parseMediaLinkV2(
  link: string,
  context: RequestContext
): Promise<MediaParseResult> {
  const preResponse = await postJson<BackendMediaParsePreV2Response>(
    '/api/client/media/parse-pre-v2',
    context,
    { link },
    { timeoutMs: MEDIA_PARSE_PRE_V2_TIMEOUT_MS }
  )
  const nodes = nodeListOrThrow(preResponse.nodes, '[media-api] parseMediaLinkV2 parse-pre-v2')
  let lastError: Error | null = null

  for (const node of nodes) {
    try {
      const response = await postMediaV2NodeJson<BackendMediaParseResponse>(
        node.url,
        context,
        { link },
        MEDIA_NODE_PREPARATION_TIMEOUT_MS,
        `[media-api] parseMediaLinkV2 parse-v2 node_id=${node.node_id}`
      )
      return normalizeMediaParseResponse(response, link, node.node_id)
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }

      if (!isTemporaryParseNodeError(error)) {
        throw error
      }

      console.error(error)
      lastError = error
    }
  }

  throw lastError ?? new HomepageApiError(
    '[media-api] parseMediaLinkV2: all parse-v2 nodes failed before returning a business result',
    0,
    CODE_MEDIA_PARSE_NODE_UNAVAILABLE
  )
}

/**
 * 解析媒体链接。
 *
 * @param link - 用户输入的链接
 * @param context - 请求上下文
 * @returns 解析结果
 */
export async function parseMediaLink(
  link: string,
  context: RequestContext
): Promise<MediaParseResult> {
  return parseMediaLinkV2(link, context)
}

/** 匿名三态：登录要求不携带下载凭证。 */
export type AnonymousDownloadAuthorization =
  | { status: 1; authorization: MediaDownloadAuthorization }
  | { status: 2; authorization: MediaDownloadAuthorization; waitSeconds: number }
  | { status: 3 }

/** 请求匿名授权并校验三态及凭证边界；等待由工作区协调。 */
export async function createAnonymousDownloadAuthorization(
  resource: MediaPost,
  context: RequestContext
): Promise<AnonymousDownloadAuthorization> {
  const response = await postJson<JsonObject>(
    '/api/client/media/download-anonymous-pre-v2', context,
    { resource_token: resource.resourceToken, preferred_node_id: resource.preferredNodeId ?? null },
    { timeoutMs: MEDIA_DOWNLOAD_PRE_V2_TIMEOUT_MS }
  )
  const location = `[media-api] 匿名授权响应无效，sourceId=${resource.sourceId}`
  if (response.status === 3) return { status: 3 }
  if ((response.status !== 1 && response.status !== 2) ||
      typeof response.token !== 'string' || !response.token ||
      typeof response.expires_at !== 'number' || !Number.isSafeInteger(response.expires_at) ||
      response.expires_at <= 0 || typeof response.download_mode !== 'string' ||
      !Array.isArray(response.nodes) || response.nodes.length === 0) {
    throw new Error(location)
  }
  const nodes = response.nodes.map(node => {
    if (!node || typeof node !== 'object' || Array.isArray(node) ||
        typeof node.node_id !== 'number' || !Number.isSafeInteger(node.node_id) || node.node_id <= 0 ||
        typeof node.url !== 'string' || !node.url) throw new Error(location)
    return { node_id: node.node_id, url: node.url }
  })
  const authorization: MediaDownloadAuthorization = {
    token: response.token, expiresAt: response.expires_at,
    downloadMode: assertDownloadMode(response.download_mode, location), nodes
  }
  if (response.status === 1) return { status: 1, authorization }
  if (typeof response.wait_seconds !== 'number' || !Number.isSafeInteger(response.wait_seconds) ||
      response.wait_seconds < 0) throw new Error(location)
  return { status: 2, authorization, waitSeconds: response.wait_seconds }
}

/**
 * 调用 download-v2 并读取 direct JSON。
 */
export async function requestMediaDownloadV2DirectIntent(
  nodeUrl: string,
  token: string,
  context: RequestContext
): Promise<DirectDownloadIntent> {
  const response = await postMediaV2NodeJson<BackendDirectDownloadIntentResponse>(
    nodeUrl,
    context,
    { token },
    MEDIA_NODE_PREPARATION_TIMEOUT_MS,
    '[media-api] requestMediaDownloadV2DirectIntent download-v2'
  )

  return {
    sourceId: response.source_id,
    platform: normalizePlatform(response.platform),
    downloadMode: response.download_mode,
    downloadUrl: response.download_url,
    filename: response.filename,
    mimeType: response.mime_type || undefined,
    size: typeof response.size === 'number' ? response.size : null,
    expiresAt: typeof response.expires_at === 'number' ? response.expires_at : null
  }
}

/**
 * 调用 download-v2 并读取 client_mux tracks JSON。
 */
export async function requestMediaDownloadV2ClientMuxIntent(
  nodeUrl: string,
  token: string,
  context: RequestContext
): Promise<ClientMuxDownloadIntent> {
  const response = await postMediaV2NodeJson<BackendClientMuxDownloadIntentResponse>(
    nodeUrl,
    context,
    { token },
    MEDIA_NODE_PREPARATION_TIMEOUT_MS,
    '[media-api] requestMediaDownloadV2ClientMuxIntent download-v2'
  )

  return {
    sourceId: response.source_id,
    platform: normalizePlatform(response.platform),
    downloadMode: response.download_mode,
    filename: response.filename,
    mimeType: response.mime_type,
    size: typeof response.size === 'number' ? response.size : null,
    expiresAt: typeof response.expires_at === 'number' ? response.expires_at : null,
    videoTrack: normalizeClientMuxTrack(response.video_track, 'video'),
    audioTrack: normalizeClientMuxTrack(response.audio_track, 'audio')
  }
}

function normalizeClientMuxTrack(
  track: BackendClientMuxTrackResponse,
  kind: 'video' | 'audio'
): ClientMuxTrackIntent {
  if (track.kind !== kind || (track.delivery !== 'file' && track.delivery !== 'segments')) {
    throw new Error(`[media-api] download-v2: 无效合并轨道，kind=${kind}`)
  }
  const base = {
    kind,
    mimeType: track.mime_type,
    size: typeof track.size === 'number' ? track.size : null
  }
  if (track.delivery === 'file') {
    return { ...base, delivery: 'file', url: track.url }
  }
  if (!track.init_segment || !Array.isArray(track.segments) || track.segments.length === 0) {
    throw new Error(`[media-api] download-v2: 分片轨道缺少初始化数据或媒体分片，kind=${kind}`)
  }
  return {
    ...base,
    delivery: 'segments',
    initSegment: track.init_segment,
    segments: track.segments.map(segment => ({
      url: segment.url,
      size: typeof segment.size === 'number' ? segment.size : null
    }))
  }
}
