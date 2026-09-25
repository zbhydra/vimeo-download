/** downloadMany 的顺序、容错与资源排重测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'

/** 下载链路断言需要读取 injected downloadMedia 的请求体，这里固定最小形状。 */
interface DownloadMediaParams {
  source: { id: string }
}

const mocks = vi.hoisted(() => ({
  checkAndConsume: vi.fn(() => Promise.resolve(true)),
  downloadMedia: vi.fn<(params: DownloadMediaParams) => Promise<{ success: true }>>(() =>
    Promise.resolve({ success: true })
  ),
  loggerError: vi.fn(),
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

vi.mock('@/core/utils/logger', () => ({
  logger: { error: mocks.loggerError }
}))

vi.mock('@/core/content/services/ContentMarkReporter', () => ({
  recordContentMark: mocks.recordContentMark
}))

import { downloadMany } from '@/core/content/download/download'
import { downloadManager } from '@/core/content/download/downloadManager'

describe('downloadMany', () => {
  beforeEach(() => {
    downloadManager.clearAll()
    mocks.checkAndConsume.mockReset()
    mocks.checkAndConsume.mockResolvedValue(true)
    mocks.downloadMedia.mockReset()
    mocks.downloadMedia.mockResolvedValue({ success: true })
    mocks.loggerError.mockReset()
    mocks.recordContentMark.mockReset()
  })

  it('严格按输入顺序逐项扣额并下载', async () => {
    await downloadMany([resourceFixture('first'), resourceFixture('second')])

    expect(mocks.checkAndConsume.mock.calls).toEqual([[1], [1]])
    expect(mocks.downloadMedia.mock.calls.map(call => call[0].source.id)).toEqual([
      'first',
      'second'
    ])
  })

  it('中间项下载失败时记录资源 ID 并继续后续项', async () => {
    mocks.downloadMedia
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('[VimeoDownloadService] Vimeo segment fetch 失败: status=403'))
      .mockResolvedValueOnce({ success: true })

    await downloadMany([
      resourceFixture('first'),
      resourceFixture('second'),
      resourceFixture('third')
    ])

    expect(mocks.downloadMedia.mock.calls.map(call => call[0].source.id)).toEqual([
      'first',
      'second',
      'third'
    ])
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining('resourceId=second'),
      expect.objectContaining({
        message: expect.stringContaining('status=403')
      })
    )
  })

  it('批内重复资源共享一次额度与真实下载，输入 Promise 全部完成', async () => {
    const duplicate = resourceFixture('duplicate')

    await downloadMany([duplicate, duplicate])

    expect(mocks.checkAndConsume).toHaveBeenCalledTimes(1)
    expect(mocks.downloadMedia).toHaveBeenCalledTimes(1)
  })

  it('明确额度不足只跳过当前项', async () => {
    mocks.checkAndConsume
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    await downloadMany([
      resourceFixture('first'),
      resourceFixture('second'),
      resourceFixture('third')
    ])

    expect(mocks.downloadMedia.mock.calls.map(call => call[0].source.id)).toEqual([
      'first',
      'third'
    ])
  })
})

/** Vimeo DASH 音视频资源的最小 fixture。 */
function resourceFixture(id: string): MediaResource {
  return {
    id,
    messageId: id,
    index: 0,
    url: `https://vod-adaptive-ak.vimeocdn.com/${id}.m4s`,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    filename: `${id}.mp4`,
    mimeType: 'video/mp4',
    chatId: 'vimeo:1196869805',
    metadata: { messageId: id }
  }
}
