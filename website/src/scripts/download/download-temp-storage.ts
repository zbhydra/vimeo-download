/**
 * 单次下载临时存储。
 *
 * 小文件使用内存；大文件使用本轮独占的 OPFS 文件，不保存可恢复状态。
 */

/** 单次下载临时文件结果。 */
export interface DownloadTempFileResult {
  /** 写入完成后的 Blob。 */
  blob: Blob
  /** 写入的字节数。 */
  bytesWritten: number
}

/** 单次下载临时写入器。 */
export interface DownloadTempWriter {
  /** 写入一个二进制分片。 */
  write(chunk: Uint8Array): void
  /** 完成写入并返回 Blob。 */
  finish(mimeType: string): DownloadTempFileResult
}

/** 创建当前下载动作内的内存临时写入器。 */
export function createMemoryDownloadTempWriter(): DownloadTempWriter {
  const chunks: Uint8Array[] = []
  let bytesWritten = 0

  return {
    write(chunk: Uint8Array): void {
      chunks.push(chunk.slice())
      bytesWritten += chunk.byteLength
    },
    finish(mimeType: string): DownloadTempFileResult {
      const parts = chunks.map(chunk => chunk.slice().buffer)
      return {
        blob: new Blob(parts, { type: mimeType || 'application/octet-stream' }),
        bytesWritten
      }
    }
  }
}

/** 创建一次性 OPFS 文件；调用者负责关闭 writable 后读取 File，保存完成后 cleanup。 */
export async function createOpfsDownloadTempFile() {
  const root = await navigator.storage.getDirectory()
  const name = `download_temp_${crypto.randomUUID()}`
  const handle = await root.getFileHandle(name, { create: true })
  let writable: FileSystemWritableFileStream
  try {
    writable = await handle.createWritable()
  } catch (error) {
    console.error(error)
    await root.removeEntry(name)
    throw error
  }
  let removed = false
  return {
    writable,
    getFile: () => handle.getFile(),
    async cleanup(): Promise<void> {
      if (removed) return
      try {
        await writable.abort()
      } catch (error) {
        console.error(error)
      }
      await root.removeEntry(name)
      removed = true
    }
  }
}
