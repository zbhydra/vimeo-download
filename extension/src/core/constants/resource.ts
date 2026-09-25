/**
 * 统一的资源类型常量
 *
 * 设计原则：
 * - ResourceType 表达媒体语义，不表达 URL 获取方式
 * - ResourceSourceKind 表达资源来源，供缓存与下载链路保留来源差异
 * - 默认 MIME / 扩展名只作为最后兜底，优先使用站点解析出的元数据
 */

/**
 * 资源类型常量
 */
export const RESOURCE_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  SUBTITLE: 'subtitle'
} as const

/**
 * 资源类型
 */
export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES]

/**
 * 资源来源常量
 */
export const RESOURCE_SOURCE_KINDS = {
  VIMEO_PROGRESSIVE_MP4: 'vimeo-progressive-mp4',
  VIMEO_DASH_VIDEO: 'vimeo-dash-video',
  VIMEO_HLS_VIDEO: 'vimeo-hls-video',
  VIMEO_DASH_AUDIO: 'vimeo-dash-audio',
  VIMEO_THUMBNAIL_URL: 'vimeo-thumbnail-url',
  VIMEO_SUBTITLE_URL: 'vimeo-subtitle-url'
} as const

/**
 * 资源来源类型
 */
export type ResourceSourceKind = (typeof RESOURCE_SOURCE_KINDS)[keyof typeof RESOURCE_SOURCE_KINDS]

/** Chrome 下载管理器可以直接保存的完整文件来源。 */
export type BrowserManagedSourceKind =
  | typeof RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
  | typeof RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL
  | typeof RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL

/**
 * 判断资源是否可直接交给 Chrome 下载管理器。
 *
 * 这里只包含无需页面内媒体处理的完整文件 URL；DASH/HLS 等需要合并的来源继续由
 * injected 下载器处理。字幕是单个文本文件，与 progressive/thumbnail 同路径。
 */
export function isBrowserManagedSourceKind(
  sourceKind: ResourceSourceKind
): sourceKind is BrowserManagedSourceKind {
  return (
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4 ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL
  )
}

/**
 * MIME 类型映射（与资源类型强相关）
 */
export const MIME_TYPE_MAP = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/mpeg',
  subtitle: 'text/vtt'
} as const satisfies Record<ResourceType, string>

/**
 * 默认扩展名映射（与资源类型强相关）
 */
export const RESOURCE_EXTENSION_MAP = {
  image: '.jpg',
  video: '.mp4',
  audio: '.mp3',
  subtitle: '.vtt'
} as const satisfies Record<ResourceType, string>

/** 常见 MIME 到文件扩展名的最后兜底映射。 */
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/matroska': '.mkv',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'text/vtt': '.vtt',
  'application/ttml+xml': '.ttml',
  'application/x-subrip': '.srt',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/wav': '.wav',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/x-matroska': '.mka'
}

/**
 * 从 MIME 类型推断文件扩展名。
 */
export function getExtensionFromMimeType(mimeType: string | undefined): string | undefined {
  if (!mimeType) {
    return undefined
  }

  const normalized = mimeType.split(';')[0].trim().toLowerCase()
  const mapped = MIME_EXTENSION_MAP[normalized]
  if (mapped) {
    return mapped
  }

  return undefined
}

/**
 * 获取资源默认扩展名，优先使用 MIME 类型。
 */
export function getDefaultResourceExtension(type: ResourceType, mimeType?: string): string {
  return getExtensionFromMimeType(mimeType) ?? RESOURCE_EXTENSION_MAP[type]
}
