/** downloadOne 的额度与协议转换测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'

const mocks = vi.hoisted(() => ({
  checkAndConsume: vi.fn(() => Promise.resolve(true)),
  downloadMedia: vi.fn(() => Promise.resolve({ success: true })),
  downloadWithBrowserManager: vi.fn(() => Promise.resolve()),
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

vi.mock('@/core/content/download/browserDownload', () => ({
  downloadWithBrowserManager: mocks.downloadWithBrowserManager
}))

vi.mock('@/core/content/services/ContentMarkReporter', () => ({
  recordContentMark: mocks.recordContentMark
}))

import { downloadOne } from '@/core/content/download/download'
import { downloadManager } from '@/core/content/download/downloadManager'

describe('downloadOne', () => {
  beforeEach(() => {
    downloadManager.clearAll()
    mocks.checkAndConsume.mockReset()
    mocks.checkAndConsume.mockResolvedValue(true)
    mocks.downloadMedia.mockReset()
    mocks.downloadMedia.mockResolvedValue({ success: true })
    mocks.downloadWithBrowserManager.mockReset()
    mocks.downloadWithBrowserManager.mockResolvedValue()
    mocks.recordContentMark.mockReset()
  })

  it('每次只扣一个额度并发送一次完整下载请求', async () => {
    await downloadOne(dashVideoFixture())

    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(1)
    expect(mocks.checkAndConsume).toHaveBeenCalledWith(1)
    expect(mocks.downloadMedia).toHaveBeenCalledTimes(1)
    expect(mocks.downloadMedia).toHaveBeenCalledWith(
      {
        taskId: expect.any(String),
        source: {
          url: 'https://vod-adaptive-ak.vimeocdn.com/exp=1999999999/1080p.m4s',
          id: 'vimeo:1196869805:video:dash:1080p:30',
          type: RESOURCE_TYPES.VIDEO,
          sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
          page: 'content',
          messageId: '1196869805',
          documentId: 'vimeo:dash-video-descriptor',
          chatId: 'vimeo:1196869805',
          filename: 'demo-video-1080p.mp4',
          size: 16_777_216,
          mimeType: 'video/mp4'
        }
      },
      { timeout: 86400000 }
    )
    expect(mocks.recordContentMark.mock.calls.map(call => call[0])).toEqual([
      'download_click',
      'download_success'
    ])
  })

  it('明确额度不足时结束当前项', async () => {
    mocks.checkAndConsume.mockResolvedValue(false)

    await downloadOne(dashVideoFixture())

    expect(mocks.checkAndConsume).toHaveBeenCalledWith(1)
    expect(mocks.downloadMedia).not.toHaveBeenCalled()
    expect(mocks.recordContentMark.mock.calls.map(call => call[0])).toEqual([
      'download_click',
      'download_quota_insufficient'
    ])
    expect(JSON.parse(mocks.recordContentMark.mock.calls[1][1])).toEqual({
      resource_type: RESOURCE_TYPES.VIDEO,
      source_kind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO
    })
  })

  it('下载失败只上报一次失败事件并包含错误内容', async () => {
    mocks.downloadMedia.mockRejectedValue(
      new Error(
        '[VimeoDownloadService] Vimeo segment fetch 失败: id=vimeo:1196869805, status=403, url=https://vod-adaptive-ak.vimeocdn.com/segment.m4s?token=secret'
      )
    )

    await expect(downloadOne(dashVideoFixture())).rejects.toThrow('status=403')

    expect(mocks.recordContentMark.mock.calls.map(call => call[0])).toEqual([
      'download_click',
      'download_failed'
    ])
    expect(JSON.parse(mocks.recordContentMark.mock.calls[1][1])).toMatchObject({
      error_name: 'Error',
      error_message: expect.stringContaining('status=403'),
      resource_type: RESOURCE_TYPES.VIDEO,
      source_kind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO
    })
  })

  it('前一任务完成移除后同一资源可以再次下载', async () => {
    const resource = dashVideoFixture()

    await downloadOne(resource)
    await downloadOne(resource)

    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(2)
    expect(mocks.downloadMedia).toHaveBeenCalledTimes(2)
  })

  it('Vimeo progressive 通过 Chrome 原生下载且不进入 injected', async () => {
    const resource = dashVideoFixture()
    resource.id = 'vimeo:1196869805:video:progressive:1080p:30'
    resource.url = 'https://vod-progressive-ak.vimeocdn.com/video.mp4?token=signed'
    resource.sourceKind = RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
    resource.filename = 'vimeo-video.mp4'

    await downloadOne(resource)

    expect(mocks.downloadWithBrowserManager).toHaveBeenCalledWith(
      expect.any(String),
      resource,
      'vimeo-video.mp4'
    )
    expect(mocks.downloadMedia).not.toHaveBeenCalled()
  })

  it('缺少文件名时按站点实体与资源序号生成稳定文件名', async () => {
    const resource = dashVideoFixture()
    resource.filename = undefined

    await downloadOne(resource)

    expect(mocks.downloadMedia).toHaveBeenCalledWith(
      {
        taskId: expect.any(String),
        source: expect.objectContaining({
          filename: 'vimeo:1196869805_1196869805_1.mp4'
        })
      },
      { timeout: 86400000 }
    )
  })
})

/** Vimeo DASH 视频资源的最小 fixture。 */
function dashVideoFixture(): MediaResource {
  return {
    id: 'vimeo:1196869805:video:dash:1080p:30',
    messageId: '1196869805',
    index: 0,
    url: 'https://vod-adaptive-ak.vimeocdn.com/exp=1999999999/1080p.m4s',
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    filename: 'demo-video-1080p.mp4',
    size: 16_777_216,
    mimeType: 'video/mp4',
    documentId: 'vimeo:dash-video-descriptor',
    chatId: 'vimeo:1196869805',
    metadata: { messageId: '1196869805' }
  }
}
