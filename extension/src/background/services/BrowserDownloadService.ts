/**
 * Chrome 下载管理器直连服务。
 *
 * Vimeo 页面只负责提供已捕获的 signed 来源；background 校验来源后创建原生下载，
 * 让文件传输脱离页面和 MV3 Service Worker 的执行生命周期。
 */

import type {
  BackgroundBrowserDownloadSource,
  BackgroundGetBrowserDownloadStatusRequest,
  BackgroundGetBrowserDownloadStatusResponse,
  BackgroundStartBrowserDownloadRequest,
  BackgroundStartBrowserDownloadResponse
} from '@/background/types'
import {
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  isBrowserManagedSourceKind,
  type BrowserManagedSourceKind
} from '@/core/constants/resource'
import type { RpcContext } from '@/core/rpc/types'
import { DEFAULT_DOWNLOAD_PATH, SettingsManager } from '@/core/storage/settings'
import { logger } from '@/core/utils/logger'
import { refreshVimeoDirectResourcesFromConfigUrl } from '@/sites/vimeo/config'
import {
  decodeVimeoSourceDescriptor,
  isVimeoHostname,
  isVimeoMediaCdnUrl,
  isVimeoSubtitleUrl
} from '@/sites/vimeo/shared'

/** Chrome 下载目录文件名保守长度上限。 */
const MAX_FILENAME_LENGTH = 180

/** 保存子目录保守长度上限；超出的目录段直接丢弃，保证路径长度可控。 */
const MAX_DIRECTORY_LENGTH = 120

/** Chrome 下载管理器直连服务。 */
export class BrowserDownloadService {
  /** 校验并创建一个 Vimeo 原生下载任务。 */
  async start(
    request: BackgroundStartBrowserDownloadRequest,
    context: RpcContext
  ): Promise<BackgroundStartBrowserDownloadResponse> {
    assertVimeoCaller(context)
    const source = request.refresh_source
      ? await refreshVimeoDirectSource(request.source)
      : request.source
    assertVimeoDirectSource(source)

    const settings = await SettingsManager.getSettings()
    const downloadId = await chrome.downloads.download({
      url: source.url,
      filename: buildDownloadFilename(settings.downloadPath, source.filename),
      conflictAction: 'uniquify',
      saveAs: false
    })

    logger.info(
      `[BrowserDownloadService] 已创建 Vimeo 原生下载: sourceId=${source.source_id}, downloadId=${downloadId}, refreshed=${request.refresh_source}`
    )
    return { download_id: downloadId }
  }

  /** 查询原生下载状态，并阻断不符合 Vimeo 来源合同的最终响应。 */
  async getStatus(
    request: BackgroundGetBrowserDownloadStatusRequest,
    context: RpcContext
  ): Promise<BackgroundGetBrowserDownloadStatusResponse> {
    assertVimeoCaller(context)
    if (!isBrowserManagedSourceKind(request.source_kind)) {
      throw new Error(
        `[BrowserDownloadService] 查询来源不支持原生下载: downloadId=${request.download_id}, sourceKind=${request.source_kind}`
      )
    }

    const items = await chrome.downloads.search({ id: request.download_id })
    const item = items[0]
    if (!item || item.byExtensionId !== chrome.runtime.id) {
      throw new Error(
        `[BrowserDownloadService] 找不到当前扩展创建的下载: downloadId=${request.download_id}`
      )
    }

    await assertDownloadItemBoundary(item, request.source_kind)
    return {
      state: item.state,
      bytes_received: item.bytesReceived,
      total_bytes: item.totalBytes >= 0 ? item.totalBytes : null,
      ...(item.error ? { error: item.error } : {})
    }
  }
}

/** 只刷新 Vimeo 完整文件列表，并恢复同一按钮对应的新直连 URL。 */
async function refreshVimeoDirectSource(
  source: BackgroundBrowserDownloadSource
): Promise<BackgroundBrowserDownloadSource> {
  const descriptor = requireMatchingDescriptor(source)
  const configUrl = descriptor.refreshConfigUrl ?? descriptor.configUrl
  const resources = await refreshVimeoDirectResourcesFromConfigUrl(configUrl)
  const fresh = resources.find(
    resource => resource.id === source.source_id && isBrowserManagedSourceKind(resource.sourceKind)
  )
  if (!fresh) {
    throw new Error(
      `[BrowserDownloadService] 刷新 Vimeo config 后找不到直连资源: sourceId=${source.source_id}, videoId=${descriptor.videoId}, delivery=${descriptor.delivery}`
    )
  }

  return {
    ...source,
    url: fresh.url,
    mime_type: fresh.mimeType ?? source.mime_type
  }
}

/** 校验请求来自 Vimeo content script。 */
function assertVimeoCaller(context: RpcContext): void {
  let origin: URL
  try {
    origin = new URL(context.origin ?? '')
  } catch (_error) {
    throw new Error('[BrowserDownloadService] 原生下载调用缺少合法 Vimeo origin')
  }

  if (origin.protocol !== 'https:' || !isVimeoHostname(origin.hostname)) {
    throw new Error(
      `[BrowserDownloadService] 拒绝非 Vimeo 页面调用原生下载: origin=${origin.origin}`
    )
  }
}

/** 校验直连 URL、媒体类型和 Vimeo 描述符属于同一个资源。 */
function assertVimeoDirectSource(source: BackgroundBrowserDownloadSource): void {
  const descriptor = requireMatchingDescriptor(source)
  if (!isAllowedDirectUrl(source)) {
    throw new Error(
      `[BrowserDownloadService] Vimeo 直连 URL 不在允许的白名单: sourceId=${source.source_id}, sourceKind=${source.source_kind}, host=${urlHostname(source.url)}`
    )
  }

  const normalizedMimeType = normalizeMimeType(source.mime_type)
  const matchesProgressive =
    source.source_kind === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4 &&
    source.type === RESOURCE_TYPES.VIDEO &&
    descriptor.delivery === 'progressive' &&
    descriptor.kind === 'video' &&
    normalizedMimeType === 'video/mp4'
  const matchesThumbnail =
    source.source_kind === RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL &&
    source.type === RESOURCE_TYPES.IMAGE &&
    descriptor.delivery === 'thumbnail' &&
    descriptor.kind === 'image' &&
    normalizedMimeType.startsWith('image/')
  const matchesSubtitle =
    source.source_kind === RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL &&
    source.type === RESOURCE_TYPES.SUBTITLE &&
    descriptor.delivery === 'subtitle' &&
    descriptor.kind === 'subtitle' &&
    isSubtitleMimeType(normalizedMimeType)

  if (!matchesProgressive && !matchesThumbnail && !matchesSubtitle) {
    throw new Error(
      `[BrowserDownloadService] Vimeo 直连来源合同不匹配: sourceId=${source.source_id}, sourceKind=${source.source_kind}, type=${source.type}, delivery=${descriptor.delivery}, kind=${descriptor.kind}, mimeType=${normalizedMimeType || 'missing'}`
    )
  }
}

/** 直连 URL 白名单按来源区分：字幕可以落在 player.vimeo.com 的 text track 端点。 */
function isAllowedDirectUrl(source: {
  source_kind: BrowserManagedSourceKind
  url: string
}): boolean {
  return source.source_kind === RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL
    ? isVimeoSubtitleUrl(source.url)
    : isVimeoMediaCdnUrl(source.url)
}

/** Chrome 报告的原生下载响应 MIME 必须与来源语义一致；空 MIME 交给 Chrome 自己的判定。 */
function isExpectedResponseMime(mimeType: string, sourceKind: BrowserManagedSourceKind): boolean {
  if (sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4) {
    return normalizeMimeType(mimeType).startsWith('video/')
  }
  if (sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL) {
    return normalizeMimeType(mimeType).startsWith('image/')
  }
  return isSubtitleMimeType(normalizeMimeType(mimeType))
}

/**
 * 字幕响应 MIME；`text/*` 覆盖 WebVTT 与 CDN 的 text/plain 交付。
 *
 * 同时接受 `application/octet-stream` 与 `binary/octet-stream`：同一套 Vimeo CDN 对 DASH
 * media segment 就会这样返回（见 `core/injected/downloadValidation.ts`），字幕纯文本文件
 * 被误判成二进制同样只是 CDN 的默认类型，而 MIME 拒绝对纯文本不增加安全价值——真正的边界是
 * `isVimeoSubtitleUrl` 的 URL 白名单。这里拒绝会得到一条 `chrome.downloads.cancel` 后不可
 * 重试的失败路径，代价远大于收益。
 */
function isSubtitleMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/ttml+xml' ||
    mimeType === 'application/x-subrip' ||
    mimeType === 'application/octet-stream' ||
    mimeType === 'binary/octet-stream'
  )
}

/** 解码并校验 descriptor 绑定当前 source ID。 */
function requireMatchingDescriptor(source: BackgroundBrowserDownloadSource) {
  const descriptor = decodeVimeoSourceDescriptor(source.document_id)
  if (!descriptor || descriptor.sourceId !== source.source_id) {
    throw new Error(
      `[BrowserDownloadService] Vimeo descriptor 与来源不匹配: sourceId=${source.source_id}`
    )
  }
  return descriptor
}

/** 校验 Chrome 最终下载 URL 与响应 MIME；违规任务在仍进行时立即取消。 */
async function assertDownloadItemBoundary(
  item: chrome.downloads.DownloadItem,
  sourceKind: BackgroundBrowserDownloadSource['source_kind']
): Promise<void> {
  const finalUrl = item.finalUrl || item.url
  const validUrl = isAllowedDirectUrl({ source_kind: sourceKind, url: finalUrl })
  const validMime = item.mime.length === 0 || isExpectedResponseMime(item.mime, sourceKind)
  if (validUrl && validMime) {
    return
  }

  if (item.state === 'in_progress') {
    await chrome.downloads.cancel(item.id)
  }
  throw new Error(
    `[BrowserDownloadService] Vimeo 原生下载响应越界: downloadId=${item.id}, host=${urlHostname(finalUrl)}, mimeType=${normalizeMimeType(item.mime) || 'missing'}`
  )
}

/**
 * 生成 `chrome.downloads.download` 接受的相对下载路径。
 *
 * Chrome 只接受下载目录下的相对路径：绝对路径、空路径和含 `..` 回退段的路径都会让整个下载
 * 失败（`@types/chrome` 的 `DownloadOptions.filename`）。保存位置是用户可控输入，所以目录
 * 逐段丢弃非法段，而不是像文件名那样把非法字符替换成空格——替换会把 `../x` 变成 `.. x`
 * 这种看起来合法、语义却变了的目录名，等于放过了回退意图。
 */
function buildDownloadFilename(directory: string | undefined, filename: string): string {
  return [...normalizeDownloadDirectory(directory), normalizeFilename(filename)].join('/')
}

/**
 * 把保存位置归一化成安全的相对目录段。
 *
 * 反斜杠先按分隔符处理（`..\x` 不能绕过回退段判定），然后逐段判定：绝对路径的开头 `/` 与
 * 连续 `/` 产生的空段、`.` 与 `..` 回退段、以 `~` 开头的段、含 `:`（Windows 盘符）或
 * `<>"|?*` 与控制字符的段全部丢弃，剩下的段按原顺序拼回相对路径；全部丢弃时回退默认子目录，
 * 保证交给 Chrome 的永远是非空相对路径。
 */
function normalizeDownloadDirectory(directory: string | undefined): string[] {
  const segments = (directory ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map(segment => segment.trim())
    .filter(isSafeDirectorySegment)

  const kept: string[] = []
  let length = 0
  for (const segment of segments) {
    if (length + segment.length + 1 > MAX_DIRECTORY_LENGTH) {
      break
    }
    kept.push(segment)
    length += segment.length + 1
  }

  return kept.length > 0 ? kept : [DEFAULT_DOWNLOAD_PATH]
}

/** 目录段里不允许出现的路径保留字符；`:` 同时挡掉 Windows 盘符。 */
const RESERVED_SEGMENT_CHARACTERS = '<>:"|?*'

/** 目录段合法性：非空、不是 `.` / `..` 回退段、不以 `~` 开头、不含保留字符与控制字符。 */
function isSafeDirectorySegment(segment: string): boolean {
  if (segment.length === 0 || segment === '.' || segment === '..' || segment.startsWith('~')) {
    return false
  }

  // 控制字符按码点判定：与 `normalizeFilename` 同一口径，正则里的控制字符转义会被 lint 拦下。
  return Array.from(segment).every(
    character => character.charCodeAt(0) >= 32 && !RESERVED_SEGMENT_CHARACTERS.includes(character)
  )
}

/** 生成 Chrome 接受的相对下载文件名：单段名字，不含目录分隔符与控制字符。 */
function normalizeFilename(value: string): string {
  const normalized = Array.from(value.trim(), character =>
    character.charCodeAt(0) < 32 ? ' ' : character
  )
    .join('')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_FILENAME_LENGTH)
  // 清洗后正好是 `.` / `..` 的名字仍带路径语义（Chrome 会直接报错），换兜底名。
  if (normalized.length === 0 || normalized === '.' || normalized === '..') {
    return 'vimeo-download'
  }
  return normalized
}

/** 规范化 MIME，忽略参数。 */
function normalizeMimeType(value: string): string {
  return value.split(';')[0].trim().toLowerCase()
}

/** 只提取安全 host，禁止把 signed path/query 写入错误。 */
function urlHostname(value: string): string {
  try {
    return new URL(value).hostname || 'missing'
  } catch (_error) {
    return 'invalid'
  }
}

/** Background 共享的浏览器原生下载服务单例。 */
export const browserDownloadService = new BrowserDownloadService()
