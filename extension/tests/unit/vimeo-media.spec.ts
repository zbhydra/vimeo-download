import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { DownloadTaskSnapshot, MediaResource } from '@/core/types'
import {
  loadVimeoResourcesFromCapturedConfig,
  loadVimeoResourcesFromConfigUrl,
  refreshVimeoDirectResourcesFromConfigUrl
} from '@/sites/vimeo/config'
import { VimeoButtonPanel } from '@/sites/vimeo/content/buttons'
import { I18nService } from '@/locales'
import zhCN from '@/locales/zh-CN.json'
import { I18N_KEYS } from '@/core/constants/i18n'
import { DEFAULT_VIMEO_CONFIG } from '@/sites/vimeo/runtimeConfig'
import {
  buildVimeoDownloadOptions,
  createVimeoResource,
  estimateDashTrackBytes,
  getVimeoResourceLabel,
  parseVimeoConfig,
  parseVimeoDashPlaylist,
  parseVimeoHlsMediaPlaylist,
  parseVimeoHlsMasterPlaylist,
  type VimeoHlsVariant
} from '@/sites/vimeo/media'
import { logger } from '@/core/utils/logger'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor,
  extractVimeoIdentityFromDocument,
  isVimeoFrameIdentityAttachedToDocument,
  parseVimeoIdentityFromUrl
} from '@/sites/vimeo/shared'

const CONFIG_URL =
  'https://player.vimeo.com/video/1201819515/config?airplay=1&context=player&h=dc93ef4923&s=native_signature_1999999999'
const REFRESH_CONFIG_URL =
  'https://player.vimeo.com/video/1201819515/config/request?expires=1999999999&signature=refresh_signature'
const PLAYLIST_URL = 'https://vod-adaptive-ak.vimeocdn.com/exp/master.json'
const HLS_MASTER_URL = 'https://vod-adaptive-ak.vimeocdn.com/hls/master.m3u8'
const HLS_MEDIA_URL = 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/prog.m3u8'
const HLS_KEY_URL = 'https://player.vimeo.com/hls-key/demo?sig=1'

describe('Vimeo media parsing', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts video id from og video, iframe, canonical and current URL', () => {
    document.head.innerHTML = `
      <meta property="og:video:url" content="https://player.vimeo.com/video/1201819515?h=dc93ef4923" />
      <link rel="canonical" href="https://vimeo.com/111" />
    `

    expect(extractVimeoIdentityFromDocument(document, 'https://vimeo.com/222')).toEqual({
      videoId: '1201819515'
    })
    const iframeIdentity = parseVimeoIdentityFromUrl(
      'https://player.vimeo.com/video/777?h=hash777',
      'https://vimeo.com/777'
    )
    expect(iframeIdentity).toEqual({ videoId: '777' })
    expect(parseVimeoIdentityFromUrl('https://vimeo.com/888')?.videoId).toBe('888')
  })

  it('computes signed media expiry from Vimeo timestamp and TTL', () => {
    const config = parseVimeoConfig(configFixture({ timestamp: 1_800_000_000, expires: 3600 }), CONFIG_URL)

    expect(config.expiresAt).toBe(1_800_003_600)
  })

  it('parses the native config/request fragment using the signed URL video id', () => {
    const config = parseVimeoConfig(configRequestFixture({ dash: false }), REFRESH_CONFIG_URL)

    expect(config.videoId).toBe('1201819515')
    expect(config.title).toBe('vimeo-video')
    expect(config.progressive.map(file => file.url)).toContain(
      'https://vod-progressive-ak.vimeocdn.com/1080.mp4'
    )
  })

  it('builds progressive, DASH, audio and thumbnail resources with adaptive Best', () => {
    const config = parseVimeoConfig(configFixture(), CONFIG_URL)
    const playlist = parseVimeoDashPlaylist(dashPlaylistFixture(2160), PLAYLIST_URL)
    const options = buildVimeoDownloadOptions(config, playlist)
    const resources = options.map((option, index) => createVimeoResource(option, index))

    const bestVideo = resources.find(resource => resource.id === 'vimeo:1201819515:video:best')
    const bestAudio = resources.find(resource => resource.id === 'vimeo:1201819515:audio:best')
    const thumbnail = resources.find(resource => resource.id === 'vimeo:1201819515:image:thumbnail')
    const bestDescriptor = decodeVimeoSourceDescriptor(bestVideo?.documentId)

    expect(bestVideo?.sourceKind).toBe(RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO)
    expect(bestVideo?.url).toBe(PLAYLIST_URL)
    expect(bestDescriptor).toMatchObject({
      version: 2,
      delivery: 'dash',
      dashPlaylistUrl: PLAYLIST_URL,
      videoTrackId: 'v-2160',
      audioTrackId: 'a-256',
      optionId: 'best'
    })
    expect(bestAudio?.sourceKind).toBe(RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO)
    expect(thumbnail?.url).toBe('https://i.vimeocdn.com/video/high.jpg')
    expect(resources.map(resource => resource.id)).toContain(
      'vimeo:1201819515:video:progressive:1080p:30'
    )
    expect(resources.map(resource => resource.id)).toContain('vimeo:1201819515:audio:dash:a-149')
  })

  it('档位词条键随描述符走到 UI，zh-CN 下渲染中文而不是英文 label', () => {
    const config = parseVimeoConfig(configFixture(), CONFIG_URL)
    const playlist = parseVimeoDashPlaylist(dashPlaylistFixture(2160), PLAYLIST_URL)
    const resources = buildVimeoDownloadOptions(config, playlist).map((option, index) =>
      createVimeoResource(option, index)
    )
    const videoOnlyPlaylist = parseVimeoDashPlaylist(
      { base_url: '', video: [dashVideoTrackFixture(1080)], audio: [] },
      PLAYLIST_URL
    )
    const noAudio = buildVimeoDownloadOptions(config, videoOnlyPlaylist)
      .map((option, index) => createVimeoResource(option, index))
      .find(resource => resource.id === 'vimeo:1201819515:video:dash:v-1080:no-audio')
    const translate = (key: string, params?: Record<string, string>) =>
      I18nService.t(key, params, 'zh-CN')
    const labelOf = (id: string) =>
      getVimeoResourceLabel(
        resources.find(resource => resource.id === id) as MediaResource,
        translate
      )

    // en-US 的键值与 media 层的回退 label 逐字相同，只有换语言才能证明词条真的生效。
    expect(labelOf('vimeo:1201819515:video:best')).toBe(zhCN['resourceItem.label.best'])
    expect(labelOf('vimeo:1201819515:audio:best')).toBe(zhCN['resourceItem.label.bestAudio'])
    expect(labelOf('vimeo:1201819515:image:thumbnail')).toBe(zhCN['resourceItem.label.thumbnail'])
    expect(getVimeoResourceLabel(noAudio as MediaResource, translate)).toBe(
      zhCN['resourceItem.label.videoNoAudio'].replace('{quality}', '1080p')
    )
    // 技术标识没有词条键，保持原样。
    expect(labelOf('vimeo:1201819515:video:progressive:1080p:30')).toBe('1080p MP4')
  })

  it('读取作者与时长并透传到同一视频的每个档位，缺失时保持 undefined', () => {
    const withMeta = parseVimeoConfig(
      configFixture({ ownerName: 'Demo Author', duration: 3725 }),
      CONFIG_URL
    )
    expect(withMeta.author).toBe('Demo Author')
    expect(withMeta.duration).toBe(3725)

    const resources = buildVimeoDownloadOptions(withMeta, null).map((option, index) =>
      createVimeoResource(option, index)
    )
    const bestVideo = resources.find(resource => resource.id === 'vimeo:1201819515:video:best')
    const thumbnail = resources.find(resource => resource.id === 'vimeo:1201819515:image:thumbnail')
    expect(bestVideo).toMatchObject({ author: 'Demo Author', duration: 3725 })
    expect(thumbnail).toMatchObject({ author: 'Demo Author', duration: 3725 })

    const withoutMeta = parseVimeoConfig(configFixture(), CONFIG_URL)
    expect(withoutMeta.author).toBeUndefined()
    expect(withoutMeta.duration).toBeUndefined()
  })

  it('config/request 刷新片段不带 video 时沿用刷新前的作者与时长', () => {
    const base = parseVimeoConfig(
      configFixture({ ownerName: 'Demo Author', duration: 754 }),
      CONFIG_URL
    )
    const refreshed = parseVimeoConfig(
      configRequestFixture({ dash: false }),
      REFRESH_CONFIG_URL,
      base
    )

    expect(refreshed.author).toBe('Demo Author')
    expect(refreshed.duration).toBe(754)
  })

  it('解析组元数据：标题/作者/时长/封面取 config 原值并透传到每个档位', () => {
    const thumbnailUrl = 'https://i.vimeocdn.com/video/democover_640'
    const config = parseVimeoConfig(
      configFixture({ ownerName: 'Demo Author', duration: 731, thumbnailUrl }),
      CONFIG_URL
    )
    expect(config.groupMetadata).toEqual({
      title: 'Demo Video',
      author: 'Demo Author',
      durationSeconds: 731,
      thumbnailUrl
    })

    const resources = buildVimeoDownloadOptions(config, null).map((option, index) =>
      createVimeoResource(option, index)
    )
    expect(resources.length).toBeGreaterThan(1)
    for (const resource of resources) {
      expect(resource.groupMetadata).toEqual(config.groupMetadata)
    }
  })

  it('thumbs 字典缺失时用 thumbnail_url 兜底出唯一封面档，Image 资源照常产出', () => {
    const thumbnailUrl = 'https://i.vimeocdn.com/video/democover_640'
    const config = parseVimeoConfig(
      configFixture({ thumbnailUrl, thumbs: null }),
      CONFIG_URL
    )
    expect(config.thumbnails).toEqual([{ url: thumbnailUrl, width: undefined }])

    const imageResources = buildVimeoDownloadOptions(config, null)
      .filter(option => option.kind === 'image')
      .map((option, index) => createVimeoResource(option, index))
    expect(imageResources).toHaveLength(1)
    expect(imageResources[0]?.id).toBe('vimeo:1201819515:image:thumbnail')
    expect(imageResources[0]?.url).toBe(thumbnailUrl)
  })

  it('thumbs 字典存在时不做 thumbnail_url 兜底', () => {
    const config = parseVimeoConfig(
      configFixture({ thumbnailUrl: 'https://i.vimeocdn.com/video/democover_640' }),
      CONFIG_URL
    )
    expect(config.thumbnails.map(thumbnail => thumbnail.url)).toEqual([
      'https://i.vimeocdn.com/video/high.jpg',
      'https://i.vimeocdn.com/video/low.jpg'
    ])
  })

  it('封面 URL 非 https 或不在 vimeocdn 域时省略，config 不带封面字段同样省略', () => {    const insecure = parseVimeoConfig(
      configFixture({ thumbnailUrl: 'http://i.vimeocdn.com/video/insecure' }),
      CONFIG_URL
    )
    expect(insecure.groupMetadata.thumbnailUrl).toBeUndefined()

    const foreignHost = parseVimeoConfig(
      configFixture({ thumbnailUrl: 'https://evil.example.com/video/cover' }),
      CONFIG_URL
    )
    expect(foreignHost.groupMetadata.thumbnailUrl).toBeUndefined()

    const missing = parseVimeoConfig(configFixture(), CONFIG_URL)
    expect(missing.groupMetadata.thumbnailUrl).toBeUndefined()
  })

  it('config 不带标题时组元数据标题为空串，文件名标题仍走默认兜底', () => {
    const config = parseVimeoConfig(configFixture({ title: null }), CONFIG_URL)

    expect(config.groupMetadata.title).toBe('')
    expect(config.title).toBe('vimeo-video')
  })

  it('config/request 刷新片段缺 video 时沿用刷新前的组元数据', () => {
    const base = parseVimeoConfig(
      configFixture({
        ownerName: 'Demo Author',
        duration: 60,
        thumbnailUrl: 'https://i.vimeocdn.com/video/democover_640'
      }),
      CONFIG_URL
    )
    const refreshed = parseVimeoConfig(
      configRequestFixture({ dash: false }),
      REFRESH_CONFIG_URL,
      base
    )

    expect(refreshed.groupMetadata).toEqual(base.groupMetadata)
  })

  it('读取 progressive 的真实 size，media 层的标签字面量不带大小', () => {
    const config = parseVimeoConfig(configFixture({ progressiveSize: 5_242_880 }), CONFIG_URL)

    expect(config.progressive.find(file => file.quality === '1080p')?.size).toBe(5_242_880)

    const resource = buildVimeoDownloadOptions(config, null)
      .map((option, index) => createVimeoResource(option, index))
      .find(item => item.id === 'vimeo:1201819515:video:progressive:1080p:30')
    expect(resource?.size).toBe(5_242_880)
    // 大小由展示层拼进档位标签，media 层的标签保持纯画质文本。
    expect(getVimeoResourceLabel(resource as MediaResource, key => key)).toBe('1080p MP4')
  })

  it('prefers progressive when adaptive has the same quality', () => {
    const config = parseVimeoConfig(configFixture({ progressiveBitrate: 3000000 }), CONFIG_URL)
    const playlist = parseVimeoDashPlaylist(dashPlaylistFixture(1080), PLAYLIST_URL)
    const options = buildVimeoDownloadOptions(config, playlist)
    const best = options.find(option => option.sourceId === 'vimeo:1201819515:video:best')

    expect(best?.delivery).toBe('progressive')
    expect(best?.url).toBe('https://vod-progressive-ak.vimeocdn.com/1080.mp4')
  })

  it('uses bitrate before progressive tie-breaker when resolution and fps match', () => {
    const config = parseVimeoConfig(configFixture(), CONFIG_URL)
    const playlist = parseVimeoDashPlaylist(dashPlaylistFixture(1080, { videoBitrate: 9000000 }), PLAYLIST_URL)
    const options = buildVimeoDownloadOptions(config, playlist)
    const best = options.find(option => option.sourceId === 'vimeo:1201819515:video:best')

    expect(best?.delivery).toBe('dash')
    expect(best?.bitrate).toBe(9000000)
  })

  it('filters DASH tracks by MP4 codec whitelist before exposing options', () => {
    const playlist = parseVimeoDashPlaylist(
      {
        base_url: '',
        video: [
          dashVideoTrackFixture(1080, { id: 'v-avc', codecs: 'avc1.640028' }),
          dashVideoTrackFixture(720, { id: 'v-vp9', mimeType: 'video/webm', codecs: 'vp09.00.51.08' }),
          dashVideoTrackFixture(540, { id: 'v-hevc', codecs: 'hvc1.1.6.L93.B0' })
        ],
        audio: [
          dashAudioTrackFixture('a-aac', { codecs: 'mp4a.40.2' }),
          dashAudioTrackFixture('a-opus', { mimeType: 'audio/webm', codecs: 'opus' })
        ]
      },
      PLAYLIST_URL
    )

    expect(playlist.videoTracks.map(track => track.id)).toEqual(['v-avc'])
    expect(playlist.audioTracks.map(track => track.id)).toEqual(['a-aac'])
  })

  it('hides DASH mux options whose known segment sizes exceed the cap', () => {
    const config = parseVimeoConfig(configFixture(), CONFIG_URL)
    const playlist = parseVimeoDashPlaylist(
      {
        base_url: '',
        video: [
          dashVideoTrackFixture(2160, {
            id: 'v-too-large',
            segmentSize: DEFAULT_VIMEO_CONFIG.muxMaxBytes
          })
        ],
        audio: [dashAudioTrackFixture('a-256', { segmentSize: 1024 })]
      },
      PLAYLIST_URL
    )
    const options = buildVimeoDownloadOptions(config, playlist)

    expect(estimateDashTrackBytes(playlist.videoTracks[0])).toBeGreaterThan(DEFAULT_VIMEO_CONFIG.muxMaxBytes)
    expect(options.some(option => option.sourceId.includes('v-too-large'))).toBe(false)
    expect(options.find(option => option.sourceId === 'vimeo:1201819515:video:best')?.delivery).toBe(
      'progressive'
    )
  })

  it('roundtrips descriptor labels and titles with non-ASCII text', () => {
    const descriptor = {
      version: 2,
      videoId: '1201819515',
      sourceId: 'vimeo:1201819515:video:best',
      optionId: 'best',
      kind: 'video',
      delivery: 'dash',
      label: '最佳 1080p 视频',
      configUrl: CONFIG_URL,
      dashPlaylistUrl: PLAYLIST_URL,
      videoTrackId: '视频轨',
      audioTrackId: '音频轨'
    } as const

    expect(decodeVimeoSourceDescriptor(encodeVimeoSourceDescriptor(descriptor))).toEqual(descriptor)
  })

  it('builds safe fMP4 HLS fallback options and rejects unsafe HLS structures', () => {
    const variants = parseVimeoHlsMasterPlaylist(
      [
        '#EXTM3U',
        '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.64001f,mp4a.40.2"',
        'https://vod-adaptive-ak.vimeocdn.com/hls/360/prog.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,FRAME-RATE=30,CODECS="avc1.640028,mp4a.40.2"',
        HLS_MEDIA_URL,
        '#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080,CODECS="vp09.00.51.08,opus"',
        'https://vod-adaptive-ak.vimeocdn.com/hls/vp9/prog.m3u8'
      ].join('\n'),
      HLS_MASTER_URL
    )
    const mediaPlaylist = parseVimeoHlsMediaPlaylist(hlsMediaPlaylistFixture(), HLS_MEDIA_URL, variants[0])
    const config = parseVimeoConfig(configFixture({ dash: false, hls: true }), CONFIG_URL)
    const options = buildVimeoDownloadOptions(config, null, mediaPlaylist ? [mediaPlaylist] : [])
    const hlsOption = options.find(
      option => option.sourceId === 'vimeo:1201819515:video:hls:1080p:2500'
    )
    const hlsDescriptor = hlsOption
      ? decodeVimeoSourceDescriptor(encodeVimeoSourceDescriptor(hlsOption.descriptor))
      : null

    expect(variants[0]).toMatchObject({
      url: HLS_MEDIA_URL,
      width: 1920,
      height: 1080,
      bandwidth: 2500000
    })
    expect(mediaPlaylist).toMatchObject({
      initSegmentUrl: 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/init.mp4',
      segments: [
        { url: 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-1.m4s' },
        { url: 'https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-2.m4s' }
      ]
    })
    expect(hlsOption).toMatchObject({
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO,
      delivery: 'hls',
      sourceId: 'vimeo:1201819515:video:hls:1080p:2500'
    })
    expect(hlsDescriptor).toMatchObject({
      delivery: 'hls',
      hlsPlaylistUrl: HLS_MEDIA_URL
    })
    // KEY 是 media playlist 级 tag（RFC 8216）：master 里出现时忽略，variant 照常解析，
    // 加密裁决下沉到 media playlist 的 EXT-X-KEY 状态机。
    expect(
      parseVimeoHlsMasterPlaylist(
        [
          '#EXTM3U',
          '#EXT-X-KEY:METHOD=AES-128,URI="https://player.vimeo.com/hls-key/k"',
          '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
          HLS_MEDIA_URL
        ].join('\n'),
        HLS_MASTER_URL
      )
    ).toEqual([expect.objectContaining({ url: HLS_MEDIA_URL, height: 1080 })])
    expect(
      parseVimeoHlsMediaPlaylist(
        ['#EXTM3U', '#EXT-X-MAP:URI="init.mp4"', '#EXTINF:1', 'seg.ts'].join('\n'),
        HLS_MEDIA_URL,
        variants[0]
      )
    ).toBeNull()
  })

  it('loads HLS fallback when DASH exists but all DASH video options are hidden by size cap', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(configFixture({ progressive: false, hls: true }), 200, CONFIG_URL)
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          {
            base_url: '',
            video: [
              dashVideoTrackFixture(2160, {
                id: 'v-too-large',
                segmentSize: DEFAULT_VIMEO_CONFIG.muxMaxBytes
              })
            ],
            audio: [dashAudioTrackFixture('a-256', { segmentSize: 1024 })]
          },
          200,
          PLAYLIST_URL
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          [
            '#EXTM3U',
            '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
            HLS_MEDIA_URL
          ].join('\n'),
          200,
          HLS_MASTER_URL,
          'application/vnd.apple.mpegurl'
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(hlsMediaPlaylistFixture(), 200, HLS_MEDIA_URL, 'application/vnd.apple.mpegurl')
      )
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await loadVimeoResourcesFromConfigUrl(CONFIG_URL)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expectFetchCredentialsOmit(fetchMock)
    expect(
      snapshot.resources.some(resource => resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO)
    ).toBe(true)
    expect(snapshot.resources.some(resource => resource.id.includes('v-too-large'))).toBe(false)
  })

  it('omits credentials for config, DASH and HLS playlist fetches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(configFixture({ progressive: false, hls: true }), 200, CONFIG_URL)
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          {
            base_url: '',
            video: [
              dashVideoTrackFixture(2160, {
                id: 'v-too-large',
                segmentSize: DEFAULT_VIMEO_CONFIG.muxMaxBytes
              })
            ],
            audio: [dashAudioTrackFixture('a-256', { segmentSize: 1024 })]
          },
          200,
          PLAYLIST_URL
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          [
            '#EXTM3U',
            '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
            HLS_MEDIA_URL
          ].join('\n'),
          200,
          HLS_MASTER_URL,
          'application/vnd.apple.mpegurl'
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          hlsMediaPlaylistFixture(),
          200,
          HLS_MEDIA_URL,
          'application/vnd.apple.mpegurl'
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    await loadVimeoResourcesFromConfigUrl(CONFIG_URL)

    expectFetchCredentialsOmit(fetchMock)
  })

  it('builds resources from captured native config without requesting config again', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await loadVimeoResourcesFromCapturedConfig({
      videoId: '1201819515',
      configUrl: CONFIG_URL,
      config: configFixture({ dash: false })
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(snapshot.resources.map(resource => resource.url)).toContain(
      'https://vod-progressive-ak.vimeocdn.com/1080.mp4'
    )
  })

  it('accepts the native refresh URL carried by embedded player config', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await loadVimeoResourcesFromCapturedConfig({
      videoId: '1201819515',
      configUrl: REFRESH_CONFIG_URL,
      config: configFixture({ dash: false, refreshConfigUrl: REFRESH_CONFIG_URL })
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(snapshot.config.configUrl).toBe(REFRESH_CONFIG_URL)
  })

  it('refreshes expiring config before rendering resources', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          configFixture({
            dash: false,
            timestamp: nowSeconds,
            expires: 20,
            progressiveUrl: 'https://vod-progressive-ak.vimeocdn.com/expired-config.mp4',
            refreshConfigUrl: REFRESH_CONFIG_URL
          }),
          200,
          CONFIG_URL
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          configRequestFixture({
            dash: false,
            progressiveUrl: 'https://vod-progressive-ak.vimeocdn.com/fresh-config.mp4',
            refreshConfigUrl: REFRESH_CONFIG_URL
          }),
          200,
          REFRESH_CONFIG_URL
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await loadVimeoResourcesFromConfigUrl(CONFIG_URL)

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([CONFIG_URL, REFRESH_CONFIG_URL])
    expectFetchCredentialsOmit(fetchMock)
    expect(snapshot.resources.map(resource => resource.url)).toContain(
      'https://vod-progressive-ak.vimeocdn.com/fresh-config.mp4'
    )
    expect(snapshot.resources.map(resource => resource.url)).not.toContain(
      'https://vod-progressive-ak.vimeocdn.com/expired-config.mp4'
    )
    expect(snapshot.config.title).toBe('Demo Video')
    expect(snapshot.config.thumbnails).toHaveLength(2)
  })

  it('刷新片段缺 text_tracks 时沿用刷新前的字幕轨', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          configFixture({
            dash: false,
            timestamp: nowSeconds,
            expires: 20,
            refreshConfigUrl: REFRESH_CONFIG_URL,
            textTracks: [
              { url: 'https://player.vimeo.com/texttrack/1.vtt', lang: 'en', label: 'English' }
            ]
          }),
          200,
          CONFIG_URL
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          configRequestFixture({ dash: false, refreshConfigUrl: REFRESH_CONFIG_URL }),
          200,
          REFRESH_CONFIG_URL
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await loadVimeoResourcesFromConfigUrl(CONFIG_URL)

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([CONFIG_URL, REFRESH_CONFIG_URL])
    expect(snapshot.config.textTracks).toEqual([
      { lang: 'en', label: 'English', url: 'https://player.vimeo.com/texttrack/1.vtt' }
    ])
    expect(snapshot.resources.map(resource => resource.id)).toContain('vimeo:1201819515:subtitle:en')
  })

  it('refreshes direct files without requesting the unrelated DASH playlist', async () => {
    const freshUrl = 'https://vod-progressive-ak.vimeocdn.com/fresh-direct.mp4'
    const fetchMock = vi.fn().mockResolvedValueOnce(
      responseWithUrl(
        configRequestFixture({ progressiveUrl: freshUrl, refreshConfigUrl: REFRESH_CONFIG_URL }),
        200,
        REFRESH_CONFIG_URL
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const resources = await refreshVimeoDirectResourcesFromConfigUrl(REFRESH_CONFIG_URL)

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([REFRESH_CONFIG_URL])
    expectFetchCredentialsOmit(fetchMock)
    expect(resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'vimeo:1201819515:video:best',
          url: freshUrl,
          sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_PROGRESSIVE_MP4
        })
      ])
    )
    expect(
      resources.some(resource => resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO)
    ).toBe(false)
  })

  it('refreshes config once when DASH playlist returns 403', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          configFixture({
            progressive: false,
            refreshConfigUrl: REFRESH_CONFIG_URL
          }),
          200,
          CONFIG_URL
        )
      )
      .mockResolvedValueOnce(responseWithUrl('', 403, PLAYLIST_URL))
      .mockResolvedValueOnce(
        responseWithUrl(
          configRequestFixture({
            progressive: false,
            refreshConfigUrl: REFRESH_CONFIG_URL
          }),
          200,
          REFRESH_CONFIG_URL
        )
      )
      .mockResolvedValueOnce(responseWithUrl(dashPlaylistFixture(1080), 200, PLAYLIST_URL))
    vi.stubGlobal('fetch', fetchMock)

    const snapshot = await loadVimeoResourcesFromConfigUrl(CONFIG_URL)

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      CONFIG_URL,
      PLAYLIST_URL,
      REFRESH_CONFIG_URL,
      PLAYLIST_URL
    ])
    expectFetchCredentialsOmit(fetchMock)
    expect(
      snapshot.resources.some(resource => resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO)
    ).toBe(true)
  })

  it('does not refresh more than once when refreshed DASH playlist still fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responseWithUrl(
          configFixture({
            progressive: false,
            refreshConfigUrl: REFRESH_CONFIG_URL
          }),
          200,
          CONFIG_URL
        )
      )
      .mockResolvedValueOnce(responseWithUrl('', 403, PLAYLIST_URL))
      .mockResolvedValueOnce(
        responseWithUrl(
          configRequestFixture({
            progressive: false,
            refreshConfigUrl: REFRESH_CONFIG_URL
          }),
          200,
          REFRESH_CONFIG_URL
        )
      )
      .mockResolvedValueOnce(responseWithUrl('', 403, PLAYLIST_URL))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadVimeoResourcesFromConfigUrl(CONFIG_URL)).rejects.toThrow('status=403')

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      CONFIG_URL,
      PLAYLIST_URL,
      REFRESH_CONFIG_URL,
      PLAYLIST_URL
    ])
    expectFetchCredentialsOmit(fetchMock)
  })

  it('matches frame identity only against the current Vimeo iframe config URL', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <iframe src="https://player.vimeo.com/video/1201819515?h=dc93ef4923"></iframe>
    `
    const matchingIdentity = {
      videoId: '1201819515'
    }
    const staleIdentity = {
      videoId: '999'
    }

    expect(isVimeoFrameIdentityAttachedToDocument(matchingIdentity, root, 'https://vimeo.com/1')).toBe(
      true
    )
    expect(isVimeoFrameIdentityAttachedToDocument(staleIdentity, root, 'https://vimeo.com/1')).toBe(
      false
    )
  })

  it('inserts the panel before action bar, renders three rows, and avoids duplicates', () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="vd-wrapper">
          <h1>Demo</h1>
          <div data-testid="action-bar">actions</div>
        </div>
      </main>
    `
    const config = parseVimeoConfig(configFixture(), CONFIG_URL)
    const playlist = parseVimeoDashPlaylist(dashPlaylistFixture(2160), PLAYLIST_URL)
    const resources = buildVimeoDownloadOptions(config, playlist).map((option, index) =>
      createVimeoResource(option, index)
    )
    const clicked: string[] = []
    const panel = new VimeoButtonPanel()
    panel.onClick(resourceId => {
      clicked.push(resourceId)
    })

    panel.render('1201819515', resources, 1999999999)
    panel.render('1201819515', resources, 1999999999)

    const panels = document.querySelectorAll('[data-testid="vdl-vimeo-panel"]')
    const actionBar = document.querySelector('[data-testid="action-bar"]')
    const insertedPanel = panels[0]
    const bestButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="vdl-vimeo-option"][data-vdl-choice="best"]'
    )

    expect(panels).toHaveLength(1)
    expect(actionBar?.previousElementSibling).toBe(insertedPanel)
    expect(document.querySelector('[data-testid="vdl-vimeo-row-video"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="vdl-vimeo-row-audio"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="vdl-vimeo-row-image"]')).not.toBeNull()
    expect(bestButton?.getAttribute('data-vdl-kind')).toBe('video')
    expect(bestButton?.getAttribute('data-vdl-source-id')).toBe('vimeo:1201819515:video:best')

    bestButton?.click()
    expect(clicked).toEqual([])

    expect(panel.beginDownload('1201819515', 'vimeo:1201819515:video:best')).toBe(true)
    expect(panel.beginDownload('1201819515', 'vimeo:1201819515:video:best')).toBe(false)
    expect(bestButton?.textContent).toBe(I18nService.t(I18N_KEYS.RESOURCE_ITEM.DOWNLOADING))
    expect(bestButton?.disabled).toBe(true)
    expect(bestButton?.getAttribute('aria-busy')).toBe('true')
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-testid="vdl-vimeo-option"][data-vdl-choice="progressive:1080p:30"]'
      )?.disabled
    ).toBe(true)

    panel.updateProgress('1201819515', 'vimeo:1201819515:video:best', 52.8)
    expect(bestButton?.textContent).toBe('52%')

    panel.endDownload('1201819515')
    expect(bestButton?.textContent).toBe('Best')
    expect(bestButton?.disabled).toBe(false)
    expect(bestButton?.hasAttribute('aria-busy')).toBe(false)

    panel.beginDownload('1201819515', 'vimeo:1201819515:video:best')
    panel.clear()
    panel.render('1201819515', resources)
    expect(document.querySelector<HTMLButtonElement>('[data-vdl-choice="best"]')?.disabled).toBe(
      true
    )
    const currentTask: DownloadTaskSnapshot = {
      taskId: 'current-task',
      resourceId: 'vimeo:1201819515:video:best',
      filename: 'video.mp4',
      type: RESOURCE_TYPES.VIDEO,
      resourceIndex: 0,
      status: 'downloading',
      progress: 40,
      receivedBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      bytesAreEstimated: false
    }
    panel.applyQueueSnapshot([
      { ...currentTask, taskId: 'old-failed-task', status: 'failed' },
      currentTask
    ])
    expect(document.querySelector<HTMLButtonElement>('[data-vdl-choice="best"]')?.textContent).toBe(
      '40%'
    )
    expect(document.querySelector<HTMLButtonElement>('[data-vdl-choice="best"]')?.disabled).toBe(
      true
    )
    expect(
      document.querySelector<HTMLButtonElement>('[data-vdl-choice="progressive:1080p:30"]')
        ?.disabled
    ).toBe(true)
    panel.applyQueueSnapshot([])
    expect(document.querySelector<HTMLButtonElement>('[data-vdl-choice="best"]')?.disabled).toBe(
      false
    )
  })

  it('falls back to inserting after h1 when action bar is missing', () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="vd-wrapper">
          <h1>Demo</h1>
        </div>
      </main>
    `
    const panel = new VimeoButtonPanel()

    panel.renderEmpty('1201819515')

    const title = document.querySelector('h1')
    const insertedPanel = document.querySelector('[data-testid="vdl-vimeo-panel"]')
    expect(title?.nextElementSibling).toBe(insertedPanel)
  })

  it('rejects an HTML config response before JSON parsing', async () => {
    const response = responseWithUrl('<html>login</html>', 200, CONFIG_URL, 'text/html')
    const jsonSpy = vi.spyOn(response, 'json')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)))

    await expect(loadVimeoResourcesFromConfigUrl(CONFIG_URL)).rejects.toThrow(
      '响应 MIME 与资源不匹配'
    )

    expect(jsonSpy).not.toHaveBeenCalled()
  })
})

describe('Vimeo HLS AES-128 加密解析', () => {
  it('外置 AUDIO rendition 拒绝，无 URI 的内嵌组保留', () => {
    const playlist = (external: boolean): string =>
      [
        '#EXTM3U',
        `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main"${external ? ',URI="audio.m3u8"' : ''}`,
        '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio"',
        HLS_MEDIA_URL
      ].join('\n')
    expect(parseVimeoHlsMasterPlaylist(playlist(true), HLS_MASTER_URL)).toEqual([])
    expect(parseVimeoHlsMasterPlaylist(playlist(false), HLS_MASTER_URL)).toHaveLength(1)
  })
  const KEY_URL = HLS_KEY_URL

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('提取 AES-128/identity KEY：显式 IV hex 物化为 16 字节并挂到分片', () => {
    const playlist = parseVimeoHlsMediaPlaylist(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        `#EXT-X-KEY:METHOD=AES-128,URI="${KEY_URL}",IV=0x123`,
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:2.000,',
        'seg-1.m4s',
        '#EXTINF:2.000,',
        'https://vod-adaptive-ak.vimeocdn.com/hls/1080/seg-2.m4s'
      ].join('\n'),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )

    // 奇数位 hex 左补 0（0x123 → 0x0123），按 big-endian 右对齐 16 字节。
    const encryption = playlist?.segments[0]?.encryption
    expect(encryption).toEqual({ keyUrl: KEY_URL, iv: ivFromHex('123') })
    expect(playlist?.segments[1]?.encryption).toEqual({ keyUrl: KEY_URL, iv: ivFromHex('123') })
  })

  it('IV 缺省时按分片 media sequence 构造 16 字节 big-endian IV', () => {
    const playlist = parseVimeoHlsMediaPlaylist(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-MEDIA-SEQUENCE:7',
        `#EXT-X-KEY:METHOD=AES-128,URI="${KEY_URL}"`,
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:2.000,',
        'seg-1.m4s',
        '#EXTINF:2.000,',
        'seg-2.m4s',
        '#EXTINF:2.000,',
        'seg-3.m4s'
      ].join('\n'),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )

    const ivs = playlist?.segments.map(segment => segment.encryption?.iv)
    expect(ivs).toHaveLength(3)
    expect(ivs?.[0]).toEqual(ivFromHex('7'))
    expect(ivs?.[1]).toEqual(ivFromHex('8'))
    expect(ivs?.[2]).toEqual(ivFromHex('9'))
  })

  it('IV 非法（非 hex、超 16 字节）时回落 media sequence IV', () => {
    const notHex = parseVimeoHlsMediaPlaylist(
      encryptedPlaylistText({ iv: 'zz', mediaSequence: 3 }),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )
    const oversized = parseVimeoHlsMediaPlaylist(
      encryptedPlaylistText({ iv: 'a'.repeat(33), mediaSequence: 3 }),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )

    expect(notHex?.segments[0]?.encryption?.iv).toEqual(ivFromHex('3'))
    expect(oversized?.segments[0]?.encryption?.iv).toEqual(ivFromHex('3'))
  })

  it('METHOD=NONE 重置回明文，仅此前分片保留加密参数', () => {
    const playlist = parseVimeoHlsMediaPlaylist(
      [
        '#EXTM3U',
        `#EXT-X-KEY:METHOD=AES-128,URI="${KEY_URL}"`,
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:2.000,',
        'seg-1.m4s',
        '#EXT-X-KEY:METHOD=NONE',
        '#EXTINF:2.000,',
        'seg-2.m4s'
      ].join('\n'),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )

    expect(playlist?.segments[0]?.encryption).toEqual({ keyUrl: KEY_URL, iv: ivFromHex('0') })
    expect(playlist?.segments[1]?.encryption).toBeUndefined()
  })

  it('SAMPLE-AES、非 identity KEYFORMAT 与缺少 key URI 拒绝整项并记日志', () => {
    const warnSpy = vi.spyOn(logger, 'warn')

    const sampleAes = parseVimeoHlsMediaPlaylist(
      encryptedPlaylistText({ keyAttrs: 'METHOD=SAMPLE-AES,URI="skd://key"', mediaSequence: 1 }),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )
    const foreignFormat = parseVimeoHlsMediaPlaylist(
      encryptedPlaylistText({
        keyAttrs: 'METHOD=AES-128,KEYFORMAT="com.apple.streamingkeydelivery",URI="skd://key"',
        mediaSequence: 1
      }),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )

    expect(sampleAes).toBeNull()
    expect(foreignFormat).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy.mock.calls[0][0]).toContain('SAMPLE-AES')
    expect(warnSpy.mock.calls[1][0]).toContain('com.apple.streamingkeydelivery')
    expect(
      parseVimeoHlsMediaPlaylist(
        encryptedPlaylistText({ keyAttrs: 'METHOD=AES-128' }),
        HLS_MEDIA_URL,
        hlsVariantFixture()
      )
    ).toBeNull()
  })

  it('加密 media playlist 照常产出 HLS 下载选项，descriptor 契约不变', () => {
    const playlist = parseVimeoHlsMediaPlaylist(
      encryptedPlaylistText({ keyAttrs: `METHOD=AES-128,URI="${KEY_URL}",IV=0x01` }),
      HLS_MEDIA_URL,
      hlsVariantFixture()
    )
    const config = parseVimeoConfig(configFixture({ dash: false, hls: true }), CONFIG_URL)
    const options = buildVimeoDownloadOptions(config, null, playlist ? [playlist] : [])

    const hlsOption = options.find(
      option => option.sourceId === 'vimeo:1201819515:video:hls:1080p:2500'
    )
    expect(hlsOption).toMatchObject({ delivery: 'hls', hlsPlaylistUrl: HLS_MEDIA_URL })
    const hlsDescriptor = hlsOption
      ? decodeVimeoSourceDescriptor(encodeVimeoSourceDescriptor(hlsOption.descriptor))
      : null
    expect(hlsDescriptor).toMatchObject({
      delivery: 'hls',
      hlsPlaylistUrl: HLS_MEDIA_URL
    })
  })
})

/** 构造 AES-128 加密形态的 HLS media playlist 文本。 */
function encryptedPlaylistText(
  options: { keyAttrs?: string; iv?: string; mediaSequence?: number } = {}
): string {
  const iv = options.iv ? `,IV=${options.iv}` : ''
  const keyAttrs = options.keyAttrs ?? `METHOD=AES-128,URI="${HLS_KEY_URL}"${iv}`
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    ...(options.mediaSequence === undefined
      ? []
      : [`#EXT-X-MEDIA-SEQUENCE:${options.mediaSequence}`]),
    `#EXT-X-KEY:${keyAttrs}`,
    '#EXT-X-MAP:URI="init.mp4"',
    '#EXTINF:2.000,',
    'seg-1.m4s'
  ].join('\n')
}

function hlsVariantFixture(): VimeoHlsVariant {
  return {
    url: HLS_MEDIA_URL,
    bandwidth: 2500000,
    width: 1920,
    height: 1080,
    fps: 30,
    codecs: 'avc1.640028,mp4a.40.2'
  }
}

/** 与解析层相同口径的 IV 期望值：奇数位左补 0 后 big-endian 右对齐。 */
function ivFromHex(hex: string): Uint8Array {
  const padded = (hex.length % 2 === 1 ? `0${hex}` : hex).padStart(32, '0')
  return Uint8Array.from(
    Array.from({ length: 16 }, (_, index) =>
      Number.parseInt(padded.slice(index * 2, index * 2 + 2), 16)
    )
  )
}

interface ConfigFixtureOptions {
  readonly dash?: boolean
  readonly expires?: number
  readonly hls?: boolean
  readonly progressive?: boolean
  readonly progressiveUrl?: string
  readonly progressiveBitrate?: number
  /** 1080p progressive 文件的字节数；不传表示 config 不带 `size`。 */
  readonly progressiveSize?: number
  readonly refreshConfigUrl?: string
  readonly timestamp?: number
  readonly textTracks?: readonly Record<string, string>[]
  /** `video.owner.name`；不传表示 config 不带作者。 */
  readonly ownerName?: string
  /** `video.duration`；不传表示 config 不带时长。 */
  readonly duration?: number
  /** `video.title`；`null` 表示 config 不带标题字段，字符串为显式标题。 */
  readonly title?: string | null
  /** `video.thumbnail_url`；不传表示 config 不带封面字段。 */
  readonly thumbnailUrl?: string
  /** `video.thumbs` 字典；`null` 表示 config 不带该字段（聚合页等 surface 的形态）。 */
  readonly thumbs?: Record<string, string> | null
}

function configFixture(options: ConfigFixtureOptions = {}) {
  const includeDash = options.dash ?? true
  const includeHls = options.hls ?? false
  const includeProgressive = options.progressive ?? true
  const progressiveUrl =
    options.progressiveUrl ?? 'https://vod-progressive-ak.vimeocdn.com/1080.mp4'

  return {
    request: {
      timestamp: options.timestamp ?? 1_999_996_399,
      expires: options.expires ?? 3600,
      config_refresh_url: options.refreshConfigUrl ?? CONFIG_URL,
      ...(options.textTracks === undefined ? {} : { text_tracks: options.textTracks }),
      files: {
        progressive: includeProgressive
          ? [
              {
                quality: '360p',
                width: 640,
                height: 360,
                fps: 30,
                mime: 'video/mp4',
                url: 'https://vod-progressive-ak.vimeocdn.com/360.mp4'
              },
              {
                quality: '1080p',
                width: 1920,
                height: 1080,
                fps: 30,
                mime: 'video/mp4',
                ...(options.progressiveBitrate === undefined
                  ? {}
                  : { bitrate: options.progressiveBitrate }),
                ...(options.progressiveSize === undefined ? {} : { size: options.progressiveSize }),
                url: progressiveUrl
              }
            ]
          : [],
        ...(includeDash
          ? {
              dash: {
                default_cdn: 'ak',
                cdns: {
                  ak: {
                    url: PLAYLIST_URL
                  }
                }
              }
            }
          : {}),
        ...(includeHls
          ? {
              hls: {
                url: HLS_MASTER_URL
              }
            }
          : {})
      }
    },
    video: {
      id: 1201819515,
      ...(options.title === undefined
        ? { title: 'Demo Video' }
        : options.title === null
          ? {}
          : { title: options.title }),
      ...(options.ownerName === undefined ? {} : { owner: { name: options.ownerName } }),
      ...(options.duration === undefined ? {} : { duration: options.duration }),
      ...(options.thumbnailUrl === undefined ? {} : { thumbnail_url: options.thumbnailUrl }),
      ...(options.thumbs === null
        ? {}
        : {
            thumbs:
              options.thumbs ?? {
                640: 'https://i.vimeocdn.com/video/low.jpg',
                1280: 'https://i.vimeocdn.com/video/high.jpg'
              }
          })
    }
  }
}

/** 模拟 Vimeo `/config/request` 返回的无 request/video 外层刷新片段。 */
function configRequestFixture(options: ConfigFixtureOptions = {}) {
  return configFixture(options).request
}

interface DashPlaylistFixtureOptions {
  readonly videoBitrate?: number
}

function dashPlaylistFixture(bestHeight: 1080 | 2160, options: DashPlaylistFixtureOptions = {}) {
  const bestWidth = bestHeight === 2160 ? 3840 : 1920
  return {
    base_url: '',
    video: [
      dashVideoTrackFixture(bestHeight, {
        id: `v-${bestHeight}`,
        bitrate: options.videoBitrate ?? (bestHeight === 2160 ? 9000000 : 3000000),
        width: bestWidth
      })
    ],
    audio: [
      dashAudioTrackFixture('a-149', { bitrate: 149000 }),
      dashAudioTrackFixture('a-256', { bitrate: 256000 })
    ]
  }
}

interface DashVideoTrackOptions {
  readonly id?: string
  readonly mimeType?: string
  readonly codecs?: string
  readonly bitrate?: number
  readonly width?: number
  readonly segmentSize?: number
}

function dashVideoTrackFixture(height: number, options: DashVideoTrackOptions = {}) {
  return {
    id: options.id ?? `v-${height}`,
    base_url: '',
    mime_type: options.mimeType ?? 'video/mp4',
    codecs: options.codecs ?? 'avc1.640028',
    bitrate: options.bitrate ?? 3000000,
    width: options.width ?? Math.round((height / 9) * 16),
    height,
    fps: 30,
    init_segment: 'AAAA',
    segments: [
      {
        url: `https://vod-adaptive-ak.vimeocdn.com/video/${height}/1.m4s`,
        ...(options.segmentSize === undefined ? {} : { size: options.segmentSize })
      }
    ]
  }
}

interface DashAudioTrackOptions {
  readonly mimeType?: string
  readonly codecs?: string
  readonly bitrate?: number
  readonly segmentSize?: number
}

function dashAudioTrackFixture(id: string, options: DashAudioTrackOptions = {}) {
  return {
    id,
    base_url: '',
    mime_type: options.mimeType ?? 'audio/mp4',
    codecs: options.codecs ?? 'mp4a.40.2',
    bitrate: options.bitrate ?? 149000,
    sample_rate: 48000,
    channels: 2,
    init_segment: 'AAAA',
    segments: [
      {
        url: `https://vod-adaptive-ak.vimeocdn.com/audio/${id}/1.m4s`,
        ...(options.segmentSize === undefined ? {} : { size: options.segmentSize })
      }
    ]
  }
}

function hlsMediaPlaylistFixture(): string {
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

function responseWithUrl(
  body: BodyInit | object,
  status: number,
  url: string,
  contentType = 'application/json'
): Response {
  const responseBody =
    typeof body === 'object' && !(body instanceof Blob) ? JSON.stringify(body) : body
  const response = new Response(responseBody, {
    status,
    headers: {
      'Content-Type': contentType
    }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function expectFetchCredentialsOmit(fetchMock: ReturnType<typeof vi.fn>): void {
  for (const call of fetchMock.mock.calls) {
    expect(call[1]).toMatchObject({
      credentials: 'omit'
    })
  }
}
