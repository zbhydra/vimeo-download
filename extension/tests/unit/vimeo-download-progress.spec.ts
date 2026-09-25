/** Vimeo DASH 聚合字节进度与下载完成契约测试。 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import { DOWNLOAD_PROGRESS_EVENT, type DownloadProgressDetail } from '@/core/protocol/injected'
import type { JsonValue } from '@/core/rpc/types'
import { VimeoDownloadService } from '@/sites/vimeo/injected/download'
import { encodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

vi.mock('@/sites/vimeo/injected/mux', () => ({
  muxVimeoVideoToMp4: vi.fn(() => Promise.resolve(new Blob(['muxed'], { type: 'video/mp4' }))),
  remuxVimeoAudioToM4a: vi.fn(() => Promise.resolve(new Blob(['audio'], { type: 'audio/mp4' }))),
  remuxVimeoMuxedMp4ToMp4: vi.fn(() =>
    Promise.resolve(new Blob(['hls'], { type: 'video/mp4' }))
  )
}))

const VIDEO_ID = '1196869805'
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?expires=2100000000&signature=controlled`
const PLAYLIST_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/master.json'
const EXPIRED_PLAYLIST_URL = 'https://vod-adaptive-ak.vimeocdn.com/expired/master.json'
const VIDEO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/video-1.m4s'
const AUDIO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/audio-1.m4s'
const SOURCE_ID = `vimeo:${VIDEO_ID}:video:dash:video-track`
const BEST_SOURCE_ID = `vimeo:${VIDEO_ID}:video:best`

describe('Vimeo DASH download progress', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('按 video/audio init 与流式 segment 总字节上报 0 到 100', async () => {
    const details: DownloadProgressDetail[] = []
    const listener = (event: Event): void => {
      details.push((event as CustomEvent<DownloadProgressDetail>).detail)
    }
    document.addEventListener(DOWNLOAD_PROGRESS_EVENT, listener)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://vimeo.com/controlled')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    try {
      await new VimeoDownloadService().handleSingleDownload('vimeo-task-1', mediaSource())

      expect(details.map(detail => detail.progress)).toEqual([
        null,
        0,
        21,
        35,
        50,
        71,
        85,
        99,
        100
      ])
      expect(details.every(detail => detail.sourceId === SOURCE_ID)).toBe(true)
      expect(details.every(detail => detail.taskId === 'vimeo-task-1')).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
        PLAYLIST_URL,
        VIDEO_SEGMENT_URL,
        AUDIO_SEGMENT_URL
      ])
      for (const call of fetchMock.mock.calls) {
        expect(call[1]).toMatchObject({ credentials: 'omit' })
      }
    } finally {
      document.removeEventListener(DOWNLOAD_PROGRESS_EVENT, listener)
    }
  })

  it('DASH playlist 过期时只刷新一次 config，并复用刷新阶段解析出的 playlist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403, EXPIRED_PLAYLIST_URL))
      .mockResolvedValueOnce(jsonResponse(configRequestFixture(), CONFIG_URL))
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://vimeo.com/refreshed')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await new VimeoDownloadService().handleSingleDownload(
      'vimeo-task-1',
      mediaSource(EXPIRED_PLAYLIST_URL)
    )

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      EXPIRED_PLAYLIST_URL,
      CONFIG_URL,
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL,
      AUDIO_SEGMENT_URL
    ])
  })

  it('Best 刷新后改选 progressive 时仍恢复同一 DASH delivery', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403, EXPIRED_PLAYLIST_URL))
      .mockResolvedValueOnce(jsonResponse(configRequestFixture(true), CONFIG_URL))
      .mockResolvedValueOnce(jsonResponse(playlistFixture(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:https://vimeo.com/refreshed-best')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    await new VimeoDownloadService().handleSingleDownload('vimeo-task-1',
      mediaSource(EXPIRED_PLAYLIST_URL, true)
    )

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      EXPIRED_PLAYLIST_URL,
      CONFIG_URL,
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL,
      AUDIO_SEGMENT_URL
    ])
  })

  it('刷新后的 DASH playlist 仍为 403 时不再递归刷新 config', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403, EXPIRED_PLAYLIST_URL))
      .mockResolvedValueOnce(jsonResponse(configRequestFixture(), CONFIG_URL))
      .mockResolvedValueOnce(statusResponse(403, PLAYLIST_URL))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      new VimeoDownloadService().handleSingleDownload(
        'vimeo-task-1',
        mediaSource(EXPIRED_PLAYLIST_URL)
      )
    ).rejects.toThrow('status=403')

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      EXPIRED_PLAYLIST_URL,
      CONFIG_URL,
      PLAYLIST_URL
    ])
  })
})

/** 构造下载 RPC 媒体源。 */
function mediaSource(dashPlaylistUrl = PLAYLIST_URL, best = false) {
  const sourceId = best ? BEST_SOURCE_ID : SOURCE_ID
  const descriptor = {
    version: 2,
    videoId: VIDEO_ID,
    sourceId,
    optionId: best ? 'best' : 'dash:video-track',
    kind: 'video',
    delivery: 'dash',
    label: '360p HD',
    configUrl: CONFIG_URL,
    refreshConfigUrl: CONFIG_URL,
    dashPlaylistUrl,
    videoTrackId: 'video-track',
    audioTrackId: 'audio-track'
  } as const

  return {
    url: dashPlaylistUrl,
    id: sourceId,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    page: 'content',
    messageId: VIDEO_ID,
    filename: 'controlled-dash.mp4',
    mimeType: 'video/mp4',
    documentId: encodeVimeoSourceDescriptor(descriptor)
  }
}

/** 构造 Vimeo `/config/request` 返回的 DASH 刷新片段。 */
function configRequestFixture(progressiveBecomesBest = false): JsonValue {
  return {
    timestamp: 2_000_000_000,
    expires: 100_000_000,
    config_refresh_url: CONFIG_URL,
    files: {
      progressive: progressiveBecomesBest
        ? [
            {
              quality: '4k',
              width: 3840,
              height: 2160,
              fps: 60,
              bitrate: 20_000_000,
              mime: 'video/mp4',
              url: 'https://vod-progressive-ak.vimeocdn.com/controlled/4k.mp4'
            }
          ]
        : [],
      dash: {
        default_cdn: 'controlled',
        cdns: {
          controlled: { url: PLAYLIST_URL }
        }
      }
    }
  }
}

/** 两条 track 各含 3 字节 init 和 4 字节媒体，聚合总大小为 14。 */
function playlistFixture(): JsonValue {
  return {
    base_url: '',
    video: [
      {
        id: 'video-track',
        base_url: '',
        mime_type: 'video/mp4',
        codecs: 'avc1.64001f',
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

/** 返回两个 2 字节块，验证单 segment 内也会更新进度。 */
function segmentResponse(url: string, contentType: string): Response {
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2]))
        controller.enqueue(Uint8Array.from([3, 4]))
        controller.close()
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': contentType }
    }
  )
  Object.defineProperty(response, 'url', { value: url })
  return response
}
