/**
 * Vimeo 直连下载来源校验与刷新。
 *
 * DownloadOrchestrator 的 direct 路径在把 URL 交给 chrome.downloads 前调用：校验来源合同，
 * 并在 signed URL 过期时从原生 refresh config 恢复新 URL。
 */

import type { BackgroundBrowserDownloadSource } from '@/background/types'
import {
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  isBrowserManagedSourceKind,
  type BrowserManagedSourceKind
} from '@/core/constants/resource'
import { refreshVimeoDirectResourcesFromConfigUrl } from '@/sites/vimeo/config'
import {
  decodeVimeoSourceDescriptor,
  isVimeoMediaCdnUrl,
  isVimeoSubtitleUrl
} from '@/sites/vimeo/shared'

/**
 * 校验并刷新 Vimeo 直连来源；由 DownloadOrchestrator 的 direct 下载路径使用。
 *
 * 校验拒绝来源合同不匹配的直连 URL；刷新在 signed URL 过期时从原生 refresh config 恢复新 URL。
 */
export async function resolveVerifiedDirectSource(
  source: BackgroundBrowserDownloadSource,
  refreshSource: boolean
): Promise<BackgroundBrowserDownloadSource> {
  const verified = refreshSource ? await refreshVimeoDirectSource(source) : source
  assertVimeoDirectSource(verified)
  return verified
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
      `[DirectSource] 刷新 Vimeo config 后找不到直连资源: sourceId=${source.source_id}, videoId=${descriptor.videoId}, delivery=${descriptor.delivery}`
    )
  }

  return {
    ...source,
    url: fresh.url,
    mime_type: fresh.mimeType ?? source.mime_type
  }
}

/** 校验直连 URL、媒体类型和 Vimeo 描述符属于同一个资源。 */
function assertVimeoDirectSource(source: BackgroundBrowserDownloadSource): void {
  const descriptor = requireMatchingDescriptor(source)
  if (!isAllowedDirectUrl(source)) {
    throw new Error(
      `[DirectSource] Vimeo 直连 URL 不在允许的白名单: sourceId=${source.source_id}, sourceKind=${source.source_kind}, host=${urlHostname(source.url)}`
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
      `[DirectSource] Vimeo 直连来源合同不匹配: sourceId=${source.source_id}, sourceKind=${source.source_kind}, type=${source.type}, delivery=${descriptor.delivery}, kind=${descriptor.kind}, mimeType=${normalizedMimeType || 'missing'}`
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

/**
 * 字幕响应 MIME；`text/*` 覆盖 WebVTT 与 CDN 的 text/plain 交付。
 *
 * 同时接受 `application/octet-stream` 与 `binary/octet-stream`：同一套 Vimeo CDN 对 DASH
 * media segment 就会这样返回（见 `core/injected/downloadValidation.ts`），字幕纯文本文件
 * 被误判成二进制同样只是 CDN 的默认类型，而 MIME 拒绝对纯文本不增加安全价值——真正的边界是
 * `isVimeoSubtitleUrl` 的 URL 白名单。
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
    throw new Error(`[DirectSource] Vimeo descriptor 与来源不匹配: sourceId=${source.source_id}`)
  }
  return descriptor
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
