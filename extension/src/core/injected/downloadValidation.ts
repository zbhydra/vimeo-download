/**
 * MAIN world 下载响应类型校验。
 *
 * 只负责把响应 Content-Type 归一化并与资源语义核对，不持有下载状态。
 */

import { RESOURCE_TYPES, type ResourceType } from '@/core/constants/resource'

/** 下载过程中需要校验的非最终媒体响应。 */
export type DownloadContentKind = ResourceType | 'hls-playlist' | 'media-segment' | 'json'

/** 已完成脱敏、可以安全跨下载边界传播的 MIME 合同错误。 */
export class DownloadContentTypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DownloadContentTypeError'
  }
}

/** 归一化并校验响应 Content-Type；不匹配时抛错。 */
export function assertDownloadContentType(
  rawContentType: string | null | undefined,
  expected: DownloadContentKind,
  label: string
): string {
  const contentType = normalizeContentType(rawContentType)
  if (!contentType || !matchesExpectedContentType(contentType, expected)) {
    throw new DownloadContentTypeError(
      `[DownloadValidation] 响应 MIME 与资源不匹配: label=${label}, expected=${expected}, contentType=${contentType || 'missing'}`
    )
  }

  return contentType
}

/** 判断归一化 MIME 是否符合资源语义。 */
function matchesExpectedContentType(contentType: string, expected: DownloadContentKind): boolean {
  if (expected === 'json') {
    return contentType === 'application/json' || contentType.endsWith('+json')
  }

  if (expected === 'hls-playlist') {
    return (
      contentType === 'application/vnd.apple.mpegurl' ||
      contentType === 'application/x-mpegurl' ||
      contentType === 'audio/mpegurl' ||
      contentType === 'audio/x-mpegurl'
    )
  }

  if (expected === 'media-segment') {
    return (
      contentType === 'video/mp4' ||
      contentType === 'audio/mp4' ||
      contentType === 'application/octet-stream' ||
      contentType === 'binary/octet-stream'
    )
  }

  if (expected === RESOURCE_TYPES.IMAGE) {
    return contentType.startsWith('image/')
  }

  if (expected === RESOURCE_TYPES.VIDEO) {
    return contentType.startsWith('video/')
  }

  if (expected === RESOURCE_TYPES.AUDIO) {
    return contentType.startsWith('audio/')
  }

  return false
}

/** 归一化 Content-Type，忽略参数并统一大小写。 */
function normalizeContentType(rawContentType: string | null | undefined): string {
  return rawContentType?.split(';')[0]?.trim().toLowerCase() ?? ''
}
