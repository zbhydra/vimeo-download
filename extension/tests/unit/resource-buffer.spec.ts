import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES,
  type ResourceSourceKind
} from '@/core/constants/resource'
import { ResourceBuffer as CoreResourceBuffer } from '@/core/content/services/ResourceBuffer'
import type { MediaResource } from '@/core/types'

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
    expect(buffer.getCount()).toBe(2)
  })

  it('badge 计数是跨视频累计的资源数；同内容快照替换不重复通知', () => {
    const buffer = new TestResourceBuffer()
    const first = createResource('v1:video', 'https://cdn.example/v1.m4s', 1)
    const second = createResource('v2:video', 'https://cdn.example/v2.m4s', 2, undefined, '20')

    buffer.mergeVideoResources('10', [first])
    expect(mocks.updateBadge).toHaveBeenLastCalledWith({ count: 1 })

    buffer.mergeVideoResources('20', [second])
    expect(mocks.updateBadge).toHaveBeenLastCalledWith({ count: 2 })

    buffer.replaceSnapshot('10', [first, second])
    expect(mocks.updateBadge).toHaveBeenLastCalledWith({ count: 2 })

    mocks.updateBadge.mockClear()
    buffer.replaceSnapshot('10', [first, second])
    expect(mocks.updateBadge).not.toHaveBeenCalled()
  })

  it('单视频快照替换移除其他视频分组与本轮不存在的旧资源', () => {
    const buffer = new TestResourceBuffer()
    const staleOther = createResource('other:video', 'https://cdn.example/other.m4s', 1, undefined, '20')
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
    expect(buffer.getCount()).toBe(1)
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
    buffer.start()
    buffer.mergeVideoResources('10', [
      createResource('v1:video', 'https://i.vimeocdn.com/video/a.jpg', 1)
    ])
    buffer.mergeVideoResources('20', [
      createResource('v2:video', 'https://i.vimeocdn.com/video/b.jpg', 1, undefined, '20')
    ])
    expect(buffer.getCount()).toBe(2)

    buffer.pageKey = 'page:b'
    vi.advanceTimersByTime(500)

    expect(buffer.getCount()).toBe(0)
    buffer.stop()
  })
})

function createResource(
  id: string,
  url: string,
  index: number,
  sourceKind: ResourceSourceKind = RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
  messageId = '10'
): MediaResource {
  return {
    id,
    messageId,
    index,
    url,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind,
    metadata: {
      messageId
    }
  }
}
