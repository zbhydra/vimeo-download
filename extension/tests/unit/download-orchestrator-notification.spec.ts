/**
 * DownloadOrchestrator 终态通知挂钩测试。
 *
 * 任务到达完成/失败终态时必须调用系统通知工具（完成还伴随 downloadTaskSucceeded 事件），
 * 配额拒绝与用户取消不通知——popup 内已有升级弹窗/用户主动行为，通知会造成打扰。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notifyDownloadFinished: vi.fn(),
  checkAndConsume: vi.fn(),
  recordMark: vi.fn(),
  getSettings: vi.fn(),
  onSettingsChanged: vi.fn(),
  resolveVerifiedDirectSource: vi.fn()
}))

vi.mock('@/background/services/downloadNotifications', () => ({
  notifyDownloadFinished: mocks.notifyDownloadFinished
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
  resolveVerifiedDirectSource: mocks.resolveVerifiedDirectSource
}))

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES, type ResourceSourceKind } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import type { DownloadOrchestrator } from '@/background/services/DownloadOrchestrator'

/** 每个用例拿到全新单例：vi.resetModules 后动态导入。 */
let orchestrator: InstanceType<typeof DownloadOrchestrator>

/** 构造 progressive 直连资源（background 直接 chrome.downloads 执行，链路最短）。 */
function directResource(resourceId: string): MediaResource {
  return {
    id: resourceId,
    messageId: '1196869805',
    index: 0,
    url: `https://vod-progressive.akamaized.net/${resourceId}.mp4`,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4 as ResourceSourceKind,
    mimeType: 'video/mp4',
    filename: `${resourceId}.mp4`,
    documentId: 'vimeo:descriptor-uri:fixture',
    size: 2048,
    metadata: { messageId: '1196869805' }
  }
}

describe('DownloadOrchestrator 终态通知挂钩', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue({ downloadPath: 'VimeoDownloader' })
    mocks.checkAndConsume.mockResolvedValue({
      allowed: true,
      count: 1,
      used: 1,
      remaining: 9,
      status: 1 as const
    })
    mocks.resolveVerifiedDirectSource.mockResolvedValue({
      source_id: 'r1',
      url: 'https://vod-progressive.akamaized.net/r1.mp4',
      type: RESOURCE_TYPES.VIDEO,
      source_kind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
      filename: 'r1.mp4',
      mime_type: 'video/mp4',
      document_id: 'vimeo:descriptor-uri:fixture'
    })
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(66))

    ;({ downloadOrchestrator: orchestrator } = await import(
      '@/background/services/DownloadOrchestrator'
    ))
  })

  it('直连下载完成：发送成功通知并广播成功事件', async () => {
    ;(chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 66, state: 'complete' }
    ])

    await orchestrator.enqueueBatch([directResource('r1')], 1)
    await vi.waitFor(() => {
      expect(mocks.notifyDownloadFinished).toHaveBeenCalledTimes(1)
      expect(mocks.notifyDownloadFinished).toHaveBeenCalledWith({
        filename: 'r1.mp4',
        succeeded: true
      })
    })

    // 成功终态同时向扩展页广播成功事件（popup 用于评分引导计数）。
    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'downloadTaskSucceeded' })
      )
    })
  })

  it('直连下载中断：任务转失败投影并发送失败通知，不发成功事件', async () => {
    ;(chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 66, state: 'interrupted', error: 'NETWORK_FAILED' }
    ])

    await orchestrator.enqueueBatch([directResource('r1')], 1)
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
    })

    expect(mocks.notifyDownloadFinished).toHaveBeenCalledTimes(1)
    expect(mocks.notifyDownloadFinished).toHaveBeenCalledWith({
      filename: 'r1.mp4',
      succeeded: false
    })
    const eventCalls = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => (call[0] as { event?: string })?.event === 'downloadTaskSucceeded'
    )
    expect(eventCalls).toHaveLength(0)
  })

  it('配额拒绝：不启动下载也不发通知', async () => {
    mocks.checkAndConsume.mockResolvedValue({
      allowed: false,
      count: 0,
      used: 5,
      remaining: 0,
      status: 0 as const,
      reset_at: 12345
    })

    await orchestrator.enqueueBatch([directResource('r1')], 33)
    await vi.waitFor(() => {
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        33,
        expect.objectContaining({ event: 'showUpgradeModal' })
      )
    })

    expect(mocks.notifyDownloadFinished).not.toHaveBeenCalled()
    expect(orchestrator.getSnapshot().tasks).toHaveLength(0)
  })

  it('等待中的任务被取消：不发通知', async () => {
    // 阻塞队首，让第二个任务停在 waiting 再取消。
    mocks.resolveVerifiedDirectSource.mockImplementation(
      () => new Promise(() => undefined)
    )

    await orchestrator.enqueueBatch([directResource('r1'), directResource('r2')], 1)
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks).toHaveLength(2)
    })

    const waitingTaskId = orchestrator.getSnapshot().tasks[1].taskId
    await orchestrator.cancelTask(waitingTaskId)

    expect(mocks.notifyDownloadFinished).not.toHaveBeenCalled()
  })
})
