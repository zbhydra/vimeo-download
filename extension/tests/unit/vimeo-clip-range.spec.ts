/** Vimeo 片段/剪辑下载：区间选项模型、下载分派与 signed URL 刷新后的区间保持。 */

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
import { VimeoDownloadService } from '@/sites/vimeo/injected/download'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor,
  formatVimeoClipOptionId,
  parseVimeoClipIdRange,
  parseVimeoTimeRange,
  stripVimeoClipSuffix,
  type VimeoTimeRange
} from '@/sites/vimeo/shared'

vi.mock('@/sites/vimeo/injected/mux', () => ({
  muxVimeoVideoToMp4: vi.fn(() => Promise.resolve(new Blob(['muxed'], { type: 'video/mp4' }))),
  remuxVimeoAudioToM4a: vi.fn(() => Promise.resolve(new Blob(['audio'], { type: 'audio/mp4' }))),
  remuxVimeoMuxedMp4ToMp4: vi.fn(() => Promise.resolve(new Blob(['hls'], { type: 'video/mp4' })))
}))

const mux = await import('@/sites/vimeo/injected/mux')

const VIDEO_ID = '1196869805'
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?expires=2100000000&signature=controlled`
const PLAYLIST_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/master.json'
const VIDEO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/video-1.m4s'
const AUDIO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/audio-1.m4s'
const HLS_MEDIA_URL = 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/prog.m3u8'
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

describe('Vimeo 片段下载分派', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.mocked(mux.muxVimeoVideoToMp4).mockClear()
    vi.mocked(mux.remuxVimeoAudioToM4a).mockClear()
    vi.mocked(mux.remuxVimeoMuxedMp4ToMp4).mockClear()
  })

  it('DASH video 把区间透传给 mux', async () => {
    stubDashFetch()
    stubSave()

    await new VimeoDownloadService().handleSingleDownload(
      'vimeo-clip-video',
      dashVideoSource(CLIP)
    )

    expect(mux.muxVimeoVideoToMp4).toHaveBeenCalledTimes(1)
    expect(vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0][2]).toEqual(CLIP)
  })

  it('DASH audio 把区间透传给 audio remux', async () => {
    stubDashFetch()
    stubSave()

    await new VimeoDownloadService().handleSingleDownload('vimeo-clip-audio', dashAudioSource(CLIP))

    expect(mux.remuxVimeoAudioToM4a).toHaveBeenCalledTimes(1)
    expect(vi.mocked(mux.remuxVimeoAudioToM4a).mock.calls[0][1]).toEqual(CLIP)
  })

  it('HLS 把区间透传给 muxed remux', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(hlsMediaResponse())
      .mockResolvedValueOnce(segmentResponse('https://vod-adaptive-ak.vimeocdn.com/hls/1080/init.mp4', 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse('https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-1.m4s', 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse('https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-2.m4s', 'video/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()

    await new VimeoDownloadService().handleSingleDownload('vimeo-clip-hls', hlsSource(CLIP))

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      HLS_MEDIA_URL,
      'https://vod-adaptive-ak.vimeocdn.com/hls/1080/init.mp4',
      'https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-1.m4s',
      'https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-2.m4s'
    ])
    expect(mux.remuxVimeoMuxedMp4ToMp4).toHaveBeenCalledTimes(1)
    expect(vi.mocked(mux.remuxVimeoMuxedMp4ToMp4).mock.calls[0][1]).toEqual(CLIP)
  })

  it('没有区间时保持既有调用形态，不传裁剪参数', async () => {
    stubDashFetch()
    stubSave()

    await new VimeoDownloadService().handleSingleDownload('vimeo-full-video', dashVideoSource())

    expect(vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0][2]).toBeUndefined()
  })

  it('signed playlist 过期刷新后仍保持同一画质与区间', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403, PLAYLIST_URL))
      .mockResolvedValueOnce(jsonResponse(configRequestFixture(), CONFIG_URL))
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()

    await new VimeoDownloadService().handleSingleDownload('vimeo-clip-refresh', dashVideoSource(CLIP))

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      PLAYLIST_URL,
      CONFIG_URL,
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL,
      AUDIO_SEGMENT_URL
    ])
    expect(mux.muxVimeoVideoToMp4).toHaveBeenCalledTimes(1)
    expect(vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0][2]).toEqual(CLIP)
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

/** 构造 DASH video 下载源；不传区间时表示整片。 */
function dashVideoSource(range?: VimeoTimeRange) {
  const resource = dashVideoResource()
  return toSource(
    range ? applyVimeoTimeRange(resource, range) : resource,
    'controlled-dash.mp4'
  )
}

/** 构造 DASH audio 下载源。 */
function dashAudioSource(range?: VimeoTimeRange) {
  const resource = allResources().find(
    resource => resource.id === `vimeo:${VIDEO_ID}:audio:dash:audio-track`
  ) as MediaResource
  return toSource(range ? applyVimeoTimeRange(resource, range) : resource, 'controlled-audio.m4a')
}

/** 构造 HLS fallback 下载源。 */
function hlsSource(range?: VimeoTimeRange) {
  const config = parseVimeoConfig(configFixture(), CONFIG_URL)
  const variant = {
    url: HLS_MEDIA_URL,
    bandwidth: 2_500_000,
    width: 1920,
    height: 1080,
    fps: 30,
    codecs: 'avc1.640028,mp4a.40.2'
  }
  const mediaPlaylist = {
    playlistUrl: HLS_MEDIA_URL,
    initSegmentUrl: 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/init.mp4',
    segments: [{ url: VIDEO_SEGMENT_URL }],
    bandwidth: variant.bandwidth,
    width: variant.width,
    height: variant.height,
    fps: variant.fps,
    codecs: variant.codecs
  }
  const resource = buildVimeoDownloadOptions(config, null, [mediaPlaylist])
    .map((option, index) => createVimeoResource(option, index))
    .find(candidate => candidate.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO) as MediaResource
  return toSource(range ? applyVimeoTimeRange(resource, range) : resource, 'controlled-hls.mp4')
}

/** 把页面资源收敛成 injected 下载源。 */
function toSource(resource: MediaResource, filename: string) {
  return {
    url: resource.url,
    id: resource.id,
    type: resource.type,
    sourceKind: resource.sourceKind,
    page: 'content' as const,
    messageId: resource.messageId,
    filename,
    mimeType: resource.mimeType,
    documentId: resource.documentId
  }
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

/** `/config/request` 刷新片段：与完整 config 共用 request 字段。 */
function configRequestFixture(): JsonValue {
  return requestFixture()
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

/** 让保存动作在 happy-dom 中静默成功。 */
function stubSave(): void {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://vimeo.com/controlled')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
}

/** DASH 链路固定响应：playlist、视频分片、音频分片。 */
function stubDashFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
  )
}

/** HLS media playlist 响应。 */
function hlsMediaResponse(): Response {
  return responseWithUrl(
    [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:2.000,',
      'seg-1.m4s',
      '#EXTINF:2.000,',
      'seg-2.m4s'
    ].join('\n'),
    200,
    HLS_MEDIA_URL,
    'application/vnd.apple.mpegurl'
  )
}

/** JSON 响应并保留生产 URL 校验需要的 final URL。 */
function jsonResponse(body: JsonValue, url: string): Response {
  return responseWithUrl(JSON.stringify(body), 200, url, 'application/json')
}

/** 构造媒体分片响应。 */
function segmentResponse(url: string, contentType: string): Response {
  return responseWithUrl(new Uint8Array([1, 2, 3, 4]), 200, url, contentType)
}

/** 构造无响应体的状态响应。 */
function statusResponse(status: number, url: string): Response {
  const response = new Response(null, { status })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

/** 构造带 final URL 的响应。 */
function responseWithUrl(
  body: BodyInit,
  status: number,
  url: string,
  contentType: string
): Response {
  const response = new Response(body, {
    status,
    headers: { 'Content-Type': contentType }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}
