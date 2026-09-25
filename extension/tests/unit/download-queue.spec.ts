/** 共享下载入口的等待、下载中、进度与完成移除合同。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import { DOWNLOAD_PROGRESS_EVENT } from '@/core/protocol/injected'
import type { DownloadQueueSnapshot, MediaResource } from '@/core/types'

const mocks = vi.hoisted(() => ({
  checkAndConsume: vi.fn(() => Promise.resolve(true)),
  downloadMedia: vi.fn(),
  emit: vi.fn(),
  recordContentMark: vi.fn()
}))

vi.mock('@/core/content/services/QuotaService', () => ({
  quotaService: { checkAndConsume: mocks.checkAndConsume }
}))

vi.mock('@/content/rpc/injectedClient', () => ({
  injectedClient: {
    downloadMedia: mocks.downloadMedia
  }
}))

vi.mock('@/core/rpc/ChromeEventBus', () => ({
  ChromeEventEmitter: class {
    emit = mocks.emit
  }
}))

vi.mock('@/core/content/services/ContentMarkReporter', () => ({
  recordContentMark: mocks.recordContentMark
}))

import { downloadMany, downloadOne, enqueueMany } from '@/core/content/download/download'
import { downloadManager } from '@/core/content/download/downloadManager'

describe('downloadManager', () => {
  beforeEach(() => {
    downloadManager.clearAll()
    mocks.checkAndConsume.mockClear()
    mocks.downloadMedia.mockReset()
    mocks.emit.mockClear()
    mocks.recordContentMark.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('真实失败保留且后项继续，人工重试尾插并永久跳过额度', async () => {
    mocks.downloadMedia
      .mockRejectedValueOnce(new Error('[Injected] stream failed'))
      .mockResolvedValue({ success: true })

    const [failedCompletion, nextCompletion] = downloadManager.enqueue([
      resourceFixture('failed', 0),
      resourceFixture('next', 1)
    ])
    const observedFailure = failedCompletion.catch(error => error)
    await nextCompletion

    await expect(observedFailure).resolves.toMatchObject({ message: '[Injected] stream failed' })
    expect(taskStates(downloadManager.getSnapshot())).toEqual([['failed', 'failed', null]])
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(2)
    expect(downloadManager.cancel(downloadManager.getSnapshot().tasks[0].taskId)).toBe(false)

    let finishActive!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishActive = () => resolve({ success: true })
        })
    )
    const activeCompletion = downloadManager.enqueue([resourceFixture('active', 2)])[0]
    await vi.waitFor(() =>
      expect(taskStates(downloadManager.getSnapshot())).toEqual([
        ['failed', 'failed', null],
        ['active', 'downloading', null]
      ])
    )

    const failedTaskId = downloadManager.getSnapshot().tasks[0].taskId
    expect(downloadManager.retry(failedTaskId)).toBe(true)
    expect(taskStates(downloadManager.getSnapshot())).toEqual([
      ['active', 'downloading', null],
      ['failed', 'waiting', null]
    ])

    finishActive?.()
    await activeCompletion
    await vi.waitFor(() => expect(downloadManager.getSnapshot().tasks).toEqual([]))
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(3)
  })

  it('clearWaiting 一次移除全部等待项并完成调用方 Promise', async () => {
    let finishActive!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishActive = () => resolve({ success: true })
        })
    )
    const completions = downloadManager.enqueue([
      resourceFixture('active', 0),
      resourceFixture('waiting-a', 1),
      resourceFixture('waiting-b', 2)
    ])
    await vi.waitFor(() => expect(downloadManager.getSnapshot().tasks).toHaveLength(3))
    const revisionBeforeClear = downloadManager.getSnapshot().revision

    expect(downloadManager.clearWaiting()).toBe(2)
    await Promise.all(completions.slice(1))
    expect(downloadManager.getSnapshot().revision).toBe(revisionBeforeClear + 1)
    expect(taskStates(downloadManager.getSnapshot())).toEqual([['active', 'downloading', null]])

    finishActive?.()
    await completions[0]
  })

  it('clearAll 移除全部等待与失败任务，已开始的活动任务继续执行', async () => {
    mocks.downloadMedia.mockRejectedValueOnce(new Error('[Injected] first failed'))
    const failedCompletion = downloadManager.enqueue([resourceFixture('failed', 0)])[0]
    await expect(failedCompletion).rejects.toThrow('[Injected] first failed')

    let finishActive!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishActive = () => resolve({ success: true })
        })
    )
    const [activeCompletion, waitingCompletion] = downloadManager.enqueue([
      resourceFixture('active', 1),
      resourceFixture('waiting', 2)
    ])
    await vi.waitFor(() => expect(mocks.downloadMedia).toHaveBeenCalledTimes(2))

    expect(downloadManager.clearAll()).toBe(2)
    await waitingCompletion
    expect(taskStates(downloadManager.getSnapshot())).toEqual([['active', 'downloading', null]])

    finishActive?.()
    await activeCompletion
    expect(downloadManager.getSnapshot().tasks).toEqual([])
  })

  it('多个入口共用一个 FIFO worker，并只接受活动资源的进度', async () => {
    let finishFirst!: (() => void)
    let finishSecond!: (() => void)
    let finishThirdTask!: (() => void)
    mocks.downloadMedia
      .mockImplementationOnce(
        () =>
          new Promise<{ success: true }>(resolve => {
            finishFirst = () => resolve({ success: true })
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ success: true }>(resolve => {
            finishSecond = () => resolve({ success: true })
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ success: true }>(resolve => {
            finishThirdTask = () => resolve({ success: true })
          })
      )

    const first = resourceFixture('first', 0)
    const second = resourceFixture('second', 1)
    const third = resourceFixture('third', 2)
    const batchPromise = downloadMany([first, second])
    const singlePromise = downloadOne(third)

    await vi.waitFor(() => {
      expect(taskStates(downloadManager.getSnapshot())).toEqual([
        ['first', 'downloading', null],
        ['second', 'waiting', null],
        ['third', 'waiting', null]
      ])
    })

    document.dispatchEvent(
      new CustomEvent(DOWNLOAD_PROGRESS_EVENT, {
        detail: progressDetail(downloadManager.getSnapshot().tasks[1].taskId, second.id, 88)
      })
    )
    expect(taskStates(downloadManager.getSnapshot())).toEqual([
      ['first', 'downloading', null],
      ['second', 'waiting', null],
      ['third', 'waiting', null]
    ])

    document.dispatchEvent(
      new CustomEvent(DOWNLOAD_PROGRESS_EVENT, {
        detail: progressDetail(downloadManager.getSnapshot().tasks[0].taskId, first.id, 42.8)
      })
    )
    expect(taskStates(downloadManager.getSnapshot())).toEqual([
      ['first', 'downloading', 42.8],
      ['second', 'waiting', null],
      ['third', 'waiting', null]
    ])

    finishFirst?.()
    await vi.waitFor(() => {
      expect(taskStates(downloadManager.getSnapshot())).toEqual([
        ['second', 'downloading', null],
        ['third', 'waiting', null]
      ])
    })

    document.dispatchEvent(
      new CustomEvent(DOWNLOAD_PROGRESS_EVENT, {
        detail: progressDetail(downloadManager.getSnapshot().tasks[0].taskId, second.id, 150)
      })
    )
    expect(taskStates(downloadManager.getSnapshot())).toEqual([
      ['second', 'downloading', 100],
      ['third', 'waiting', null]
    ])

    finishSecond?.()
    await batchPromise

    await vi.waitFor(() => {
      expect(taskStates(downloadManager.getSnapshot())).toEqual([['third', 'downloading', null]])
    })
    document.dispatchEvent(
      new CustomEvent(DOWNLOAD_PROGRESS_EVENT, {
        detail: progressDetail(downloadManager.getSnapshot().tasks[0].taskId, third.id, 15)
      })
    )
    expect(taskStates(downloadManager.getSnapshot())).toEqual([['third', 'downloading', 15]])

    expect(mocks.downloadMedia).toHaveBeenCalledTimes(3)
    finishThirdTask?.()
    await singlePromise

    expect(downloadManager.getSnapshot().tasks).toEqual([])
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(3)
    expect(mocks.emit).toHaveBeenLastCalledWith(
      'downloadQueueUpdated',
      expect.objectContaining({ tasks: [] })
    )
  })

  it('下载速度固定采样并平滑突发吞吐，无新增字节三秒后主动清空', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    let finishDownload!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishDownload = () => resolve({ success: true })
        })
    )
    const completion = downloadManager.enqueue([resourceFixture('speed-sampling', 0)])[0]
    await vi.advanceTimersByTimeAsync(0)
    expect(downloadManager.getSnapshot().tasks[0]?.status).toBe('downloading')
    const taskId = downloadManager.getSnapshot().tasks[0].taskId

    try {
      dispatchByteProgress(taskId, 'speed-sampling', 0)
      await vi.advanceTimersByTimeAsync(500)
      expect(downloadManager.getSnapshot().tasks[0].bytesPerSecond).toBeNull()

      dispatchByteProgress(taskId, 'speed-sampling', 1024)
      await vi.advanceTimersByTimeAsync(500)
      expect(downloadManager.getSnapshot().tasks[0]).toMatchObject({
        bytesPerSecond: 1024,
        bytesAreEstimated: false
      })

      await vi.advanceTimersByTimeAsync(499)
      dispatchByteProgress(taskId, 'speed-sampling', 5120, true)
      await vi.advanceTimersByTimeAsync(1)
      expect(downloadManager.getSnapshot().tasks[0].bytesPerSecond).toBeCloseTo(2457.6)
      expect(downloadManager.getSnapshot().tasks[0].bytesAreEstimated).toBe(true)

      await vi.advanceTimersByTimeAsync(500)
      expect(downloadManager.getSnapshot().tasks[0].bytesPerSecond).toBeCloseTo(1966.08)

      await vi.advanceTimersByTimeAsync(3000)
      expect(downloadManager.getSnapshot().tasks[0].bytesPerSecond).toBeNull()

      dispatchByteProgress(taskId, 'speed-sampling', 256)
      await vi.advanceTimersByTimeAsync(500)
      dispatchByteProgress(taskId, 'speed-sampling', 768)
      await vi.advanceTimersByTimeAsync(500)
      expect(downloadManager.getSnapshot().tasks[0].bytesPerSecond).toBe(512)
    } finally {
      finishDownload?.()
      await vi.advanceTimersByTimeAsync(0)
      await completion
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('系统时钟小幅回调造成采样间隔不足时保留已展示速度', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    let finishDownload!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishDownload = () => resolve({ success: true })
        })
    )
    const completion = downloadManager.enqueue([resourceFixture('speed-clock-adjustment', 0)])[0]
    await vi.advanceTimersByTimeAsync(0)
    const taskId = downloadManager.getSnapshot().tasks[0].taskId

    try {
      dispatchByteProgress(taskId, 'speed-clock-adjustment', 0)
      await vi.advanceTimersByTimeAsync(500)
      dispatchByteProgress(taskId, 'speed-clock-adjustment', 1024)
      await vi.advanceTimersByTimeAsync(500)
      expect(downloadManager.getSnapshot().tasks[0].bytesPerSecond).toBe(1024)

      mocks.emit.mockClear()
      vi.setSystemTime(1800)
      await vi.advanceTimersByTimeAsync(500)

      expect(downloadManager.getSnapshot().tasks[0].bytesPerSecond).toBe(1024)
      expect(mocks.emit).not.toHaveBeenCalled()
    } finally {
      finishDownload?.()
      await vi.advanceTimersByTimeAsync(0)
      await completion
    }
  })

  it('enqueueMany 在真实任务未完成时已经返回，并继续观察后台失败', async () => {
    let failDownload!: ((error: Error) => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failDownload = reject
        })
    )

    expect(enqueueMany([resourceFixture('background', 0)])).toBeUndefined()
    await vi.waitFor(() => expect(mocks.downloadMedia).toHaveBeenCalledOnce())
    expect(downloadManager.getSnapshot().tasks[0]).toMatchObject({
      resourceId: 'background',
      status: 'downloading'
    })

    failDownload?.(new Error('[Injected] background failed'))
    await vi.waitFor(() =>
      expect(downloadManager.getSnapshot().tasks[0]).toMatchObject({ status: 'failed' })
    )
  })

  it('批内及跨 enqueue 重复资源只保留一个活动任务并共享 completion', async () => {
    let finishActive!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishActive = () => resolve({ success: true })
        })
    )

    const duplicate = resourceFixture('duplicate', 0)
    const completions = downloadManager.enqueue([duplicate, duplicate])
    const crossEnqueueCompletion = downloadManager.enqueue([duplicate])[0]
    await vi.waitFor(() => expect(downloadManager.getSnapshot().tasks).toHaveLength(1))

    expect(completions[0]).toBe(completions[1])
    expect(crossEnqueueCompletion).toBe(completions[0])
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(1)
    expect(
      mocks.recordContentMark.mock.calls.filter(call => call[0] === 'download_click')
    ).toHaveLength(1)

    finishActive?.()
    await Promise.all([...completions, crossEnqueueCompletion])
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(1)
    expect(mocks.downloadMedia).toHaveBeenCalledTimes(1)
  })

  it('waiting 重复入队保持位置与 completion，并用最新材料执行', async () => {
    let finishActive!: (() => void)
    mocks.downloadMedia
      .mockImplementationOnce(
        () =>
          new Promise<{ success: true }>(resolve => {
            finishActive = () => resolve({ success: true })
          })
      )
      .mockRejectedValueOnce(new Error('[Injected] refreshed round failed'))
      .mockResolvedValueOnce({ success: true })

    const active = resourceFixture('active-before-refresh', 0)
    const stale = resourceFixture('refreshable', 1)
    stale.url = 'stream/stale'
    stale.filename = 'stale.mp4'
    const [activeCompletion, waitingCompletion] = downloadManager.enqueue([active, stale])
    await vi.waitFor(() =>
      expect(taskStates(downloadManager.getSnapshot())).toEqual([
        ['active-before-refresh', 'downloading', null],
        ['refreshable', 'waiting', null]
      ])
    )
    const waitingTaskId = downloadManager.getSnapshot().tasks[1].taskId
    const fresh = {
      ...stale,
      index: 7,
      url: 'https://vod-adaptive-ak.vimeocdn.com/fresh/playlist.m3u8',
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO,
      documentId: 'fresh-document',
      filename: 'fresh.mp4'
    }

    const refreshedCompletion = downloadManager.enqueue([fresh])[0]

    expect(refreshedCompletion).toBe(waitingCompletion)
    expect(downloadManager.getSnapshot().tasks[1]).toMatchObject({
      taskId: waitingTaskId,
      resourceIndex: 7,
      filename: 'fresh.mp4',
      status: 'waiting'
    })

    finishActive?.()
    await activeCompletion
    await expect(refreshedCompletion).rejects.toThrow('[Injected] refreshed round failed')
    expect(mocks.downloadMedia.mock.calls[1][0].source).toMatchObject({
      id: 'refreshable',
      url: 'https://vod-adaptive-ak.vimeocdn.com/fresh/playlist.m3u8',
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO,
      documentId: 'fresh-document',
      filename: 'fresh.mp4'
    })

    expect(downloadManager.retry(waitingTaskId)).toBe(true)
    await vi.waitFor(() => expect(downloadManager.getSnapshot().tasks).toEqual([]))
    expect(mocks.downloadMedia.mock.calls[2][0].source).toMatchObject({
      id: 'refreshable',
      url: 'https://vod-adaptive-ak.vimeocdn.com/fresh/playlist.m3u8',
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO,
      documentId: 'fresh-document',
      filename: 'fresh.mp4'
    })
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(2)
  })

  it('downloading 重复入队冻结已启动材料并复用当前 completion', async () => {
    let finishDownload!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishDownload = () => resolve({ success: true })
        })
    )
    const original = resourceFixture('frozen', 0)
    original.url = 'stream/original'
    original.filename = 'original.mp4'
    const originalCompletion = downloadManager.enqueue([original])[0]
    await vi.waitFor(() => expect(mocks.downloadMedia).toHaveBeenCalledOnce())

    const replacement = {
      ...original,
      url: 'stream/replacement',
      filename: 'replacement.mp4'
    }
    const duplicateCompletion = downloadManager.enqueue([replacement])[0]

    expect(duplicateCompletion).toBe(originalCompletion)
    expect(mocks.downloadMedia.mock.calls[0][0].source).toMatchObject({
      url: 'stream/original',
      filename: 'original.mp4'
    })
    finishDownload?.()
    await duplicateCompletion
  })

  it('failed 重复入队恢复同一 task、尾插、免额度并重建 completion', async () => {
    mocks.downloadMedia.mockRejectedValueOnce(new Error('[Injected] first round failed'))
    const firstCompletion = downloadManager.enqueue([resourceFixture('recoverable', 0)])[0]
    await expect(firstCompletion).rejects.toThrow('[Injected] first round failed')
    const failedTaskId = downloadManager.getSnapshot().tasks[0].taskId

    let finishActive!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishActive = () => resolve({ success: true })
        })
    )
    mocks.downloadMedia.mockResolvedValueOnce({ success: true })
    const activeCompletion = downloadManager.enqueue([resourceFixture('active-before-retry', 1)])[0]
    await vi.waitFor(() => expect(downloadManager.getSnapshot().tasks[1].status).toBe('downloading'))

    const fresh = resourceFixture('recoverable', 9)
    fresh.url = 'stream/recovered'
    fresh.filename = 'recovered.mp4'
    const recoveredCompletion = downloadManager.enqueue([fresh])[0]

    expect(recoveredCompletion).not.toBe(firstCompletion)
    expect(downloadManager.getSnapshot().tasks.map(task => task.taskId)).toEqual([
      downloadManager.getSnapshot().tasks[0].taskId,
      failedTaskId
    ])
    expect(downloadManager.getSnapshot().tasks[1]).toMatchObject({
      resourceId: 'recoverable',
      resourceIndex: 9,
      status: 'waiting'
    })

    finishActive?.()
    await Promise.all([activeCompletion, recoveredCompletion])
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(2)
    expect(mocks.downloadMedia.mock.calls[2][0].source).toMatchObject({
      id: 'recoverable',
      url: 'stream/recovered',
      filename: 'recovered.mp4'
    })
  })

  it('显式 retry 重建 completion，重复 enqueue 等待新轮次且再次失败已被观察', async () => {
    mocks.downloadMedia
      .mockRejectedValueOnce(new Error('[Injected] first retry failure'))
      .mockRejectedValueOnce(new Error('[Injected] second retry failure'))
    const resource = resourceFixture('explicit-retry', 0)
    const firstCompletion = downloadManager.enqueue([resource])[0]
    await expect(firstCompletion).rejects.toThrow('[Injected] first retry failure')
    const taskId = downloadManager.getSnapshot().tasks[0].taskId

    expect(downloadManager.retry(taskId)).toBe(true)
    const retryCompletion = downloadManager.enqueue([resource])[0]

    expect(retryCompletion).not.toBe(firstCompletion)
    await expect(retryCompletion).rejects.toThrow('[Injected] second retry failure')
    expect(downloadManager.getSnapshot().tasks[0]).toMatchObject({ taskId, status: 'failed' })
    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(1)
  })

  it('已开始的活动任务拒绝取消，等待项仍可本地移除', async () => {
    let finishActive!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishActive = () => resolve({ success: true })
        })
    )
    const completions = downloadManager.enqueue([
      resourceFixture('active', 0),
      resourceFixture('waiting-local', 1)
    ])
    await vi.waitFor(() => expect(mocks.downloadMedia).toHaveBeenCalledOnce())
    const [activeTask, waitingTask] = downloadManager.getSnapshot().tasks

    expect(downloadManager.cancel(activeTask.taskId)).toBe(false)
    expect(downloadManager.getSnapshot().tasks[0].status).toBe('downloading')

    expect(downloadManager.cancel(waitingTask.taskId)).toBe(true)
    await completions[1]
    expect(taskStates(downloadManager.getSnapshot())).toEqual([['active', 'downloading', null]])

    finishActive?.()
    await completions[0]
    expect(downloadManager.getSnapshot().tasks).toEqual([])
  })

  it('额度检查前先发布解析出的文件名、类型与声明大小', async () => {
    const resource = resourceFixture('resolved-name', 0)
    resource.filename = undefined
    resource.size = 2048
    let snapshotAtQuota!: DownloadQueueSnapshot
    mocks.checkAndConsume.mockImplementationOnce(() => {
      snapshotAtQuota = downloadManager.getSnapshot()
      return Promise.resolve(false)
    })

    await downloadManager.enqueue([resource])[0]

    expect(snapshotAtQuota?.tasks[0]).toMatchObject({
      resourceId: 'resolved-name',
      filename: 'vimeo:1196869805_resolved-name_1.mp4',
      type: RESOURCE_TYPES.VIDEO,
      totalBytes: 2048
    })
    expect(mocks.downloadMedia).not.toHaveBeenCalled()
  })

  it('content 本地订阅立即收到快照并在取消订阅后停止更新', async () => {
    let finishDownload!: (() => void)
    mocks.downloadMedia.mockImplementationOnce(
      () =>
        new Promise<{ success: true }>(resolve => {
          finishDownload = () => resolve({ success: true })
        })
    )
    const receivedSnapshots: DownloadQueueSnapshot[] = []
    const unsubscribe = downloadManager.subscribe(snapshot => receivedSnapshots.push(snapshot))

    expect(receivedSnapshots).toEqual([downloadManager.getSnapshot()])
    const completion = downloadManager.enqueue([resourceFixture('subscribed', 0)])[0]
    await vi.waitFor(() => {
      expect(receivedSnapshots.at(-1)?.tasks[0]).toMatchObject({
        resourceId: 'subscribed',
        status: 'downloading'
      })
    })

    unsubscribe()
    const snapshotCountAfterUnsubscribe = receivedSnapshots.length
    finishDownload?.()
    await completion

    expect(receivedSnapshots).toHaveLength(snapshotCountAfterUnsubscribe)
  })
})

/** 构造顺序可区分的 Vimeo DASH 视频资源。 */
function resourceFixture(id: string, index: number): MediaResource {
  return {
    id,
    messageId: id,
    index,
    url: `https://vod-adaptive-ak.vimeocdn.com/${id}/playlist.json`,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    filename: `${id}.mp4`,
    mimeType: 'video/mp4',
    chatId: 'vimeo:1196869805',
    metadata: { messageId: id }
  }
}

/** 把快照压缩为测试关注的资源、状态和进度。 */
function taskStates(snapshot: DownloadQueueSnapshot): Array<[string, string, number | null]> {
  return snapshot.tasks.map(task => [task.resourceId, task.status, task.progress])
}

/** 构造共享队列可接受的完整进度合同。 */
function progressDetail(taskId: string, sourceId: string, progress: number) {
  return {
    taskId,
    sourceId,
    progress,
    receivedBytes: null,
    totalBytes: null,
    bytesAreEstimated: false
  }
}

/** 向活动任务发送带累计字节的真实进度样本。 */
function dispatchByteProgress(
  taskId: string,
  sourceId: string,
  receivedBytes: number,
  bytesAreEstimated = false
): void {
  document.dispatchEvent(
    new CustomEvent(DOWNLOAD_PROGRESS_EVENT, {
      detail: {
        taskId,
        sourceId,
        progress: null,
        receivedBytes,
        totalBytes: 8192,
        bytesAreEstimated
      }
    })
  )
}
