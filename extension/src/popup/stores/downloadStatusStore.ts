/**
 * Popup 底部下载队列 Store。
 *
 * 下载统一由 background 编排器驱动，数据源是 background 编排快照（getDownloadQueue RPC +
 * downloadQueueUpdated 事件）；取消与重试同样发 background，下载中任务由编排器按执行通道
 * （Chrome downloads.cancel / offscreen cancelTask）转发取消。快照作用域恒为 background
 * 全局队列，不区分页面。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { DownloadQueueSnapshot, DownloadTaskSnapshot } from '@/core/types'
import type { ExtensionEvents } from '@/core/events/types'
import { ChromeEventSubscriber } from '@/core/rpc/ChromeEventBus'
import { logger } from '@/core/utils/logger'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'

/** 当前 Popup 的全局下载队列投影。 */
export const useDownloadStatusStore = defineStore('downloadStatus', () => {
  /** 全局按创建顺序排列的未完成任务。 */
  const tasks = ref<DownloadTaskSnapshot[]>([])

  /** 当前 background worker 生命周期作用域。 */
  const scopeId = ref<string | null>(null)

  /** 最近应用的快照版本。 */
  const revision = ref(-1)

  /** 正在等待取消 RPC 返回的任务 ID，只用于禁用重复点击。 */
  const cancelRequestIds = ref<string[]>([])

  /** Popup 生命周期内的 background RPC 客户端。 */
  let backgroundClient: BackgroundChannel | null = null

  /** Popup 生命周期内的下载状态事件订阅器。 */
  let eventSubscriber: ChromeEventSubscriber<ExtensionEvents> | null = null

  /** 当前下载状态事件的取消订阅函数。 */
  let eventUnsubscribe: (() => void) | null = null

  /** 正在下载的任务。 */
  const activeTasks = computed(() => tasks.value.filter(task => task.status === 'downloading'))

  /** 尚未轮到的任务。 */
  const waitingTasks = computed(() => tasks.value.filter(task => task.status === 'waiting'))

  /** 已失败并等待用户人工重试的任务。 */
  const failedTasks = computed(() => tasks.value.filter(task => task.status === 'failed'))

  /** 正在下载数量。 */
  const activeCount = computed(() => activeTasks.value.length)

  /** 当前下载中的任务数量。 */
  const currentCount = computed(() => activeTasks.value.length)

  /** 等待中数量。 */
  const waitingCount = computed(() => waitingTasks.value.length)

  /** 失败数量。 */
  const failedCount = computed(() => failedTasks.value.length)

  /** 未完成任务总数。 */
  const totalCount = computed(() => tasks.value.length)

  /** 顶部入口是否需要显示。 */
  const hasTasks = computed(() => totalCount.value > 0)

  /** 当前下载中任务的整体进度。 */
  const currentProgress = computed<number | null>(() => {
    if (activeTasks.value.length === 0) {
      return null
    }

    let totalProgress = 0
    for (const task of activeTasks.value) {
      if (task.progress === null) {
        return null
      }
      totalProgress += task.progress
    }
    return Math.floor(totalProgress / activeTasks.value.length)
  })

  /** 订阅实时快照并查询 background 编排队列。 */
  async function initialize(_tab: chrome.tabs.Tab | null): Promise<void> {
    destroy()
    resetSnapshot()

    backgroundClient = new BackgroundChannel()
    eventSubscriber = new ChromeEventSubscriber<ExtensionEvents>()
    eventUnsubscribe = eventSubscriber.on('downloadQueueUpdated', applySnapshot)

    try {
      const initialSnapshot = await backgroundClient.getDownloadQueue()
      applySnapshot(initialSnapshot)
    } catch (error) {
      logger.error('[downloadStatusStore] 查询下载编排队列失败', error)
    }
  }

  /** 转发 UI 已展示的取消操作；任务状态与能力由 background 编排器最终裁决。 */
  async function cancelTask(taskId: string): Promise<void> {
    if (cancelRequestIds.value.includes(taskId)) {
      return
    }

    cancelRequestIds.value = [...cancelRequestIds.value, taskId]
    try {
      const response = await backgroundClient?.cancelDownloadTask({ taskId })
      if (response && !response.accepted) {
        const snapshot = await backgroundClient?.getDownloadQueue()
        if (snapshot) {
          applySnapshot(snapshot)
        }
      }
    } catch (error) {
      logger.error(`[downloadStatusStore] 取消下载任务失败: taskId=${taskId}`, error)
    } finally {
      cancelRequestIds.value = cancelRequestIds.value.filter(id => id !== taskId)
    }
  }

  /** 按编排任务 ID 重试失败项。 */
  async function retryTask(taskId: string): Promise<void> {
    try {
      const response = await backgroundClient?.retryDownloadTask({ taskId })
      if (response && !response.accepted) {
        const snapshot = await backgroundClient?.getDownloadQueue()
        if (snapshot) {
          applySnapshot(snapshot)
        }
      }
    } catch (error) {
      logger.error(`[downloadStatusStore] 重试下载任务失败: taskId=${taskId}`, error)
    }
  }

  /** 同一 worker 拒绝旧版本，新 worker 用自己的 revision 重新开始。 */
  function applySnapshot(snapshot: DownloadQueueSnapshot): void {
    if (snapshot.scopeId === scopeId.value && snapshot.revision < revision.value) {
      return
    }
    scopeId.value = snapshot.scopeId
    revision.value = snapshot.revision
    tasks.value = snapshot.tasks.map(task => ({ ...task }))
  }

  /** 清理 Popup 生命周期内的 RPC 和事件监听。 */
  function destroy(): void {
    eventUnsubscribe?.()
    eventUnsubscribe = null
    eventSubscriber?.destroy()
    eventSubscriber = null
    backgroundClient?.destroy()
    backgroundClient = null
  }

  /** 清空上一 Popup 订阅的快照身份。 */
  function resetSnapshot(): void {
    tasks.value = []
    scopeId.value = null
    revision.value = -1
    cancelRequestIds.value = []
  }

  return {
    tasks,
    scopeId,
    revision,
    activeTasks,
    failedTasks,
    waitingTasks,
    activeCount,
    currentCount,
    waitingCount,
    failedCount,
    totalCount,
    hasTasks,
    currentProgress,
    cancelRequestIds,
    initialize,
    cancelTask,
    retryTask,
    destroy
  }
})
