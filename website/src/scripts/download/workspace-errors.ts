/**
 * 下载工作区错误映射。
 *
 * 只做错误分类与文案映射，不触发鉴权、渲染或下载动作。
 */

import { HomepageApiError } from '../runtime/api'
import type { DownloadWorkspaceContent } from '../../i18n/schema'
import { ClientMuxDownloadError } from './client-mux'
import {
  AutoRangeResumeExhaustedError,
  RangeStreamInterruptedError
} from './download-range-stream'
import { DownloadStorageError } from './download-storage-error'
import { UnsupportedDownloadModeError } from './download-methods'
import {
  DirectDownloadHttpError,
  DirectUrlExpiredError
} from './response-download'

const CODE_RATE_LIMIT_EXCEEDED = 998
/** 旧 media 解析接口返回的平台不支持错误码。 */
const CODE_MEDIA_PLATFORM_UNSUPPORTED = 24000
/** parse-v2 解析接口返回的平台不支持错误码。 */
const CODE_MEDIA_PARSE_UNSUPPORTED_PLATFORM = 24031
/** 网站下载文件类型不在媒体白名单内。 */
const CODE_MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED = 24049
const CODE_RATE_LIMIT_EXCEEDED_MEDIA = 24004
const CODE_VIMEO_PARSE_FAILED = 24005

interface ApiErrorLike {
  code?: number | string
}

function hasApiErrorCode(error: Error | string | null): error is Error & ApiErrorLike {
  return error instanceof Error && 'code' in error
}

/** 只把后端数字业务码的 msg 暴露给用户，网络/超时等技术错误继续走兜底文案。 */
function getBusinessErrorMessage(error: HomepageApiError): string | null {
  const code = getApiErrorCode(error)
  if (code === null) {
    return null
  }

  const message = error.message.trim()
  return message.length > 0 ? message : null
}

/** 读取后端业务错误码。 */
export function getApiErrorCode(error: Error | string | null): number | null {
  if (!hasApiErrorCode(error)) {
    return null
  }

  const code = Number(error.code)
  return Number.isFinite(code) ? code : null
}

/** 判断是否为网站下载文件类型白名单拒绝。 */
export function isUnsafeFileTypeError(error: Error | string | null): boolean {
  return getApiErrorCode(error) === CODE_MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED
}

/** 判断是否为限流错误。 */
export function isRateLimitError(error: Error | string | null): boolean {
  const code = getApiErrorCode(error)
  return code === CODE_RATE_LIMIT_EXCEEDED || code === CODE_RATE_LIMIT_EXCEEDED_MEDIA
}

/** 映射错误到本地化文案。 */
export function mapErrorToCopy(
  copy: DownloadWorkspaceContent,
  error: Error | string | null,
  fallback: string
): string {
  const code = getApiErrorCode(error)
  if (
    code === CODE_MEDIA_PLATFORM_UNSUPPORTED ||
    code === CODE_MEDIA_PARSE_UNSUPPORTED_PLATFORM
  ) {
    return copy.errors.unsupportedPlatform ?? fallback
  }
  if (code === CODE_VIMEO_PARSE_FAILED) {
    return copy.errors.vimeoParseFailed ?? fallback
  }
  if (code === CODE_MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED) {
    return copy.errors.unsafeFileTypeUseExtension ?? fallback
  }
  if (isRateLimitError(error)) {
    return copy.errors.rateLimitExceeded ?? fallback
  }

  if (
    error instanceof AutoRangeResumeExhaustedError ||
    error instanceof RangeStreamInterruptedError
  ) {
    return copy.errors.downloadNetworkInterrupted ?? copy.errors.downloadFailed ?? fallback
  }

  if (error instanceof DirectUrlExpiredError || error instanceof DirectDownloadHttpError) {
    return copy.errors.downloadFailed ?? fallback
  }

  if (error instanceof UnsupportedDownloadModeError) {
    return copy.errors.unsupportedDownloadMode ?? copy.errors.downloadFailed ?? fallback
  }

  if (error instanceof ClientMuxDownloadError) {
    if (error.reason === 'opfs_unavailable_for_large_file') {
      return (copy.errors.browserStorageInsufficientUseExtension ?? copy.errors.downloadFailed ?? fallback)
        .replace(/\{(?:file_size|available_space|required_space)\}/g, '-')
    }
    if (error.reason === 'client_mux_too_large') {
      return copy.errors.clientMuxTooLarge ?? copy.errors.downloadFailed ?? fallback
    }
    if (error.reason === 'track_fetch_failed') {
      return copy.errors.trackFetchFailed ?? copy.errors.downloadFailed ?? fallback
    }
    return copy.errors.clientMuxFailed ?? copy.errors.downloadFailed ?? fallback
  }

  if (error instanceof DownloadStorageError) {
    return error.message
  }

  if (error instanceof HomepageApiError) {
    return getBusinessErrorMessage(error) ?? fallback
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }
  if (typeof error === 'string' && error.length > 0) {
    return error
  }
  return fallback
}
