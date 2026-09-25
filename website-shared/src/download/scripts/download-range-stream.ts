/**
 * HTTP Range 响应写入工具。
 *
 * 负责校验 200/206、校验 Content-Range 起点、把 Response body 写入传入 writer，
 * 并按 1MiB 或 1 秒节流保存 checkpoint。
 */

import type { DownloadResumeWriter } from './download-resume-store'
import type { DownloadProgressSnapshot } from './types'

/** checkpoint 最小字节间隔。 */
const CHECKPOINT_BYTES = 1024 * 1024

/** checkpoint 最小时间间隔。 */
const CHECKPOINT_INTERVAL_MS = 1000
/** 用户可见的自动续传耗尽提示；技术原因写入 Error.message 供后台排障。 */
const AUTO_RANGE_RESUME_USER_MESSAGE = 'Network connection interrupted. Click Continue to resume.'

/** 自动续传耗尽的具体来源。 */
export type AutoRangeResumeExhaustedReason = 'direct_consecutive_empty_retries'

/** 自动续传耗尽诊断上下文。 */
export interface AutoRangeResumeExhaustedContext {
  /** 耗尽原因分类。 */
  reason: AutoRangeResumeExhaustedReason
  /** direct 的连续无进展重试上限。 */
  retryLimit: number
}

/** Range 响应不能拼接到现有 OPFS 临时文件。 */
export class RangeResumeResponseError extends Error {
  /** HTTP 状态码。 */
  readonly status: number
  /** 期望的起始字节。 */
  readonly startByte: number

  constructor(message: string, status: number, startByte: number) {
    super(message)
    this.name = 'RangeResumeResponseError'
    this.status = status
    this.startByte = startByte
  }
}

/** Range 流读取被浏览器网络层中断。 */
export class RangeStreamInterruptedError extends Error {
  /** 中断时已经写入的总字节数。 */
  readonly downloadedBytes: number
  /** 服务端声明的总字节数。 */
  readonly totalBytes: number | null
  /** 本次 Range 写入起点。 */
  readonly startByte: number

  constructor(
    sourceId: string,
    downloadedBytes: number,
    totalBytes: number | null,
    startByte: number,
    cause: Error
  ) {
    super(
      `[download-range-stream] stream interrupted, sourceId=${sourceId}, downloadedBytes=${downloadedBytes}, totalBytes=${totalBytes ?? 'unknown'}, startByte=${startByte}, cause=${cause.name}: ${cause.message}`
    )
    this.name = 'RangeStreamInterruptedError'
    this.downloadedBytes = downloadedBytes
    this.totalBytes = totalBytes
    this.startByte = startByte
  }
}

/** 自动 Range 续传次数耗尽，交给用户点击 Continue。 */
export class AutoRangeResumeExhaustedError extends Error {
  /** 自动续传耗尽时已经写入的总字节数。 */
  readonly downloadedBytes: number
  /** 服务端声明的总字节数。 */
  readonly totalBytes: number | null
  /** 已执行的自动续传次数。 */
  readonly retryCount: number
  /** 用户可见文案，避免把技术细节直接展示给普通用户。 */
  readonly userMessage = AUTO_RANGE_RESUME_USER_MESSAGE
  /** 自动续传耗尽原因分类。 */
  readonly reason: AutoRangeResumeExhaustedReason
  /** direct 的连续无进展重试上限。 */
  readonly retryLimit: number
  /** 触发耗尽的底层错误类型。 */
  readonly causeName: string
  /** 触发耗尽的底层错误消息。 */
  readonly causeMessage: string

  constructor(
    sourceId: string,
    downloadedBytes: number,
    totalBytes: number | null,
    retryCount: number,
    cause: Error,
    context: AutoRangeResumeExhaustedContext
  ) {
    super(
      buildAutoRangeResumeExhaustedMessage(
        sourceId,
        downloadedBytes,
        totalBytes,
        retryCount,
        cause,
        context
      )
    )
    this.name = 'AutoRangeResumeExhaustedError'
    this.downloadedBytes = downloadedBytes
    this.totalBytes = totalBytes
    this.retryCount = retryCount
    this.reason = context.reason
    this.retryLimit = context.retryLimit
    this.causeName = cause.name
    this.causeMessage = cause.message
    console.warn(this.message)
  }
}

/** 自动续传耗尽原因的用户可读描述。 */
function autoRangeResumeReasonText(context: AutoRangeResumeExhaustedContext): string {
  return `direct stream made no progress for ${context.retryLimit} consecutive retries`
}

function buildAutoRangeResumeExhaustedMessage(
  sourceId: string,
  downloadedBytes: number,
  totalBytes: number | null,
  retryCount: number,
  cause: Error,
  context: AutoRangeResumeExhaustedContext
): string {
  const parts = [
    '[download-range-stream] auto Range resume exhausted',
    `reason=${autoRangeResumeReasonText(context)}`,
    `sourceId=${sourceId}`,
    `downloadedBytes=${downloadedBytes}`,
    `totalBytes=${totalBytes ?? 'unknown'}`,
    `retryCount=${retryCount}`,
    `retryLimit=${context.retryLimit}`
  ]
  parts.push(`cause=${cause.name}: ${cause.message}`)
  return parts.join(', ')
}

/** Range 流写入完成结果。 */
export interface RangeWriteResult {
  /** 写入完成后的总下载字节数。 */
  downloadedBytes: number
  /** 总字节数，null 表示未知。 */
  totalBytes: number | null
  /** 响应 MIME 类型。 */
  mimeType: string
}

/** 判断本轮 Range 写入是否推进了文件字节位置。 */
export function hasRangeWriteProgress(startByte: number, downloadedBytes: number): boolean {
  return downloadedBytes > startByte
}

/** checkpoint 快照。 */
interface RangeCheckpointSnapshot {
  /** 当前已下载字节数。 */
  downloadedBytes: number
  /** 当前总字节数。 */
  totalBytes: number | null
  /** 当前 MIME 类型。 */
  mimeType: string
}

/** Range 写入选项。 */
interface PipeRangeResponseOptions {
  /** 资源 ID，用于错误定位。 */
  sourceId: string
  /** 当前写入起始字节。 */
  startByte: number
  /** 资源已知总大小。 */
  fallbackTotalBytes: number | null
  /** 目标写入器。 */
  writer: DownloadResumeWriter
  /** 下载进度回调。 */
  onProgress?(progress: DownloadProgressSnapshot): void
  /** checkpoint 回调。 */
  onCheckpoint?(snapshot: RangeCheckpointSnapshot): Promise<void>
}

interface ParsedContentRange {
  /** 响应起始字节。 */
  start: number
  /** 响应结束字节。 */
  end: number
  /** 资源总字节数，null 表示服务端未声明。 */
  totalBytes: number | null
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function parseContentRange(value: string | null): ParsedContentRange | null {
  if (!value) {
    return null
  }

  const matched = value.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i)
  if (!matched) {
    return null
  }

  const start = Number.parseInt(matched[1], 10)
  const end = Number.parseInt(matched[2], 10)
  const totalBytes = matched[3] === '*' ? null : Number.parseInt(matched[3], 10)
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    (totalBytes !== null && !Number.isSafeInteger(totalBytes)) ||
    end < start ||
    (totalBytes !== null && end >= totalBytes)
  ) {
    return null
  }

  return { start, end, totalBytes }
}

function resolveTotalBytes(
  response: Response,
  startByte: number,
  fallbackTotalBytes: number | null
): number | null {
  if (response.status === 206) {
    const parsedRange = parseContentRange(response.headers.get('content-range'))
    return parsedRange?.totalBytes ?? fallbackTotalBytes
  }

  const contentLength = parseContentLength(response.headers.get('content-length'))
  return contentLength === null ? fallbackTotalBytes : startByte + contentLength
}

function assertRangeResponse(
  response: Response,
  sourceId: string,
  startByte: number
): void {
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(
      `[download-range-stream] assertRangeResponse: unexpected HTTP status, sourceId=${sourceId}, status=${response.status}, startByte=${startByte}`
    )
  }

  if (startByte <= 0) {
    return
  }

  if (response.status !== 206) {
    throw new RangeResumeResponseError(
      `[download-range-stream] assertRangeResponse: resume requires 206, sourceId=${sourceId}, status=${response.status}, startByte=${startByte}`,
      response.status,
      startByte
    )
  }

  const contentRange = response.headers.get('content-range')
  const parsedRange = parseContentRange(contentRange)
  if (!parsedRange || parsedRange.start !== startByte) {
    throw new RangeResumeResponseError(
      `[download-range-stream] assertRangeResponse: Content-Range start mismatch, sourceId=${sourceId}, expected=${startByte}, contentRange=${contentRange ?? 'missing'}`,
      response.status,
      startByte
    )
  }

  // size=null 资源允许续传；能否拼接只看服务端是否返回 206 且 Content-Range 起点匹配。
}

async function cancelUnreadResponse(response: Response): Promise<void> {
  if (!response.body) {
    return
  }

  try {
    await response.body.cancel()
  } catch (error) {
    console.error(error)
  }
}

/** 已进入读取态时 response.body 被 reader 锁定，只能通过 reader.cancel() 主动断开旧流。 */
async function cancelActiveResponseReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
  try {
    await reader.cancel()
  } catch (error) {
    console.error(error)
  }
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress))
}

function isLikelyStreamInterruption(error: Error): boolean {
  if (error.name === 'AbortError') {
    return true
  }
  if (error instanceof TypeError) {
    return true
  }

  return /load failed|network|fetch|aborted|terminated/i.test(error.message)
}

/** 校验 Range 响应并把 body 写入目标 writer。 */
export async function pipeRangeResponseToWriter(
  response: Response,
  options: PipeRangeResponseOptions
): Promise<RangeWriteResult> {
  const startedAt = Date.now()
  let downloadedBytes = options.startByte
  let mimeType = 'application/octet-stream'
  let totalBytes = options.fallbackTotalBytes
  let lastCheckpointBytes = options.startByte
  let lastCheckpointAtMs = startedAt
  let closed = false
  let responseValidated = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  const emitProgress = (): void => {
    const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001)
    const sessionBytes = Math.max(0, downloadedBytes - options.startByte)
    options.onProgress?.({
      progress:
        totalBytes !== null && totalBytes > 0
          ? clampProgress((downloadedBytes / totalBytes) * 100)
          : undefined,
      downloadedBytes,
      totalBytes,
      speedBytesPerSecond: sessionBytes > 0 ? sessionBytes / elapsedSeconds : null
    })
  }

  const checkpoint = async (force: boolean): Promise<void> => {
    const now = Date.now()
    if (
      !force &&
      downloadedBytes - lastCheckpointBytes < CHECKPOINT_BYTES &&
      now - lastCheckpointAtMs < CHECKPOINT_INTERVAL_MS
    ) {
      return
    }

    lastCheckpointBytes = downloadedBytes
    lastCheckpointAtMs = now
    await options.onCheckpoint?.({ downloadedBytes, totalBytes, mimeType })
  }

  const closeWriter = async (): Promise<void> => {
    if (closed) {
      return
    }
    closed = true
    await options.writer.close()
  }

  try {
    assertRangeResponse(response, options.sourceId, options.startByte)
    responseValidated = true
    mimeType = response.headers.get('content-type') || 'application/octet-stream'
    totalBytes = resolveTotalBytes(response, options.startByte, options.fallbackTotalBytes)

    if (!response.body) {
      const blob = await response.blob()
      const chunk = new Uint8Array(await blob.arrayBuffer())
      if (chunk.byteLength > 0) {
        await options.writer.write(chunk)
        downloadedBytes += chunk.byteLength
      }
      emitProgress()
      await checkpoint(true)
      await closeWriter()
      return { downloadedBytes, totalBytes, mimeType }
    }

    reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        emitProgress()
        await checkpoint(true)
        await closeWriter()
        return { downloadedBytes, totalBytes, mimeType }
      }

      if (!value || value.byteLength === 0) {
        continue
      }

      await options.writer.write(value)
      downloadedBytes += value.byteLength
      emitProgress()
      await checkpoint(false)
    }
  } catch (error) {
    if (reader) {
      await cancelActiveResponseReader(reader)
    }
    if (!responseValidated) {
      await cancelUnreadResponse(response)
    } else {
      await checkpoint(true)
    }
    await closeWriter().catch(closeError => {
      console.error(closeError)
    })
    if (error instanceof Error && isLikelyStreamInterruption(error)) {
      throw new RangeStreamInterruptedError(
        options.sourceId,
        downloadedBytes,
        totalBytes,
        options.startByte,
        error
      )
    }
    throw error
  }
}
