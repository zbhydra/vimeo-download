/**
 * Vimeo 媒体资源建模。
 *
 * 从 player config 与 DASH playlist 中生成页面按钮和 popup 共用的 MediaResource。
 * 资源进入缓存前完成 URL 白名单过滤，DASH 只展示能在前端稳定 mux 的 track。
 */

import { I18N_KEYS } from '@/core/constants/i18n'
import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { MediaResource, ResourceSourceKind, VideoGroupMetadata } from '@/core/types'
import type { JsonObject, JsonValue } from '@/core/rpc/types'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor,
  formatVimeoClipOptionId,
  formatVimeoFilename,
  isAllowedVimeoFetchUrl,
  isJsonObject,
  isVimeoMediaCdnUrl,
  isVimeoSubtitleUrl,
  parseUrl,
  parseVimeoConfigRefreshUrlVideoId,
  parseVimeoTimeRange,
  readFiniteNumber,
  readPositiveInt,
  readString,
  type VimeoDelivery,
  type VimeoOptionKind,
  type VimeoSourceDescriptor,
  type VimeoTimeRange
} from './shared'
import { vimeoConfig } from './runtimeConfig'

/** Vimeo progressive MP4。 */
export interface VimeoProgressiveFile {
  /** 直连 MP4 URL。 */
  url: string
  /** Vimeo quality 文本，如 1080p。 */
  quality?: string
  /** 宽度。 */
  width?: number
  /** 高度。 */
  height?: number
  /** 帧率。 */
  fps?: number
  /** MIME 类型。 */
  mime?: string
  /** 码率。 */
  bitrate?: number
  /** 文件字节数；config 未给时缺失，不估算。 */
  size?: number
}

/** Vimeo thumbnail。 */
export interface VimeoThumbnail {
  /** 图片 URL。 */
  url: string
  /** 宽度或 key 推断尺寸。 */
  width?: number
}

/** Vimeo 字幕轨（text track）。 */
export interface VimeoTextTrack {
  /** 语言标识，用于生成稳定的 option id：优先 `lang`，缺失时用 `label`。 */
  lang: string
  /** 展示名：优先 `label`，缺失时用 `lang`。 */
  label: string
  /** 已解析为绝对的 Vimeo 字幕直链。 */
  url: string
}

/** 字幕文件格式与扩展名。 */
interface VimeoSubtitleFormat {
  /** 不带点的文件扩展名。 */
  extension: string
  /** 交给 Chrome 下载与边界校验的 MIME。 */
  mimeType: string
}

/** 已解析 Vimeo config。 */
export interface VimeoParsedConfig {
  /** Vimeo video id。 */
  videoId: string
  /** 视频标题。 */
  title: string
  /** 作者（`video.owner.name`）；Vimeo 未给出时缺失。 */
  author?: string
  /** 视频时长（秒，`video.duration`）；Vimeo 未给出时缺失。 */
  duration?: number
  /** config URL。 */
  configUrl: string
  /** config_refresh_url。 */
  refreshConfigUrl?: string
  /** signed URL 绝对过期时间（Unix 秒）。 */
  expiresAt?: number
  /**
   * 组展示元数据；`video.title` 原值进 `groupMetadata.title`（缺失为空串，与 `title` 的
   * 文件名兜底值区分开），`/config/request` 刷新片段缺 `video` 时沿用刷新前值。
   */
  groupMetadata: VideoGroupMetadata
  /** progressive MP4 列表。 */
  progressive: VimeoProgressiveFile[]
  /** DASH playlist URL。 */
  dashPlaylistUrl?: string
  /** HLS playlist URL。 */
  hlsPlaylistUrl?: string
  /** thumbnail 列表。 */
  thumbnails: VimeoThumbnail[]
  /** 字幕轨列表。 */
  textTracks: VimeoTextTrack[]
}

/** DASH segment。 */
export interface VimeoDashSegment {
  /** segment 相对或绝对 URL。 */
  url: string
  /** segment 字节数。 */
  size?: number
}

/** DASH track。 */
export interface VimeoDashTrack {
  /** track id。 */
  id: string
  /** track base_url。 */
  baseUrl: string
  /** MIME 类型。 */
  mimeType: string
  /** codec 字符串。 */
  codecs?: string
  /** 码率。 */
  bitrate?: number
  /** 宽度。 */
  width?: number
  /** 高度。 */
  height?: number
  /** 帧率。 */
  fps?: number
  /** 采样率。 */
  sampleRate?: number
  /** 声道数。 */
  channels?: number
  /** base64 init segment。 */
  initSegment: string
  /** media segments。 */
  segments: VimeoDashSegment[]
}

/** DASH playlist。 */
export interface VimeoDashPlaylist {
  /** playlist URL。 */
  playlistUrl: string
  /** playlist base_url。 */
  baseUrl: string
  /** 视频 tracks。 */
  videoTracks: VimeoDashTrack[]
  /** 音频 tracks。 */
  audioTracks: VimeoDashTrack[]
}

/** HLS master variant。 */
export interface VimeoHlsVariant {
  /** variant playlist URL。 */
  url: string
  /** bandwidth。 */
  bandwidth?: number
  /** 宽度。 */
  width?: number
  /** 高度。 */
  height?: number
  /** 帧率。 */
  fps?: number
  /** master playlist CODECS。 */
  codecs?: string
}

/** HLS fMP4 segment。 */
export interface VimeoHlsSegment {
  /** 绝对 segment URL。 */
  url: string
}

/** 已安全解析的 HLS fMP4 media playlist。 */
export interface VimeoHlsMediaPlaylist {
  /** media playlist URL。 */
  playlistUrl: string
  /** init segment URL，来自 #EXT-X-MAP。 */
  initSegmentUrl: string
  /** media segments。 */
  segments: VimeoHlsSegment[]
  /** bandwidth。 */
  bandwidth?: number
  /** 宽度。 */
  width?: number
  /** 高度。 */
  height?: number
  /** 帧率。 */
  fps?: number
  /** codecs，必须同时包含可 remux 的 video/audio codec。 */
  codecs: string
}

/** Vimeo 下载按钮选项。 */
export interface VimeoDownloadOption {
  /** option id。 */
  optionId: string
  /** source/resource id。 */
  sourceId: string
  /** 类型。 */
  kind: VimeoOptionKind
  /** 交付方式。 */
  delivery: VimeoDelivery
  /** 按钮标签的技术文本；`labelKey` 存在时只作为回退。 */
  label: string
  /** 标签的 i18n 词条键；`1080p HD`、`128 kbps` 这类数字加单位的技术标识不带键。 */
  labelKey?: string
  /** `labelKey` 的插值参数。 */
  labelParams?: Record<string, string>
  /** 视频标题，用于 Popup 信息区与文件名。 */
  title: string
  /** 视频作者，用于 Popup 信息区；缺失时不展示。 */
  author?: string
  /** 视频时长（秒），用于 Popup 信息区；缺失时不展示。 */
  duration?: number
  /** 组展示元数据，统一取自 config，随资源进入 ResourceBuffer 的 videoGroups 通道。 */
  groupMetadata: VideoGroupMetadata
  /** 文件名。 */
  filename: string
  /** 下载或 config URL。 */
  url: string
  /** sourceKind。 */
  sourceKind: ResourceSourceKind
  /** 宽度。 */
  width?: number
  /** 高度。 */
  height?: number
  /** 帧率。 */
  fps?: number
  /** 码率。 */
  bitrate?: number
  /** 文件大小估算。 */
  size?: number
  /** MIME 类型。 */
  mimeType: string
  /** DASH playlist URL；仅 DASH 选项设置。 */
  dashPlaylistUrl?: string
  /** DASH video track id。 */
  videoTrackId?: string
  /** DASH audio track id。 */
  audioTrackId?: string
  /** HLS media playlist URL。 */
  hlsPlaylistUrl?: string
  /** 下载描述符。 */
  descriptor: VimeoSourceDescriptor
}

const DEFAULT_TITLE = 'vimeo-video'

const DASH_AUDIO_MIME_TYPE = 'audio/mp4'
const DASH_VIDEO_MIME_TYPE = 'video/mp4'

/**
 * 解析 Vimeo 完整 config 或 `/config/request` 刷新片段。
 *
 * @param value Vimeo JSON 响应
 * @param configUrl 产生响应的完整 signed URL
 * @param fallbackConfig 刷新已有 config 时沿用的视频元数据
 */
export function parseVimeoConfig(
  value: JsonValue,
  configUrl: string,
  fallbackConfig?: VimeoParsedConfig
): VimeoParsedConfig {
  const root = requireJsonObject(value, 'config')
  const refreshVideoId = parseVimeoConfigRefreshUrlVideoId(configUrl)
  const request = isJsonObject(root.request)
    ? root.request
    : refreshVideoId
      ? root
      : requireJsonObject(root.request, 'config.request')
  const files = requireJsonObject(request.files, 'config.request.files')
  const video = isJsonObject(root.video) ? root.video : null

  const videoId =
    String(readPositiveInt(video?.id) ?? readPositiveInt(root.video_id) ?? '') ||
    fallbackConfig?.videoId ||
    refreshVideoId ||
    ''
  if (!videoId) {
    throw new Error(
      `[VimeoMedia] config.video.id 缺失或不是正整数: configHost=${urlHostname(configUrl)}, stage=config-parse`
    )
  }
  if (refreshVideoId && videoId !== refreshVideoId) {
    throw new Error(
      `[VimeoMedia] config/request URL 与视频身份不匹配: urlVideoId=${refreshVideoId}, configVideoId=${videoId}, configHost=${urlHostname(configUrl)}, stage=config-parse`
    )
  }

  const timestamp = readPositiveInt(request.timestamp)
  const expiresInSeconds = readPositiveInt(request.expires)
  const owner = isJsonObject(video?.owner) ? video.owner : null

  return {
    videoId,
    title: readString(video?.title) ?? fallbackConfig?.title ?? DEFAULT_TITLE,
    // `/config/request` 刷新片段不带 `video`，与标题一样沿用刷新前的元数据。
    author: readString(owner?.name) ?? fallbackConfig?.author,
    duration: readPositiveInt(video?.duration) ?? fallbackConfig?.duration,
    configUrl,
    refreshConfigUrl: readAllowedFetchUrl(request.config_refresh_url),
    expiresAt:
      timestamp !== undefined && expiresInSeconds !== undefined
        ? timestamp + expiresInSeconds
        : undefined,
    groupMetadata: {
      // 组元数据取 config 原值：标题缺失保持空串（popup 用 videoId 兜底），不落文件名用的
      // DEFAULT_TITLE；刷新片段缺 `video` 时与上面各字段一样沿用刷新前值。
      title: readString(video?.title) ?? fallbackConfig?.groupMetadata?.title ?? '',
      author: readString(owner?.name) ?? fallbackConfig?.groupMetadata?.author,
      durationSeconds:
        readPositiveInt(video?.duration) ?? fallbackConfig?.groupMetadata?.durationSeconds,
      thumbnailUrl:
        readGroupThumbnailUrl(video?.thumbnail_url) ?? fallbackConfig?.groupMetadata?.thumbnailUrl
    },
    progressive: readProgressiveFiles(files.progressive),
    dashPlaylistUrl: readDashPlaylistUrl(files.dash),
    hlsPlaylistUrl: readHlsPlaylistUrl(files.hls),
    thumbnails: video ? readThumbnails(video.thumbs) : (fallbackConfig?.thumbnails ?? []),
    textTracks: readTextTracks(request.text_tracks, configUrl) ?? fallbackConfig?.textTracks ?? []
  }
}

/** 解析 Vimeo DASH playlist JSON。 */
export function parseVimeoDashPlaylist(value: JsonValue, playlistUrl: string): VimeoDashPlaylist {
  const root = requireJsonObject(value, 'dash playlist')
  const playlist: VimeoDashPlaylist = {
    playlistUrl,
    baseUrl: readString(root.base_url) ?? '',
    videoTracks: readDashTracks(root.video, 'video'),
    audioTracks: readDashTracks(root.audio, 'audio')
  }

  return {
    ...playlist,
    videoTracks: playlist.videoTracks.filter(track => isSafeDashVideoTrack(playlist, track)),
    audioTracks: playlist.audioTracks.filter(track => isSafeDashAudioTrack(playlist, track))
  }
}

/** 从 config 与 DASH playlist 构造全部下载选项。 */
export function buildVimeoDownloadOptions(
  config: VimeoParsedConfig,
  dashPlaylist: VimeoDashPlaylist | null,
  hlsPlaylists: VimeoHlsMediaPlaylist[] = []
): VimeoDownloadOption[] {
  const progressiveOptions = buildProgressiveOptions(config)
  const audioTracks = dashPlaylist ? sortAudioTracks(dashPlaylist.audioTracks) : []
  const bestAudioTrack = audioTracks[0]
  const dashVideoOptions = dashPlaylist
    ? sortVideoTracks(dashPlaylist.videoTracks).flatMap(track =>
        createDashVideoOptions(config, dashPlaylist.playlistUrl, track, bestAudioTrack)
      )
    : []
  const safeDashVideoOptions = dashVideoOptions.filter(option => !isKnownOversized(option.size))
  const hlsVideoOptions =
    safeDashVideoOptions.length === 0
      ? sortHlsMediaPlaylists(hlsPlaylists).map(playlist => createHlsVideoOption(config, playlist))
      : []
  const audioOptions = dashPlaylist
    ? audioTracks
        .map(track => createDashAudioOption(config, dashPlaylist.playlistUrl, track))
        .filter(option => !isKnownOversized(option.size))
    : []
  const subtitleOptions = buildSubtitleOptions(config)
  const thumbnailOption = buildThumbnailOption(config)

  const options: VimeoDownloadOption[] = []
  const videoOptions = [...progressiveOptions, ...safeDashVideoOptions, ...hlsVideoOptions]
  const bestVideo = selectBestVideoOption(videoOptions)
  if (bestVideo) {
    options.push(createBestVideoOption(bestVideo, config))
  }
  options.push(...sortVideoOptions(videoOptions))

  const bestAudio = audioOptions[0]
  if (bestAudio) {
    options.push(createBestAudioOption(bestAudio, config))
  }
  options.push(...audioOptions)
  options.push(...subtitleOptions)

  if (thumbnailOption) {
    options.push(thumbnailOption)
  }

  return options
}

/**
 * 给一个已建模资源附加片段裁剪区间。
 *
 * 区间并入 option id 与 source id，使同一画质的多个片段在资源缓存、Popup 选择与下载队列中
 * 各自独立；只有 DASH/HLS 能在浏览器内按 packet 边界裁剪，progressive 直链交给 Chrome
 * 下载管理器、无法只取区间，因此这里直接拒绝而不是产出一个名字像片段、内容却是全片的文件。
 *
 * @param resource 已建模的 DASH/HLS 资源
 * @param range 相对媒体起点的秒级区间
 */
export function applyVimeoTimeRange(resource: MediaResource, range: VimeoTimeRange): MediaResource {
  const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
  if (!descriptor) {
    throw new Error(
      `[VimeoMedia] 资源缺少可解析的 descriptor，无法裁剪: resourceId=${resource.id}, stage=clip`
    )
  }
  if (descriptor.delivery !== 'dash' && descriptor.delivery !== 'hls') {
    throw new Error(
      `[VimeoMedia] 只有 DASH/HLS 交付支持片段裁剪: resourceId=${resource.id}, delivery=${descriptor.delivery}, stage=clip`
    )
  }

  const validRange = parseVimeoTimeRange(range)
  if (!validRange) {
    throw new Error(
      `[VimeoMedia] 片段区间非法: resourceId=${resource.id}, startSeconds=${range.startSeconds}, endSeconds=${range.endSeconds}, stage=clip`
    )
  }

  const clipDescriptor: VimeoSourceDescriptor = {
    ...descriptor,
    sourceId: formatVimeoClipOptionId(descriptor.sourceId, validRange),
    optionId: formatVimeoClipOptionId(descriptor.optionId, validRange),
    startSeconds: validRange.startSeconds,
    endSeconds: validRange.endSeconds
  }

  return {
    ...resource,
    id: clipDescriptor.sourceId,
    ...(resource.filename ? { filename: appendClipFilename(resource.filename, validRange) } : {}),
    documentId: encodeVimeoSourceDescriptor(clipDescriptor)
  }
}

/** 从下载选项构造 MediaResource。 */
export function createVimeoResource(option: VimeoDownloadOption, index: number): MediaResource {
  const resourceType =
    option.kind === 'video'
      ? RESOURCE_TYPES.VIDEO
      : option.kind === 'audio'
        ? RESOURCE_TYPES.AUDIO
        : option.kind === 'subtitle'
          ? RESOURCE_TYPES.SUBTITLE
          : RESOURCE_TYPES.IMAGE

  return {
    id: option.sourceId,
    messageId: option.descriptor.videoId,
    index,
    url: option.url,
    type: resourceType,
    sourceKind: option.sourceKind,
    filename: option.filename,
    title: option.title,
    author: option.author,
    duration: option.duration,
    groupMetadata: option.groupMetadata,
    size: option.size,
    thumbnail: option.kind === 'image' ? option.url : undefined,
    mimeType: option.mimeType,
    documentId: encodeVimeoSourceDescriptor(option.descriptor),
    width: option.width,
    height: option.height,
    chatId: `vimeo:${option.descriptor.videoId}`,
    metadata: { messageId: option.descriptor.videoId }
  }
}

/** 标签翻译函数；由调用方注入各自的 i18n 实现，media 层不依赖 i18n 运行时。 */
export type VimeoLabelTranslator = (key: string, params?: Record<string, string>) => string

/**
 * 从资源 documentId 读取展示标签。
 *
 * 词条由 media 层声明在 descriptor 里（`Best`、`(no audio)` 这类英文词都在 i18n 表中），
 * 字幕语言名等站点数据标签没有词条键，按原样展示。
 */
export function getVimeoResourceLabel(
  resource: MediaResource,
  translate: VimeoLabelTranslator
): string {
  const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
  if (!descriptor) {
    return resource.filename ?? resource.id
  }

  return descriptor.labelKey
    ? translate(descriptor.labelKey, descriptor.labelParams)
    : descriptor.label
}

/**
 * 判断资源是否支持片段裁剪。
 *
 * 只有 DASH/HLS 能在浏览器内按 packet 边界取区间；progressive 交给 Chrome 下载管理器、
 * subtitle 与 thumbnail 也不是分片交付。该口径与 `applyVimeoTimeRange` 的拒绝条件一致，
 * 供 UI 在用户触发前禁用入口。
 */
export function supportsVimeoTimeRange(resource: MediaResource): boolean {
  const delivery = decodeVimeoSourceDescriptor(resource.documentId)?.delivery
  return delivery === 'dash' || delivery === 'hls'
}

/** 从资源 documentId 读取页面按钮 choice。 */
export function getVimeoResourceChoice(resource: MediaResource): string {
  const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
  if (!descriptor) {
    return resource.id
  }

  if (descriptor.kind === 'video' && descriptor.optionId === 'best') {
    return 'best'
  }
  if (descriptor.kind === 'audio' && descriptor.optionId === 'best-audio') {
    return 'best-audio'
  }
  if (descriptor.kind === 'image') {
    return 'best-thumbnail'
  }
  return descriptor.optionId
}

/** Vimeo sourceKind 排序。 */
export function getVimeoSourceRank(resource: MediaResource): number {
  if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4) {
    return 40
  }
  if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO) {
    return 35
  }
  if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO) {
    return 34
  }
  if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO) {
    return 30
  }
  if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL) {
    return 25
  }
  if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL) {
    return 20
  }
  return 1
}

/** 解析非加密 HLS master variants。 */
export function parseVimeoHlsMasterPlaylist(text: string, playlistUrl: string): VimeoHlsVariant[] {
  if (hasHlsTag(text, '#EXT-X-KEY')) {
    return []
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  const variants: VimeoHlsVariant[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.startsWith('#EXT-X-STREAM-INF:')) {
      continue
    }

    const nextLine = lines[index + 1]
    if (!nextLine || nextLine.startsWith('#')) {
      continue
    }

    const url = resolveUrlOrNull(nextLine, playlistUrl)
    if (!url) {
      continue
    }
    if (!isVimeoMediaCdnUrl(url)) {
      continue
    }

    const attrs = parseHlsAttributes(line.slice('#EXT-X-STREAM-INF:'.length))
    const resolution = readString(attrs.RESOLUTION)?.match(/^(\d+)x(\d+)$/)
    variants.push({
      url,
      bandwidth: readPositiveInt(attrs.BANDWIDTH),
      width: resolution ? Number.parseInt(resolution[1], 10) : undefined,
      height: resolution ? Number.parseInt(resolution[2], 10) : undefined,
      fps: readHlsNumber(attrs['FRAME-RATE']),
      codecs: readString(attrs.CODECS)
    })
  }

  return variants.filter(isSupportedHlsVariant).sort(compareHlsVariantDesc)
}

/** 解析安全 fMP4 HLS media playlist；不满足结构时返回 null，不展示按钮。 */
export function parseVimeoHlsMediaPlaylist(
  text: string,
  playlistUrl: string,
  variant: VimeoHlsVariant
): VimeoHlsMediaPlaylist | null {
  if (hasHlsTag(text, '#EXT-X-KEY') || hasHlsTag(text, '#EXT-X-BYTERANGE')) {
    return null
  }

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  const mapLine = lines.find(line => line.startsWith('#EXT-X-MAP:'))
  if (!mapLine) {
    return null
  }

  const mapAttrs = parseHlsAttributes(mapLine.slice('#EXT-X-MAP:'.length))
  const mapUri = readString(mapAttrs.URI)
  if (!mapUri || readString(mapAttrs.BYTERANGE)) {
    return null
  }

  const initSegmentUrl = resolveUrlOrNull(mapUri, playlistUrl)
  if (!initSegmentUrl) {
    return null
  }
  if (!isSafeHlsSegmentUrl(initSegmentUrl)) {
    return null
  }

  const segments: VimeoHlsSegment[] = []
  for (const line of lines) {
    if (line.startsWith('#')) {
      continue
    }

    const segmentUrl = resolveUrlOrNull(line, playlistUrl)
    if (!segmentUrl) {
      return null
    }
    if (!isSafeHlsSegmentUrl(segmentUrl)) {
      return null
    }
    segments.push({ url: segmentUrl })
  }

  const codecs = variant.codecs
  if (segments.length === 0 || !codecs) {
    return null
  }

  return {
    playlistUrl,
    initSegmentUrl,
    segments,
    bandwidth: variant.bandwidth,
    width: variant.width,
    height: variant.height,
    fps: variant.fps,
    codecs
  }
}

/** 解析 DASH track 的绝对 segment URL。 */
export function resolveDashSegmentUrl(
  playlist: VimeoDashPlaylist,
  track: VimeoDashTrack,
  segment: VimeoDashSegment
): string {
  const playlistBase = resolveRelativeUrl(playlist.playlistUrl, playlist.baseUrl)
  const trackBase = resolveRelativeUrl(playlistBase, track.baseUrl)
  return new URL(segment.url, trackBase).href
}

/** 按 track id 查找 DASH track。 */
export function findDashTrack(
  tracks: VimeoDashTrack[],
  trackId: string | undefined
): VimeoDashTrack | null {
  if (!trackId) {
    return null
  }

  return tracks.find(track => track.id === trackId) ?? null
}

/** 读取 JSON object。 */
function requireJsonObject(value: JsonValue | undefined, label: string): JsonObject {
  if (isJsonObject(value)) {
    return value
  }

  throw new Error(`[VimeoMedia] ${label} 必须是对象`)
}

/** 读取 progressive files。 */
function readProgressiveFiles(value: JsonValue | undefined): VimeoProgressiveFile[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  const files: VimeoProgressiveFile[] = []
  for (const item of value) {
    if (!isJsonObject(item)) {
      continue
    }

    const url = readString(item.url)
    if (!url || seen.has(url) || !isVimeoMediaCdnUrl(url)) {
      continue
    }

    seen.add(url)
    files.push({
      url,
      quality: readString(item.quality),
      width: readPositiveInt(item.width),
      height: readPositiveInt(item.height),
      fps: readFiniteNumber(item.fps),
      mime: readString(item.mime),
      bitrate: readPositiveInt(item.bitrate),
      size: readPositiveInt(item.size)
    })
  }

  return files.sort(compareProgressiveDesc)
}

/** 读取 DASH playlist URL。 */
function readDashPlaylistUrl(value: JsonValue | undefined): string | undefined {
  const dash = isJsonObject(value) ? value : null
  if (!dash) {
    return undefined
  }

  const cdns = isJsonObject(dash.cdns) ? dash.cdns : null
  if (!cdns) {
    return undefined
  }

  const defaultCdn = readString(dash.default_cdn)
  const selected = defaultCdn && isJsonObject(cdns[defaultCdn]) ? cdns[defaultCdn] : null
  const selectedUrl = selected ? readAllowedFetchUrl(selected.url) : undefined
  if (selectedUrl) {
    return selectedUrl
  }

  for (const value of Object.values(cdns)) {
    if (!isJsonObject(value)) {
      continue
    }
    const url = readAllowedFetchUrl(value.url)
    if (url) {
      return url
    }
  }

  return undefined
}

/** 读取 HLS playlist URL。 */
function readHlsPlaylistUrl(value: JsonValue | undefined): string | undefined {
  const hls = isJsonObject(value) ? value : null
  if (!hls) {
    return undefined
  }

  const url = readAllowedFetchUrl(hls.url)
  if (url) {
    return url
  }

  const cdns = isJsonObject(hls.cdns) ? hls.cdns : null
  if (!cdns) {
    return undefined
  }

  for (const cdnValue of Object.values(cdns)) {
    if (!isJsonObject(cdnValue)) {
      continue
    }
    const cdnUrl = readAllowedFetchUrl(cdnValue.url)
    if (cdnUrl) {
      return cdnUrl
    }
  }

  return undefined
}

/** 读取允许 fetch 的 URL。 */
function readAllowedFetchUrl(value: JsonValue | undefined): string | undefined {
  const url = readString(value)
  return url && isAllowedVimeoFetchUrl(url) ? url : undefined
}

/** 读取视频封面 URL；只接受 https 且 `*.vimeocdn.com` 域，非法时省略该字段。 */
function readGroupThumbnailUrl(value: JsonValue | undefined): string | undefined {
  const url = readString(value)
  return url && isVimeoMediaCdnUrl(url) ? url : undefined
}

/** 读取 thumbnails。 */
function readThumbnails(value: JsonValue | undefined): VimeoThumbnail[] {
  if (!isJsonObject(value)) {
    return []
  }

  const thumbnails: VimeoThumbnail[] = []
  const seen = new Set<string>()
  for (const [key, rawUrl] of Object.entries(value)) {
    const url = readString(rawUrl)
    if (!url || seen.has(url) || !isVimeoMediaCdnUrl(url)) {
      continue
    }

    seen.add(url)
    thumbnails.push({
      url,
      width: /^\d+$/.test(key) ? Number.parseInt(key, 10) : undefined
    })
  }

  return thumbnails.sort((left, right) => (right.width ?? 0) - (left.width ?? 0))
}

/**
 * 读取 text tracks。
 *
 * 字段缺失（例如 `/config/request` 刷新片段不带字幕）时返回 null，由调用方沿用刷新前的轨道；
 * 只有合法且命中 Vimeo 字幕白名单的轨道才进入资源缓存。相对 URL 按 config URL 解析：
 * Vimeo 播放器 config 里的字幕地址常见为 `/texttrack/{id}.vtt?...` 形式。
 */
function readTextTracks(value: JsonValue | undefined, configUrl: string): VimeoTextTrack[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const tracks: VimeoTextTrack[] = []
  const seenUrls = new Set<string>()
  const seenLangs = new Set<string>()
  for (const item of value) {
    if (!isJsonObject(item)) {
      continue
    }

    const rawUrl = readString(item.url)
    const rawLabel = readString(item.label)
    const lang = readString(item.lang) ?? rawLabel
    if (!rawUrl || !lang) {
      continue
    }

    const url = resolveUrlOrNull(rawUrl, configUrl)
    if (!url || !isVimeoSubtitleUrl(url) || seenUrls.has(url) || seenLangs.has(lang)) {
      continue
    }

    seenUrls.add(url)
    seenLangs.add(lang)
    tracks.push({ lang, label: rawLabel ?? lang, url })
  }

  return tracks
}

/** 从 URL 扩展名判断字幕格式；无法识别时按 Vimeo 默认交付的 WebVTT 处理。 */
function resolveVimeoSubtitleFormat(url: string): VimeoSubtitleFormat {
  const pathname = parseUrl(url)?.pathname.toLowerCase() ?? ''
  if (pathname.endsWith('.ttml') || pathname.endsWith('.dfxp') || pathname.endsWith('.xml')) {
    return { extension: 'ttml', mimeType: 'application/ttml+xml' }
  }
  if (pathname.endsWith('.srt')) {
    return { extension: 'srt', mimeType: 'application/x-subrip' }
  }

  return { extension: 'vtt', mimeType: 'text/vtt' }
}

/** 片段文件名：在扩展名前插入区间后缀，和全片文件区分开。 */
function appendClipFilename(filename: string, range: VimeoTimeRange): string {
  return filename.replace(/(\.[^.]*)$/, `-clip-${range.startSeconds}-${range.endSeconds}s$1`)
}

/** 读取 DASH tracks。 */
function readDashTracks(value: JsonValue | undefined, kind: 'video' | 'audio'): VimeoDashTrack[] {
  if (!Array.isArray(value)) {
    return []
  }

  const tracks: VimeoDashTrack[] = []
  for (const item of value) {
    if (!isJsonObject(item)) {
      continue
    }

    const id = readString(item.id)
    const initSegment = readString(item.init_segment)
    const segments = readDashSegments(item.segments)
    if (!id || !initSegment || segments.length === 0) {
      continue
    }

    tracks.push({
      id,
      baseUrl: readString(item.base_url) ?? '',
      mimeType: readString(item.mime_type) ?? '',
      codecs: readString(item.codecs),
      bitrate: readPositiveInt(item.bitrate),
      width: readPositiveInt(item.width),
      height: readPositiveInt(item.height),
      fps: readFiniteNumber(item.fps),
      sampleRate: readPositiveInt(item.sample_rate),
      channels: readPositiveInt(item.channels),
      initSegment,
      segments
    })
  }

  return kind === 'video' ? sortVideoTracks(tracks) : sortAudioTracks(tracks)
}

/** 读取 DASH segments。 */
function readDashSegments(value: JsonValue | undefined): VimeoDashSegment[] {
  if (!Array.isArray(value)) {
    return []
  }

  const segments: VimeoDashSegment[] = []
  for (const item of value) {
    if (!isJsonObject(item)) {
      continue
    }

    const url = readString(item.url)
    if (!url) {
      continue
    }

    segments.push({
      url,
      size: readPositiveInt(item.size)
    })
  }

  return segments
}

/** DASH video track 安全检查。 */
function isSafeDashVideoTrack(playlist: VimeoDashPlaylist, track: VimeoDashTrack): boolean {
  return (
    normalizeMimeType(track.mimeType) === DASH_VIDEO_MIME_TYPE &&
    hasSupportedDashVideoCodec(track.codecs) &&
    hasOnlySafeDashSegments(playlist, track)
  )
}

/** DASH audio track 安全检查。 */
function isSafeDashAudioTrack(playlist: VimeoDashPlaylist, track: VimeoDashTrack): boolean {
  return (
    normalizeMimeType(track.mimeType) === DASH_AUDIO_MIME_TYPE &&
    hasSupportedDashAudioCodec(track.codecs) &&
    hasOnlySafeDashSegments(playlist, track)
  )
}

/** DASH segment URL 安全检查。 */
function hasOnlySafeDashSegments(playlist: VimeoDashPlaylist, track: VimeoDashTrack): boolean {
  try {
    return track.segments.every(segment => {
      const url = resolveDashSegmentUrl(playlist, track, segment)
      return isVimeoMediaCdnUrl(url) && !isTsSegmentUrl(url)
    })
  } catch (_error) {
    return false
  }
}

/** 构造 progressive 选项。 */
function buildProgressiveOptions(config: VimeoParsedConfig): VimeoDownloadOption[] {
  return config.progressive.map(file => {
    const height = file.height ?? parseQualityHeight(file.quality)
    const fps = file.fps ? Math.round(file.fps) : undefined
    const quality = height ? `${height}p` : (file.quality ?? 'MP4')
    const optionId = `progressive:${quality}:${fps ?? 0}`
    return createOption(config, {
      optionId,
      sourceId: `vimeo:${config.videoId}:video:${optionId}`,
      kind: 'video',
      delivery: 'progressive',
      label: `${quality} MP4`,
      filename: formatVimeoFilename(config.title, `${quality}-mp4`, 'mp4'),
      url: file.url,
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
      width: file.width,
      height,
      fps: file.fps,
      bitrate: file.bitrate,
      size: file.size,
      mimeType: file.mime ?? 'video/mp4'
    })
  })
}

/**
 * 构造一条 DASH video track 的全部选项：带音轨与不带音轨各一条。
 *
 * 音轨不再强制绑定：没有可用音轨时同样给出纯视频选项，用户也可以主动选择无音轨交付以
 * 跳过音频下载。有音轨的选项排在前面，保证同画质下 `Best` 仍优先选择带音轨版本。
 */
function createDashVideoOptions(
  config: VimeoParsedConfig,
  dashPlaylistUrl: string,
  videoTrack: VimeoDashTrack,
  audioTrack: VimeoDashTrack | undefined
): VimeoDownloadOption[] {
  const withAudio = audioTrack
    ? [createDashVideoOption(config, dashPlaylistUrl, videoTrack, audioTrack)]
    : []
  return [...withAudio, createDashVideoOption(config, dashPlaylistUrl, videoTrack, undefined)]
}

/** 构造 DASH video 选项；`audioTrack` 为空时产出纯视频文件。 */
function createDashVideoOption(
  config: VimeoParsedConfig,
  dashPlaylistUrl: string,
  videoTrack: VimeoDashTrack,
  audioTrack: VimeoDashTrack | undefined
): VimeoDownloadOption {
  const quality = videoTrack.height ? `${videoTrack.height}p` : 'HD'
  const optionId = audioTrack ? `dash:${videoTrack.id}` : `dash:${videoTrack.id}:no-audio`
  const videoBytes = estimateDashTrackBytes(videoTrack)
  const size = audioTrack
    ? sumKnownSizes(videoBytes, estimateDashTrackBytes(audioTrack))
    : videoBytes
  return createOption(config, {
    optionId,
    sourceId: `vimeo:${config.videoId}:video:${optionId}`,
    kind: 'video',
    delivery: 'dash',
    label: audioTrack ? `${quality} HD` : `${quality} HD (no audio)`,
    ...(audioTrack
      ? {}
      : {
          labelKey: I18N_KEYS.RESOURCE_ITEM.LABEL_VIDEO_NO_AUDIO,
          labelParams: { quality }
        }),
    filename: formatVimeoFilename(
      config.title,
      audioTrack ? `${quality}-hd` : `${quality}-hd-no-audio`,
      'mp4'
    ),
    url: dashPlaylistUrl,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    width: videoTrack.width,
    height: videoTrack.height,
    fps: videoTrack.fps,
    bitrate: videoTrack.bitrate,
    size,
    mimeType: 'video/mp4',
    dashPlaylistUrl,
    videoTrackId: videoTrack.id,
    ...(audioTrack ? { audioTrackId: audioTrack.id } : {})
  })
}

/** 构造字幕选项；每个语言一条，直接交给 Chrome 下载管理器。 */
function buildSubtitleOptions(config: VimeoParsedConfig): VimeoDownloadOption[] {
  return config.textTracks.map(track => {
    const format = resolveVimeoSubtitleFormat(track.url)
    return createOption(config, {
      optionId: `subtitle:${track.lang}`,
      sourceId: `vimeo:${config.videoId}:subtitle:${track.lang}`,
      kind: 'subtitle',
      delivery: 'subtitle',
      label: track.label,
      filename: formatVimeoFilename(config.title, track.label, format.extension),
      url: track.url,
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL,
      mimeType: format.mimeType
    })
  })
}

/** 构造 DASH audio 选项。 */
function createDashAudioOption(
  config: VimeoParsedConfig,
  dashPlaylistUrl: string,
  audioTrack: VimeoDashTrack
): VimeoDownloadOption {
  const bitrateKbps = audioTrack.bitrate ? Math.round(audioTrack.bitrate / 1000) : 0
  const label = bitrateKbps > 0 ? `${bitrateKbps} kbps` : 'Audio'
  const optionId = `dash:${audioTrack.id}`
  return createOption(config, {
    optionId,
    sourceId: `vimeo:${config.videoId}:audio:${optionId}`,
    kind: 'audio',
    delivery: 'dash',
    label,
    // 无码率的音轨只能用类型名当标签，复用类型词条避免再引入一个同义词条。
    ...(bitrateKbps > 0 ? {} : { labelKey: I18N_KEYS.RESOURCE_ITEM.TYPE_AUDIO }),
    filename: formatVimeoFilename(
      config.title,
      bitrateKbps > 0 ? `${bitrateKbps}kbps` : 'audio',
      'm4a'
    ),
    url: dashPlaylistUrl,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO,
    bitrate: audioTrack.bitrate,
    size: estimateDashTrackBytes(audioTrack),
    mimeType: 'audio/mp4',
    dashPlaylistUrl,
    audioTrackId: audioTrack.id
  })
}

/** 构造 HLS fMP4 video fallback 选项。 */
function createHlsVideoOption(
  config: VimeoParsedConfig,
  playlist: VimeoHlsMediaPlaylist
): VimeoDownloadOption {
  const quality = playlist.height ? `${playlist.height}p` : 'HLS'
  const bandwidthKbps = playlist.bandwidth ? Math.round(playlist.bandwidth / 1000) : 0
  const optionId = `hls:${quality}:${bandwidthKbps}`
  return createOption(config, {
    optionId,
    sourceId: `vimeo:${config.videoId}:video:${optionId}`,
    kind: 'video',
    delivery: 'hls',
    label: `${quality} HLS`,
    filename: formatVimeoFilename(config.title, `${quality}-hls`, 'mp4'),
    url: playlist.playlistUrl,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO,
    width: playlist.width,
    height: playlist.height,
    fps: playlist.fps,
    bitrate: playlist.bandwidth,
    mimeType: 'video/mp4',
    hlsPlaylistUrl: playlist.playlistUrl
  })
}

/** 构造 thumbnail 选项。 */
function buildThumbnailOption(config: VimeoParsedConfig): VimeoDownloadOption | null {
  const thumbnail = config.thumbnails[0]
  if (!thumbnail) {
    return null
  }

  return createOption(config, {
    optionId: 'best-thumbnail',
    sourceId: `vimeo:${config.videoId}:image:thumbnail`,
    kind: 'image',
    delivery: 'thumbnail',
    label: 'Thumbnail',
    labelKey: I18N_KEYS.RESOURCE_ITEM.LABEL_THUMBNAIL,
    filename: formatVimeoFilename(config.title, 'thumbnail', 'jpg'),
    url: thumbnail.url,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL,
    width: thumbnail.width,
    mimeType: 'image/jpeg'
  })
}

/** 构造 Best video 选项。 */
function createBestVideoOption(
  selected: VimeoDownloadOption,
  config: VimeoParsedConfig
): VimeoDownloadOption {
  return createOption(config, {
    ...selected,
    optionId: 'best',
    sourceId: `vimeo:${config.videoId}:video:best`,
    label: 'Best',
    labelKey: I18N_KEYS.RESOURCE_ITEM.LABEL_BEST,
    filename: formatVimeoFilename(config.title, 'best', 'mp4')
  })
}

/** 构造 Best Audio 选项。 */
function createBestAudioOption(
  selected: VimeoDownloadOption,
  config: VimeoParsedConfig
): VimeoDownloadOption {
  const bitrate = selected.bitrate ? `${Math.round(selected.bitrate / 1000)}kbps` : 'best-audio'
  return createOption(config, {
    ...selected,
    optionId: 'best-audio',
    sourceId: `vimeo:${config.videoId}:audio:best`,
    label: 'Best Audio',
    labelKey: I18N_KEYS.RESOURCE_ITEM.LABEL_BEST_AUDIO,
    filename: formatVimeoFilename(config.title, bitrate, 'm4a')
  })
}

/**
 * 创建统一 option 并同步 descriptor。
 *
 * 标题、作者、时长与组元数据统一取自 config，保证同一视频的所有档位展示同一份元数据；
 * 放在展开之后覆写，档位构造处不需要（也无法）各自设置。
 */
function createOption(
  config: VimeoParsedConfig,
  input: Omit<VimeoDownloadOption, 'descriptor' | 'title' | 'author' | 'duration' | 'groupMetadata'>
): VimeoDownloadOption {
  return {
    ...input,
    title: config.title,
    author: config.author,
    duration: config.duration,
    groupMetadata: config.groupMetadata,
    descriptor: {
      version: 2,
      videoId: config.videoId,
      sourceId: input.sourceId,
      optionId: input.optionId,
      kind: input.kind,
      delivery: input.delivery,
      label: input.label,
      ...(input.labelKey ? { labelKey: input.labelKey } : {}),
      ...(input.labelParams ? { labelParams: input.labelParams } : {}),
      configUrl: config.configUrl,
      refreshConfigUrl: config.refreshConfigUrl,
      dashPlaylistUrl: input.dashPlaylistUrl,
      videoTrackId: input.videoTrackId,
      audioTrackId: input.audioTrackId,
      hlsPlaylistUrl: input.hlsPlaylistUrl
    }
  }
}

/** 选择最高画质 video 选项。 */
function selectBestVideoOption(options: VimeoDownloadOption[]): VimeoDownloadOption | null {
  if (options.length === 0) {
    return null
  }

  return sortVideoOptions(options)[0]
}

/** video 选项排序。 */
function sortVideoOptions(options: VimeoDownloadOption[]): VimeoDownloadOption[] {
  return [...options].sort(compareVideoOptionDesc)
}

/** progressive 文件排序。 */
function compareProgressiveDesc(left: VimeoProgressiveFile, right: VimeoProgressiveFile): number {
  return (
    (right.height ?? 0) - (left.height ?? 0) ||
    (right.width ?? 0) - (left.width ?? 0) ||
    (right.fps ?? 0) - (left.fps ?? 0) ||
    (right.bitrate ?? 0) - (left.bitrate ?? 0)
  )
}

/** video track 排序。 */
function sortVideoTracks(tracks: VimeoDashTrack[]): VimeoDashTrack[] {
  return [...tracks].sort(
    (left, right) =>
      (right.height ?? 0) - (left.height ?? 0) ||
      (right.width ?? 0) - (left.width ?? 0) ||
      (right.bitrate ?? 0) - (left.bitrate ?? 0) ||
      (right.fps ?? 0) - (left.fps ?? 0)
  )
}

/** audio track 排序。 */
function sortAudioTracks(tracks: VimeoDashTrack[]): VimeoDashTrack[] {
  return [...tracks].sort(
    (left, right) =>
      (right.bitrate ?? 0) - (left.bitrate ?? 0) ||
      (right.sampleRate ?? 0) - (left.sampleRate ?? 0) ||
      (right.channels ?? 0) - (left.channels ?? 0)
  )
}

/** HLS media playlist 排序。 */
function sortHlsMediaPlaylists(playlists: VimeoHlsMediaPlaylist[]): VimeoHlsMediaPlaylist[] {
  return [...playlists].sort(compareHlsMediaPlaylistDesc)
}

/**
 * Video option 比较：分辨率 -> fps -> bitrate -> progressive tie-breaker。
 *
 * 比较结果决定候选顺序（`buildVimeoDownloadOptions` 里 `Best` 之后依次 push），并沿
 * 「content 扫描 → `ResourceBuffer` 插入序 → popup 不重排」一路传到 Popup 的 Video 行。Popup
 * 依赖这条顺序即画质降序来取 `Best` 的无音轨交付（`popup/utils/videoPanel.ts` 的
 * `buildVideoOptions` 取第一条带纯视频变体的档位），改这里的排序规则会连带改那个选择。
 */
function compareVideoOptionDesc(left: VimeoDownloadOption, right: VimeoDownloadOption): number {
  return (
    getArea(right) - getArea(left) ||
    (right.fps ?? 0) - (left.fps ?? 0) ||
    (right.bitrate ?? 0) - (left.bitrate ?? 0) ||
    getDeliveryRank(right.delivery) - getDeliveryRank(left.delivery)
  )
}

/** HLS variant 排序。 */
function compareHlsVariantDesc(left: VimeoHlsVariant, right: VimeoHlsVariant): number {
  return (
    (right.height ?? 0) - (left.height ?? 0) ||
    (right.width ?? 0) - (left.width ?? 0) ||
    (right.fps ?? 0) - (left.fps ?? 0) ||
    (right.bandwidth ?? 0) - (left.bandwidth ?? 0)
  )
}

/** HLS media playlist 排序。 */
function compareHlsMediaPlaylistDesc(
  left: VimeoHlsMediaPlaylist,
  right: VimeoHlsMediaPlaylist
): number {
  return (
    (right.height ?? 0) - (left.height ?? 0) ||
    (right.width ?? 0) - (left.width ?? 0) ||
    (right.fps ?? 0) - (left.fps ?? 0) ||
    (right.bandwidth ?? 0) - (left.bandwidth ?? 0)
  )
}

/** 面积分。 */
function getArea(option: VimeoDownloadOption): number {
  return (option.width ?? 0) * (option.height ?? 0)
}

/** delivery 同画质排序。 */
function getDeliveryRank(delivery: VimeoDelivery): number {
  return delivery === 'progressive' ? 2 : 1
}

/** 已知 size 超过当前 mux 上限则不展示。 */
function isKnownOversized(size: number | undefined): boolean {
  return size !== undefined && size > vimeoConfig.muxMaxBytes
}

/** 估算 DASH track 总字节；segment size 不完整时返回 undefined。 */
export function estimateDashTrackBytes(track: VimeoDashTrack): number | undefined {
  let total = getBase64DecodedByteLength(track.initSegment)
  for (const segment of track.segments) {
    if (segment.size === undefined) {
      return undefined
    }
    total += segment.size
  }

  return total
}

/** 两个可选 size 都已知时返回总 size，否则保持未知。 */
function sumKnownSizes(left: number | undefined, right: number | undefined): number | undefined {
  return left !== undefined && right !== undefined ? left + right : undefined
}

/** base64 字符串解码后的字节数。 */
function getBase64DecodedByteLength(value: string): number {
  const normalized = value.replace(/\s+/g, '')
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

/** 标准化 MIME。 */
function normalizeMimeType(value: string | undefined): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? ''
}

/** DASH/HLS audio codec 白名单。 */
function hasSupportedDashAudioCodec(codecs: string | undefined): boolean {
  return splitCodecs(codecs).some(codec => codec.startsWith('mp4a'))
}

/** DASH/HLS video codec 白名单；仅承诺 AVC，避免 HEVC/VP9/WebM 在 MP4 remux 时炸。 */
function hasSupportedDashVideoCodec(codecs: string | undefined): boolean {
  return splitCodecs(codecs).some(codec => codec.startsWith('avc1') || codec.startsWith('avc3'))
}

/** HLS fallback 只展示 muxed fMP4：master CODECS 必须同时声明 AVC + AAC。 */
function isSupportedHlsVariant(variant: VimeoHlsVariant): boolean {
  return (
    isVimeoMediaCdnUrl(variant.url) &&
    hasSupportedDashVideoCodec(variant.codecs) &&
    hasSupportedDashAudioCodec(variant.codecs)
  )
}

/** 拆分 codec 列表。 */
function splitCodecs(codecs: string | undefined): string[] {
  return (codecs ?? '')
    .split(',')
    .map(codec => codec.trim().toLowerCase())
    .filter(codec => codec.length > 0)
}

/** HLS fMP4 segment URL 检查。 */
function isSafeHlsSegmentUrl(url: string): boolean {
  return isVimeoMediaCdnUrl(url) && !isTsSegmentUrl(url)
}

/** MPEG-TS HLS 不进入前端 remux fallback。 */
function isTsSegmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.pathname.toLowerCase().endsWith('.ts')
  } catch (_error) {
    return true
  }
}

/** HLS tag 大小写无关检查。 */
function hasHlsTag(text: string, tag: string): boolean {
  return text.toUpperCase().includes(tag.toUpperCase())
}

/** 读取 HLS 数字 attribute。 */
function readHlsNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/** 从 quality 文本取高度。 */
function parseQualityHeight(quality: string | undefined): number | undefined {
  const match = quality?.match(/^(\d+)p$/)
  return match ? Number.parseInt(match[1], 10) : undefined
}

/** 逐段解析相对 URL。 */
function resolveRelativeUrl(baseUrl: string, value: string): string {
  if (!value) {
    return baseUrl
  }

  return new URL(value, baseUrl).href
}

/** URL 解析失败时返回 null。 */
function resolveUrlOrNull(value: string, baseUrl: string): string | null {
  try {
    return new URL(value, baseUrl).href
  } catch (_error) {
    return null
  }
}

/** 只保留日志定位需要的 host，不输出 signed path/query。 */
function urlHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch (_error) {
    return 'invalid'
  }
}

/** 解析 HLS attribute。 */
function parseHlsAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const part of splitHlsAttributeParts(text)) {
    const [key, ...rest] = part.split('=')
    if (!key || rest.length === 0) {
      continue
    }
    attrs[key.trim()] = rest.join('=').replace(/^"|"$/g, '').trim()
  }
  return attrs
}

/** 按 HLS attribute 语法拆分，避免 CODECS="avc1,mp4a" 被逗号切坏。 */
function splitHlsAttributeParts(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuote = false

  for (const char of text) {
    if (char === '"') {
      inQuote = !inQuote
      current += char
      continue
    }

    if (char === ',' && !inQuote) {
      if (current.trim()) {
        parts.push(current.trim())
      }
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}
