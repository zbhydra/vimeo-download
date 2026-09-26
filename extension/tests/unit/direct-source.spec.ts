/**
 * Vimeo 直连来源校验与刷新测试。
 *
 * resolveVerifiedDirectSource 是 DownloadOrchestrator direct 路径的唯一入口合同：来源校验、
 * URL 白名单、signed URL 过期刷新（progressive 与字幕）。原 BrowserDownloadService 的
 * start/getStatus RPC 边界已随 content 下载链退役。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackgroundBrowserDownloadSource } from '@/background/types'
import { resolveVerifiedDirectSource } from '@/background/services/directSource'
import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import { encodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

const mocks = vi.hoisted(() => ({
  refreshVimeoDirectResourcesFromConfigUrl: vi.fn()
}))

vi.mock('@/sites/vimeo/config', () => ({
  refreshVimeoDirectResourcesFromConfigUrl: mocks.refreshVimeoDirectResourcesFromConfigUrl
}))

const VIDEO_ID = '1196869805'
const SOURCE_ID = `vimeo:${VIDEO_ID}:video:progressive:1080p:30`
const BEST_SOURCE_ID = `vimeo:${VIDEO_ID}:video:best`
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?expires=2100000000&signature=config`
const REFRESH_CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?signature=refresh`
const MEDIA_URL = 'https://vod-progressive-ak.vimeocdn.com/video/original.mp4?token=signed'
const FRESH_MEDIA_URL = 'https://vod-progressive-ak.vimeocdn.com/video/fresh.mp4?token=signed'
const ENGLISH_SUBTITLE_URL = 'https://player.vimeo.com/texttrack/1234567.vtt?token=signed'
const CHINESE_SUBTITLE_URL = `https://captions.vimeocdn.com/captions/${VIDEO_ID}-zh.vtt?token=signed`

describe('resolveVerifiedDirectSource', () => {
  beforeEach(() => {
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockReset()
  })

  it('校验通过的 progressive 来源原样返回', async () => {
    const source = progressiveSource()

    await expect(resolveVerifiedDirectSource(source, false)).resolves.toEqual(source)
    expect(mocks.refreshVimeoDirectResourcesFromConfigUrl).not.toHaveBeenCalled()
  })

  it('拒绝白名单外的 URL：akamaized 等无证据主机不能放行', async () => {
    await expect(
      resolveVerifiedDirectSource(progressiveSource({ url: 'https://attacker.example/video.mp4' }), false)
    ).rejects.toThrow('URL 不在允许的白名单')
    // 真实采样的媒体主机只落在 vimeocdn.com；akamaized.net 无证据支撑，必须被白名单拒绝。
    await expect(
      resolveVerifiedDirectSource(
        progressiveSource({ url: 'https://vod-progressive.akamaized.net/video/original.mp4' }),
        false
      )
    ).rejects.toThrow('URL 不在允许的白名单')
  })

  it('创建前拒绝 MIME 与 descriptor 合同不匹配', async () => {
    await expect(
      resolveVerifiedDirectSource(progressiveSource({ mime_type: 'text/html' }), false)
    ).rejects.toThrow('直连来源合同不匹配')
  })

  it('signed URL 过期时刷新 config 并返回新 URL', async () => {
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([freshResource()])

    const verified = await resolveVerifiedDirectSource(progressiveSource(), true)

    expect(mocks.refreshVimeoDirectResourcesFromConfigUrl).toHaveBeenCalledWith(REFRESH_CONFIG_URL)
    expect(verified.url).toBe(FRESH_MEDIA_URL)
  })

  it('刷新时按稳定 Best ID 恢复最新 progressive 文件', async () => {
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([
      bestProgressiveResource(),
      freshResource()
    ])

    const verified = await resolveVerifiedDirectSource(
      progressiveSource({
        source_id: BEST_SOURCE_ID,
        document_id: encodeVimeoSourceDescriptor(
          progressiveDescriptor(BEST_SOURCE_ID, 'best', CONFIG_URL)
        )
      }),
      true
    )

    expect(verified.url).toBe(FRESH_MEDIA_URL)
  })

  it('字幕来源接受 player texttrack 与 captions CDN 白名单，拒绝其余主机', async () => {
    await expect(
      resolveVerifiedDirectSource(subtitleSource(), false)
    ).resolves.toMatchObject({ url: ENGLISH_SUBTITLE_URL, mime_type: 'text/vtt' })
    await expect(
      resolveVerifiedDirectSource(
        subtitleSource({ url: `https://player.vimeo.com/video/${VIDEO_ID}/config` }),
        false
      )
    ).rejects.toThrow('URL 不在允许的白名单')
    await expect(
      resolveVerifiedDirectSource(subtitleSource({ url: 'https://attacker.example/evil.vtt' }), false)
    ).rejects.toThrow('URL 不在允许的白名单')
  })

  it('字幕来源 MIME 与 type 合同不匹配时拒绝', async () => {
    await expect(
      resolveVerifiedDirectSource(subtitleSource({ mime_type: 'video/mp4' }), false)
    ).rejects.toThrow('直连来源合同不匹配')
    await expect(
      resolveVerifiedDirectSource(subtitleSource({ type: RESOURCE_TYPES.AUDIO }), false)
    ).rejects.toThrow('直连来源合同不匹配')
  })

  it('直连中断刷新 config 后恢复同一语言的字幕', async () => {
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([
      { ...subtitleRefreshResource(), url: CHINESE_SUBTITLE_URL }
    ])

    const verified = await resolveVerifiedDirectSource(subtitleSource(), true)

    expect(mocks.refreshVimeoDirectResourcesFromConfigUrl).toHaveBeenCalledWith(REFRESH_CONFIG_URL)
    expect(verified.url).toBe(CHINESE_SUBTITLE_URL)
  })

  it('刷新后缺少同语言字幕时明确失败', async () => {
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([])

    await expect(resolveVerifiedDirectSource(subtitleSource(), true)).rejects.toThrow(
      '刷新 Vimeo config 后找不到直连资源'
    )
  })
})

// ============================================================================
// 夹具
// ============================================================================

/** 构造 progressive 下载描述符。 */
function progressiveDescriptor(
  sourceId: string,
  optionId: string,
  configUrl: string
): VimeoDescriptorShape {
  return {
    version: 2,
    videoId: VIDEO_ID,
    sourceId,
    optionId,
    kind: 'video',
    delivery: 'progressive',
    label: '1080p',
    configUrl,
    refreshConfigUrl: REFRESH_CONFIG_URL
  }
}

/** 构造 progressive 直连来源。 */
function progressiveSource(
  overrides: Partial<BackgroundBrowserDownloadSource> = {}
): BackgroundBrowserDownloadSource {
  return {
    source_id: SOURCE_ID,
    url: MEDIA_URL,
    type: RESOURCE_TYPES.VIDEO,
    source_kind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4,
    filename: 'controlled-1080p.mp4',
    mime_type: 'video/mp4',
    document_id: encodeVimeoSourceDescriptor(progressiveDescriptor(SOURCE_ID, SOURCE_ID, CONFIG_URL)),
    ...overrides
  }
}

/** 刷新后恢复出的 progressive 资源（最小形状）。 */
function freshResource() {
  return {
    id: SOURCE_ID,
    url: FRESH_MEDIA_URL,
    mimeType: 'video/mp4',
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
  }
}

/** 刷新后按 Best ID 命中的 progressive 资源。 */
function bestProgressiveResource() {
  return {
    id: BEST_SOURCE_ID,
    url: FRESH_MEDIA_URL,
    mimeType: 'video/mp4',
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
  }
}

/** 构造字幕直连来源。 */
function subtitleSource(
  overrides: Partial<BackgroundBrowserDownloadSource> = {}
): BackgroundBrowserDownloadSource {
  return {
    source_id: `vimeo:1201819515:subtitle:en`,
    url: ENGLISH_SUBTITLE_URL,
    type: RESOURCE_TYPES.SUBTITLE,
    source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL,
    filename: 'Demo-English.vtt',
    mime_type: 'text/vtt',
    document_id: encodeVimeoSourceDescriptor({
      version: 2,
      videoId: '1201819515',
      sourceId: 'vimeo:1201819515:subtitle:en',
      optionId: 'subtitle:en',
      kind: 'subtitle',
      delivery: 'subtitle',
      label: 'English',
      configUrl: `https://player.vimeo.com/video/1201819515/config?h=x&s=y`,
      refreshConfigUrl: REFRESH_CONFIG_URL
    }),
    ...overrides
  }
}

/** 刷新后恢复出的字幕资源（最小形状）。 */
function subtitleRefreshResource() {
  return {
    id: 'vimeo:1201819515:subtitle:en',
    url: ENGLISH_SUBTITLE_URL,
    mimeType: 'text/vtt',
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL
  }
}

/** 描述符形状别名；结构由 encodeVimeoSourceDescriptor 校验。 */
type VimeoDescriptorShape = Parameters<typeof encodeVimeoSourceDescriptor>[0]
