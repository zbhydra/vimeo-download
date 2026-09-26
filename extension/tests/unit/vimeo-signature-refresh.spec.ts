/**
 * Vimeo 签名 URL 重签守卫单元测试。
 *
 * 覆盖 track 一致性守卫的三条裁决：一致续跑（携带新签名 playlist 与原任务身份）、
 * best 回落换 track 整任务重跑、无同 delivery 候选或播放页无 config 时任务失败。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadPlayerPage: vi.fn(),
  loadResources: vi.fn()
}))

vi.mock('@/sites/vimeo/config', () => ({
  loadVimeoCapturedConfigFromPlayerPage: mocks.loadPlayerPage,
  loadVimeoResourcesFromCapturedConfig: mocks.loadResources
}))

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import {
  encodeVimeoSourceDescriptor,
  type VimeoSourceDescriptor
} from '@/sites/vimeo/shared'
import { refreshVimeoTaskResource } from '@/background/services/vimeoSignatureRefresh'

const CONFIG_URL = 'https://player.vimeo.com/video/1196869805/config?expires=9999999999&signature=cfg'

/** 原任务描述符：1080p 指定档位 + 片段区间。 */
function originalDescriptor(overrides: Partial<VimeoSourceDescriptor> = {}): VimeoSourceDescriptor {
  return {
    version: 2,
    videoId: '1196869805',
    sourceId: 'vimeo:1196869805:video:dash:1080p:clip:10-20',
    optionId: '1080p',
    kind: 'video',
    delivery: 'dash',
    label: '1080p',
    configUrl: CONFIG_URL,
    dashPlaylistUrl: 'https://player.vimeo.com/progressive_redirect/dash/old/playlist.json?sig=old',
    videoTrackId: 'v1',
    audioTrackId: 'a1',
    startSeconds: 10,
    endSeconds: 20,
    ...overrides
  }
}

/** 构造刷新快照中的候选资源。 */
function freshResource(
  descriptor: VimeoSourceDescriptor,
  overrides: Partial<MediaResource> = {}
): MediaResource {
  return {
    id: descriptor.sourceId,
    messageId: '1196869805',
    index: 0,
    url: 'https://vod-adaptive-ak.vimeocdn.com/fresh.m4s',
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    mimeType: 'video/mp4',
    size: 4096,
    documentId: encodeVimeoSourceDescriptor(descriptor),
    metadata: { messageId: '1196869805' },
    ...overrides
  }
}

/** 刷新后的候选描述符：同 base 画质、新签名 playlist。 */
function freshDescriptor(overrides: Partial<VimeoSourceDescriptor> = {}): VimeoSourceDescriptor {
  return {
    ...originalDescriptor({
      sourceId: 'vimeo:1196869805:video:dash:1080p',
      startSeconds: undefined,
      endSeconds: undefined
    }),
    dashPlaylistUrl: 'https://player.vimeo.com/progressive_redirect/dash/new/playlist.json?sig=new',
    ...overrides
  }
}

describe('vimeoSignatureRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadPlayerPage.mockResolvedValue({
      videoId: '1196869805',
      configUrl: CONFIG_URL,
      config: {}
    })
  })

  it('track 一致时返回 continue，新签名资源保留原任务身份与片段区间', async () => {
    mocks.loadResources.mockResolvedValue({
      resources: [freshResource(freshDescriptor())]
    })

    const outcome = await refreshVimeoTaskResource(originalDescriptor())

    expect(outcome.mode).toBe('continue')
    // 资源 id 沿用原任务（含片段后缀），进度回传与投影按它对账。
    expect(outcome.resource.id).toBe('vimeo:1196869805:video:dash:1080p:clip:10-20')
    expect(outcome.resource.url).toBe('https://vod-adaptive-ak.vimeocdn.com/fresh.m4s')
  })

  it('exact 候选 track 变化时返回 restart，新资源携带新 track', async () => {
    mocks.loadResources.mockResolvedValue({
      resources: [freshResource(freshDescriptor({ videoTrackId: 'v2' }))]
    })

    const outcome = await refreshVimeoTaskResource(originalDescriptor())

    expect(outcome.mode).toBe('restart')
    const descriptor = JSON.parse(
      decodeURIComponent(outcome.resource.documentId!.replace('vimeo:descriptor-uri:', ''))
    ) as VimeoSourceDescriptor
    expect(descriptor.videoTrackId).toBe('v2')
  })

  it('best 回落找不到同 track 但存在同 delivery 候选时整任务重跑', async () => {
    mocks.loadResources.mockResolvedValue({
      resources: [freshResource(freshDescriptor({ videoTrackId: 'v2', optionId: 'best' }))]
    })

    const outcome = await refreshVimeoTaskResource(
      originalDescriptor({ optionId: 'best', sourceId: 'vimeo:1196869805:video:dash:best' })
    )

    expect(outcome.mode).toBe('restart')
    expect(outcome.resource.id).toBe('vimeo:1196869805:video:dash:best')
  })

  it('指定档位找不到同画质候选时抛错（任务失败）', async () => {
    mocks.loadResources.mockResolvedValue({ resources: [] })

    await expect(refreshVimeoTaskResource(originalDescriptor())).rejects.toThrow(
      /找不到同 delivery 资源/
    )
  })

  it('播放页给不出 config 时抛错（任务失败）', async () => {
    mocks.loadPlayerPage.mockResolvedValue(null)

    await expect(refreshVimeoTaskResource(originalDescriptor())).rejects.toThrow(
      /播放页给不出可用 config/
    )
  })

  it('原任务无音轨时刷新不把音频带回，也不影响守卫判定', async () => {
    mocks.loadResources.mockResolvedValue({
      resources: [
        freshResource(
          freshDescriptor({ audioTrackId: 'a1' })
        )
      ]
    })

    const outcome = await refreshVimeoTaskResource(
      originalDescriptor({ audioTrackId: undefined })
    )

    const descriptor = JSON.parse(
      decodeURIComponent(outcome.resource.documentId!.replace('vimeo:descriptor-uri:', ''))
    ) as VimeoSourceDescriptor
    expect(descriptor.audioTrackId).toBeUndefined()
  })
})
