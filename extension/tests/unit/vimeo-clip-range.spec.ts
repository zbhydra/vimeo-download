/**
 * Vimeo 片段/剪辑下载：区间选项模型。
 *
 * 下载分派（区间透传给 mux）已随 injected 下载链退役，等价合同由
 * offscreen-download-dispatch.spec 以 offscreen 执行器覆盖。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS } from '@/core/constants/resource'
import type { JsonObject, JsonValue } from '@/core/rpc/types'
import type { MediaResource } from '@/core/types'
import {
  applyVimeoTimeRange,
  buildVimeoDownloadOptions,
  createVimeoResource,
  parseVimeoConfig,
  parseVimeoDashPlaylist
} from '@/sites/vimeo/media'
import { vimeoResourceBuffer } from '@/sites/vimeo/content/resourceBuffer'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor,
  formatVimeoClipOptionId,
  parseVimeoClipIdRange,
  parseVimeoTimeRange,
  stripVimeoClipSuffix,
} from '@/sites/vimeo/shared'

const VIDEO_ID = '1196869805'
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?expires=2100000000&signature=controlled`
const PLAYLIST_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/master.json'
const VIDEO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/video-1.m4s'
const AUDIO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/audio-1.m4s'
const CLIP = { startSeconds: 12.5, endSeconds: 30 }

describe('Vimeo 片段区间选项模型', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('区间并入 option/source id 与文件名，并写入描述符', () => {
    const original = dashVideoResource()
    const clip = applyVimeoTimeRange(original, CLIP)
    const descriptor = decodeVimeoSourceDescriptor(clip.documentId)

    expect(clip.id).toBe(`vimeo:${VIDEO_ID}:video:dash:video-track:clip:12.5-30`)
    expect(clip.filename).toBe('Controlled-360p-hd-clip-12.5-30s.mp4')
    expect(descriptor).toMatchObject({
      sourceId: clip.id,
      optionId: 'dash:video-track:clip:12.5-30',
      delivery: 'dash',
      videoTrackId: 'video-track',
      audioTrackId: 'audio-track',
      startSeconds: 12.5,
      endSeconds: 30
    })
    // 原资源是缓存里的共享对象，不能被就地改写。
    expect(original.id).toBe(`vimeo:${VIDEO_ID}:video:dash:video-track`)
    expect(decodeVimeoSourceDescriptor(original.documentId)?.startSeconds).toBeUndefined()
  })

  it('拒绝 progressive/字幕交付与非法规格区间', () => {
    const options = allResources()
    const progressive = options.find(
      resource => resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
    ) as MediaResource
    const subtitle = options.find(
      resource => resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL
    ) as MediaResource
    const dash = dashVideoResource()

    expect(() => applyVimeoTimeRange(progressive, CLIP)).toThrow('只有 DASH/HLS 交付支持片段裁剪')
    expect(() => applyVimeoTimeRange(subtitle, CLIP)).toThrow('只有 DASH/HLS 交付支持片段裁剪')
    expect(() => applyVimeoTimeRange(dash, { startSeconds: 30, endSeconds: 12.5 })).toThrow(
      '片段区间非法'
    )
    expect(() => applyVimeoTimeRange(dash, { startSeconds: -1, endSeconds: 5 })).toThrow(
      '片段区间非法'
    )
    expect(() =>
      applyVimeoTimeRange(dash, { startSeconds: 0, endSeconds: Number.NaN })
    ).toThrow('片段区间非法')
  })

  it('拒绝指数形式与超范围的秒数，区间身份构造与解析严格对齐', () => {
    const dash = dashVideoResource()

    // number input 接受 `1e-7` 这类科学记数法：`String()` 会写成指数形式，后缀正则读不回来。
    expect(parseVimeoTimeRange({ startSeconds: 1e-7, endSeconds: 5 })).toBeNull()
    expect(parseVimeoTimeRange({ startSeconds: 0, endSeconds: 1e21 })).toBeNull()
    expect(parseVimeoTimeRange({ startSeconds: 1e-7, endSeconds: 1e21 })).toBeNull()
    expect(() =>
      applyVimeoTimeRange(dash, { startSeconds: 1e-7, endSeconds: 5 })
    ).toThrow('片段区间非法')
    expect(() => formatVimeoClipOptionId('dash:video-track', {
      startSeconds: 1e-7,
      endSeconds: 5
    })).toThrow('片段秒数无法写成十进制文本')

    // 交界处仍可用：能写成十进制文本的秒数必须原样回环。
    const range = { startSeconds: 0.000001, endSeconds: 1e20 }
    const clipId = formatVimeoClipOptionId('dash:video-track', range)
    expect(clipId).toBe('dash:video-track:clip:0.000001-100000000000000000000')
    expect(parseVimeoClipIdRange(`vimeo:${VIDEO_ID}:video:${clipId}`)).toEqual(range)
    expect(parseVimeoClipIdRange(`vimeo:${VIDEO_ID}:video:dash:video-track:clip:1e-7-5`)).toBeNull()
  })

  it('刷新恢复用的去后缀能还原全片选项，未裁剪选项不受影响', () => {
    const clipId = applyVimeoTimeRange(dashVideoResource(), CLIP).id

    expect(stripVimeoClipSuffix(clipId)).toBe(`vimeo:${VIDEO_ID}:video:dash:video-track`)
    expect(stripVimeoClipSuffix(`vimeo:${VIDEO_ID}:video:dash:video-track`)).toBe(
      `vimeo:${VIDEO_ID}:video:dash:video-track`
    )
  })

  it('资源缓存按片段 ID 还原出与 popup 一致的片段资源', () => {
    const buffer = vimeoResourceBuffer
    const video = dashVideoResource()
    buffer.replaceSnapshot(VIDEO_ID, [video])

    const clipId = applyVimeoTimeRange(video, CLIP).id
    const restored = buffer.getResource(clipId)

    expect(restored?.id).toBe(clipId)
    expect(restored?.filename).toBe('Controlled-360p-hd-clip-12.5-30s.mp4')
    expect(decodeVimeoSourceDescriptor(restored?.documentId)?.startSeconds).toBe(CLIP.startSeconds)
    // 全片档位与未知 ID 都不受影响。
    expect(buffer.getResource(video.id)).toEqual(video)
    expect(buffer.getResource(`vimeo:${VIDEO_ID}:video:dash:missing:clip:1-2`)).toBeUndefined()
  })

  it('无音轨档位同样能带区间：身份是 `:no-audio` 在内、`:clip:` 在后，缓存按去后缀还原', () => {
    const buffer = vimeoResourceBuffer
    const noAudio = noAudioVideoResource()
    buffer.replaceSnapshot(VIDEO_ID, [noAudio])

    const clipId = applyVimeoTimeRange(noAudio, CLIP).id

    // 身份规则不变：纯视频档位的 ID 仍由 media 层生成，区间只追加在其后。
    expect(clipId).toBe(`vimeo:${VIDEO_ID}:video:dash:video-track:no-audio:clip:12.5-30`)
    expect(stripVimeoClipSuffix(clipId)).toBe(noAudio.id)

    // 缓存按去后缀的基础 ID 找回纯视频档位并重新套用同一区间，descriptor 仍不带音轨。
    const restored = buffer.getResource(clipId)
    expect(restored?.id).toBe(clipId)
    expect(decodeVimeoSourceDescriptor(restored?.documentId)?.audioTrackId).toBeUndefined()
    expect(decodeVimeoSourceDescriptor(restored?.documentId)?.startSeconds).toBe(CLIP.startSeconds)
  })

  it('描述符只接受 DASH/HLS 上的合法区间，缺字段时按全片处理', () => {
    const base = {
      version: 2,
      videoId: VIDEO_ID,
      sourceId: `vimeo:${VIDEO_ID}:video:dash:video-track`,
      optionId: 'dash:video-track',
      kind: 'video',
      delivery: 'dash',
      label: '360p HD',
      configUrl: CONFIG_URL,
      dashPlaylistUrl: PLAYLIST_URL,
      videoTrackId: 'video-track'
    } as const

    expect(
      decodeVimeoSourceDescriptor(
        encodeVimeoSourceDescriptor({ ...base, startSeconds: 1, endSeconds: 2 })
      )
    ).toMatchObject({ startSeconds: 1, endSeconds: 2 })
    expect(
      decodeVimeoSourceDescriptor(
        encodeVimeoSourceDescriptor({ ...base, startSeconds: 2, endSeconds: 1 })
      )?.startSeconds
    ).toBeUndefined()
    expect(
      decodeVimeoSourceDescriptor(encodeVimeoSourceDescriptor({ ...base, startSeconds: 1 }))
        ?.startSeconds
    ).toBeUndefined()
    expect(
      decodeVimeoSourceDescriptor(
        encodeVimeoSourceDescriptor({
          ...base,
          delivery: 'progressive',
          dashPlaylistUrl: undefined,
          videoTrackId: undefined,
          startSeconds: 1,
          endSeconds: 2
        })
      )
    ).toBeNull()
    expect(parseVimeoTimeRange({ startSeconds: 0, endSeconds: 0 })).toBeNull()
    expect(parseVimeoTimeRange({})).toBeNull()
  })
})

/** 构造全部资源，用于验证哪些交付可以裁剪。 */
function allResources(): MediaResource[] {
  const config = parseVimeoConfig(
    configFixture([
      { url: 'https://player.vimeo.com/texttrack/1.vtt', lang: 'en', label: 'English' }
    ]),
    CONFIG_URL
  )
  const playlist = parseVimeoDashPlaylist(playlistFixture(), PLAYLIST_URL)
  return buildVimeoDownloadOptions(config, playlist).map((option, index) =>
    createVimeoResource(option, index)
  )
}

/** 构造 DASH video 页面资源。 */
function dashVideoResource(): MediaResource {
  return allResources().find(
    resource => resource.id === `vimeo:${VIDEO_ID}:video:dash:video-track`
  ) as MediaResource
}

/** 构造同一条 video track 的纯视频档位（descriptor 不带 audioTrackId）。 */
function noAudioVideoResource(): MediaResource {
  return allResources().find(
    resource => resource.id === `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
  ) as MediaResource
}

/** 构造 Vimeo config；传入 textTracks 时附带字幕轨。 */
function configFixture(textTracks?: readonly JsonObject[]): JsonValue {
  return {
    request: requestFixture(textTracks),
    video: { id: Number(VIDEO_ID), title: 'Controlled', thumbs: {} }
  }
}

/** config/request 片段与完整 config 共用的 request 字段。 */
function requestFixture(textTracks?: readonly JsonObject[]): JsonValue {
  return {
    timestamp: 2_000_000_000,
    expires: 100_000_000,
    config_refresh_url: CONFIG_URL,
    files: filesFixture(),
    ...(textTracks === undefined ? {} : { text_tracks: textTracks })
  }
}

/** progressive/DASH/HLS 入口。 */
function filesFixture(): JsonValue {
  return {
    progressive: [
      {
        quality: '360p',
        width: 640,
        height: 360,
        fps: 30,
        mime: 'video/mp4',
        url: 'https://vod-progressive-ak.vimeocdn.com/controlled/360.mp4'
      }
    ],
    dash: { default_cdn: 'controlled', cdns: { controlled: { url: PLAYLIST_URL } } },
    hls: { url: 'https://vod-adaptive-ak.vimeocdn.com/hls/master.m3u8' }
  }
}

/** 构造 DASH playlist。 */
function playlistFixture(): JsonValue {
  return {
    base_url: '',
    video: [
      {
        id: 'video-track',
        base_url: '',
        mime_type: 'video/mp4',
        codecs: 'avc1.64001f',
        bitrate: 1_000_000,
        width: 640,
        height: 360,
        init_segment: 'AAAA',
        segments: [{ url: VIDEO_SEGMENT_URL, size: 4 }]
      }
    ],
    audio: [
      {
        id: 'audio-track',
        base_url: '',
        mime_type: 'audio/mp4',
        codecs: 'mp4a.40.2',
        bitrate: 195000,
        init_segment: 'AAAA',
        segments: [{ url: AUDIO_SEGMENT_URL, size: 4 }]
      }
    ]
  }
}
