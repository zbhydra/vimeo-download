/**
 * HTTP Response 流式读取器。
 *
 * 单响应下载按 Content-Length 上报百分比；多响应媒体可复用逐块字节回调，
 * 在 DASH 等聚合下载中按整份媒体总字节计算真实进度。
 */

import { reportDownloadProgress } from '@/core/downloadProgress'

/** 响应流读取阶段可上报的最高百分比。 */
const MAX_TRANSFER_PROGRESS = 99

/** 响应 Blob 读取参数。 */
export interface ResponseBlobProgressOptions {
  /** 当前页面下载管理器分配的唯一任务 ID。 */
  taskId: string
  /** 调用方提供的稳定资源 ID。 */
  sourceId: string
  /** 已由调用方校验过的最终 MIME。 */
  contentType: string
}

/** 单个响应块读取完成后的字节回调。 */
export type ResponseChunkHandler = (byteLength: number) => void

/**
 * 读取完整响应并返回 Blob。
 *
 * @param response 已校验状态、响应 URL 与 MIME 的 fetch 响应
 * @param options 资源标识与最终 MIME
 */
export async function readResponseBlobWithProgress(
  response: Response,
  options: ResponseBlobProgressOptions
): Promise<Blob> {
  const totalBytes = readUsableContentLength(response.headers)
  let receivedBytes = 0
  let lastReportedProgress: number | null = null

  if (totalBytes !== null) {
    reportDownloadProgress({
      taskId: options.taskId,
      sourceId: options.sourceId,
      progress: 0,
      receivedBytes: null,
      totalBytes: null,
      bytesAreEstimated: false
    })
    lastReportedProgress = 0
  }

  const chunks = await readResponseChunks(response, byteLength => {
    receivedBytes += byteLength
    if (totalBytes === null) {
      return
    }

    const progress = Math.min(MAX_TRANSFER_PROGRESS, Math.floor((receivedBytes / totalBytes) * 100))
    if (progress !== lastReportedProgress) {
      reportDownloadProgress({
        taskId: options.taskId,
        sourceId: options.sourceId,
        progress,
        receivedBytes: null,
        totalBytes: null,
        bytesAreEstimated: false
      })
      lastReportedProgress = progress
    }
  })

  return new Blob(chunks, { type: options.contentType })
}

/**
 * 逐块读取响应并合并为 ArrayBuffer。
 *
 * @param response 已完成状态、URL 与 MIME 校验的响应
 * @param onChunk 每个网络块复制完成后的实际字节回调
 */
export async function readResponseArrayBufferByChunk(
  response: Response,
  onChunk: ResponseChunkHandler
): Promise<ArrayBuffer> {
  const chunks = await readResponseChunks(response, onChunk)
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const bytes = new Uint8Array(totalBytes)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes.buffer
}

/** 逐块复制响应流，避免结果持有浏览器内部流缓冲区。 */
async function readResponseChunks(
  response: Response,
  onChunk: ResponseChunkHandler
): Promise<Uint8Array[]> {
  const body = response.body
  if (!body) {
    const buffer = await response.arrayBuffer()
    const chunk = new Uint8Array(buffer)
    if (chunk.byteLength > 0) {
      onChunk(chunk.byteLength)
    }
    return [chunk]
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []

  try {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        break
      }
      if (result.value.byteLength === 0) {
        continue
      }

      const chunk = new Uint8Array(result.value.byteLength)
      chunk.set(result.value)
      chunks.push(chunk)
      onChunk(chunk.byteLength)
    }
  } finally {
    reader.releaseLock()
  }

  return chunks
}

/** 只在浏览器可见响应头未声明压缩编码时使用正整数 Content-Length。 */
function readUsableContentLength(headers: Headers): number | null {
  const contentEncoding = headers.get('Content-Encoding')?.trim().toLowerCase()
  if (contentEncoding && contentEncoding !== 'identity') {
    return null
  }

  const rawContentLength = headers.get('Content-Length')
  if (rawContentLength === null) {
    return null
  }

  const contentLength = Number(rawContentLength)
  return Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : null
}
