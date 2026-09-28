/**
 * DownloadOrchestrator 终态历史回写挂钩测试。
 *
 * 任务到达成功/失败终态时必须回写下载历史（带发起页 URL 与成败状态）；配额拒绝与用户取消
 * 不回写。回写与既有通知挂钩（downloadNotifications）是同一批调用点。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  notifyDownloadFinished: vi.fn(),
  recordDownloadTaskOutcome: vi.fn(),
  checkAndConsume: vi.fn(),
  recordMark: vi.fn(),
  getSettings: vi.fn(),
  onSettingsChanged: vi.fn(),
  resolveVerifiedDirectSource: vi.fn()
}))

vi.mock('@/background/services/downloadNotifications', () => ({
  notifyDownloadFinished: mocks.notifyDownloadFinished
}))

vi.mock('@/background/services/downloadHistoryWriteback', () => ({
  recordDownloadTaskOutcome: mocks.recordDownloadTaskOutcome
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
    title: resourceId,
    filename: `${resourceId}.mp4`,
    documentId: 'vimeo:descriptor-uri:fixture',
    size: 2048,
    metadata: { messageId: '1196869805' }
  }
}

describe('DownloadOrchestrator 终态历史回写挂钩', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue({ downloadPath: 'VimeoDownloader', filenamePattern: '{title}' })
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
    ;(chrome.tabs.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      url: 'https://vimeo.com/1196869805'
    })

    ;({ downloadOrchestrator: orchestrator } = await import(
      '@/background/services/DownloadOrchestrator'
    ))
  })

  it('直连下载完成：回写成功历史并携带发起页 URL', async () => {
    ;(chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 66, state: 'complete' }
    ])

    await orchestrator.enqueueBatch([directResource('r1')], 7)
    await vi.waitFor(() => {
      expect(mocks.recordDownloadTaskOutcome).toHaveBeenCalledTimes(1)
    })

    expect(mocks.recordDownloadTaskOutcome).toHaveBeenCalledWith({
      resource: expect.objectContaining({ id: 'r1' }),
      pageUrl: 'https://vimeo.com/1196869805',
      filename: 'r1.mp4',
      succeeded: true
    })
  })

  it('直连下载中断：回写失败历史', async () => {
    ;(chrome.downloads.search as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 66, state: 'interrupted', error: 'NETWORK_FAILED' }
    ])

    await orchestrator.enqueueBatch([directResource('r1')], 7)
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks[0]?.status).toBe('failed')
    })

    expect(mocks.recordDownloadTaskOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: false })
    )
  })

  it('配额拒绝与等待中取消：不回写历史', async () => {
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

    // 阻塞队首再取消 waiting 任务，两条路径都不应有历史回写。
    mocks.resolveVerifiedDirectSource.mockImplementation(() => new Promise(() => undefined))
    mocks.recordDownloadTaskOutcome.mockClear()
    await orchestrator.enqueueBatch([directResource('r2'), directResource('r3')], 7)
    await vi.waitFor(() => {
      expect(orchestrator.getSnapshot().tasks).toHaveLength(2)
    })
    const waitingTaskId = orchestrator.getSnapshot().tasks[1].taskId
    await orchestrator.cancelTask(waitingTaskId)

    expect(mocks.recordDownloadTaskOutcome).not.toHaveBeenCalled()
  })
})
