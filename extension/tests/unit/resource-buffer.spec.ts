import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  type ResourceSourceKind
} from '@/core/constants/resource'
import { ResourceBuffer as CoreResourceBuffer } from '@/core/content/services/ResourceBuffer'
import type { MediaResource, VideoGroupMetadata } from '@/core/types'

const mocks = vi.hoisted(() => ({
  updateBadge: vi.fn(() => Promise.resolve({ success: true }))
}))

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: vi.fn(() => ({
    updateBadge: mocks.updateBadge
  }))
}))

vi.mock('@/core/rpc/ChromeEventBus', () => ({
  ChromeEventEmitter: vi.fn(() => ({
    emit: vi.fn()
  }))
}))

class TestResourceBuffer extends CoreResourceBuffer {
  protected readonly siteName = 'test'

  pageKey = 'page:a'

  protected getPageKey(): string {
    return this.pageKey
  }

  protected getSourceRank(resource: MediaResource): number {
    if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4) {
      return 20
    }

    if (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL) {
      return 10
    }

    return 1
  }
}

describe('ResourceBuffer', () => {
  afterEach(() => {
    vi.useRealTimers()
    mocks.updateBadge.mockClear()
  })

  it('合并视频按 id 去重，并用更高 sourceRank 资源替换同 id 资源', () => {
    const buffer = new TestResourceBuffer()
    const thumbnail = createResource('same', 'https://i.vimeocdn.com/video/thumb.jpg', 10)
    const progressive = createResource(
      'same',
      'https://vod-progressive-ak.vimeocdn.com/a.mp4',
      20,
      RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
    )

    buffer.mergeVideoResources('10', [thumbnail])
    buffer.mergeVideoResources('10', [thumbnail])
    expect(buffer.getAllResources()).toEqual([thumbnail])

    buffer.mergeVideoResources('10', [progressive])
    expect(buffer.getAllResources()).toEqual([progressive])
    expect(buffer.getResource(progressive.id)?.url).toBe(
      'https://vod-progressive-ak.vimeocdn.com/a.mp4'
    )
  })

  it('低 sourceRank 资源不能覆盖已缓存的高 sourceRank 资源', () => {
    const buffer = new TestResourceBuffer()
    const progressive = createResource(
      'same',
      'https://vod-progressive-ak.vimeocdn.com/a.mp4',
      10,
      RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
    )
    const thumbnail = createResource('same', 'https://i.vimeocdn.com/video/thumb.jpg', 10)

    buffer.mergeVideoResources('10', [progressive])
    buffer.mergeVideoResources('10', [thumbnail])

    expect(buffer.getAllResources()).toEqual([progressive])
  })

  it('多视频合并互不影响，组序保持写入顺序', () => {
    const buffer = new TestResourceBuffer()
    const first = createResource('v1:video', 'https://cdn.example/v1.m4s', 1)
    const second = createResource('v2:video', 'https://cdn.example/v2.m4s', 2, undefined, '20')

    buffer.mergeVideoResources('10', [first])
    buffer.mergeVideoResources('20', [second])
    buffer.mergeVideoResources('10', [first])

    expect(buffer.getAllResources()).toEqual([first, second])
    expect(buffer.getVideoCount()).toBe(2)
  })

  it('并入第 17 组时按首并入序淘汰最旧组：组与元数据回收、badge 回落、旧资源查不到', () => {
    const buffer = new TestResourceBuffer()

    // 组上限 16（与 MAIN world 捕获上限对齐）：先写满 16 组，第 17 组并入触发最早组淘汰。
    for (let videoIndex = 1; videoIndex <= 16; videoIndex += 1) {
      const videoId = String(videoIndex)
      buffer.mergeVideoResources(videoId, [
        createResource(
          `v${videoIndex}:video`,
          `https://cdn.example/v${videoIndex}.m4s`,
          videoIndex,
          undefined,
          videoId,
          GROUP_META_A
        )
      ])
    }
    expect(buffer.getVideoGroups()).toHaveLength(16)

    buffer.mergeVideoResources('17', [
      createResource('v17:video', 'https://cdn.example/v17.m4s', 17, undefined, '17', GROUP_META_B)
    ])

    // 最早组（组 1）连同元数据被淘汰，组序从组 2 连续排到组 17。
    const groups = buffer.getVideoGroups()
    expect(groups).toHaveLength(16)
    expect(groups.map(group => group.videoId)).toEqual(
      Array.from({ length: 16 }, (_, offset) => String(offset + 2))
    )

    // badge 是视频组数（每组 1 个视频），随淘汰回落而不是涨到 17。
    expect(mocks.updateBadge).toHaveBeenLastCalledWith({ count: 16 })
    expect(buffer.getVideoCount()).toBe(16)

    // 被淘汰组的资源跨组查找不再命中，未淘汰组不受影响。
    expect(buffer.getResource('v1:video')).toBeUndefined()
    expect(buffer.getResource('v2:video')?.url).toBe('https://cdn.example/v2.m4s')
  })

  it('badge 计数是视频数：一个视频无论多少档位都算 1；同内容快照替换不重复通知', () => {
    const buffer = new TestResourceBuffer()
    const first = createResource('v1:video', 'https://cdn.example/v1.m4s', 1, undefined, '10')
    const second = createResource('v2:video', 'https://cdn.example/v2.m4s', 2, undefined, '10')
    const other = createResource('v3:video', 'https://cdn.example/v3.m4s', 3, undefined, '20')

    // 同一视频的两个档位只计 1，不按资源数累计。
    buffer.mergeVideoResources('10', [first, second])
    expect(mocks.updateBadge).toHaveBeenLastCalledWith({ count: 1 })

    buffer.mergeVideoResources('20', [other])
    expect(mocks.updateBadge).toHaveBeenLastCalledWith({ count: 2 })

    // 快照替换是整页语义：组 20 被移除，只剩组 10 的两个档位，视频数为 1。
    buffer.replaceSnapshot('10', [first, second])
    expect(mocks.updateBadge).toHaveBeenLastCalledWith({ count: 1 })

    mocks.updateBadge.mockClear()
    buffer.replaceSnapshot('10', [first, second])
    expect(mocks.updateBadge).not.toHaveBeenCalled()
  })

  it('单视频快照替换移除其他视频分组与本轮不存在的旧资源', () => {
    const buffer = new TestResourceBuffer()
    const staleOther = createResource(
      'other:video',
      'https://cdn.example/other.m4s',
      1,
      undefined,
      '20'
    )
    const oldVideo = createResource('old-video', 'https://vod-adaptive-ak.vimeocdn.com/old.m4s', 1)
    const currentThumbnail = createResource(
      'current-thumbnail',
      'https://i.vimeocdn.com/video/current.jpg',
      10,
      RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL
    )
    const currentProgressive = createResource(
      'current-thumbnail',
      'https://vod-progressive-ak.vimeocdn.com/current.mp4',
      10,
      RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
    )

    buffer.mergeVideoResources('10', [oldVideo])
    buffer.mergeVideoResources('20', [staleOther])

    buffer.replaceSnapshot('10', [currentThumbnail, currentProgressive])

    // 聚合页并入的其他视频与旧资源都被整页快照替换，同 id 保留更高来源排序版本。
    expect(buffer.getAllResources()).toEqual([currentProgressive])
    expect(buffer.getVideoCount()).toBe(1)
  })

  it('快照替换同 id 时仍保留更高 sourceRank 资源', () => {
    const buffer = new TestResourceBuffer()
    const thumbnail = createResource(
      'same',
      'https://i.vimeocdn.com/video/thumb.jpg',
      10,
      RESOURCE_SOURCE_KINDS.VIMEO_THUMBNAIL_URL
    )
    const progressive = createResource(
      'same',
      'https://vod-progressive-ak.vimeocdn.com/a.mp4',
      10,
      RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
    )

    buffer.replaceSnapshot('10', [thumbnail, progressive])
    expect(buffer.getAllResources()).toEqual([progressive])
  })

  it('pageKey 变化时清空全部视频分组', () => {
    vi.useFakeTimers()
    const buffer = new TestResourceBuffer()
    const pageChanged = vi.fn(() => {
      expect(buffer.getVideoCount()).toBe(0)
    })
    buffer.onPageChange(pageChanged)
    buffer.start()
    buffer.mergeVideoResources('10', [
      createResource('v1:video', 'https://i.vimeocdn.com/video/a.jpg', 1)
    ])
    buffer.mergeVideoResources('20', [
      createResource('v2:video', 'https://i.vimeocdn.com/video/b.jpg', 1, undefined, '20')
    ])
    expect(buffer.getVideoCount()).toBe(2)

    buffer.pageKey = 'page:b'
    vi.advanceTimersByTime(500)

    expect(buffer.getVideoCount()).toBe(0)
    expect(pageChanged).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(500)
    expect(pageChanged).toHaveBeenCalledOnce()
    buffer.stop()
  })

  it('getVideoGroups 按组序返回组元数据；无元数据的组标题回落空串', () => {
    const buffer = new TestResourceBuffer()
    buffer.mergeVideoResources('10', [
      createResource('v1:video', 'https://cdn.example/v1.m4s', 0, undefined, '10', GROUP_META_A)
    ])
    buffer.mergeVideoResources('20', [
      createResource('v2:video', 'https://cdn.example/v2.m4s', 0, undefined, '20', GROUP_META_B)
    ])

    expect(buffer.getVideoGroups()).toEqual([
      { videoId: '10', ...GROUP_META_A },
      { videoId: '20', ...GROUP_META_B }
    ])

    // 空资源组没有元数据可取，标题回落空串由 popup 用 videoId 兜底。
    buffer.replaceSnapshot('30', [])
    expect(buffer.getVideoGroups()).toEqual([{ videoId: '30', title: '' }])
  })

  it('mergeVideoResources 元数据按字段补齐：已有非空值保留，空缺由后续轮补全', () => {
    const buffer = new TestResourceBuffer()
    buffer.mergeVideoResources('10', [createResource('v1:video', 'https://cdn.example/v1.m4s', 0)])
    expect(buffer.getVideoGroups()).toEqual([{ videoId: '10', title: '' }])

    buffer.mergeVideoResources('10', [
      createResource('v1:video', 'https://cdn.example/v1.m4s', 0, undefined, '10', {
        title: 'Partial Title'
      })
    ])
    expect(buffer.getVideoGroups()).toEqual([{ videoId: '10', title: 'Partial Title' }])

    buffer.mergeVideoResources('10', [
      createResource('v1:video', 'https://cdn.example/v1.m4s', 0, undefined, '10', GROUP_META_A)
    ])
    expect(buffer.getVideoGroups()).toEqual([
      // title 已有非空值保留，其余字段补齐。
      { videoId: '10', title: 'Partial Title', ...restOf(GROUP_META_A) }
    ])
  })

  it('快照替换整组替换元数据，清空时元数据随组清理', () => {
    const buffer = new TestResourceBuffer()
    buffer.mergeVideoResources('10', [
      createResource('v1:video', 'https://cdn.example/v1.m4s', 0, undefined, '10', GROUP_META_A)
    ])
    buffer.mergeVideoResources('20', [
      createResource('v2:video', 'https://cdn.example/v2.m4s', 0, undefined, '20', GROUP_META_B)
    ])

    buffer.replaceSnapshot('10', [
      createResource('v3:video', 'https://cdn.example/v3.m4s', 0, undefined, '10', GROUP_META_B)
    ])
    expect(buffer.getVideoGroups()).toEqual([{ videoId: '10', ...GROUP_META_B }])

    buffer.clear()
    expect(buffer.getVideoGroups()).toEqual([])
  })
})

/** 组元数据样本 A：四字段齐全。 */
const GROUP_META_A: VideoGroupMetadata = {
  title: 'First Video',
  author: 'Author A',
  durationSeconds: 30,
  thumbnailUrl: 'https://i.vimeocdn.com/video/cover-a'
}

/** 组元数据样本 B：只有标题。 */
const GROUP_META_B: VideoGroupMetadata = { title: 'Second Video' }

/** 取样本中除 title 外的字段，用于断言「title 保留、其余补齐」。 */
function restOf(metadata: VideoGroupMetadata): Omit<VideoGroupMetadata, 'title'> {
  const { title: _title, ...rest } = metadata
  return rest
}

function createResource(
  id: string,
  url: string,
  index: number,
  sourceKind: ResourceSourceKind = RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
  messageId = '10',
  groupMetadata?: VideoGroupMetadata
): MediaResource {
  return {
    id,
    messageId,
    index,
    url,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind,
    ...(groupMetadata ? { groupMetadata } : {}),
    metadata: {
      messageId
    }
  }
}
