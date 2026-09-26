/**
 * HTTP Response 流式读取器。
 *
 * 多响应媒体复用逐块字节回调，在 DASH 等聚合下载中按整份媒体总字节计算真实进度。
 */

/** 单个响应块读取完成后的字节回调。 */
export type ResponseChunkHandler = (byteLength: number) => void

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
