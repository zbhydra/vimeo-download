/** Popup 下载状态 Store 的初始查询与事件竞态（background 是唯一快照作用域）。 */

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

vi.mock('@/popup/rpc/background.rpc', () => ({
  BackgroundChannel: class {
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

  it('保留查询期间的新事件（同作用域最新者胜），并拒绝旧版本快照', async () => {
    let resolveInitial!: (snapshot: DownloadQueueSnapshot) => void
    mocks.getDownloadQueue.mockReturnValue(
      new Promise<DownloadQueueSnapshot>(resolve => {
        resolveInitial = resolve
      })
    )

    const store = useDownloadStatusStore()
    const initializePromise = store.initialize(tabFixture(72))
    await vi.waitFor(() => expect(mocks.handler.value).not.toBeNull())

    const initial = snapshotFixture('background', 3, 30, true)
    // 查询返回前先应用可信事件，较旧的初查结果不覆盖新版本。
    mocks.handler.value?.(snapshotFixture('background', 4, 40, true))
    mocks.handler.value?.(snapshotFixture('background', 5, 50, true))
    resolveInitial?.(initial)
    await initializePromise

    // 数据源为 background 编排队列，查询不再携带 tabId。
    expect(mocks.getDownloadQueue).toHaveBeenCalledWith()
    expect(store.scopeId).toBe('background')
    expect(store.revision).toBe(5)
    expect(store.activeCount).toBe(1)
    expect(store.waitingCount).toBe(1)

    mocks.handler.value?.(snapshotFixture('background', 2, 10, false))
    expect(store.revision).toBe(5)

    mocks.handler.value?.({
      scopeId: 'background',
      revision: 6,
      tasks: [activeTask('active-a', 20), activeTask('active-b', null)]
    })
    expect(store.activeCount).toBe(2)

    await store.cancelTask('active-a')
    expect(mocks.cancelDownloadTask).toHaveBeenCalledWith({ taskId: 'active-a' })

    mocks.handler.value?.({
      scopeId: 'background',
      revision: 7,
      tasks: [failedTask('failed-a')]
    })
    expect(store.failedCount).toBe(1)
    expect(store.totalCount).toBe(1)
    await store.retryTask('failed-a')
    expect(mocks.retryDownloadTask).toHaveBeenCalledWith({ taskId: 'failed-a' })

    store.destroy()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.destroySubscriber).toHaveBeenCalledOnce()
    expect(mocks.destroyClient).toHaveBeenCalledOnce()
  })

  it('初查传输失败后，可信快照仍建立作用域并恢复队列', async () => {
    mocks.getDownloadQueue.mockRejectedValueOnce(new Error('transport failed'))
    const store = useDownloadStatusStore()
    await store.initialize(tabFixture(72))
    expect(store.scopeId).toBeNull()

    mocks.handler.value?.(snapshotFixture('worker-a', 4, 40, false))
    expect(store.scopeId).toBe('worker-a')
    expect(store.revision).toBe(4)
    expect(store.activeCount).toBe(1)
  })

  it('worker 更换作用域后接受较低 revision，随后仍拒绝同 scope 的旧版本', async () => {
    mocks.getDownloadQueue.mockResolvedValueOnce(snapshotFixture('worker-a', 30, 90, false))
    const store = useDownloadStatusStore()
    await store.initialize(tabFixture(72))

    mocks.handler.value?.(snapshotFixture('worker-b', 1, 10, true))
    expect(store.scopeId).toBe('worker-b')
    expect(store.revision).toBe(1)
    expect(store.waitingCount).toBe(1)
    mocks.handler.value?.(snapshotFixture('worker-b', 0, 0, false))
    expect(store.revision).toBe(1)
    expect(store.waitingCount).toBe(1)
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
