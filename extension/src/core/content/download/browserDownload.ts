/**
 * Content 侧 Chrome 原生下载协调器。
 *
 * 每次 RPC 只创建任务或读取一次快照，background 不等待大文件；页面存在时轮询状态以
 * 维持按钮进度和顺序批量，页面销毁后 Chrome 下载管理器仍继续写文件。
 */

import type {
  BackgroundBrowserDownloadSource,
  BackgroundGetBrowserDownloadStatusResponse
} from '@/background/types'
import { BackgroundChannel } from '@/content/rpc/background.rpc'
import {
  isBrowserManagedSourceKind,
  type BrowserManagedSourceKind
} from '@/core/constants/resource'
import { reportDownloadProgress } from '@/core/downloadProgress'
import type { MediaResource } from '@/core/types'
import { logger } from '@/core/utils/logger'

/** Chrome 下载状态轮询间隔。 */
const STATUS_POLL_INTERVAL_MS = 500

/** 页面仍存在时等待单项完成的最长时间。 */
const BROWSER_DOWNLOAD_TIMEOUT_MS = 24 * 60 * 60 * 1000

/** 可由刷新 Vimeo signed config 修复的 Chrome 服务端错误。 */
const REFRESHABLE_INTERRUPT_REASONS = new Set([
  'SERVER_FAILED',
  'SERVER_UNAUTHORIZED',
  'SERVER_FORBIDDEN'
])

/** content 调用 background 的模块级具体客户端。 */
const backgroundClient = new BackgroundChannel()

/** Chrome 下载被中断。 */
class BrowserDownloadInterruptedError extends Error {
  /** Chrome InterruptReason。 */
  readonly reason: string

  constructor(downloadId: number, reason: string) {
    super(`[BrowserDownload] Chrome 原生下载中断: downloadId=${downloadId}, reason=${reason}`)
    this.name = 'BrowserDownloadInterruptedError'
    this.reason = reason
  }
}

/**
 * 创建并等待一个浏览器原生下载。
 *
 * 等待只服务当前页面 UI 与顺序批量；导航导致等待终止时，Chrome 持有的任务不受影响。
 */
export async function downloadWithBrowserManager(
  taskId: string,
  resource: MediaResource,
  filename: string
): Promise<void> {
  if (!isBrowserManagedSourceKind(resource.sourceKind)) {
    throw new Error(
      `[BrowserDownload] 来源不支持 Chrome 原生下载: sourceId=${resource.id}, sourceKind=${resource.sourceKind}`
    )
  }

  const sourceKind = resource.sourceKind
  const source = toBrowserDownloadSource(resource, filename, sourceKind)
  let refreshSource = false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    reportDownloadProgress({
      taskId,
      sourceId: resource.id,
      progress: null,
      receivedBytes: null,
      totalBytes: null,
      bytesAreEstimated: false
    })
    try {
      const started = await backgroundClient.startBrowserDownload({
        source,
        refresh_source: refreshSource
      })
      await waitForBrowserDownload(taskId, started.download_id, resource, sourceKind)
      return
    } catch (error) {
      const canRefresh =
        !refreshSource &&
        error instanceof BrowserDownloadInterruptedError &&
        REFRESHABLE_INTERRUPT_REASONS.has(error.reason)
      logger.error(
        `[BrowserDownload] Vimeo 原生下载失败: sourceId=${resource.id}, refreshSource=${refreshSource}`,
        error
      )
      if (canRefresh) {
        refreshSource = true
        continue
      }
      throw error
    }
  }
}

/** 轮询短 RPC，直到 Chrome 下载完成或明确中断。 */
async function waitForBrowserDownload(
  taskId: string,
  downloadId: number,
  resource: MediaResource,
  sourceKind: BrowserManagedSourceKind
): Promise<void> {
  const deadline = Date.now() + BROWSER_DOWNLOAD_TIMEOUT_MS
  let lastProgress: number | null = null

  while (Date.now() < deadline) {
    const status = await backgroundClient.getBrowserDownloadStatus({
      download_id: downloadId,
      source_kind: sourceKind
    })
    if (status.state === 'complete') {
      reportDownloadProgress({
        taskId,
        sourceId: resource.id,
        progress: 100,
        receivedBytes: null,
        totalBytes: null,
        bytesAreEstimated: false
      })
      return
    }
    if (status.state === 'interrupted') {
      throw new BrowserDownloadInterruptedError(downloadId, status.error ?? 'UNKNOWN')
    }

    const progress = calculateProgress(status)
    if (progress !== lastProgress) {
      reportDownloadProgress({
        taskId,
        sourceId: resource.id,
        progress,
        receivedBytes: null,
        totalBytes: null,
        bytesAreEstimated: false
      })
      lastProgress = progress
    }
    await delay(STATUS_POLL_INTERVAL_MS)
  }

  throw new Error(
    `[BrowserDownload] 等待 Chrome 原生下载超时: sourceId=${resource.id}, downloadId=${downloadId}, timeoutMs=${BROWSER_DOWNLOAD_TIMEOUT_MS}`
  )
}

/** 从 Chrome 下载快照计算页面按钮进度，网络读取阶段最高为 99。 */
function calculateProgress(status: BackgroundGetBrowserDownloadStatusResponse): number | null {
  if (status.total_bytes === null || status.total_bytes <= 0) {
    return null
  }
  return Math.min(99, Math.floor((status.bytes_received / status.total_bytes) * 100))
}

/** 把页面资源收敛成 background 允许的最小直连合同。 */
function toBrowserDownloadSource(
  resource: MediaResource,
  filename: string,
  sourceKind: BrowserManagedSourceKind
): BackgroundBrowserDownloadSource {
  if (!resource.mimeType || !resource.documentId) {
    throw new Error(
      `[BrowserDownload] Vimeo 直连资源缺少 MIME 或 descriptor: sourceId=${resource.id}, mimeType=${resource.mimeType ?? 'missing'}, documentId=${resource.documentId ? 'present' : 'missing'}`
    )
  }

  return {
    source_id: resource.id,
    url: resource.url,
    type: resource.type,
    source_kind: sourceKind,
    filename,
    mime_type: resource.mimeType,
    document_id: resource.documentId
  }
}

/** 不阻塞 Service Worker 的 content 轮询延迟。 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}
