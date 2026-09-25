/**
 * Popup 当前目标标签页的未完成下载状态 Store。
 *
 * 初始化先订阅实时快照，再通过固定 tab RPC 取得页面作用域；订阅期间收到的快照按作用域
 * 暂存，避免查询响应与进度事件竞态。后续只接收同一作用域且版本更新的状态。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { DownloadQueueSnapshot, DownloadTaskSnapshot } from '@/core/types'
import type { ExtensionEvents } from '@/core/events/types'
import { ChromeEventSubscriber } from '@/core/rpc/ChromeEventBus'
import { logger } from '@/core/utils/logger'
import { ContentChannel } from '@/popup/rpc/content.rpc'

/** 当前 Popup 的目标页面下载状态。 */
export const useDownloadStatusStore = defineStore('downloadStatus', () => {
  /** 当前页面按创建顺序排列的未完成任务。 */
  const tasks = ref<DownloadTaskSnapshot[]>([])

  /** 当前 content document 生命周期作用域。 */
  const scopeId = ref<string | null>(null)

  /** 最近应用的快照版本。 */
  const revision = ref(-1)

  /** 正在等待取消 RPC 返回的任务 ID，只用于禁用重复点击。 */
  const cancelRequestIds = ref<string[]>([])

  /** Popup 打开后固定使用的目标 tab。 */
  let targetTabId: number | null = null

  /** Popup 生命周期内的 content RPC 客户端。 */
  let contentClient: ContentChannel | null = null

  /** Popup 生命周期内的下载状态事件订阅器。 */
  let eventSubscriber: ChromeEventSubscriber<ExtensionEvents> | null = null

  /** 当前下载状态事件的取消订阅函数。 */
  let eventUnsubscribe: (() => void) | null = null

  /** 初始化 RPC 期间按页面作用域暂存的最新事件。 */
  const pendingSnapshots = new Map<string, DownloadQueueSnapshot>()

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

  /** 订阅并查询 Popup 打开时固定的目标标签页。 */
  async function initialize(tab: chrome.tabs.Tab | null): Promise<void> {
    destroy()
    resetSnapshot()

    targetTabId = tab?.id ?? null
    if (targetTabId === null) {
      return
    }

    contentClient = new ContentChannel()
    eventSubscriber = new ChromeEventSubscriber<ExtensionEvents>()
    eventUnsubscribe = eventSubscriber.on('downloadQueueUpdated', snapshot => {
      if (scopeId.value === null) {
        const pending = pendingSnapshots.get(snapshot.scopeId)
        if (!pending || snapshot.revision > pending.revision) {
          pendingSnapshots.set(snapshot.scopeId, snapshot)
        }
        return
      }
      applySnapshot(snapshot)
    })

    try {
      const initialSnapshot = await contentClient.getDownloadQueue({ tabId: targetTabId })
      scopeId.value = initialSnapshot.scopeId
      applySnapshot(initialSnapshot)

      const pendingSnapshot = pendingSnapshots.get(initialSnapshot.scopeId)
      if (pendingSnapshot) {
        applySnapshot(pendingSnapshot)
      }
    } catch (error) {
      logger.error(`[downloadStatusStore] 查询当前标签页下载任务失败: tabId=${targetTabId}`, error)
    } finally {
      pendingSnapshots.clear()
    }
  }

  /** 转发 UI 已展示的取消操作；任务状态与能力由 DownloadManager 最终裁决。 */
  async function cancelTask(taskId: string): Promise<void> {
    if (targetTabId === null || cancelRequestIds.value.includes(taskId)) {
      return
    }

    cancelRequestIds.value = [...cancelRequestIds.value, taskId]
    try {
      const response = await contentClient?.cancelDownloadTask({ taskId }, { tabId: targetTabId })
      if (response && !response.accepted) {
        const snapshot = await contentClient?.getDownloadQueue({ tabId: targetTabId })
        if (snapshot) {
          applySnapshot(snapshot)
        }
      }
    } catch (error) {
      logger.error(
        `[downloadStatusStore] 取消当前标签页下载任务失败: tabId=${targetTabId}, taskId=${taskId}`,
        error
      )
    } finally {
      cancelRequestIds.value = cancelRequestIds.value.filter(id => id !== taskId)
    }
  }

  /** 按共享任务 ID 重试当前固定目标页的失败项。 */
  async function retryTask(taskId: string): Promise<void> {
    if (targetTabId === null) {
      return
    }

    try {
      const response = await contentClient?.retryDownloadTask({ taskId }, { tabId: targetTabId })
      if (response && !response.accepted) {
        const snapshot = await contentClient?.getDownloadQueue({ tabId: targetTabId })
        if (snapshot) {
          applySnapshot(snapshot)
        }
      }
    } catch (error) {
      logger.error(
        `[downloadStatusStore] 重试当前标签页下载任务失败: tabId=${targetTabId}, taskId=${taskId}`,
        error
      )
    }
  }

  /** 应用同一页面作用域内的新版本快照。 */
  function applySnapshot(snapshot: DownloadQueueSnapshot): void {
    if (snapshot.scopeId !== scopeId.value || snapshot.revision < revision.value) {
      return
    }
    revision.value = snapshot.revision
    tasks.value = snapshot.tasks.map(task => ({ ...task }))
  }

  /** 清理 Popup 生命周期内的 RPC 和事件监听。 */
  function destroy(): void {
    eventUnsubscribe?.()
    eventUnsubscribe = null
    eventSubscriber?.destroy()
    eventSubscriber = null
    contentClient?.destroy()
    contentClient = null
    pendingSnapshots.clear()
  }

  /** 清空上一目标页面的快照身份。 */
  function resetSnapshot(): void {
    tasks.value = []
    scopeId.value = null
    revision.value = -1
    cancelRequestIds.value = []
    targetTabId = null
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
