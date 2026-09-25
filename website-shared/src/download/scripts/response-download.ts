/**
 * Response 流下载工具。
 *
 * direct runner 使用这里的 HTTP 校验、流式读取、进度计算和 object URL 生成。
 */

import { createMemoryDownloadTempWriter } from './download-temp-storage'
import { DownloadStorageError } from './download-storage-error'
import type { DownloadCompletion } from './download-completion'
import type { DownloadProgressSnapshot } from './types'

/** 直连 URL 过期或浏览器无法读取直链。 */
export class DirectUrlExpiredError extends Error {
  /** HTTP 状态码；0 表示 CORS 或网络层失败。 */
  readonly status: number

  constructor(status: number, context: string) {
    super(`[response-download] DirectUrlExpiredError in ${context}: direct URL unavailable, status=${status}`)
    this.name = 'DirectUrlExpiredError'
    this.status = status
  }
}

/** 直连下载返回不可重试的 HTTP 状态码。 */
export class DirectDownloadHttpError extends Error {
  /** HTTP 状态码。 */
  readonly status: number

  constructor(status: number, context: string) {
    super(`[response-download] DirectDownloadHttpError in ${context}: direct download failed, status=${status}`)
    this.name = 'DirectDownloadHttpError'
    this.status = status
  }
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function guessFilename(disposition: string | null, fallback: string): string {
  if (!disposition) {
    return fallback
  }

  const matchedName = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/)
  if (!matchedName?.[1]) {
    return fallback
  }

  try {
    return decodeURIComponent(matchedName[1])
  } catch (error) {
    console.error(error)
    return matchedName[1]
  }
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress))
}

function isLikelyNetworkError(error: Error): boolean {
  if (error.name === 'AbortError') {
    return true
  }
  return error instanceof TypeError
}

function createMemoryStorageError(
  operation: DownloadStorageError['operation'],
  context: string,
  cause: Error
): DownloadStorageError {
  return new DownloadStorageError({
    storageType: 'memory',
    recoveryMode: 'current_page',
    operation,
    context,
    cause
  })
}

function createMemoryObjectUrl(blob: Blob, context: string): string {
  try {
    return URL.createObjectURL(blob)
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createMemoryStorageError('read_temp', context, cause)
    console.error(storageError)
    throw storageError
  }
}

/** 获取已授权直链 Response。 */
export async function fetchDirectDownloadResponse(
  directUrl: string,
  context: string,
  extraHeaders: HeadersInit = {}
): Promise<Response> {
  try {
    const response = await fetch(directUrl, {
      headers: extraHeaders,
      // X CDN 会因本地页面 Referer 返回 403，直连下载请求不需要携带 Referer。
      referrerPolicy: 'no-referrer'
    })
    if (response.status === 403 || response.status === 404 || response.status === 410) {
      throw new DirectUrlExpiredError(response.status, context)
    }
    if (response.status !== 200 && response.status !== 206) {
      throw new DirectDownloadHttpError(response.status, context)
    }
    return response
  } catch (error) {
    if (error instanceof DirectUrlExpiredError || error instanceof DirectDownloadHttpError) {
      throw error
    }
    if (error instanceof Error && isLikelyNetworkError(error)) {
      throw new DirectUrlExpiredError(0, context)
    }
    throw error
  }
}

/** 把 Response 流读取为 object URL 保存动作。 */
export async function createObjectUrlCompletionFromResponse(
  response: Response,
  fallbackFilename: string,
  onProgress: ((progress: DownloadProgressSnapshot) => void) | undefined,
  context: string
): Promise<DownloadCompletion> {
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`[response-download] createObjectUrlCompletionFromResponse: unexpected HTTP status=${response.status}, context=${context}`)
  }

  const totalBytes = parseContentLength(response.headers.get('content-length'))
  const mimeType = response.headers.get('content-type') || 'application/octet-stream'
  const startedAt = Date.now()
  const writer = createMemoryDownloadTempWriter()
  let downloadedBytes = 0

  const emitProgress = (): void => {
    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
    onProgress?.({
      progress:
        totalBytes !== null && totalBytes > 0
          ? clampProgress((downloadedBytes / totalBytes) * 100)
          : undefined,
      downloadedBytes,
      totalBytes,
      speedBytesPerSecond: downloadedBytes > 0 ? downloadedBytes / elapsedSeconds : null
    })
  }

  if (!response.body) {
    const blob = await response.blob()
    downloadedBytes = blob.size
    emitProgress()
    return {
      kind: 'object_url',
      objectUrl: createMemoryObjectUrl(blob, context),
      filename: guessFilename(response.headers.get('content-disposition'), fallbackFilename),
      revokeAfterMs: 60_000,
      bytesWritten: downloadedBytes,
      objectUrlSource: 'blob'
    }
  }

  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value || value.byteLength === 0) {
      continue
    }
    try {
      writer.write(value)
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error))
      const storageError = createMemoryStorageError('write_temp', context, cause)
      console.error(storageError)
      throw storageError
    }
    downloadedBytes += value.byteLength
    emitProgress()
  }

  let result: ReturnType<typeof writer.finish>
  try {
    result = writer.finish(mimeType)
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createMemoryStorageError('write_temp', context, cause)
    console.error(storageError)
    throw storageError
  }
  emitProgress()

  return {
    kind: 'object_url',
    objectUrl: createMemoryObjectUrl(result.blob, context),
    filename: guessFilename(response.headers.get('content-disposition'), fallbackFilename),
    revokeAfterMs: 60_000,
    bytesWritten: result.bytesWritten,
    objectUrlSource: 'blob'
  }
}
