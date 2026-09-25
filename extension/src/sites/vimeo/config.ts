/**
 * Vimeo config/playlist 加载器。
 *
 * 所有请求只发往 player.vimeo.com 或 Vimeo CDN/Akamai 白名单，响应进入资源缓存前
 * 由 media.ts 做结构化解析与二次 URL 过滤。
 */

import { assertDownloadContentType } from '@/core/injected/downloadValidation'
import type { JsonValue } from '@/core/rpc/types'
import type { MediaResource } from '@/core/types'
import {
  createEmbeddedVimeoConfigSnapshot,
  readEmbeddedVimeoConfigFromHtml
} from './embeddedConfig'
import {
  isAllowedVimeoFetchUrl,
  isVimeoPlayerHostname,
  parseUrl,
  parseVimeoConfigRefreshUrlVideoId,
  parseVimeoConfigUrlVideoId,
  type VimeoCapturedConfigSnapshot
} from './shared'
import {
  buildVimeoDownloadOptions,
  createVimeoResource,
  parseVimeoConfig,
  parseVimeoDashPlaylist,
  parseVimeoHlsMediaPlaylist,
  parseVimeoHlsMasterPlaylist,
  type VimeoDashPlaylist,
  type VimeoHlsMediaPlaylist,
  type VimeoHlsVariant,
  type VimeoParsedConfig
} from './media'
import { vimeoConfig } from './runtimeConfig'

const RETRYABLE_PLAYLIST_STATUS_CODES = new Set([403, 404, 410])

/** 播放页 HTML 单份上限：内嵌 config 之外还有播放器脚本，超过即判定为异常页面。 */
const MAX_PLAYER_PAGE_BYTES = 1024 * 1024

/** Vimeo 资源快照。 */
export interface VimeoResourceSnapshot {
  /** 已解析 config。 */
  config: VimeoParsedConfig
  /** 已解析 DASH playlist。 */
  dashPlaylist: VimeoDashPlaylist | null
  /** 已安全识别的非加密 HLS variants。 */
  hlsVariants: VimeoHlsVariant[]
  /** 已安全解析的 fMP4 HLS media playlists。 */
  hlsMediaPlaylists: VimeoHlsMediaPlaylist[]
  /** popup/page 共用资源列表。 */
  resources: MediaResource[]
}

/** 从 MAIN world 捕获的原生 config 加载 Vimeo 资源。 */
export async function loadVimeoResourcesFromCapturedConfig(
  snapshot: VimeoCapturedConfigSnapshot
): Promise<VimeoResourceSnapshot> {
  const urlVideoId =
    parseVimeoConfigUrlVideoId(snapshot.configUrl) ??
    parseVimeoConfigRefreshUrlVideoId(snapshot.configUrl)
  if (!urlVideoId || urlVideoId !== snapshot.videoId) {
    throw new Error(
      `[VimeoConfig] 捕获 config URL 与 videoId 不匹配: capturedVideoId=${snapshot.videoId}, urlVideoId=${urlVideoId ?? 'invalid'}, stage=capture-validate`
    )
  }

  return loadVimeoResourcesFromConfigValue(snapshot.config, snapshot.configUrl, true)
}

/** 通过 config URL 加载 Vimeo 资源。 */
export async function loadVimeoResourcesFromConfigUrl(
  configUrl: string
): Promise<VimeoResourceSnapshot> {
  return loadVimeoResourcesFromConfigUrlOnce(configUrl, true)
}

/** 下载 URL 过期后刷新一次资源，不允许刷新过程再次递归请求 config。 */
export async function refreshVimeoResourcesFromConfigUrl(
  configUrl: string
): Promise<VimeoResourceSnapshot> {
  return loadVimeoResourcesFromConfigUrlOnce(configUrl, false)
}

/**
 * 下载中断后只刷新 Vimeo 完整文件来源。
 *
 * Progressive/Thumbnail 不依赖 adaptive playlist；这里故意不加载 DASH/HLS，避免无关
 * playlist 失效阻断仍可用的直连文件重试。
 */
export async function refreshVimeoDirectResourcesFromConfigUrl(
  configUrl: string
): Promise<MediaResource[]> {
  const configJson = await fetchJson(configUrl, 'direct config', false)
  const config = parseVimeoConfig(configJson, configUrl)
  return buildVimeoDownloadOptions(config, null).map((option, index) =>
    createVimeoResource(option, index)
  )
}

/**
 * 主通道失效时由扩展身份直连 Vimeo 播放页，取回内嵌原生 config。
 *
 * `/video/{id}/config` 的签名覆盖整组查询参数，不能由 videoId 重建（见
 * `docs/feat/002.下载功能/tech-扩展端Vimeo本地下载.md` §5），因此兜底不构造 config URL，只取
 * 播放页初始 HTML 里的 `window.playerConfig`：与 MAIN world 内嵌通道同一份数据，但由
 * background 发起，不依赖页面注入是否成功。请求失败抛错，播放页给不出可用 config 时返回 null。
 */
export async function loadVimeoCapturedConfigFromPlayerPage(
  videoId: string
): Promise<VimeoCapturedConfigSnapshot | null> {
  const pageUrl = `https://player.vimeo.com/video/${videoId}`
  assertFetchUrl(pageUrl, 'player page')

  const response = await fetch(pageUrl, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  })
  const finalUrl = response.url || pageUrl
  if (!response.ok) {
    throw new Error(
      `[VimeoConfig] player page 请求失败: host=${urlHostname(finalUrl)}, stage=response, status=${response.status}`
    )
  }
  assertPlayerPageUrl(finalUrl)

  const html = await response.text()
  if (!isPlayerPageWithinLimit(html)) {
    throw new Error(
      `[VimeoConfig] player page 响应越界: host=${urlHostname(finalUrl)}, stage=read, chars=${html.length}`
    )
  }

  const config = readEmbeddedVimeoConfigFromHtml(html)
  if (!config) {
    return null
  }

  return createEmbeddedVimeoConfigSnapshot(config, finalUrl)
}

/** 兜底只接受仍落在 Vimeo 播放页的最终响应，不跟随重定向到其它页面。 */
function assertPlayerPageUrl(url: string): void {
  const hostname = parseUrl(url)?.hostname
  if (!hostname || !isVimeoPlayerHostname(hostname)) {
    throw new Error(
      `[VimeoConfig] player page 响应 URL 不是 Vimeo 播放页: host=${urlHostname(url)}, stage=validate`
    )
  }
}

/** 按 UTF-8 实际字节限制播放页 HTML，避免异常页面进入解析。 */
function isPlayerPageWithinLimit(html: string): boolean {
  return (
    html.length <= MAX_PLAYER_PAGE_BYTES &&
    new TextEncoder().encode(html).length <= MAX_PLAYER_PAGE_BYTES
  )
}

/** Vimeo playlist signed URL 可刷新错误。 */
class VimeoExpiredPlaylistError extends Error {
  /** HTTP 状态码。 */
  readonly status: number

  constructor(message: string, status: number) {
    super(`[VimeoConfig] ${message}, status=${status}`)
    this.name = 'VimeoExpiredPlaylistError'
    this.status = status
  }
}

/** 通过 config URL 加载 Vimeo 资源，每轮扫描最多刷新一次。 */
async function loadVimeoResourcesFromConfigUrlOnce(
  configUrl: string,
  canRefresh: boolean,
  fallbackConfig?: VimeoParsedConfig
): Promise<VimeoResourceSnapshot> {
  const configJson = await fetchJson(configUrl, 'config', false)
  return loadVimeoResourcesFromConfigValue(configJson, configUrl, canRefresh, fallbackConfig)
}

/** 从一份已取得的 config JSON 构建资源，每轮最多走一次刷新 URL。 */
async function loadVimeoResourcesFromConfigValue(
  configJson: JsonValue,
  configUrl: string,
  canRefresh: boolean,
  fallbackConfig?: VimeoParsedConfig
): Promise<VimeoResourceSnapshot> {
  const config = parseVimeoConfig(configJson, configUrl, fallbackConfig)

  if (canRefresh && shouldRefreshExpiredConfig(config)) {
    return loadVimeoResourcesFromConfigUrlOnce(config.refreshConfigUrl, false, config)
  }

  try {
    return await buildVimeoResourceSnapshot(config)
  } catch (error) {
    if (canRefresh && error instanceof VimeoExpiredPlaylistError && config.refreshConfigUrl) {
      console.error(error)
      return loadVimeoResourcesFromConfigUrlOnce(config.refreshConfigUrl, false, config)
    }

    throw error
  }
}

/** 从已解析 config 构建资源快照。 */
async function buildVimeoResourceSnapshot(
  config: VimeoParsedConfig
): Promise<VimeoResourceSnapshot> {
  const dashPlaylist = config.dashPlaylistUrl
    ? await loadDashPlaylist(config.dashPlaylistUrl)
    : null
  const baseOptions = buildVimeoDownloadOptions(config, dashPlaylist)
  const shouldTryHlsFallback =
    Boolean(config.hlsPlaylistUrl) && !baseOptions.some(option => option.kind === 'video')
  const hlsSnapshot =
    shouldTryHlsFallback && config.hlsPlaylistUrl
      ? await loadHlsMediaPlaylists(config.hlsPlaylistUrl)
      : { variants: [], mediaPlaylists: [] }
  const options =
    hlsSnapshot.mediaPlaylists.length > 0
      ? buildVimeoDownloadOptions(config, dashPlaylist, hlsSnapshot.mediaPlaylists)
      : baseOptions
  const resources = options.map((option, index) => createVimeoResource(option, index))

  return {
    config,
    dashPlaylist,
    hlsVariants: hlsSnapshot.variants,
    hlsMediaPlaylists: hlsSnapshot.mediaPlaylists,
    resources
  }
}

/** 即将过期的 config 先走 refresh URL，避免页面刚渲染就拿到过期 CDN URL。 */
function shouldRefreshExpiredConfig(config: VimeoParsedConfig): config is VimeoParsedConfig & {
  refreshConfigUrl: string
} {
  if (!config.expiresAt || !config.refreshConfigUrl) {
    return false
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  return config.expiresAt <= nowSeconds + vimeoConfig.configRefreshWindowSeconds
}

/** 加载 DASH playlist。 */
async function loadDashPlaylist(playlistUrl: string): Promise<VimeoDashPlaylist | null> {
  try {
    const json = await fetchJson(playlistUrl, 'dash playlist', true)
    return parseVimeoDashPlaylist(json, playlistUrl)
  } catch (error) {
    if (error instanceof VimeoExpiredPlaylistError) {
      throw error
    }
    console.error(error)
    return null
  }
}

/** HLS fallback 解析结果。 */
interface VimeoHlsLoadSnapshot {
  /** 安全 master variants。 */
  variants: VimeoHlsVariant[]
  /** 安全 fMP4 media playlists。 */
  mediaPlaylists: VimeoHlsMediaPlaylist[]
}

/** 加载并安全识别 HLS fMP4 media playlists。 */
async function loadHlsMediaPlaylists(playlistUrl: string): Promise<VimeoHlsLoadSnapshot> {
  try {
    const text = await fetchText(playlistUrl, 'hls playlist')
    const variants = parseVimeoHlsMasterPlaylist(text, playlistUrl)
    const mediaPlaylists: VimeoHlsMediaPlaylist[] = []

    for (const variant of variants) {
      try {
        const mediaText = await fetchText(variant.url, 'hls media playlist')
        const mediaPlaylist = parseVimeoHlsMediaPlaylist(mediaText, variant.url, variant)
        if (mediaPlaylist) {
          mediaPlaylists.push(mediaPlaylist)
        }
      } catch (error) {
        if (error instanceof VimeoExpiredPlaylistError) {
          throw error
        }
        console.error(error)
      }
    }

    return { variants, mediaPlaylists }
  } catch (error) {
    if (error instanceof VimeoExpiredPlaylistError) {
      throw error
    }
    console.error(error)
    return { variants: [], mediaPlaylists: [] }
  }
}

/** 拉取 JSON 并校验原始/重定向 URL。 */
async function fetchJson(
  url: string,
  label: string,
  retryExpiredSignedUrl: boolean
): Promise<JsonValue> {
  assertFetchUrl(url, label)

  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  })
  assertFetchUrl(response.url || url, `${label} response`)

  if (!response.ok) {
    if (retryExpiredSignedUrl && RETRYABLE_PLAYLIST_STATUS_CODES.has(response.status)) {
      throw new VimeoExpiredPlaylistError(
        `${label} signed URL 可能过期: host=${urlHostname(response.url || url)}, stage=response`,
        response.status
      )
    }

    throw new Error(
      `[VimeoConfig] ${label} 请求失败: host=${urlHostname(response.url || url)}, stage=response, status=${response.status}`
    )
  }

  assertDownloadContentType(response.headers.get('Content-Type'), 'json', `Vimeo ${label}`)
  return (await response.json()) as JsonValue
}

/** 拉取文本并校验原始/重定向 URL。 */
async function fetchText(url: string, label: string): Promise<string> {
  assertFetchUrl(url, label)

  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  })
  assertFetchUrl(response.url || url, `${label} response`)

  if (!response.ok) {
    if (RETRYABLE_PLAYLIST_STATUS_CODES.has(response.status)) {
      throw new VimeoExpiredPlaylistError(
        `${label} signed URL 可能过期: host=${urlHostname(response.url || url)}, stage=response`,
        response.status
      )
    }

    throw new Error(
      `[VimeoConfig] ${label} 请求失败: host=${urlHostname(response.url || url)}, stage=response, status=${response.status}`
    )
  }

  assertDownloadContentType(response.headers.get('Content-Type'), 'hls-playlist', `Vimeo ${label}`)
  return response.text()
}

/** Vimeo config/playlist URL 白名单。 */
function assertFetchUrl(url: string, label: string): void {
  if (!isAllowedVimeoFetchUrl(url)) {
    throw new Error(
      `[VimeoConfig] ${label} URL 不在 Vimeo fetch 白名单: host=${urlHostname(url)}, stage=validate`
    )
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
