/**
 * OffscreenTaskRunner 下载分派契约测试。
 *
 * injected 下载链退役后，区间透传、音轨分派、聚合字节进度与 MIME 边界的合同改由 offscreen
 * 执行器承接（原 vimeo-clip-range / vimeo-audio-toggle / vimeo-download-progress /
 * vimeo-media 的分派用例迁移至此）。签名失效重签由 vimeo-signature-refresh.spec 覆盖。
 * mux 层 mock 返回 MuxOutputArtifact（OPFS 产物引用），muxArtifactStore 一并 mock。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  taskProgress: vi.fn(),
  taskComplete: vi.fn(),
  taskFailed: vi.fn(),
  taskCancelled: vi.fn(),
  refreshSignatureRequest: vi.fn(),
  keepAlive: vi.fn(),
  muxVideo: vi.fn(),
  remuxAudio: vi.fn(),
  remuxMuxed: vi.fn(),
  removeMuxArtifact: vi.fn(),
  sweepMuxArtifacts: vi.fn()
}))

vi.mock('@/offscreen/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    taskProgress = mocks.taskProgress
    taskComplete = mocks.taskComplete
    taskFailed = mocks.taskFailed
    taskCancelled = mocks.taskCancelled
    refreshSignatureRequest = mocks.refreshSignatureRequest
    keepAlive = mocks.keepAlive
  }
}))

vi.mock('@/offscreen/mux', () => ({
  muxVimeoVideoToMp4: mocks.muxVideo,
  remuxVimeoAudioToM4a: mocks.remuxAudio,
  remuxVimeoMuxedMp4ToMp4: mocks.remuxMuxed
}))

vi.mock('@/offscreen/muxArtifactStore', () => ({
  sweepMuxArtifacts: mocks.sweepMuxArtifacts,
  removeMuxArtifact: mocks.removeMuxArtifact
}))

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import {
  encodeVimeoSourceDescriptor,
  type VimeoSourceDescriptor,
  type VimeoTimeRange
} from '@/sites/vimeo/shared'
import { offscreenTaskRunner } from '@/offscreen/OffscreenTaskRunner'

const VIDEO_ID = '1196869805'
const PLAYLIST_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/master.json'
const VIDEO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/video-1.m4s'
const AUDIO_SEGMENT_URL = 'https://vod-adaptive-ak.vimeocdn.com/controlled/audio-1.m4s'
const HLS_MEDIA_URL = 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/prog.m3u8'
const HLS_INIT_URL = 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/init.mp4'
const HLS_SEGMENT_URLS = [
  'https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-1.m4s',
  'https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-2.m4s'
]
const CLIP: VimeoTimeRange = { startSeconds: 12.5, endSeconds: 30 }

/** 构造 DASH video 资源；audioTrackId 省略表示无音轨交付。 */
function dashVideoResource(
  options: {
    audioTrackId?: string
    range?: VimeoTimeRange
    taskIdSuffix?: string
  } = {}
): MediaResource {
  const optionId = options.audioTrackId ? 'dash:video-track' : 'dash:video-track:no-audio'
  const sourceId = `vimeo:${VIDEO_ID}:video:${optionId}${options.taskIdSuffix ?? ''}`
  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId: VIDEO_ID,
    sourceId,
    optionId,
    kind: 'video',
    delivery: 'dash',
    label: '360p HD',
    configUrl: `https://player.vimeo.com/video/${VIDEO_ID}/config?expires=1&signature=x`,
    dashPlaylistUrl: PLAYLIST_URL,
    videoTrackId: 'video-track',
    ...(options.audioTrackId ? { audioTrackId: options.audioTrackId } : {}),
    ...(options.range ?? {})
  }

  return {
    id: sourceId,
    messageId: VIDEO_ID,
    index: 0,
    url: PLAYLIST_URL,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    mimeType: 'video/mp4',
    filename: 'controlled-dash.mp4',
    size: 14,
    documentId: encodeVimeoSourceDescriptor(descriptor),
    metadata: { messageId: VIDEO_ID }
  }
}

/** 构造 DASH audio-only 资源。 */
function dashAudioResource(range?: VimeoTimeRange): MediaResource {
  const sourceId = `vimeo:${VIDEO_ID}:audio:dash:audio-track`
  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId: VIDEO_ID,
    sourceId,
    optionId: '195kbps',
    kind: 'audio',
    delivery: 'dash',
    label: '195 kbps',
    configUrl: `https://player.vimeo.com/video/${VIDEO_ID}/config?expires=1&signature=x`,
    dashPlaylistUrl: PLAYLIST_URL,
    audioTrackId: 'audio-track',
    ...(range ?? {})
  }

  return {
    id: sourceId,
    messageId: VIDEO_ID,
    index: 0,
    url: PLAYLIST_URL,
    type: RESOURCE_TYPES.AUDIO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO,
    mimeType: 'audio/mp4',
    filename: 'controlled-audio.m4a',
    size: 7,
    documentId: encodeVimeoSourceDescriptor(descriptor),
    metadata: { messageId: VIDEO_ID }
  }
}

/** 构造 HLS fallback 视频资源。 */
function hlsResource(range?: VimeoTimeRange): MediaResource {
  const sourceId = `vimeo:${VIDEO_ID}:video:hls:1080p:2500`
  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId: VIDEO_ID,
    sourceId,
    optionId: 'hls:1080p:2500',
    kind: 'video',
    delivery: 'hls',
    label: '1080p HLS',
    configUrl: `https://player.vimeo.com/video/${VIDEO_ID}/config?expires=1&signature=x`,
    hlsPlaylistUrl: HLS_MEDIA_URL,
    ...(range ?? {})
  }

  return {
    id: sourceId,
    messageId: VIDEO_ID,
    index: 0,
    url: HLS_MEDIA_URL,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO,
    mimeType: 'video/mp4',
    filename: 'controlled-hls.mp4',
    size: 12,
    documentId: encodeVimeoSourceDescriptor(descriptor),
    metadata: { messageId: VIDEO_ID }
  }
}

/** DASH playlist：两条 track 各含 3 字节 init 和 4 字节媒体，聚合总大小 14。 */
function dashPlaylistPayload(audio: boolean = true) {
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
    audio: audio
      ? [
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
      : []
  }
}

/** 构造带 final URL 的响应。 */
function responseWithUrl(
  body: BodyInit,
  status: number,
  url: string,
  contentType: string
): Response {
  const response = new Response(body, { status, headers: { 'Content-Type': contentType } })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

/** JSON 响应并保留生产 URL 校验需要的 final URL。 */
function jsonResponse(body: unknown, url: string): Response {
  return responseWithUrl(JSON.stringify(body), 200, url, 'application/json')
}

/** 媒体分片响应（4 字节）。 */
function segmentResponse(url: string, contentType: string): Response {
  return responseWithUrl(Uint8Array.from([1, 2, 3, 4]), 200, url, contentType)
}

/** happy-dom 不保证实现 blob URL 静态方法：显式接管。 */
const createObjectUrlMock = vi.fn(() => 'blob:mock-artifact')
const revokeObjectUrlMock = vi.fn()
const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('OffscreenTaskRunner 下载分派', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.taskProgress.mockResolvedValue({ recorded: true })
    mocks.taskComplete.mockResolvedValue({ accepted: true })
    mocks.taskFailed.mockResolvedValue({ accepted: true })
    mocks.keepAlive.mockResolvedValue({ alive: true })
    mocks.removeMuxArtifact.mockResolvedValue(undefined)
    mocks.sweepMuxArtifacts.mockResolvedValue(undefined)
    // 产物契约：MuxOutputArtifact（OPFS File 引用 + 显式 MIME + 临时文件名）
    mocks.muxVideo.mockImplementation(
      async (_video: Blob, _audio: Blob | null, _range: VimeoTimeRange | undefined, taskId: string) =>
        artifactMock(taskId, 'mp4', 'video/mp4')
    )
    mocks.remuxAudio.mockImplementation(
      async (_blob: Blob, _range: VimeoTimeRange | undefined, taskId: string) =>
        artifactMock(taskId, 'm4a', 'audio/mp4')
    )
    mocks.remuxMuxed.mockImplementation(
      async (_blob: Blob, _range: VimeoTimeRange | undefined, taskId: string) =>
        artifactMock(taskId, 'mp4', 'video/mp4')
    )
    URL.createObjectURL = createObjectUrlMock
    URL.revokeObjectURL = revokeObjectUrlMock
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectURL
    vi.unstubAllGlobals()
  })

  it('DASH video 描述符带区间时把区间透传给 mux', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
        .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
        .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    )

    expect(offscreenTaskRunner.startTask('dispatch-clip-video', dashVideoResource({ range: CLIP }))).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.muxVideo).toHaveBeenCalledTimes(1)
    expect(mocks.muxVideo.mock.calls[0][2]).toEqual(CLIP)
  })

  it('没有区间时保持整片调用形态，不传裁剪参数', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
        .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
        .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    )

    expect(offscreenTaskRunner.startTask('dispatch-full-video', dashVideoResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.muxVideo.mock.calls[0][2]).toBeUndefined()
  })

  it('DASH audio 把区间透传给 audio remux', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
        .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    )

    expect(
      offscreenTaskRunner.startTask('dispatch-clip-audio', dashAudioResource(CLIP))
    ).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.remuxAudio).toHaveBeenCalledTimes(1)
    expect(mocks.remuxAudio.mock.calls[0][1]).toEqual(CLIP)
  })

  it('HLS 把区间透传给 muxed remux，并按 init+segments 顺序抓取', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(hlsMediaPlaylistText(), 200, HLS_MEDIA_URL, 'application/vnd.apple.mpegurl')
      )
      .mockResolvedValueOnce(segmentResponse(HLS_INIT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(HLS_SEGMENT_URLS[0], 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(HLS_SEGMENT_URLS[1], 'video/mp4'))
    vi.stubGlobal('fetch', fetchMock)

    expect(offscreenTaskRunner.startTask('dispatch-clip-hls', hlsResource(CLIP))).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      HLS_MEDIA_URL,
      HLS_INIT_URL,
      ...HLS_SEGMENT_URLS
    ])
    expect(mocks.remuxMuxed).toHaveBeenCalledTimes(1)
    expect(mocks.remuxMuxed.mock.calls[0][1]).toEqual(CLIP)
  })

  it('无音轨描述符只下载视频分片并走单轨 mux', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
    vi.stubGlobal('fetch', fetchMock)

    expect(
      offscreenTaskRunner.startTask('dispatch-mute-video', dashVideoResource())
    ).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([PLAYLIST_URL, VIDEO_SEGMENT_URL])
    const [videoBlob, audioBlob] = mocks.muxVideo.mock.calls[0]
    expect(videoBlob).toBeInstanceOf(Blob)
    expect(audioBlob).toBeNull()
  })

  it('有音轨描述符仍下载两条轨并 mux 成带音频文件', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)

    expect(
      offscreenTaskRunner.startTask(
        'dispatch-audio-video',
        dashVideoResource({ audioTrackId: 'audio-track' })
      )
    ).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL,
      AUDIO_SEGMENT_URL
    ])
    const [, audioBlob] = mocks.muxVideo.mock.calls[0]
    expect(audioBlob).toBeInstanceOf(Blob)
  })

  it('描述符声明了 audio track 但 playlist 已无该轨时明确失败', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(false), PLAYLIST_URL))
    )

    expect(
      offscreenTaskRunner.startTask(
        'dispatch-missing-audio',
        dashVideoResource({ audioTrackId: 'audio-track' })
      )
    ).toBe(true)
    await vi.waitFor(() => expect(mocks.taskFailed).toHaveBeenCalledTimes(1))

    expect(mocks.muxVideo).not.toHaveBeenCalled()
    expect(mocks.taskFailed.mock.calls[0][0].message).toContain('DASH audio track 不存在')
  })

  it('DASH 聚合字节经 taskProgress 回传，产物 blob 交 background 落盘', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(VIDEO_SEGMENT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)

    expect(
      offscreenTaskRunner.startTask(
        'dispatch-progress',
        dashVideoResource({ audioTrackId: 'audio-track' })
      )
    ).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    // 分发入口先强制回传一次 null，随后预算建立回传 0 与整份媒体总字节；终态前回传 100，
    // 中间值受 250ms 节流约束只要求单调不减。
    const progressPayloads = mocks.taskProgress.mock.calls.map(call => call[0])
    expect(progressPayloads[0]).toMatchObject({ progress: null, totalBytes: null })
    expect(progressPayloads[1]).toMatchObject({ progress: 0, totalBytes: 14 })
    expect(progressPayloads.at(-1)).toMatchObject({ progress: 100 })
    const reported = progressPayloads
      .map(payload => payload.progress)
      .filter((progress): progress is number => progress !== null)
    expect([...reported].sort((left, right) => left - right)).toEqual(reported)

    // 所有请求都不携带凭证；产物文件名与 MIME 随 taskComplete 交付。
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      PLAYLIST_URL,
      VIDEO_SEGMENT_URL,
      AUDIO_SEGMENT_URL
    ])
    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toMatchObject({ credentials: 'omit' })
    }
    expect(mocks.taskComplete.mock.calls[0][0]).toMatchObject({
      taskId: 'dispatch-progress',
      filename: 'controlled-dash.mp4',
      mimeType: 'video/mp4'
    })
  })

  it('HLS media playlist MIME 不符时在读取文本前失败', async () => {
    const response = responseWithUrl('{"login":true}', 200, HLS_MEDIA_URL, 'application/json')
    const textSpy = vi.spyOn(response, 'text')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)))

    expect(offscreenTaskRunner.startTask('dispatch-hls-mime', hlsResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskFailed).toHaveBeenCalledTimes(1))

    expect(mocks.taskFailed.mock.calls[0][0].message).toContain('响应 MIME 与资源不匹配')
    expect(textSpy).not.toHaveBeenCalled()
  })

  it('HLS 分片 MIME 不符时在读取字节前失败', async () => {
    const playlistResponse = responseWithUrl(
      hlsMediaPlaylistText(),
      200,
      HLS_MEDIA_URL,
      'application/vnd.apple.mpegurl'
    )
    const htmlSegment = responseWithUrl('<html>login</html>', 200, HLS_INIT_URL, 'text/html')
    const arrayBufferSpy = vi.spyOn(htmlSegment, 'arrayBuffer')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(playlistResponse).mockResolvedValueOnce(htmlSegment)
    )

    expect(offscreenTaskRunner.startTask('dispatch-hls-segment-mime', hlsResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskFailed).toHaveBeenCalledTimes(1))

    expect(mocks.taskFailed.mock.calls[0][0].message).toContain('响应 MIME 与资源不匹配')
    expect(arrayBufferSpy).not.toHaveBeenCalled()
  })
})

/** HLS fMP4 media playlist 文本；init 与两个分片均为相对地址。 */
function hlsMediaPlaylistText(): string {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXTINF:2.000,',
    'seg-1.m4s',
    '#EXTINF:2.000,',
    'seg-2.m4s'
  ].join('\n')
}

/** 构造 MuxOutputArtifact 形状的产物桩。 */
function artifactMock(taskId: string, extension: string, mimeType: string) {
  const tempFileName = `${taskId}.${extension}`
  return {
    file: new File([tempFileName], tempFileName, { type: mimeType }),
    mimeType,
    tempFileName
  }
}
