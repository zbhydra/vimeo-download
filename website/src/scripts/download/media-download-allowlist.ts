/**
 * 网站下载媒体白名单。
 *
 * 前端只做体验提前拦截；后端 download-anonymous-pre-v2 仍是最终安全校验。
 */

import type { MediaPost } from './types'

/** 单条网站媒体下载白名单规则。 */
export interface WebDownloadMediaAllowlistEntry {
  /** 允许的文件后缀，不包含点号。 */
  suffixes: readonly string[]
  /** 允许的 MIME 类型，不包含参数。 */
  mimeTypes: readonly string[]
}

/** 网站端允许直接下载的媒体后缀与 MIME 类型。 */
export const WEB_DOWNLOAD_MEDIA_ALLOWLIST: readonly WebDownloadMediaAllowlistEntry[] = [
  // 文本文件按后缀放行，避免 text/plain 将脚本等未知类型一并放行。
  { suffixes: ['csv', 'txt', 'tsv', 'md', 'json', 'log'], mimeTypes: [] },
  { suffixes: ['mp4'], mimeTypes: ['video/mp4'] },
  { suffixes: ['jpg', 'jpeg'], mimeTypes: ['image/jpeg'] },
  { suffixes: ['mov'], mimeTypes: ['video/quicktime'] },
  { suffixes: ['mkv'], mimeTypes: ['video/x-matroska'] },
  { suffixes: ['mp3'], mimeTypes: ['audio/mpeg'] },
  { suffixes: ['png'], mimeTypes: ['image/png'] },
  { suffixes: ['wav'], mimeTypes: ['audio/wav', 'audio/x-wav'] },
  { suffixes: ['m4a'], mimeTypes: ['audio/mp4'] },
  { suffixes: ['webp'], mimeTypes: ['image/webp'] },
  { suffixes: ['gif'], mimeTypes: ['image/gif'] },
  { suffixes: ['webm'], mimeTypes: ['video/webm'] },
  { suffixes: ['m4v'], mimeTypes: ['video/x-m4v'] },
  { suffixes: ['avi'], mimeTypes: ['video/x-msvideo'] },
  { suffixes: ['ogg'], mimeTypes: ['audio/ogg', 'video/ogg'] },
  { suffixes: ['flac'], mimeTypes: ['audio/flac'] },
  { suffixes: ['pdf'], mimeTypes: ['application/pdf'] },
  { suffixes: ['doc'], mimeTypes: ['application/msword'] },
  {
    suffixes: ['docx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  },
  { suffixes: ['ppt'], mimeTypes: ['application/vnd.ms-powerpoint'] },
  {
    suffixes: ['pptx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  },
  { suffixes: ['xls'], mimeTypes: ['application/vnd.ms-excel'] },
  {
    suffixes: ['xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  }
]

/** 高风险文件后缀；命中时优先拒绝，即使 MIME 看起来是媒体类型。 */
export const WEB_DOWNLOAD_DENIED_SUFFIXES: readonly string[] = [
  'apk',
  'apks',
  'xapk',
  'exe',
  'msi',
  'dmg',
  'pkg',
  'ipa',
  'deb',
  'rpm',
  'jar',
  'dll',
  'so',
  'sh',
  'bat',
  'cmd',
  'ps1',
  'zip',
  'rar',
  '7z'
]

/** 白名单后缀集合，用于快速判定文件名。 */
const ALLOWED_SUFFIXES = new Set(WEB_DOWNLOAD_MEDIA_ALLOWLIST.flatMap(entry => entry.suffixes))

/** 白名单 MIME 集合，用于支持无后缀媒体文件。 */
const ALLOWED_MIME_TYPES = new Set(WEB_DOWNLOAD_MEDIA_ALLOWLIST.flatMap(entry => entry.mimeTypes))

/** 风险后缀集合，用于执行优先拒绝规则。 */
const DENIED_SUFFIXES = new Set(WEB_DOWNLOAD_DENIED_SUFFIXES)

/** 提取最后一个点号后的文件后缀。 */
export function getWebDownloadFilenameSuffix(filename: string | null | undefined): string | null {
  const normalizedFilename = filename?.trim() ?? ''
  const dotIndex = normalizedFilename.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === normalizedFilename.length - 1) {
    return null
  }

  const suffix = normalizedFilename.slice(dotIndex + 1).trim().toLowerCase()
  return suffix.length > 0 ? suffix : null
}

/** 规范化 MIME 类型，去掉 charset 等参数。 */
export function normalizeWebDownloadMimeType(mimeType: string | null | undefined): string | null {
  const normalizedMimeType = mimeType?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return normalizedMimeType.length > 0 ? normalizedMimeType : null
}

/** 判断资源是否允许从网站域名直接下载。 */
export function isWebDownloadMediaAllowed(resource: Pick<MediaPost, 'filename' | 'mimeType'>): boolean {
  const suffix = getWebDownloadFilenameSuffix(resource.filename)
  if (suffix && DENIED_SUFFIXES.has(suffix)) {
    return false
  }
  if (suffix && ALLOWED_SUFFIXES.has(suffix)) {
    return true
  }

  const mimeType = normalizeWebDownloadMimeType(resource.mimeType)
  return Boolean(mimeType && ALLOWED_MIME_TYPES.has(mimeType))
}
