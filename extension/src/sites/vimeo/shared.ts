/**
 * Vimeo 站点共享工具。
 *
 * 这里集中维护 Vimeo host、config URL、CDN 白名单、文件名和下载描述符规则。
 * content/injected 共用同一套判断，保证 popup 触发下载时能从 IMediaSource 恢复足够信息。
 */

import type { ResourceSourceKind } from '@/core/constants/resource'
import { RESOURCE_SOURCE_KINDS } from '@/core/constants/resource'
import type { JsonObject, JsonValue } from '@/core/rpc/types'

/** Vimeo 下载选项类型。 */
export type VimeoOptionKind = 'video' | 'audio' | 'image' | 'subtitle'

/** Vimeo 资源交付方式。 */
export type VimeoDelivery = 'progressive' | 'dash' | 'hls' | 'thumbnail' | 'subtitle'

/** Vimeo 页面身份。 */
export interface VimeoVideoIdentity {
  /** Vimeo 数字 video id。 */
  videoId: string
}

/** MAIN world 从 Vimeo 原生播放器请求捕获的 config。 */
export interface VimeoCapturedConfigSnapshot {
  /** config 对应的 Vimeo video id。 */
  videoId: string
  /** 原生完整签名 config URL，或内嵌 config 自带的签名 config_refresh_url。 */
  configUrl: string
  /** 已解析为 JSON 的原始 config 响应。 */
  config: JsonValue
}

/** 通过 documentId 传给 injected 的 Vimeo 下载描述符。 */
export interface VimeoSourceDescriptor {
  /** 描述符版本。 */
  version: 2
  /** 当前 video id。 */
  videoId: string
  /** 当前按钮对应的 source id。 */
  sourceId: string
  /** 当前按钮对应的 option id。 */
  optionId: string
  /** 当前按钮所属行。 */
  kind: VimeoOptionKind
  /** 资源交付方式。 */
  delivery: VimeoDelivery
  /** 页面按钮标签的技术文本；`labelKey` 存在时只作为回退。 */
  label: string
  /** 标签的 i18n 词条键；技术标识与字幕语言名不带键。 */
  labelKey?: string
  /** `labelKey` 的插值参数。 */
  labelParams?: Record<string, string>
  /** 原始 config URL。 */
  configUrl: string
  /** Vimeo config 内的刷新 URL。 */
  refreshConfigUrl?: string
  /** DASH playlist URL；DASH 下载首次直接使用，不预先刷新 config。 */
  dashPlaylistUrl?: string
  /** DASH video track id。 */
  videoTrackId?: string
  /** DASH audio track id。 */
  audioTrackId?: string
  /** HLS media playlist URL；只用于安全 fMP4 HLS fallback。 */
  hlsPlaylistUrl?: string
  /** 片段裁剪起点（秒，相对媒体起点）；与 endSeconds 必须同时存在。 */
  startSeconds?: number
  /** 片段裁剪终点（秒，相对媒体起点）。 */
  endSeconds?: number
  /** 可安全筛选的媒体分片时间线；缺失时下载器必须保守取整轨。 */
  videoSegmentTimeline?: VimeoSegmentWindow[]
  audioSegmentTimeline?: VimeoSegmentWindow[]
}

/** 单个媒体分片在媒体时间轴上的范围。 */
export interface VimeoSegmentWindow {
  startSeconds: number
  endSeconds: number
}

/** 片段裁剪时间区间（秒，相对媒体起点）。 */
export interface VimeoTimeRange {
  /** 起点，必须小于 endSeconds。 */
  startSeconds: number
  /** 终点。 */
  endSeconds: number
}

/**
 * 片段秒数的十进制文本形状。构造与解析共用同一份定义。
 *
 * `String(number)` 对 |v| < 1e-6 或 ≥ 1e21 会输出指数形式（`1e-7`、`1e+21`），后缀正则读不回来：
 * 用户键入 `1e-7` 时 Popup 会用模板字符串生成 `:clip:1e-7-5`，content 侧却解析不出区间，
 * 结果是这一单静默丢弃。秒数只能以字面十进制文本进入 ID。
 */
const CLIP_SECONDS_SOURCE = '\\d+(?:\\.\\d+)?'
const CLIP_SECONDS_RE = new RegExp(`^${CLIP_SECONDS_SOURCE}$`)
/** 片段选项 ID 后缀：`{optionId}:clip:{start}-{end}`。 */
const VIMEO_CLIP_SUFFIX_RE = new RegExp(`:clip:(${CLIP_SECONDS_SOURCE})-(${CLIP_SECONDS_SOURCE})$`)

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])
const VIMEO_PAGE_HOSTS = new Set(['vimeo.com', 'www.vimeo.com'])
const VIMEO_PLAYER_HOST = 'player.vimeo.com'
const VIMEO_CDN_SUFFIXES = ['.vimeocdn.com'] as const
/** 播放器文字轨端点；字幕直链可以不落在媒体 CDN 上。 */
const VIMEO_TEXT_TRACK_PATH_PREFIX = '/texttrack/'
const VIMEO_DESCRIPTOR_URI_PREFIX = 'vimeo:descriptor-uri:'
const VIMEO_DESCRIPTOR_LEGACY_PREFIX = 'vimeo:descriptor:'
const VIMEO_FRAME_IDENTITY_MESSAGE_TYPE = 'vdl:vimeo:frame-identity'
const VIDEO_ID_RE = /^\d+$/

/** Vimeo player frame helper 发给 top content 的身份消息。 */
export interface VimeoFrameIdentityMessage {
  /** 自有 marker，防止误收其它 postMessage。 */
  type: typeof VIMEO_FRAME_IDENTITY_MESSAGE_TYPE
  /** frame 内提取出的 video id。 */
  videoId: string
  /** frame 当前页面 URL，仅用于调试和去重。 */
  frameUrl: string
}

/** 判断当前 host 是否为 Vimeo。 */
export function isVimeoHostname(hostname: string): boolean {
  return VIMEO_HOSTS.has(hostname.toLowerCase())
}

/** 判断当前 host 是否为 Vimeo player frame。 */
export function isVimeoPlayerHostname(hostname: string): boolean {
  return hostname.toLowerCase() === VIMEO_PLAYER_HOST
}

/** 从 location 生成 Vimeo 页面缓存键。 */
export function getVimeoPageKey(locationValue: Pick<Location, 'href'>): string {
  return `vimeo:${locationValue.href}`
}

/** 从当前文档提取 Vimeo videoId。 */
export function extractVimeoIdentityFromDocument(
  root: ParentNode = document,
  locationHref: string = window.location.href
): VimeoVideoIdentity | null {
  const candidates = [
    readMetaContent(root, 'meta[property="og:video:url"]'),
    readElementAttribute(root, 'iframe[src*="player.vimeo.com/video/"]', 'src'),
    readElementAttribute(root, 'link[rel="canonical"]', 'href'),
    locationHref
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const identity = parseVimeoIdentityFromUrl(candidate, locationHref)
    if (identity) {
      return identity
    }
  }

  return null
}

/** 校验文本是否为 Vimeo 数字 video id；不可信通道（frame 消息、EventRpc 枚举）给出的提示值须先经此过滤。 */
export function isVimeoVideoIdText(value: string): boolean {
  return VIDEO_ID_RE.test(value)
}

/** 从 URL 文本解析 Vimeo videoId。 */
export function parseVimeoIdentityFromUrl(
  text: string,
  baseUrl: string = window.location.href
): VimeoVideoIdentity | null {
  const parsed = parseUrl(text, baseUrl)
  if (!parsed) {
    return null
  }

  const hostname = parsed.hostname.toLowerCase()
  const segments = parsed.pathname.split('/').filter(Boolean)
  let videoId: string | null = null

  if (hostname === VIMEO_PLAYER_HOST) {
    const videoIndex = segments.indexOf('video')
    const maybeId = videoIndex >= 0 ? segments[videoIndex + 1] : null
    if (maybeId && VIDEO_ID_RE.test(maybeId)) {
      videoId = maybeId
    }
  } else if (VIMEO_PAGE_HOSTS.has(hostname)) {
    videoId = segments.find(segment => VIDEO_ID_RE.test(segment)) ?? null
  }

  if (!videoId) {
    return null
  }

  return { videoId }
}

/** 从 Vimeo 原生完整 config URL 读取 videoId。 */
export function parseVimeoConfigUrlVideoId(url: string): string | null {
  return parseVimeoPlayerEndpointVideoId(url, /^\/video\/(\d+)\/config$/)
}

/** 从 Vimeo 原生 config_refresh_url 读取 videoId。 */
export function parseVimeoConfigRefreshUrlVideoId(url: string): string | null {
  return parseVimeoPlayerEndpointVideoId(url, /^\/video\/(\d+)\/config\/request$/)
}

/** 校验 player.vimeo.com HTTPS endpoint，并从 path 提取 videoId。 */
function parseVimeoPlayerEndpointVideoId(url: string, pathPattern: RegExp): string | null {
  const parsed = parseUrl(url)
  if (
    !parsed ||
    parsed.protocol !== 'https:' ||
    normalizeHostname(parsed.hostname) !== VIMEO_PLAYER_HOST
  ) {
    return null
  }

  const match = parsed.pathname.match(pathPattern)
  return match?.[1] ?? null
}

/** 判断 URL 是否为 Vimeo 媒体 CDN URL。 */
export function isVimeoMediaCdnUrl(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed || parsed.protocol !== 'https:') {
    return false
  }

  const host = normalizeHostname(parsed.hostname)
  return VIMEO_CDN_SUFFIXES.some(suffix => host === suffix.slice(1) || host.endsWith(suffix))
}

/**
 * 判断 URL 是否为 Vimeo 字幕直链。
 *
 * 字幕来自 `text_tracks[].url`，不在 `*.vimeocdn.com` 下：播放器 config 给的是
 * `player.vimeo.com/texttrack/*` 或 `vimeo.com/texttrack/*` 端点（相对路径按 Vimeo 主站解析），
 * 部分交付也在 Vimeo CDN 上。
 * 这里单独判定，既不放宽 `VIMEO_CDN_SUFFIXES`，也不改 manifest host permissions。
 */
export function isVimeoSubtitleUrl(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed || parsed.protocol !== 'https:') {
    return false
  }

  const host = normalizeHostname(parsed.hostname)
  if (host === VIMEO_PLAYER_HOST || VIMEO_PAGE_HOSTS.has(host)) {
    return parsed.pathname.startsWith(VIMEO_TEXT_TRACK_PATH_PREFIX)
  }

  return isVimeoMediaCdnUrl(url)
}

/** 判断 URL 是否可用于 config/playlist 拉取。 */
export function isAllowedVimeoFetchUrl(url: string): boolean {
  const parsed = parseUrl(url)
  if (!parsed || parsed.protocol !== 'https:') {
    return false
  }

  return normalizeHostname(parsed.hostname) === VIMEO_PLAYER_HOST || isVimeoMediaCdnUrl(url)
}

/** 判断 sourceKind 是否属于 Vimeo。 */
export function isVimeoSourceKind(sourceKind: ResourceSourceKind | undefined): boolean {
  return (
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4 ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL
  )
}

/** 生成安全文件名。 */
export function formatVimeoFilename(title: string, suffix: string, extension: string): string {
  const safeTitle = sanitizeFilename(title || 'vimeo-video')
  return `${safeTitle}-${suffix}.${extension.replace(/^\./, '')}`
}

/**
 * 把时间区间并入 option/source id。
 *
 * 同一画质的多个片段必须能在资源缓存、Popup 选择与下载队列里各自独立，因此身份里带上区间；
 * 全片选项不带后缀，保持既有 ID 完全不变。秒数写不出十进制文本（`1e-7` 这类指数记法）时
 * 直接抛错：构造一个 content 侧读不回来的身份，比拒绝这次调用更危险。
 */
export function formatVimeoClipOptionId(optionId: string, range: VimeoTimeRange): string {
  if (!isClipSeconds(range.startSeconds) || !isClipSeconds(range.endSeconds)) {
    throw new Error(
      `[VimeoShared] 片段秒数无法写成十进制文本: optionId=${optionId}, startSeconds=${range.startSeconds}, endSeconds=${range.endSeconds}`
    )
  }

  return `${optionId}:clip:${range.startSeconds}-${range.endSeconds}`
}

/** 去掉片段后缀，用于刷新 config 后重新定位同一画质选项。 */
export function stripVimeoClipSuffix(value: string): string {
  return value.replace(VIMEO_CLIP_SUFFIX_RE, '')
}

/** 从片段 ID 后缀还原区间；没有后缀或区间非法时返回 null。 */
export function parseVimeoClipIdRange(value: string): VimeoTimeRange | null {
  const match = VIMEO_CLIP_SUFFIX_RE.exec(value)
  if (!match) {
    return null
  }

  return parseVimeoTimeRange({
    startSeconds: Number.parseFloat(match[1]),
    endSeconds: Number.parseFloat(match[2])
  })
}

/**
 * 校验时间区间；不合法时返回 null，由调用方决定是否降级。
 *
 * 秒数必须能写成片段 ID 后缀认的十进制文本（`isClipSeconds`）：指数形式、负数、NaN 都在此
 * 被拒，因而不存在「Popup 生成得出、content 解析不回」的区间。
 */
export function parseVimeoTimeRange(value: {
  startSeconds?: number
  endSeconds?: number
}): VimeoTimeRange | null {
  const start = value.startSeconds
  const end = value.endSeconds
  if (start === undefined || end === undefined) {
    return null
  }

  if (!isClipSeconds(start) || !isClipSeconds(end)) {
    return null
  }

  return end > start ? { startSeconds: start, endSeconds: end } : null
}

/** 判断秒数能否写成片段 ID 后缀里的十进制文本；负数与非有限值同样落在这个形状之外。 */
function isClipSeconds(seconds: number): boolean {
  return CLIP_SECONDS_RE.test(String(seconds))
}

/** 编码 Vimeo 下载描述符。 */
export function encodeVimeoSourceDescriptor(descriptor: VimeoSourceDescriptor): string {
  return `${VIMEO_DESCRIPTOR_URI_PREFIX}${encodeURIComponent(JSON.stringify(descriptor))}`
}

/** 解码 Vimeo 下载描述符。 */
export function decodeVimeoSourceDescriptor(
  value: string | undefined
): VimeoSourceDescriptor | null {
  if (!value) {
    return null
  }

  try {
    const parsed = decodeDescriptorPayload(value)
    return parseVimeoSourceDescriptor(parsed)
  } catch (error) {
    console.error(error)
    return null
  }
}

/** 构造 Vimeo frame identity postMessage。 */
export function createVimeoFrameIdentityMessage(
  identity: VimeoVideoIdentity,
  frameUrl: string
): VimeoFrameIdentityMessage {
  const message: VimeoFrameIdentityMessage = {
    type: VIMEO_FRAME_IDENTITY_MESSAGE_TYPE,
    videoId: identity.videoId,
    frameUrl
  }
  return message
}

/** 解析并校验 Vimeo frame identity postMessage payload。 */
export function parseVimeoFrameIdentityMessage(
  value: JsonValue | undefined
): VimeoFrameIdentityMessage | null {
  if (!isJsonObject(value) || value.type !== VIMEO_FRAME_IDENTITY_MESSAGE_TYPE) {
    return null
  }

  const videoId = readString(value.videoId)
  const frameUrl = readString(value.frameUrl)
  if (!videoId || !VIDEO_ID_RE.test(videoId) || !frameUrl) {
    return null
  }

  const parsedFrameUrl = parseUrl(frameUrl)
  if (!parsedFrameUrl || normalizeHostname(parsedFrameUrl.hostname) !== VIMEO_PLAYER_HOST) {
    return null
  }

  const message: VimeoFrameIdentityMessage = {
    type: VIMEO_FRAME_IDENTITY_MESSAGE_TYPE,
    videoId,
    frameUrl
  }
  return message
}

/** 判断 frame identity 是否仍绑定在当前页面的 Vimeo iframe 上。 */
export function isVimeoFrameIdentityAttachedToDocument(
  identity: VimeoVideoIdentity,
  root: ParentNode = document,
  locationHref: string = window.location.href
): boolean {
  const iframes = Array.from(
    root.querySelectorAll<HTMLIFrameElement>('iframe[src*="player.vimeo.com/video/"]')
  )

  return iframes.some(iframe => {
    const src = iframe.getAttribute('src')
    if (!src) {
      return false
    }

    const iframeIdentity = parseVimeoIdentityFromUrl(src, locationHref)
    return iframeIdentity?.videoId === identity.videoId
  })
}

/** JSON object type guard。 */
export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取字符串字段。 */
export function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** 读取有限数字字段。 */
export function readFiniteNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 读取正整数字段，兼容 Vimeo JSON 里偶见的数字字符串。 */
export function readPositiveInt(value: JsonValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10)
    return parsed > 0 ? parsed : undefined
  }

  return undefined
}

/** 读取字符串字段表；非字符串项直接丢弃，空表返回 undefined。 */
function readStringRecord(value: JsonValue | undefined): Record<string, string> | undefined {
  if (!isJsonObject(value)) {
    return undefined
  }

  const record: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      record[key] = item
    }
  }

  return Object.keys(record).length > 0 ? record : undefined
}

/** URL 解析，失败返回 null。 */
export function parseUrl(url: string, baseUrl?: string): URL | null {
  try {
    return baseUrl ? new URL(url, baseUrl) : new URL(url)
  } catch (_error) {
    return null
  }
}

/** 清理 hostname 尾点。 */
function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '')
}

/** 读取 meta content。 */
function readMetaContent(root: ParentNode, selector: string): string | null {
  return root.querySelector<HTMLMetaElement>(selector)?.content ?? null
}

/** 读取元素 attribute。 */
function readElementAttribute(
  root: ParentNode,
  selector: string,
  attribute: string
): string | null {
  return root.querySelector<Element>(selector)?.getAttribute(attribute) ?? null
}

/** 文件名只保留用户可识别的标题字符，避免下载失败。 */
function sanitizeFilename(value: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .split('\n')
    .join(' ')
    .split('\r')
    .join(' ')
    .split('\t')
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
  return normalized.length > 0 ? normalized : 'vimeo-video'
}

/** 解码 descriptor payload；新格式用 URI 编码，旧格式只为兼容内存中的旧按钮。 */
function decodeDescriptorPayload(value: string): JsonValue {
  if (value.startsWith(VIMEO_DESCRIPTOR_URI_PREFIX)) {
    return JSON.parse(
      decodeURIComponent(value.slice(VIMEO_DESCRIPTOR_URI_PREFIX.length))
    ) as JsonValue
  }

  if (value.startsWith(VIMEO_DESCRIPTOR_LEGACY_PREFIX)) {
    return JSON.parse(atob(value.slice(VIMEO_DESCRIPTOR_LEGACY_PREFIX.length))) as JsonValue
  }

  throw new Error('[VimeoShared] descriptor 前缀不合法')
}

/** 解析 descriptor JSON。 */
function parseVimeoSourceDescriptor(value: JsonValue): VimeoSourceDescriptor | null {
  if (!isJsonObject(value) || value.version !== 2) {
    return null
  }

  const videoId = readString(value.videoId)
  const sourceId = readString(value.sourceId)
  const optionId = readString(value.optionId)
  const kind = parseOptionKind(value.kind)
  const delivery = parseDelivery(value.delivery)
  const label = readString(value.label)
  const configUrl = readString(value.configUrl)
  if (!videoId || !sourceId || !optionId || !kind || !delivery || !label || !configUrl) {
    return null
  }

  const dashPlaylistUrl = readString(value.dashPlaylistUrl)
  const videoTrackId = readString(value.videoTrackId)
  const audioTrackId = readString(value.audioTrackId)
  const hlsPlaylistUrl = readString(value.hlsPlaylistUrl)
  if (
    (delivery === 'dash' &&
      (!dashPlaylistUrl ||
        (kind === 'video' && !videoTrackId) ||
        (kind === 'audio' && !audioTrackId) ||
        (kind !== 'video' && kind !== 'audio'))) ||
    (delivery === 'hls' && (kind !== 'video' || !hlsPlaylistUrl)) ||
    (delivery === 'progressive' && kind !== 'video') ||
    (delivery === 'thumbnail' && kind !== 'image') ||
    (delivery === 'subtitle' && kind !== 'subtitle') ||
    (delivery !== 'subtitle' && kind === 'subtitle')
  ) {
    return null
  }

  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId,
    sourceId,
    optionId,
    kind,
    delivery,
    label,
    configUrl
  }

  const refreshConfigUrl = readString(value.refreshConfigUrl)
  if (refreshConfigUrl) {
    descriptor.refreshConfigUrl = refreshConfigUrl
  }

  const labelKey = readString(value.labelKey)
  if (labelKey) {
    descriptor.labelKey = labelKey
  }

  const labelParams = readStringRecord(value.labelParams)
  if (labelParams) {
    descriptor.labelParams = labelParams
  }

  if (dashPlaylistUrl) {
    descriptor.dashPlaylistUrl = dashPlaylistUrl
  }

  if (videoTrackId) {
    descriptor.videoTrackId = videoTrackId
  }

  if (audioTrackId) {
    descriptor.audioTrackId = audioTrackId
  }

  if (hlsPlaylistUrl) {
    descriptor.hlsPlaylistUrl = hlsPlaylistUrl
  }

  const videoSegmentTimeline = readSegmentTimeline(value.videoSegmentTimeline)
  const audioSegmentTimeline = readSegmentTimeline(value.audioSegmentTimeline)
  if (videoSegmentTimeline) descriptor.videoSegmentTimeline = videoSegmentTimeline
  if (audioSegmentTimeline) descriptor.audioSegmentTimeline = audioSegmentTimeline

  const range = parseVimeoTimeRange({
    startSeconds: readFiniteNumber(value.startSeconds),
    endSeconds: readFiniteNumber(value.endSeconds)
  })
  // 区间是有意义的下载参数：不能裁剪的 delivery 带上区间说明描述符与交付方式不一致，
  // 直接拒绝比静默产出全片更安全。
  if (range && delivery !== 'dash' && delivery !== 'hls') {
    return null
  }
  if (range) {
    descriptor.startSeconds = range.startSeconds
    descriptor.endSeconds = range.endSeconds
  }

  return descriptor
}

function readSegmentTimeline(value: JsonValue | undefined): VimeoSegmentWindow[] | null {
  if (!Array.isArray(value)) return null
  const timeline: VimeoSegmentWindow[] = []
  for (const item of value) {
    if (!isJsonObject(item)) return null
    const startSeconds = readFiniteNumber(item.startSeconds)
    const endSeconds = readFiniteNumber(item.endSeconds)
    if (startSeconds === undefined || endSeconds === undefined || endSeconds <= startSeconds) {
      return null
    }
    timeline.push({ startSeconds, endSeconds })
  }
  return timeline.length > 0 ? timeline : null
}

/** 解析 option kind。 */
function parseOptionKind(value: JsonValue | undefined): VimeoOptionKind | null {
  return value === 'video' || value === 'audio' || value === 'image' || value === 'subtitle'
    ? value
    : null
}

/** 解析 delivery。 */
function parseDelivery(value: JsonValue | undefined): VimeoDelivery | null {
  return value === 'progressive' ||
    value === 'dash' ||
    value === 'hls' ||
    value === 'thumbnail' ||
    value === 'subtitle'
    ? value
    : null
}
