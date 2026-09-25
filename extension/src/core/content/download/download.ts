/**
 * Content 共享下载入口。
 *
 * 所有入口只向页面单例 DownloadManager 入队；Manager 的唯一 worker 按 FIFO 串行执行。
 */

import type { MediaResource } from '@/core/types'
import { logger } from '@/core/utils/logger'
import { downloadManager } from './downloadManager'

/**
 * 下载一个资源。
 *
 * @param resource 待下载媒体资源
 */
export async function downloadOne(resource: MediaResource): Promise<void> {
  const [completion] = downloadManager.enqueue([resource])
  await completion
}

/**
 * 按输入顺序逐项下载，当前项失败不阻断后续资源。
 *
 * @param resources 待下载资源；重复 ID 共享当前队列任务
 */
export async function downloadMany(resources: readonly MediaResource[]): Promise<void> {
  await Promise.all(enqueueAndObserve(resources))
}

/**
 * 把整批资源加入 FIFO 后立即返回，并在后台记录每个任务的异步失败。
 *
 * Popup RPC 只承诺资源回查与入队完成；页面内调用方继续使用 downloadMany 等待全部终态。
 */
export function enqueueMany(resources: readonly MediaResource[]): void {
  enqueueAndObserve(resources)
}

/** 入队并把每个 completion 收敛为已观察 Promise，避免异步失败成为未处理拒绝。 */
function enqueueAndObserve(resources: readonly MediaResource[]): Promise<void>[] {
  return downloadManager.enqueue(resources).map((completion, index) =>
    completion.catch(error => {
      logger.error(`[downloadMany] 单项下载失败: resourceId=${resources[index].id}`, error)
    })
  )
}
