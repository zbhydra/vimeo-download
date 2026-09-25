/** Popup 下载状态 Store 的初始查询、事件竞态与页面作用域隔离。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { RESOURCE_TYPES } from '@/core/constants/resource'
import type { DownloadQueueSnapshot } from '@/core/types'
import { useDownloadStatusStore } from '@/popup/stores/downloadStatusStore'

const mocks = vi.hoisted(() => ({
  getDownloadQueue: vi.fn(),
  cancelDownloadTask: vi.fn(),
  retryDownloadTask: vi.fn(),
  destroyClient: vi.fn(),
  destroySubscriber: vi.fn(),
  unsubscribe: vi.fn(),
  handler: {
    value: null as ((snapshot: DownloadQueueSnapshot) => void) | null
  }
}))

vi.mock('@/popup/rpc/content.rpc', () => ({
  ContentChannel: class {
    getDownloadQueue = mocks.getDownloadQueue
    cancelDownloadTask = mocks.cancelDownloadTask
    retryDownloadTask = mocks.retryDownloadTask
    destroy = mocks.destroyClient
  }
}))

vi.mock('@/core/rpc/ChromeEventBus', () => ({
  ChromeEventSubscriber: class {
    on(_event: string, handler: (snapshot: DownloadQueueSnapshot) => void): () => void {
      mocks.handler.value = handler
      return mocks.unsubscribe
    }

    destroy = mocks.destroySubscriber
  }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: { error: vi.fn() }
}))

describe('downloadStatusStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.handler.value = null
    mocks.cancelDownloadTask.mockResolvedValue({ accepted: true })
    mocks.retryDownloadTask.mockResolvedValue({ accepted: true })
  })

  it('保留查询期间的新事件，并拒绝其他页面和旧版本快照', async () => {
    let resolveInitial!: ((snapshot: DownloadQueueSnapshot) => void)
    mocks.getDownloadQueue.mockReturnValue(
      new Promise<DownloadQueueSnapshot>(resolve => {
        resolveInitial = resolve
      })
    )

    const store = useDownloadStatusStore()
    const initializePromise = store.initialize(tabFixture(72))
    await vi.waitFor(() => expect(mocks.handler.value).not.toBeNull())

    const initial = snapshotFixture('target-scope', 3, 30, true)
    const duringQuery = snapshotFixture('target-scope', 4, 40, true)
    mocks.handler.value?.(duringQuery)
    mocks.handler.value?.(snapshotFixture('other-scope', 20, 90, false))
    resolveInitial?.(initial)
    await initializePromise

    expect(mocks.getDownloadQueue).toHaveBeenCalledWith({ tabId: 72 })
    expect(store.scopeId).toBe('target-scope')
    expect(store.revision).toBe(4)
    expect(store.activeCount).toBe(1)
    expect(store.waitingCount).toBe(1)

    mocks.handler.value?.(snapshotFixture('target-scope', 2, 10, false))
    expect(store.revision).toBe(4)

    mocks.handler.value?.({
      scopeId: 'target-scope',
      revision: 5,
      tasks: [
        activeTask('active-a', 20),
        activeTask('active-b', null)
      ]
    })
    expect(store.activeCount).toBe(2)

    await store.cancelTask('active-a')
    expect(mocks.cancelDownloadTask).toHaveBeenCalledWith(
      { taskId: 'active-a' },
      { tabId: 72 }
    )

    mocks.handler.value?.({
      scopeId: 'target-scope',
      revision: 6,
      tasks: [failedTask('failed-a')]
    })
    expect(store.failedCount).toBe(1)
    expect(store.totalCount).toBe(1)
    await store.retryTask('failed-a')
    expect(mocks.retryDownloadTask).toHaveBeenCalledWith(
      { taskId: 'failed-a' },
      { tabId: 72 }
    )

    store.destroy()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.destroySubscriber).toHaveBeenCalledOnce()
    expect(mocks.destroyClient).toHaveBeenCalledOnce()
  })
})

/** 构造固定目标标签页。 */
function tabFixture(id: number): chrome.tabs.Tab {
  return { id, url: 'https://vimeo.com/1196869805', active: true } as chrome.tabs.Tab
}

/** 构造一个下载中和可选等待任务的版本化快照。 */
function snapshotFixture(
  scopeId: string,
  revision: number,
  progress: number,
  includeWaiting: boolean
): DownloadQueueSnapshot {
  return {
    scopeId,
    revision,
    tasks: [
      activeTask('active', progress),
      ...(includeWaiting
        ? [
            {
              taskId: `${scopeId}:waiting`,
              resourceId: 'waiting',
              filename: 'waiting.mp4',
              type: RESOURCE_TYPES.VIDEO,
              resourceIndex: 1,
              status: 'waiting' as const,
              progress: null,
              receivedBytes: null,
              totalBytes: 2048,
              bytesPerSecond: null,
              bytesAreEstimated: false
            }
          ]
        : [])
    ]
  }
}

/** 构造活动下载任务。 */
function activeTask(taskId: string, progress: number | null) {
  return {
    taskId,
    resourceId: taskId,
    filename: `${taskId}.mp4`,
    type: RESOURCE_TYPES.VIDEO,
    resourceIndex: 0,
    status: 'downloading' as const,
    progress,
    receivedBytes: 1024,
    totalBytes: 2048,
    bytesPerSecond: 512,
    bytesAreEstimated: false
  }
}

/** 构造保留在共享列表中的失败任务。 */
function failedTask(taskId: string) {
  return {
    ...activeTask(taskId, null),
    status: 'failed' as const,
    receivedBytes: null,
    bytesPerSecond: null
  }
}
