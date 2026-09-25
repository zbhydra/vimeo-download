/** Content 侧 Chrome 原生下载轮询与刷新测试。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import { downloadWithBrowserManager } from '@/core/content/download/browserDownload'
import { DOWNLOAD_PROGRESS_EVENT, type DownloadProgressDetail } from '@/core/protocol/injected'
import type { MediaResource } from '@/core/types'
import { encodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

const mocks = vi.hoisted(() => ({
  startBrowserDownload: vi.fn(),
  getBrowserDownloadStatus: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    startBrowserDownload = mocks.startBrowserDownload
    getBrowserDownloadStatus = mocks.getBrowserDownloadStatus
  }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: {
    error: mocks.loggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

describe('content browser download coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.startBrowserDownload.mockReset()
    mocks.getBrowserDownloadStatus.mockReset()
    mocks.loggerError.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('轮询 Chrome 字节进度并在完成后上报 100', async () => {
    const progress = collectProgress()
    mocks.startBrowserDownload.mockResolvedValue({ download_id: 71 })
    mocks.getBrowserDownloadStatus
      .mockResolvedValueOnce({
        state: 'in_progress',
        bytes_received: 500,
        total_bytes: 1000
      })
      .mockResolvedValueOnce({
        state: 'complete',
        bytes_received: 1000,
        total_bytes: 1000
      })

    const promise = downloadWithBrowserManager('browser-task-1', resourceFixture(), 'controlled.mp4')
    await vi.advanceTimersByTimeAsync(500)
    await promise

    expect(progress.values).toEqual([null, 50, 100])
    expect(progress.taskIds).toEqual(['browser-task-1', 'browser-task-1', 'browser-task-1'])
    expect(mocks.startBrowserDownload).toHaveBeenCalledWith({
      source: expect.objectContaining({
        source_id: SOURCE_ID,
        url: MEDIA_URL,
        source_kind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
        filename: 'controlled.mp4'
      }),
      refresh_source: false
    })
    progress.stop()
  })

  it('SERVER_FORBIDDEN 时刷新一次 signed config 后重新创建任务', async () => {
    mocks.startBrowserDownload
      .mockResolvedValueOnce({ download_id: 71 })
      .mockResolvedValueOnce({ download_id: 72 })
    mocks.getBrowserDownloadStatus
      .mockResolvedValueOnce({
        state: 'interrupted',
        bytes_received: 0,
        total_bytes: null,
        error: 'SERVER_FORBIDDEN'
      })
      .mockResolvedValueOnce({
        state: 'complete',
        bytes_received: 1000,
        total_bytes: 1000
      })

    await downloadWithBrowserManager('browser-task-1', resourceFixture(), 'controlled.mp4')

    expect(mocks.startBrowserDownload.mock.calls.map(call => call[0].refresh_source)).toEqual([
      false,
      true
    ])
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })

  it('用户取消时抛出可定位错误且不刷新 signed config', async () => {
    mocks.startBrowserDownload.mockResolvedValue({ download_id: 71 })
    mocks.getBrowserDownloadStatus.mockResolvedValue({
      state: 'interrupted',
      bytes_received: 100,
      total_bytes: 1000,
      error: 'USER_CANCELED'
    })

    await expect(
      downloadWithBrowserManager('browser-task-1', resourceFixture(), 'controlled.mp4')
    ).rejects.toThrow('reason=USER_CANCELED')
    expect(mocks.startBrowserDownload).toHaveBeenCalledTimes(1)
  })
})

const VIDEO_ID = '1196869805'
const SOURCE_ID = `vimeo:${VIDEO_ID}:video:progressive:1080p:30`
const MEDIA_URL = 'https://vod-progressive-ak.vimeocdn.com/video/original.mp4?token=signed'
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?signature=config`

/** 构造 Vimeo progressive 页面资源。 */
function resourceFixture(): MediaResource {
  return {
    id: SOURCE_ID,
    messageId: VIDEO_ID,
    index: 0,
    url: MEDIA_URL,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
    filename: 'controlled.mp4',
    mimeType: 'video/mp4',
    documentId: encodeVimeoSourceDescriptor({
      version: 2,
      videoId: VIDEO_ID,
      sourceId: SOURCE_ID,
      optionId: 'progressive:1080p:30',
      kind: 'video',
      delivery: 'progressive',
      label: '1080p MP4',
      configUrl: CONFIG_URL,
      refreshConfigUrl: CONFIG_URL
    }),
    metadata: { messageId: VIDEO_ID }
  }
}

/** 收集当前测试产生的页面进度事件。 */
function collectProgress(): {
  values: Array<number | null>
  taskIds: string[]
  stop: () => void
} {
  const values: Array<number | null> = []
  const taskIds: string[] = []
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<DownloadProgressDetail>).detail
    values.push(detail.progress)
    taskIds.push(detail.taskId)
  }
  document.addEventListener(DOWNLOAD_PROGRESS_EVENT, listener)
  return {
    values,
    taskIds,
    stop: () => document.removeEventListener(DOWNLOAD_PROGRESS_EVENT, listener)
  }
}
