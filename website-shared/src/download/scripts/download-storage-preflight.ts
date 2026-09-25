/**
 * 下载前浏览器本地存储预检。
 *
 * OPFS 与 IndexedDB 共享浏览器 origin storage quota；Memory 没有可靠剩余容量 API。
 * 这里先拦截明显空间不足和大文件无法写 OPFS 的情况，避免进入 download-pre-v2 扣费后才失败。
 */

import type { MediaPost } from './types'

/** 1 MiB 字节数。 */
const MIB = 1024 * 1024

/** 浏览器存储预检安全余量，避免 estimate 的近似值刚好踩线。 */
const STORAGE_SAFETY_MARGIN_BYTES = 64 * MIB

/** 浏览器存储预检按文件大小追加的比例余量。 */
const STORAGE_SAFETY_MARGIN_RATIO = 0.15

/** OPFS 不可用时仍允许 Memory 兜底的最大文件大小。 */
const MEMORY_FALLBACK_MAX_BYTES = 100 * MIB

const CLIENT_MUX_MEMORY_MAX_BYTES = 50 * MIB

/** OPFS 真实写入探测大小。 */
const OPFS_PROBE_BYTES = 1 * MIB

/** 下载前浏览器存储预检结果。 */
export type DownloadStoragePreflightResult =
  | {
      /** 预检是否通过。 */
      ok: true
      /** 当前文件大小。 */
      fileSizeBytes: number | null
      /** 当前 origin storage 已使用字节数。 */
      usageBytes: number | null
      /** 当前 origin storage 配额字节数。 */
      quotaBytes: number | null
      /** 当前 origin storage 剩余字节数。 */
      availableBytes: number | null
      /** 本次下载建议预留字节数。 */
      requiredBytes: number | null
      /** OPFS 是否完成真实写入探测。 */
      opfsWritable: boolean | null
    }
  | {
      /** 预检是否通过。 */
      ok: false
      /** 失败原因。 */
      reason: 'insufficient_storage' | 'opfs_unavailable_for_large_file'
      /** 当前文件大小。 */
      fileSizeBytes: number | null
      /** 当前 origin storage 已使用字节数。 */
      usageBytes: number | null
      /** 当前 origin storage 配额字节数。 */
      quotaBytes: number | null
      /** 当前 origin storage 剩余字节数。 */
      availableBytes: number | null
      /** 本次下载建议预留字节数。 */
      requiredBytes: number | null
      /** OPFS 是否完成真实写入探测。 */
      opfsWritable: boolean | null
      /** OPFS 探测失败的底层错误名。 */
      errorName?: string
      /** OPFS 探测失败的底层错误信息。 */
      errorMessage?: string
    }

interface BrowserStorageEstimate {
  /** 当前 origin storage 已使用字节数。 */
  usageBytes: number | null
  /** 当前 origin storage 配额字节数。 */
  quotaBytes: number | null
  /** 当前 origin storage 剩余字节数。 */
  availableBytes: number | null
}

interface OpfsProbeResult {
  /** OPFS 是否可真实写入。 */
  writable: boolean
  /** 探测失败的底层错误名。 */
  errorName?: string
  /** 探测失败的底层错误信息。 */
  errorMessage?: string
}

function normalizeBytes(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

function fileSizeBytes(resource: MediaPost): number | null {
  return typeof resource.size === 'number' && Number.isFinite(resource.size) && resource.size > 0
    ? Math.floor(resource.size)
    : null
}

function requiredStorageBytes(sizeBytes: number): number {
  const ratioMargin = Math.ceil(sizeBytes * STORAGE_SAFETY_MARGIN_RATIO)
  return sizeBytes + Math.max(STORAGE_SAFETY_MARGIN_BYTES, ratioMargin)
}

async function estimateBrowserStorage(): Promise<BrowserStorageEstimate> {
  if (typeof navigator === 'undefined' || typeof navigator.storage === 'undefined') {
    return {
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null
    }
  }

  if (typeof navigator.storage.estimate !== 'function') {
    return {
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null
    }
  }

  let estimate: StorageEstimate
  try {
    estimate = await navigator.storage.estimate()
  } catch (error) {
    console.error(error)
    return {
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null
    }
  }
  const usageBytes = normalizeBytes(estimate.usage)
  const quotaBytes = normalizeBytes(estimate.quota)
  return {
    usageBytes,
    quotaBytes,
    availableBytes:
      usageBytes !== null && quotaBytes !== null
        ? Math.max(0, quotaBytes - usageBytes)
        : null
  }
}

function errorName(error: Error): string {
  return error.name || 'Error'
}

function errorMessage(error: Error): string {
  return error.message || String(error)
}

async function probeOpfsWritable(sourceId: string): Promise<OpfsProbeResult> {
  if (typeof navigator === 'undefined' || typeof navigator.storage === 'undefined') {
    return {
      writable: false,
      errorName: 'StorageUnavailable',
      errorMessage: 'navigator.storage is unavailable'
    }
  }

  const storage = navigator.storage as StorageManager & {
    /** OPFS 根目录读取函数。 */
    getDirectory?: () => Promise<FileSystemDirectoryHandle>
  }
  if (typeof storage.getDirectory !== 'function') {
    return {
      writable: false,
      errorName: 'OpfsUnavailable',
      errorMessage: 'navigator.storage.getDirectory is unavailable'
    }
  }

  const safeSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  const probeFileName =
    `download_preflight_${safeSourceId}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
  let root: FileSystemDirectoryHandle | null = null
  try {
    root = await storage.getDirectory()
    const handle = await root.getFileHandle(probeFileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(new Uint8Array(OPFS_PROBE_BYTES))
    await writable.close()
    const file = await handle.getFile()
    if (file.size !== OPFS_PROBE_BYTES) {
      return {
        writable: false,
        errorName: 'OpfsProbeSizeMismatch',
        errorMessage: `expected=${OPFS_PROBE_BYTES}, actual=${file.size}`
      }
    }
    return { writable: true }
  } catch (error) {
    console.error(error)
    const cause = error instanceof Error ? error : new Error(String(error))
    return {
      writable: false,
      errorName: errorName(cause),
      errorMessage: errorMessage(cause)
    }
  } finally {
    if (root) {
      try {
        await root.removeEntry(probeFileName)
      } catch (error) {
        console.error(error)
      }
    }
  }
}

/** 检查当前浏览器环境是否适合开始网页端下载。 */
export async function checkDownloadStoragePreflight(
  resource: MediaPost
): Promise<DownloadStoragePreflightResult> {
  const sizeBytes = fileSizeBytes(resource)
  const isClientMux = resource.downloadMode === 'client_mux'
  if (sizeBytes === null && !isClientMux) {
    return {
      ok: true,
      fileSizeBytes: null,
      usageBytes: null,
      quotaBytes: null,
      availableBytes: null,
      requiredBytes: null,
      opfsWritable: null
    }
  }

  // 合并期间输入双轨与输出同时占用磁盘。
  const requiredBytes = sizeBytes === null
    ? null
    : requiredStorageBytes(sizeBytes * (isClientMux ? 2 : 1))
  const estimate = await estimateBrowserStorage()
  if (requiredBytes !== null && estimate.availableBytes !== null && estimate.availableBytes < requiredBytes) {
    return {
      ok: false,
      reason: 'insufficient_storage',
      fileSizeBytes: sizeBytes,
      usageBytes: estimate.usageBytes,
      quotaBytes: estimate.quotaBytes,
      availableBytes: estimate.availableBytes,
      requiredBytes,
      opfsWritable: null
    }
  }

  const probe = await probeOpfsWritable(resource.sourceId)
  const memoryLimit = isClientMux ? CLIENT_MUX_MEMORY_MAX_BYTES : MEMORY_FALLBACK_MAX_BYTES
  if (!probe.writable && (sizeBytes === null || sizeBytes > memoryLimit)) {
    return {
      ok: false,
      reason: 'opfs_unavailable_for_large_file',
      fileSizeBytes: sizeBytes,
      usageBytes: estimate.usageBytes,
      quotaBytes: estimate.quotaBytes,
      availableBytes: estimate.availableBytes,
      requiredBytes,
      opfsWritable: false,
      errorName: probe.errorName,
      errorMessage: probe.errorMessage
    }
  }

  return {
    ok: true,
    fileSizeBytes: sizeBytes,
    usageBytes: estimate.usageBytes,
    quotaBytes: estimate.quotaBytes,
    availableBytes: estimate.availableBytes,
    requiredBytes,
    opfsWritable: probe.writable
  }
}

/** 格式化存储字节数，供下载前提示使用。 */
export function formatStorageBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'unknown'
  }

  if (bytes >= 1024 * MIB) {
    return `${(bytes / (1024 * MIB)).toFixed(1)} GiB`
  }
  if (bytes >= MIB) {
    return `${(bytes / MIB).toFixed(0)} MiB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KiB`
  }
  return `${bytes} B`
}
