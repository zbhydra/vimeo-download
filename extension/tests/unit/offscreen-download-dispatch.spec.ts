/**
 * OffscreenTaskRunner 下载分派契约测试。
 *
 * injected 下载链退役后，区间透传、音轨分派、聚合字节进度与 MIME 边界的合同改由 offscreen
 * 执行器承接（原 vimeo-clip-range / vimeo-audio-toggle / vimeo-download-progress /
 * vimeo-media 的分派用例迁移至此）。签名失效重签由 vimeo-signature-refresh.spec 覆盖。
 * mux 层 mock 返回 MuxOutputArtifact（OPFS 产物引用），muxArtifactStore 一并 mock。
 */

import { createCipheriv } from 'node:crypto'

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
  transcodeMp3: vi.fn(),
  openMuxInputWriter: vi.fn(),
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

vi.mock('@/offscreen/mp3', () => ({
  transcodeMuxArtifactToMp3: mocks.transcodeMp3
}))

vi.mock('@/offscreen/muxArtifactStore', () => ({
  sweepMuxArtifacts: mocks.sweepMuxArtifacts,
  openMuxInputWriter: mocks.openMuxInputWriter,
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
const HLS_KEY_URL = 'https://player.vimeo.com/hls-key/demo-key?sig=1'
const HLS_FOREIGN_KEY_URL = 'https://evil.example.com/hls-key/demo-key'

/** 固定测试 key（16 字节），与 encryptHlsSegment 的加密 key 一致。 */
const AES_KEY = Uint8Array.from({ length: 16 }, (_, index) => index + 1)

/** media sequence 0/1 对应的缺省 IV（RFC 8216：128 位 big-endian 序号）。 */
const SEQUENCE_IV_0 = new Uint8Array(16)
const SEQUENCE_IV_1 = Uint8Array.from({ length: 16 }, (_, index) => (index === 15 ? 1 : 0))

/** AES-128-CBC 加密分片字节（PKCS#7 填充，与 HLS 交付口径一致）。 */
function encryptHlsSegment(iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const cipher = createCipheriv('aes-128-cbc', AES_KEY, iv)
  return Uint8Array.from(Buffer.concat([cipher.update(plaintext), cipher.final()]))
}

/** 构造带 AES-128 KEY 声明的 HLS media playlist 文本（不带 IV，走缺省 sequence IV）。 */
function encryptedHlsPlaylistText(options: { keyUrl?: string } = {}): string {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-KEY:METHOD=AES-128,URI="${options.keyUrl ?? HLS_KEY_URL}"`,
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXTINF:2.000,',
    'seg-1.m4s',
    '#EXTINF:2.000,',
    'seg-2.m4s'
  ].join('\n')
}

/** 构造 DASH video 资源；audioTrackId 省略表示无音轨交付。 */
function dashVideoResource(
  options: {
    audioTrackId?: string
    range?: VimeoTimeRange
    timeline?: { startSeconds: number; endSeconds: number }
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
    ...(options.timeline
      ? { videoSegmentTimeline: [options.timeline] }
      : {}),
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

/** 构造 DASH audio-only 资源；`targetFormat` 模拟 popup 的 MP3 导出选择。 */
function dashAudioResource(range?: VimeoTimeRange, targetFormat?: 'mp3'): MediaResource {
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
    metadata: { messageId: VIDEO_ID },
    ...(targetFormat ? { targetFormat } : {})
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
    mocks.transcodeMp3.mockImplementation(async (artifact: { tempFileName: string }) => ({
      file: new File(['mp3'], `${artifact.tempFileName}.mp3`, { type: 'audio/mpeg' }),
      mimeType: 'audio/mpeg',
      tempFileName: `${artifact.tempFileName}.mp3`
    }))
    mocks.openMuxInputWriter.mockImplementation(async (fileName: string) => {
      const chunks: Uint8Array[] = []
      return {
        fileName,
        write: vi.fn(async (chunk: Uint8Array) => {
          chunks.push(chunk.slice())
        }),
        finalize: vi.fn(async () => new File(chunks, fileName)),
        dispose: vi.fn(async () => undefined)
      }
    })
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

    expect(
      offscreenTaskRunner.startTask(
        'dispatch-clip-video',
        dashVideoResource({ range: CLIP, timeline: { startSeconds: 10, endSeconds: 40 } })
      )
    ).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.muxVideo).toHaveBeenCalledTimes(1)
    expect(mocks.muxVideo.mock.calls[0][2]).toEqual({ startSeconds: 2.5, endSeconds: 20 })
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

  it('streamingMode=never 时按分片写 OPFS 输入并在 remux 后清理', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
        .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    )

    const resource = dashAudioResource()
    resource.streamingMode = 'never'
    expect(offscreenTaskRunner.startTask('dispatch-never-audio', resource)).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.openMuxInputWriter).toHaveBeenCalledWith('dispatch-never-audio-input-audio')
    const writer = mocks.openMuxInputWriter.mock.results[0].value as Promise<{
      write: ReturnType<typeof vi.fn>
    }>
    const resolvedWriter = await writer
    expect(resolvedWriter.write).toHaveBeenCalledTimes(2)
    expect(mocks.remuxAudio.mock.calls[0][0]).toBeInstanceOf(File)
    expect(mocks.removeMuxArtifact).toHaveBeenCalledWith('dispatch-never-audio-input-audio')
  })

  it('签名 restart 后仍保留 never 模式并使用 OPFS File 输入', async () => {
    const resource = dashAudioResource()
    resource.streamingMode = 'never'
    mocks.refreshSignatureRequest.mockResolvedValue({
      mode: 'restart',
      resource: dashAudioResource()
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithUrl('', 403, PLAYLIST_URL, 'application/json'))
      .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
      .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    vi.stubGlobal('fetch', fetchMock)

    expect(offscreenTaskRunner.startTask('dispatch-restart-never', resource)).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.openMuxInputWriter).toHaveBeenCalledWith('dispatch-restart-never-input-audio')
    expect(mocks.remuxAudio.mock.calls.at(-1)?.[0]).toBeInstanceOf(File)
    await vi.waitFor(() => expect(offscreenTaskRunner.listActiveTasks()).toHaveLength(0))
  })

  it('音频资源缺省按 m4a 交付，不进 MP3 转码链', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
        .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    )

    expect(offscreenTaskRunner.startTask('dispatch-audio-m4a', dashAudioResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.transcodeMp3).not.toHaveBeenCalled()
    expect(mocks.taskComplete.mock.calls[0][0]).toMatchObject({
      taskId: 'dispatch-audio-m4a',
      filename: 'controlled-audio.m4a',
      mimeType: 'audio/mp4'
    })
  })

  it('targetFormat=mp3 时在 m4a remux 产物上继续转码，交付 mp3 产物与扩展名', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(dashPlaylistPayload(), PLAYLIST_URL))
        .mockResolvedValueOnce(segmentResponse(AUDIO_SEGMENT_URL, 'audio/mp4'))
    )

    const resource = dashAudioResource(undefined, 'mp3')
    resource.streamingMode = 'never'
    expect(offscreenTaskRunner.startTask('dispatch-audio-mp3', resource)).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    // 转码输入是 remux 产物（OPFS File 引用），不是下载 blob。
    expect(mocks.transcodeMp3).toHaveBeenCalledTimes(1)
    expect(mocks.openMuxInputWriter).toHaveBeenCalledWith('dispatch-audio-mp3-input-audio')
    const [transcodeInput, transcodeTaskId] = mocks.transcodeMp3.mock.calls[0]
    expect(transcodeTaskId).toBe('dispatch-audio-mp3')
    expect(transcodeInput).toMatchObject({ tempFileName: 'dispatch-audio-mp3.m4a' })

    expect(mocks.taskComplete.mock.calls[0][0]).toMatchObject({
      taskId: 'dispatch-audio-mp3',
      // 资源自带名仍指向 .m4a，交付名按本次产物扩展名重写。
      filename: 'controlled-audio.mp3',
      mimeType: 'audio/mpeg'
    })
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

  it('HLS streamingMode=never 时按顺序写单个 OPFS 输入并清理', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(hlsMediaPlaylistText(), 200, HLS_MEDIA_URL, 'application/vnd.apple.mpegurl')
      )
      .mockResolvedValueOnce(segmentResponse(HLS_INIT_URL, 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(HLS_SEGMENT_URLS[0], 'video/mp4'))
      .mockResolvedValueOnce(segmentResponse(HLS_SEGMENT_URLS[1], 'video/mp4'))
    vi.stubGlobal('fetch', fetchMock)

    const resource = hlsResource()
    resource.streamingMode = 'never'
    expect(offscreenTaskRunner.startTask('dispatch-never-hls', resource)).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    expect(mocks.openMuxInputWriter).toHaveBeenCalledWith('dispatch-never-hls-input-hls')
    const resolvedWriter = (await mocks.openMuxInputWriter.mock.results[0].value) as {
      write: ReturnType<typeof vi.fn>
    }
    expect(resolvedWriter.write).toHaveBeenCalledTimes(3)
    expect(mocks.remuxMuxed.mock.calls[0][0]).toBeInstanceOf(File)
    expect(mocks.removeMuxArtifact).toHaveBeenCalledWith('dispatch-never-hls-input-hls')
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

  it('HLS 加密分片 fetch 后解密再喂 mux：产物字节与明文一致，key 按任务缓存', async () => {
    // 不带 IV 属性：分片 IV 按缺省 media sequence（0、1）构造，端到端验证缺省 IV 链路。
    // fetch 顺序体现实现口径：先取分片字节、首个加密分片处再取 key（缓存后供 seg-2 复用）。
    const plaintext1 = Uint8Array.from({ length: 32 }, (_, index) => index)
    const plaintext2 = Uint8Array.from([9, 8, 7])
    const initBytes = Uint8Array.from([1, 1, 1, 1])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptedHlsPlaylistText(),
          200,
          HLS_MEDIA_URL,
          'application/vnd.apple.mpegurl'
        )
      )
      .mockResolvedValueOnce(responseWithUrl(initBytes, 200, HLS_INIT_URL, 'video/mp4'))
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptHlsSegment(SEQUENCE_IV_0, plaintext1),
          200,
          HLS_SEGMENT_URLS[0],
          'video/mp4'
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(AES_KEY, 200, HLS_KEY_URL, 'application/octet-stream')
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptHlsSegment(SEQUENCE_IV_1, plaintext2),
          200,
          HLS_SEGMENT_URLS[1],
          'video/mp4'
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    expect(offscreenTaskRunner.startTask('hls-aes-roundtrip', hlsResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskComplete).toHaveBeenCalledTimes(1))

    // init 明文先取（RFC 8216：EXT-X-KEY 只作用于 media segment）；key 仅请求一次。
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      HLS_MEDIA_URL,
      HLS_INIT_URL,
      ...HLS_SEGMENT_URLS.slice(0, 1),
      HLS_KEY_URL,
      ...HLS_SEGMENT_URLS.slice(1)
    ])
    expect(fetchMock.mock.calls.filter(call => call[0] === HLS_KEY_URL)).toHaveLength(1)

    const inputBlob = mocks.remuxMuxed.mock.calls[0][0] as Blob
    const muxedBytes = new Uint8Array(await inputBlob.arrayBuffer())
    expect(Array.from(muxedBytes)).toEqual([...initBytes, ...plaintext1, ...plaintext2])
  })

  it('key URL 不在 Vimeo fetch 白名单时拒绝任务，且不发起该请求', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptedHlsPlaylistText({ keyUrl: HLS_FOREIGN_KEY_URL }),
          200,
          HLS_MEDIA_URL,
          'application/vnd.apple.mpegurl'
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(Uint8Array.from([1, 1, 1, 1]), 200, HLS_INIT_URL, 'video/mp4')
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptHlsSegment(SEQUENCE_IV_0, Uint8Array.from([1, 2, 3])),
          200,
          HLS_SEGMENT_URLS[0],
          'video/mp4'
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    expect(offscreenTaskRunner.startTask('hls-aes-foreign-key', hlsResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskFailed).toHaveBeenCalledTimes(1))

    // 白名单校验在 key 请求发起前：foreign key URL 不应出现在任何 fetch 调用里。
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      HLS_MEDIA_URL,
      HLS_INIT_URL,
      HLS_SEGMENT_URLS[0]
    ])
    expect(mocks.taskFailed.mock.calls[0][0].message).toContain('不在 Vimeo fetch 白名单')
    expect(mocks.remuxMuxed).not.toHaveBeenCalled()
  })

  it('key 响应经 30x 重定向到白名单外主机时拒绝任务，且不消费该响应', async () => {
    // 白名单只校验 playlist 声明的 key URL；30x 跟随后最终 URL 落在白名单外同样拒绝。
    const foreignKeyResponse = responseWithUrl(
      AES_KEY,
      200,
      HLS_FOREIGN_KEY_URL,
      'application/octet-stream'
    )
    const arrayBufferSpy = vi.spyOn(foreignKeyResponse, 'arrayBuffer')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptedHlsPlaylistText(),
          200,
          HLS_MEDIA_URL,
          'application/vnd.apple.mpegurl'
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(Uint8Array.from([1, 1, 1, 1]), 200, HLS_INIT_URL, 'video/mp4')
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptHlsSegment(SEQUENCE_IV_0, Uint8Array.from([1, 2, 3])),
          200,
          HLS_SEGMENT_URLS[0],
          'video/mp4'
        )
      )
      .mockResolvedValueOnce(foreignKeyResponse)
    vi.stubGlobal('fetch', fetchMock)

    expect(offscreenTaskRunner.startTask('hls-aes-key-redirect', hlsResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskFailed).toHaveBeenCalledTimes(1))

    expect(mocks.taskFailed.mock.calls[0][0].message).toContain('重定向后 URL 不在 Vimeo fetch 白名单')
    // 重定向复检在读取字节前：foreign host 的响应体不得被消费。
    expect(arrayBufferSpy).not.toHaveBeenCalled()
    expect(mocks.remuxMuxed).not.toHaveBeenCalled()
  })

  it('key 与分片不匹配时解密失败进入任务失败链', async () => {
    const wrongKey = Uint8Array.from({ length: 16 }, (_, index) => 255 - index)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptedHlsPlaylistText(),
          200,
          HLS_MEDIA_URL,
          'application/vnd.apple.mpegurl'
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(Uint8Array.from([1, 1, 1, 1]), 200, HLS_INIT_URL, 'video/mp4')
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          encryptHlsSegment(SEQUENCE_IV_0, Uint8Array.from([1, 2, 3])),
          200,
          HLS_SEGMENT_URLS[0],
          'video/mp4'
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(wrongKey, 200, HLS_KEY_URL, 'application/octet-stream')
      )
    vi.stubGlobal('fetch', fetchMock)

    expect(offscreenTaskRunner.startTask('hls-aes-wrong-key', hlsResource())).toBe(true)
    await vi.waitFor(() => expect(mocks.taskFailed).toHaveBeenCalledTimes(1))

    expect(mocks.taskFailed.mock.calls[0][0].message).toContain('AES-CBC 分片解密失败')
    expect(mocks.remuxMuxed).not.toHaveBeenCalled()
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
