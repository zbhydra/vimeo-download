/**
 * mux 产物的 OPFS 临时文件管理。
 *
 * DASH/HLS 合成产物不再经 BufferTarget 整份驻留内存（数 GB 的 4K 长片会 OOM），而是用
 * Mediabunny StreamTarget 流式写入 OPFS 专用目录，交付时以 OPFS File 引用创建 blob URL。
 * 本模块负责临时文件的完整生命周期：
 *
 * - 创建：`vdl-mux/<stem>.<ext>`，stem 取全局唯一的 taskId 防碰撞；
 * - 交付：File 交 OffscreenTaskRunner 交付；background 经 downloads.search 确认落盘后
 *   在 releaseTaskArtifact 中删除；
 * - 清扫：offscreen 启动时递归删除整个目录（上次会话崩溃/泄漏的兜底）。
 *
 * 删除均为尽力而为：失败记日志不抛出，残留由下次启动清扫兜底。
 */

import { StreamTarget } from 'mediabunny'

import { logger } from '@/core/utils/logger'

/** OPFS 内 mux 产物专用目录。 */
const MUX_TEMP_DIR = 'vdl-mux'

/** 已完成的 mux 产物：OPFS File 引用与其临时文件名。 */
export interface MuxOutputArtifact {
  /** 产物 File；URL.createObjectURL 按引用交付，不整读进内存。 */
  readonly file: File
  /** 产物的 MIME 类型；OPFS File.type 恒为空，须显式携带。 */
  readonly mimeType: string
  /** OPFS 临时文件名；background 落盘确认后凭此删除。 */
  readonly tempFileName: string
}

/** 进行中的 mux 产物写入端。 */
export interface MuxArtifactWriter {
  /** OPFS 临时文件名（MUX_TEMP_DIR 内唯一）。 */
  readonly fileName: string
  /** 交给 Mediabunny Output 的写入目标。 */
  readonly target: StreamTarget
  /**
   * 取产物 File。只能在 Output.finalize() 成功后调用：StreamTarget 会在 finalize 内关闭
   * 可写流并等待写完，这里只读回文件引用，不可重复关闭。
   */
  finalize(): Promise<File>
  /** 丢弃产物：中止可写流并删除临时文件。mux 失败路径的清理，不抛出。 */
  dispose(): Promise<void>
}

/** 在 OPFS 临时目录创建唯一产物文件并打开流式写入。 */
export async function openMuxArtifactWriter(
  stem: string,
  extension: string
): Promise<MuxArtifactWriter> {
  const fileName = `${stem}.${extension}`
  const directory = await muxTempDirectory()
  const fileHandle = await directory.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  const target = new StreamTarget(writable, { chunked: true })

  return {
    fileName,
    target,
    finalize: () => fileHandle.getFile(),
    async dispose(): Promise<void> {
      try {
        await writable.abort()
      } catch (error) {
        // 流可能已被 StreamTarget 关闭或因写盘错误自行中止，这里只负责收尾。
        logger.warn(`[MuxArtifactStore] 中止可写流失败: fileName=${fileName}`, error)
      }
      await removeMuxArtifact(fileName)
    }
  }
}

/** 删除单个 OPFS 临时产物；尽力而为，失败记日志。 */
export async function removeMuxArtifact(fileName: string): Promise<void> {
  try {
    const directory = await muxTempDirectory()
    await directory.removeEntry(fileName)
  } catch (error) {
    logger.warn(`[MuxArtifactStore] 删除 OPFS 临时产物失败: fileName=${fileName}`, error)
  }
}

/** 进行中的裸字节产物写入端（不经 Mediabunny，MP3 帧流等自管容器输出用）。 */
export interface MuxByteArtifactWriter {
  /** OPFS 临时文件名（MUX_TEMP_DIR 内唯一）。 */
  readonly fileName: string
  /** 追加一段字节；顺序写入，无定位语义。 */
  write(chunk: Uint8Array): Promise<void>
  /** 取产物 File。只能在最后一次 write 完成后调用，不可重复关闭。 */
  finalize(): Promise<File>
  /** 丢弃产物：中止可写流并删除临时文件。失败路径的清理，不抛出。 */
  dispose(): Promise<void>
}

/** 在 OPFS 临时目录创建唯一产物文件并打开裸字节流式写入。 */
export async function openMuxArtifactByteWriter(
  stem: string,
  extension: string
): Promise<MuxByteArtifactWriter> {
  return openMuxByteWriter(`${stem}.${extension}`)
}

/** 在 OPFS 临时目录创建指定文件名的裸字节写入端。 */
async function openMuxByteWriter(fileName: string): Promise<MuxByteArtifactWriter> {
  const directory = await muxTempDirectory()
  const fileHandle = await directory.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  const streamWriter = writable instanceof WritableStream ? writable.getWriter() : null

  return {
    fileName,
    write: chunk => (streamWriter ? streamWriter.write(chunk) : writable.write(chunk)),
    finalize: () => {
      // 与 StreamTarget.finalize 同口径：close 后才允许读回文件引用。
      return (streamWriter ? streamWriter.close() : writable.close()).then(() =>
        fileHandle.getFile()
      )
    },
    async dispose(): Promise<void> {
      try {
        await (streamWriter ? streamWriter.abort() : writable.abort())
      } catch (error) {
        logger.warn(`[MuxArtifactStore] 中止可写流失败: fileName=${fileName}`, error)
      }
      await removeMuxArtifact(fileName)
    }
  }
}

/** 打开 adaptive 输入临时文件；仅用于 never streaming，写完后交 Mediabunny BlobSource(File)。 */
export async function openMuxInputWriter(fileName: string): Promise<MuxByteArtifactWriter> {
  return openMuxByteWriter(fileName)
}

/**
 * 启动清扫：递归删除整个临时目录，清掉上次会话泄漏的未交付产物。
 *
 * 整目录删除而非逐项枚举：lib 未含 DOM.AsyncIterable，且「清空残留」语义等价。目录不存在
 * 是首次使用的常态，不视为错误。
 */
export async function sweepMuxArtifacts(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(MUX_TEMP_DIR, { recursive: true })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return
    }
    logger.error('[MuxArtifactStore] 清扫 OPFS 临时目录失败', error)
  }
}

/** 打开（不存在则创建）OPFS 临时目录。 */
async function muxTempDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(MUX_TEMP_DIR, { create: true })
}
