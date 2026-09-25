/** Vimeo DASH「有音轨 / 无音轨」视频交付的选项模型、下载分派与边界测试。 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { JsonValue } from '@/core/rpc/types'
import { DEFAULT_VIMEO_CONFIG } from '@/sites/vimeo/runtimeConfig'
import {
  buildVimeoDownloadOptions,
  parseVimeoConfig,
  parseVimeoDashPlaylist
} from '@/sites/vimeo/media'
import { VimeoDownloadService } from '@/sites/vimeo/injected/download'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor
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

describe('Vimeo 无音轨视频选项', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('同一画质给出带音轨与无音轨两条选项，Best 保持带音轨', () => {
    const options = buildOptions()
    const withAudio = options.find(
      option => option.sourceId === `vimeo:${VIDEO_ID}:video:dash:video-track`
    )
    const withoutAudio = options.find(
      option => option.sourceId === `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    )

    expect(withAudio).toMatchObject({
      label: '360p HD',
      filename: 'Controlled-360p-hd.mp4',
      size: 14,
      bitrate: 1_000_000
    })
    expect(withoutAudio).toMatchObject({
      label: '360p HD (no audio)',
      filename: 'Controlled-360p-hd-no-audio.mp4',
      size: 7,
      bitrate: 1_000_000
    })
    expect(decodeVimeoSourceDescriptor(withAudio?.descriptor.sourceId ? encodeDescriptor(withAudio) : '')).toMatchObject(
      { audioTrackId: 'audio-track', videoTrackId: 'video-track' }
    )
    expect(decodeVimeoSourceDescriptor(encodeDescriptor(withoutAudio))).toMatchObject({
      videoTrackId: 'video-track'
    })
    expect(decodeVimeoSourceDescriptor(encodeDescriptor(withoutAudio))?.audioTrackId).toBeUndefined()
    expect(options.find(option => option.sourceId === `vimeo:${VIDEO_ID}:video:best`)).toMatchObject({
      label: 'Best',
      audioTrackId: 'audio-track'
    })
  })

  it('playlist 没有音轨时仍给出纯视频选项', () => {
    const options = buildOptions({ audio: [] })
    const videoIds = options
      .filter(option => option.kind === 'video')
      .map(option => option.sourceId)

    expect(videoIds).toEqual([
      `vimeo:${VIDEO_ID}:video:best`,
      `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`
    ])
    expect(options.find(option => option.optionId === 'dash:video-track:no-audio')).toMatchObject({
      size: 7
    })
    expect(options.some(option => option.kind === 'audio')).toBe(false)
  })

  it('视频轨本身超限时两条选项都不展示，仅合计超限时保留无音轨选项并让它成为 Best', () => {
    const oversizeVideo = buildOptions({ videoSegmentSize: DEFAULT_VIMEO_CONFIG.muxMaxBytes })
    expect(oversizeVideo.some(option => option.kind === 'video' && option.delivery === 'dash')).toBe(
      false
    )
    expect(oversizeVideo.some(option => option.kind === 'video')).toBe(false)

    // 只有「视频 + 音频」超限时，纯视频仍能在内存上限内下载，因此保留并成为唯一可用画质。
    const oversizedMux = buildOptions({
      videoSegmentSize: DEFAULT_VIMEO_CONFIG.muxMaxBytes - 4,
      audioSegmentSize: 8
    })
    expect(
      oversizedMux.filter(option => option.kind === 'video').map(option => option.optionId)
    ).toEqual(['best', 'dash:video-track:no-audio'])
    const best = oversizedMux.find(option => option.optionId === 'best')
    expect(best?.label).toBe('Best')
    expect(best?.audioTrackId).toBeUndefined()
  })
})

describe('Vimeo 无音轨视频下载分派', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.mocked(mux.muxVimeoVideoToMp4).mockClear()
  })

  it('无音轨描述符只下载视频分片并走单轨 mux', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()

    await new VimeoDownloadService().handleSingleDownload(
      'vimeo-task-mute',
      mediaSource({ audioTrackId: null })
    )

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([PLAYLIST_URL, VIDEO_SEGMENT_URL])
    expect(mux.muxVimeoVideoToMp4).toHaveBeenCalledTimes(1)
    const [videoBlob, audioBlob] = vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0]
    expect(videoBlob).toBeInstanceOf(Blob)
    expect(audioBlob).toBeNull()
  })

  it('有音轨描述符仍下载两条轨并 mux 成带音频文件', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()

    await new VimeoDownloadService().handleSingleDownload(
      'vimeo-task-audio',
      mediaSource({ audioTrackId: 'audio-track' })
    )

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL,
      AUDIO_SEGMENT_URL
    ])
    const [, audioBlob] = vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0]
    expect(audioBlob).toBeInstanceOf(Blob)
  })

  it('描述符声明了 audio track 但 playlist 已无该轨时明确失败', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(playlistFixture({ audio: [] }), PLAYLIST_URL))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()

    await expect(
      new VimeoDownloadService().handleSingleDownload(
        'vimeo-task-missing-audio',
        mediaSource({ audioTrackId: 'audio-track' })
      )
    ).rejects.toThrow('DASH audio track 不存在')
    expect(mux.muxVimeoVideoToMp4).not.toHaveBeenCalled()
  })

  it('signed playlist 过期刷新后仍保持无音轨交付', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403, PLAYLIST_URL))
      .mockResolvedValueOnce(jsonResponse(configRequestFixture(), CONFIG_URL))
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await new VimeoDownloadService().handleSingleDownload(
      'vimeo-task-mute-refresh',
      mediaSource({ audioTrackId: null })
    )

    // 新快照只有带音轨的全片选项，刷新恢复不能让纯视频交付重新带上音频。
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      PLAYLIST_URL,
      CONFIG_URL,
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL
    ])
    const [, audioBlob] = vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0]
    expect(audioBlob).toBeNull()
  })

  it('无音轨 Best 刷新后即使带音轨版本重新可用也保持无音轨', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403, PLAYLIST_URL))
      .mockResolvedValueOnce(jsonResponse(configRequestFixture(), CONFIG_URL))
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await new VimeoDownloadService().handleSingleDownload(
      'vimeo-task-mute-best',
      mediaSource({ audioTrackId: null, best: true })
    )

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      PLAYLIST_URL,
      CONFIG_URL,
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL
    ])
    const [, audioBlob] = vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0]
    expect(audioBlob).toBeNull()
  })

  it('signed playlist 过期刷新后仍保持带音轨交付', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403, PLAYLIST_URL))
      .mockResolvedValueOnce(jsonResponse(configRequestFixture(), CONFIG_URL))
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    stubSave()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await new VimeoDownloadService().handleSingleDownload(
      'vimeo-task-audio-refresh',
      mediaSource({ audioTrackId: 'audio-track' })
    )

    const [, audioBlob] = vi.mocked(mux.muxVimeoVideoToMp4).mock.calls[0]
    expect(audioBlob).toBeInstanceOf(Blob)
  })
})

describe('Vimeo DASH 描述符音轨约束', () => {
  it('video 不要求 audioTrackId，audio 仍要求 audioTrackId', () => {
    const video = decodeVimeoSourceDescriptor(
      encodeVimeoSourceDescriptor({
        version: 2,
        videoId: VIDEO_ID,
        sourceId: `vimeo:${VIDEO_ID}:video:dash:video-track:no-audio`,
        optionId: 'dash:video-track:no-audio',
        kind: 'video',
        delivery: 'dash',
        label: '360p HD (no audio)',
        configUrl: CONFIG_URL,
        dashPlaylistUrl: PLAYLIST_URL,
        videoTrackId: 'video-track'
      })
    )
    const audioWithoutTrack = decodeVimeoSourceDescriptor(
      encodeVimeoSourceDescriptor({
        version: 2,
        videoId: VIDEO_ID,
        sourceId: `vimeo:${VIDEO_ID}:audio:dash:audio-track`,
        optionId: 'dash:audio-track',
        kind: 'audio',
        delivery: 'dash',
        label: '195 kbps',
        configUrl: CONFIG_URL,
        dashPlaylistUrl: PLAYLIST_URL
      })
    )

    expect(video?.videoTrackId).toBe('video-track')
    expect(audioWithoutTrack).toBeNull()
  })
})

/** DASH video 下载源参数；audioTrackId 为 null 表示无音轨交付。 */
interface MediaSourceOptions {
  readonly audioTrackId: string | null
  /** 构造稳定 Best ID 的下载源，用于验证刷新恢复。 */
  readonly best?: boolean
}

/** 从选项构造可编解码的 descriptor 字符串。 */
function encodeDescriptor(option: ReturnType<typeof buildOptions>[number] | undefined): string {
  return option ? encodeVimeoSourceDescriptor(option.descriptor) : ''
}

interface BuildOptionsInput {
  readonly audio?: readonly JsonValue[]
  readonly videoSegmentSize?: number
  readonly audioSegmentSize?: number
}

/** 构造资源选项。 */
function buildOptions(input: BuildOptionsInput = {}) {
  const config = parseVimeoConfig(configFixture(), CONFIG_URL)
  const playlist = parseVimeoDashPlaylist(
    playlistFixture({
      audio: input.audio,
      videoSegmentSize: input.videoSegmentSize,
      audioSegmentSize: input.audioSegmentSize
    }),
    PLAYLIST_URL
  )
  return buildVimeoDownloadOptions(config, playlist)
}

/** 构造 Vimeo config。 */
function configFixture(): JsonValue {
  return {
    request: {
      timestamp: 2_000_000_000,
      expires: 100_000_000,
      config_refresh_url: CONFIG_URL,
      files: {
        progressive: [],
        dash: { default_cdn: 'controlled', cdns: { controlled: { url: PLAYLIST_URL } } }
      }
    },
    video: { id: Number(VIDEO_ID), title: 'Controlled', thumbs: {} }
  }
}

/** `/config/request` 刷新片段：与完整 config 共用 request 字段。 */
function configRequestFixture(): JsonValue {
  return {
    timestamp: 2_000_000_000,
    expires: 100_000_000,
    config_refresh_url: CONFIG_URL,
    files: {
      progressive: [],
      dash: { default_cdn: 'controlled', cdns: { controlled: { url: PLAYLIST_URL } } }
    }
  }
}

interface PlaylistFixtureInput {
  readonly audio?: readonly JsonValue[]
  readonly videoSegmentSize?: number
  readonly audioSegmentSize?: number
}

/** 构造 DASH playlist；默认 video 4 字节、audio 3 字节媒体数据。 */
function playlistFixture(input: PlaylistFixtureInput = {}): JsonValue {
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
        segments: [
          {
            url: VIDEO_SEGMENT_URL,
            ...(input.videoSegmentSize === undefined ? { size: 4 } : { size: input.videoSegmentSize })
          }
        ]
      }
    ],
    audio:
      input.audio ??
      [
        {
          id: 'audio-track',
          base_url: '',
          mime_type: 'audio/mp4',
          codecs: 'mp4a.40.2',
          bitrate: 195000,
          init_segment: 'AAAA',
          segments: [
            {
              url: AUDIO_SEGMENT_URL,
              ...(input.audioSegmentSize === undefined
                ? { size: 4 }
                : { size: input.audioSegmentSize })
            }
          ]
        }
      ]
  }
}

/** 构造 DASH video 下载源。 */
function mediaSource(options: MediaSourceOptions) {
  const optionId = options.best
    ? 'best'
    : options.audioTrackId
      ? 'dash:video-track'
      : 'dash:video-track:no-audio'
  const sourceId = `vimeo:${VIDEO_ID}:video:${optionId}`
  const descriptor = {
    version: 2 as const,
    videoId: VIDEO_ID,
    sourceId,
    optionId,
    kind: 'video' as const,
    delivery: 'dash' as const,
    label: options.best ? 'Best' : options.audioTrackId ? '360p HD' : '360p HD (no audio)',
    configUrl: CONFIG_URL,
    refreshConfigUrl: CONFIG_URL,
    dashPlaylistUrl: PLAYLIST_URL,
    videoTrackId: 'video-track',
    ...(options.audioTrackId ? { audioTrackId: options.audioTrackId } : {})
  }

  return {
    url: PLAYLIST_URL,
    id: sourceId,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    page: 'content',
    messageId: VIDEO_ID,
    filename: options.audioTrackId ? 'controlled.mp4' : 'controlled-no-audio.mp4',
    mimeType: 'video/mp4',
    documentId: encodeVimeoSourceDescriptor(descriptor)
  }
}

/** 让保存动作在 happy-dom 中静默成功。 */
function stubSave(): void {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://vimeo.com/controlled')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
}

/** JSON 响应并保留生产 URL 校验需要的 final URL。 */
function jsonResponse(body: JsonValue, url: string): Response {
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

/** 构造无响应体的 HTTP 状态响应。 */
function statusResponse(status: number, url: string): Response {
  const response = new Response(null, { status })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

/** 构造带响应体的媒体分片响应。 */
function segmentResponse(url: string, contentType: string): Response {
  const response = new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Type': contentType }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}
