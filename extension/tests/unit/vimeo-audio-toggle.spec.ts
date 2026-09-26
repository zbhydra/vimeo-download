/**
 * Vimeo DASH「有音轨 / 无音轨」视频交付的选项模型与描述符边界。
 *
 * 下载分派（无音轨走单轨 mux 等）已随 injected 下载链退役，等价合同由
 * offscreen-download-dispatch.spec 以 offscreen 执行器覆盖。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { JsonValue } from '@/core/rpc/types'
import { DEFAULT_VIMEO_CONFIG } from '@/sites/vimeo/runtimeConfig'
import {
  buildVimeoDownloadOptions,
  parseVimeoConfig,
  parseVimeoDashPlaylist
} from '@/sites/vimeo/media'
import { decodeVimeoSourceDescriptor, encodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

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

/** DASH playlist 夹具参数。 */
interface PlaylistFixtureInput {
  /** 覆盖 audio 轨列表；传空数组表示 playlist 无音轨。 */
  readonly audio?: readonly JsonValue[]
  /** 覆盖 video segment 声明大小。 */
  readonly videoSegmentSize?: number
  /** 覆盖 audio segment 声明大小。 */
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

