/**
 * DownloadOrchestrator 单元测试。
 *
 * 覆盖入队去重与全局单并发、配额拒绝与升级弹窗通知、offscreen 产物交付的落盘回执、
 * 取消/失败/重试投影，以及 SW 冷启动对账（以 offscreen 活跃任务为准重建编排表）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  offscreenStartTask: vi.fn(),
  offscreenCancelTask: vi.fn(),
  offscreenListActiveTasks: vi.fn(),
  offscreenReleaseTaskArtifact: vi.fn(),
  ensureOffscreenDocument: vi.fn(),
  hasOffscreenDocument: vi.fn(),
  checkAndConsume: vi.fn(),
  recordMark: vi.fn(),
  getSettings: vi.fn(),
  onSettingsChanged: vi.fn()
}))

vi.mock('@/background/rpc/offscreen.rpc', () => ({
  OffscreenChannel: class {
    startTask = mocks.offscreenStartTask
    cancelTask = mocks.offscreenCancelTask
    listActiveTasks = mocks.offscreenListActiveTasks
    releaseTaskArtifact = mocks.offscreenReleaseTaskArtifact
  }
}))

vi.mock('@/background/services/offscreenDocument', () => ({
  ensureOffscreenDocument: mocks.ensureOffscreenDocument,
  hasOffscreenDocument: mocks.hasOffscreenDocument
}))

vi.mock('@/core/api/quota', () => ({
  quotaApi: {
    checkAndConsume: mocks.checkAndConsume
  }
}))

vi.mock('@/background/services/ExtensionMarkReporter', () => ({
  recordBackgroundMark: mocks.recordMark
}))

vi.mock('@/core/storage/settings', () => ({
  SettingsManager: {
    getSettings: mocks.getSettings,
    onSettingsChanged: mocks.onSettingsChanged
  },
  DEFAULT_DOWNLOAD_PATH: 'VimeoDownloader'
}))

vi.mock('@/background/services/directSource', () => ({
  resolveVerifiedDirectSource: vi.fn()
}))

import {
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  type ResourceSourceKind
} from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import type { DownloadOrchestrator } from '@/background/services/DownloadOrchestrator'

/** 每个用例拿到全新单例：vi.resetModules 后动态导入。 */
let orchestrator: InstanceType<typeof DownloadOrchestrator>

/** 构造 DASH 视频资源。 */
function resourceFixture(resourceId: string): MediaResource {
  return {
    id: resourceId,
    messageId: '1196869805',
    index: 0,
    url: `https://vod-adaptive-ak.vimeocdn.com/${resourceId}.m4s`,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    mimeType: 'video/mp4',
    filename: `${resourceId}.mp4`,
    documentId: 'vimeo:descriptor-uri:fixture',
    size: 2048,
    metadata: { messageId: '1196869805' }
  }
}

/** 捕获 downloads.onChanged 最近注册的监听器。 */
function latestOnChangedListener(): (delta: { id: number; state?: { current: string } }) => void {
  const addListener = chrome.downloads.onChanged.addListener as ReturnType<typeof vi.fn>
  const latestCall = addListener.mock.calls.at(-1)
  if (!latestCall) {
    throw new Error('[download-orchestrator.spec] onChanged listener not registered')
  }
  return latestCall[0] as (delta: { id: number; state?: { current: string } }) => void
}

describe('DownloadOrchestrator', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.ensureOffscreenDocument.mockResolvedValue(undefined)
    mocks.hasOffscreenDocument.mockResolvedValue(false)
    mocks.checkAndConsume.mockResolvedValue({
      allowed: true,
      count: 1,
      used: 1,
      remaining: 9,
      status: 1 as const
    })
    mocks.getSettings.mockResolvedValue({ downloadPath: 'VimeoDownloader' })
    mocks.offscreenStartTask.mockResolvedValue({ started: true })
    mocks.offscreenCancelTask.mockResolvedValue({ accepted: true })
    mocks.offscreenListActiveTasks.mockResolvedValue({ tasks: [] })
    mocks.offscreenReleaseTaskArtifact.mockResolvedValue({ released: true })
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(55))

    ;({ downloadOrchestrator: orchestrator } = await import('@/background/services/DownloadOrchestrator'))
  })

  it('同资源去重合并，全局单并发：首任务未终态前不启动第二个', async () => {
    const first = resourceFixture('r1')
    const second = resourceFixture('r2')

    const batch = await orchestrator.enqueueBatch([first, second], 1)
    expect(batch).toEqual({ accepted: true, count: 2 })
    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)
    })
    expect(mocks.offscreenStartTask).toHaveBeenCalledWith({
      taskId: expect.any(String),
      resource: first
    })
    expect(orchestrator.getSnapshot().tasks.map(task => task.status)).toEqual([
      'downloading',
      'waiting'
    ])

    const duplicate = await orchestrator.enqueueBatch([first], 1)
    expect(duplicate).toEqual({ accepted: true, count: 1 })
    expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)

    // 首任务交付并落盘完成后，队列推进到第二个任务。
    const activeTaskId = orchestrator.getSnapshot().tasks[0].taskId
    const complete = orchestrator.handleTaskComplete({
      taskId: activeTaskId,
      blobUrl: 'blob:fixture-blob',
      filename: 'r1.mp4',
      mimeType: 'video/mp4'
    })
    await vi.waitFor(() => {
      latestOnChangedListener()({ id: 55, state: { current: 'complete' } })
    })
    await complete

    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(2)
    })
    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.tasks).toHaveLength(1)
    expect(snapshot.tasks[0].resourceId).toBe('r2')
    expect(mocks.offscreenReleaseTaskArtifact).toHaveBeenCalledWith({
      taskId: activeTaskId,
      blobUrl: 'blob:fixture-blob'
    })
  })

  it('产物落盘走保存位置子目录并使用 uniquify', async () => {
    await orchestrator.enqueueBatch([resourceFixture('r1')], 1)
    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)
    })
    const activeTaskId = orchestrator.getSnapshot().tasks[0].taskId

    const complete = orchestrator.handleTaskComplete({
      taskId: activeTaskId,
      blobUrl: 'blob:fixture-blob',
      filename: 'r1.mp4',
      mimeType: 'video/mp4'
    })
    await vi.waitFor(() => {
      latestOnChangedListener()({ id: 55, state: { current: 'complete' } })
    })
    await complete

    expect(chrome.downloads.download).toHaveBeenCalledWith({
      url: 'blob:fixture-blob',
      filename: 'VimeoDownloader/r1.mp4',
      conflictAction: 'uniquify',
      saveAs: false
    })
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
    })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      'download_success',
      expect.any(String)
    )
  })

  it('配额拒绝时不启动下载，通知发起 tab 显示升级弹窗并记录打点', async () => {
    mocks.checkAndConsume.mockResolvedValue({
      allowed: false,
      count: 0,
      used: 5,
      remaining: 0,
      status: 0 as const,
      reset_at: 12345
    })

    await orchestrator.enqueueBatch([resourceFixture('r1')], 33)

    expect(mocks.offscreenStartTask).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        33,
        expect.objectContaining({ event: 'showUpgradeModal', data: { resetAt: 12345 } })
      )
    })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      'download_quota_insufficient',
      expect.any(String)
    )
    expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
  })

  it('配额 API 异常时 fail-open 允许下载，不弹升级窗', async () => {
    mocks.checkAndConsume.mockRejectedValue(new Error('quota api unavailable'))

    await orchestrator.enqueueBatch([resourceFixture('r1')], 33)

    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)
    })
    expect(orchestrator.getSnapshot().tasks[0].status).toBe('downloading')
    const tabCalls = (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mock.calls
    expect(tabCalls).not.toContainEqual([33, expect.objectContaining({ event: 'showUpgradeModal' })])
  })

  it('等待任务可直接取消；执行中任务经 offscreen 取消确认后移除', async () => {
    await orchestrator.enqueueBatch([resourceFixture('r1'), resourceFixture('r2')], 1)
    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.tasks.map(task => task.status)).toEqual(['downloading', 'waiting'])

    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)
    })
    const waitingTaskId = snapshot.tasks[1].taskId
    expect(await orchestrator.cancelTask(waitingTaskId)).toBe(true)
    expect(orchestrator.getSnapshot().tasks).toHaveLength(1)

    const activeTaskId = orchestrator.getSnapshot().tasks[0].taskId
    expect(await orchestrator.cancelTask(activeTaskId)).toBe(true)
    expect(mocks.offscreenCancelTask).toHaveBeenCalledWith({ taskId: activeTaskId })
    await orchestrator.handleTaskCancelled({ taskId: activeTaskId })
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
    })
    expect(mocks.recordMark).not.toHaveBeenCalledWith('download_failed', expect.any(String))
  })

  it('offscreen 失败回传转为 failed 投影；重试重新入队并跳过配额', async () => {
    await orchestrator.enqueueBatch([resourceFixture('r1')], 1)
    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)
    })
    const activeTaskId = orchestrator.getSnapshot().tasks[0].taskId

    await orchestrator.handleTaskFailed({ taskId: activeTaskId, message: 'segment 403' })
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
    })

    const failedSnapshot = orchestrator.getSnapshot()
    expect(failedSnapshot.tasks).toHaveLength(1)
    expect(failedSnapshot.tasks[0].status).toBe('failed')
    expect(mocks.recordMark).toHaveBeenCalledWith('download_failed', expect.any(String))

    mocks.checkAndConsume.mockClear()
    expect(orchestrator.retryTask(activeTaskId)).toBe(true)
    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(2)
    })
    expect(mocks.checkAndConsume).not.toHaveBeenCalled()
  })

  it('SW 冷启动对账：以 offscreen 活跃任务为准重建投影，不重复跟踪', async () => {
    mocks.hasOffscreenDocument.mockResolvedValue(true)
    const liveResource = resourceFixture('r-live')
    mocks.offscreenListActiveTasks.mockResolvedValue({
      tasks: [
        {
          taskId: 'bg-live-1',
          resourceId: 'r-live',
          progress: 42,
          receivedBytes: 1024,
          totalBytes: 2048,
          resource: liveResource
        }
      ]
    })

    await orchestrator.reconcile()

    const snapshot = orchestrator.getSnapshot()
    expect(snapshot.tasks).toHaveLength(1)
    expect(snapshot.tasks[0]).toMatchObject({
      taskId: 'bg-live-1',
      resourceId: 'r-live',
      status: 'downloading',
      progress: 42,
      receivedBytes: 1024,
      totalBytes: 2048
    })

    // offscreen 回传进度：对账后的任务直接接续投影。
    await orchestrator.handleTaskProgress({
      taskId: 'bg-live-1',
      sourceId: 'r-live',
      progress: 50,
      receivedBytes: 1100,
      totalBytes: 2048
    })
    expect(orchestrator.getSnapshot().tasks[0].progress).toBe(50)
  })

  it('没有 offscreen document 时不发起对账查询', async () => {
    await orchestrator.reconcile()

    expect(mocks.offscreenListActiveTasks).not.toHaveBeenCalled()
    expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
  })

  it('不支持编排下载的来源直接拒绝整批请求', async () => {
    const subtitle: MediaResource = {
      ...resourceFixture('r-srt'),
      type: RESOURCE_TYPES.SUBTITLE,
      // 越界来源是刻意构造的非法输入，用于验证编排器整批拒绝。
      sourceKind: 'unknown_source_kind' as ResourceSourceKind
    }

    await expect(orchestrator.enqueueBatch([subtitle], 1)).rejects.toThrow(
      /不支持编排下载/
    )
    expect(mocks.offscreenStartTask).not.toHaveBeenCalled()
  })

  it('取消转发失败记墓碑后，offscreen 迟到产物交付被拒绝且不落盘', async () => {
    mocks.offscreenCancelTask.mockRejectedValueOnce(new Error('RpcTargetNotFoundError'))
    await orchestrator.enqueueBatch([resourceFixture('r1')], 1)
    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)
    })
    const taskId = orchestrator.getSnapshot().tasks[0].taskId

    await orchestrator.cancelTask(taskId)
    // 转发失败本地终止：任务先从投影移除。
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
    })
    expect(mocks.offscreenCancelTask).toHaveBeenCalledWith({ taskId })

    // offscreen 实际存活且仍在执行；对账查询时它仍上报为活跃任务。
    mocks.hasOffscreenDocument.mockResolvedValue(true)
    mocks.offscreenListActiveTasks.mockResolvedValue({
      tasks: [
        {
          taskId,
          resourceId: 'r1',
          progress: 99,
          receivedBytes: 2000,
          totalBytes: 2048,
          resource: resourceFixture('r1')
        }
      ]
    })

    await orchestrator.handleTaskComplete({
      taskId,
      blobUrl: 'blob:late-delivery',
      filename: 'r1.mp4',
      mimeType: 'video/mp4'
    })

    // 迟到交付不落盘：产物释放、投影保持为空；对账趁机补发取消而不是复活任务。
    expect(chrome.downloads.download).not.toHaveBeenCalled()
    expect(mocks.offscreenReleaseTaskArtifact).toHaveBeenCalledWith({
      taskId,
      blobUrl: 'blob:late-delivery'
    })
    expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
    expect(mocks.offscreenCancelTask).toHaveBeenLastCalledWith({ taskId })
  })

  it('对账遇取消墓碑任务：补发取消且不复活为可执行任务', async () => {
    mocks.offscreenCancelTask.mockRejectedValueOnce(new Error('RpcTargetNotFoundError'))
    await orchestrator.enqueueBatch([resourceFixture('r1')], 1)
    await vi.waitFor(() => {
      expect(mocks.offscreenStartTask).toHaveBeenCalledTimes(1)
    })
    const taskId = orchestrator.getSnapshot().tasks[0].taskId

    await orchestrator.cancelTask(taskId)
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
    })

    // offscreen 实际仍在执行，SW 唤醒对账；补发取消成功。
    mocks.hasOffscreenDocument.mockResolvedValue(true)
    mocks.offscreenListActiveTasks.mockResolvedValue({
      tasks: [
        {
          taskId,
          resourceId: 'r1',
          progress: 60,
          receivedBytes: 1200,
          totalBytes: 2048,
          resource: resourceFixture('r1')
        }
      ]
    })
    await orchestrator.reconcile()

    expect(mocks.offscreenCancelTask).toHaveBeenLastCalledWith({ taskId })
    expect(orchestrator.getSnapshot().tasks).toHaveLength(0)

    // offscreen 接受补发取消后中止任务：后续进度回传不再投影。
    mocks.offscreenListActiveTasks.mockResolvedValue({ tasks: [] })
    expect(
      await orchestrator.handleTaskProgress({
        taskId,
        sourceId: 'r1',
        progress: 70,
        receivedBytes: 1400,
        totalBytes: 2048
      })
    ).toEqual({ recorded: false })
    expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
  })
})
