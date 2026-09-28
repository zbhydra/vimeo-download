/**
 * chrome.downloads 相对下载路径拼接与文件名模板命名边界测试。
 *
 * 原经由 BrowserDownloadService.start 的路径归一化表改为直接测纯函数：保存位置是用户可控
 * 输入，目录逐段丢弃非法段，文件名清洗后仍带路径语义时换兜底名。`buildResourceFilename`
 * 是模板的唯一应用点：background 在落盘前按 settings.filenamePattern 用任务上下文重渲染。
 */

import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_DOWNLOAD_PATH,
  SettingsManager
} from '@/core/storage/settings'
import { FILENAME_PATTERN_DEFAULT } from '@/core/utils/filenameTemplate'
import { normalizeFilename } from '@/core/utils/downloadFilename'
import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import { encodeVimeoSourceDescriptor, type VimeoSourceDescriptor } from '@/sites/vimeo/shared'
import {
  buildDownloadFilename,
  buildResourceFilename,
  normalizeDownloadDirectory
} from '@/background/services/downloadFilename'

const FILENAME = 'controlled-1080p.mp4'

describe('buildDownloadFilename', () => {
  it('保存位置拼成相对子目录，绝对路径、盘符、回退段与空段逐段丢弃', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['my/videos', 'my/videos/controlled-1080p.mp4'],
      // 绝对路径的开头 `/` 与连续 `/` 都是空段，丢弃后仍落在下载目录内
      ['/etc/passwd', 'etc/passwd/controlled-1080p.mp4'],
      ['a//b/', 'a/b/controlled-1080p.mp4'],
      // 回退段（含反斜杠写法）整段丢弃，逃不出下载目录
      ['../..', 'vimeo-video-downloader/controlled-1080p.mp4'],
      ['..\\..\\windows', 'windows/controlled-1080p.mp4'],
      // 盘符段含 `:`，整段丢弃
      ['C:\\Windows\\System32', 'Windows/System32/controlled-1080p.mp4'],
      // `~` 开头的段按家目录语义处理，直接丢弃
      ['~/Documents', 'Documents/controlled-1080p.mp4'],
      // 空值回退默认子目录，Chrome 才不会收到空路径
      ['', 'vimeo-video-downloader/controlled-1080p.mp4'],
      ['   ', 'vimeo-video-downloader/controlled-1080p.mp4']
    ]

    for (const [downloadPath, expected] of cases) {
      const filename = buildDownloadFilename(downloadPath, FILENAME)
      expect({ downloadPath, filename }).toEqual({ downloadPath, filename: expected })
      // 无论用户填什么，交给 Chrome 的都必须是非空相对路径且不含回退段
      expect(filename.startsWith('/')).toBe(false)
      expect(filename.includes('..')).toBe(false)
    }
  })

  it('文件名清洗后正好是回退段时换兜底名，避免 Chrome 因 `..` 直接报错', () => {
    expect(buildDownloadFilename(undefined, '..')).toBe(
      `${DEFAULT_DOWNLOAD_PATH}/vimeo-download`
    )
  })

  it('目录长度超出预算时丢弃后续段，保证路径长度可控', () => {
    const longSegments = Array.from({ length: 40 }, (_, index) => `segment-${index}`)
    const segments = normalizeDownloadDirectory(longSegments.join('/'))
    expect(segments.join('/').length).toBeLessThanOrEqual(120)
    expect(segments[0]).toBe('segment-0')
  })
})

describe('normalizeFilename（popup 预览与 background 落盘共用的净化语义）', () => {
  it('非法路径字符与控制字符替换为空格，连续空白收敛为一个', () => {
    expect(normalizeFilename('a<b>c:"d/e\\f|g?h*i')).toBe('a b c d e f g h i')
    expect(normalizeFilename('video\u0007name')).toBe('video name')
    expect(normalizeFilename('  spaced   out\tname ')).toBe('spaced out name')
  })

  it('超出 180 字符上限截断，清洗后为空或只剩路径语义时换兜底名', () => {
    expect(normalizeFilename('x'.repeat(200)).length).toBe(180)
    expect(normalizeFilename('')).toBe('vimeo-download')
    expect(normalizeFilename('..')).toBe('vimeo-download')
  })
})

/** 带描述符的视频资源 fixture：descriptor 提供 quality（label）与 videoId。 */
function vimeoResource(fields: Partial<MediaResource> = {}): MediaResource {
  const descriptor: VimeoSourceDescriptor = {
    version: 2,
    videoId: '1196869805',
    sourceId: 'vimeo:1196869805:video:dash:video-track',
    optionId: 'dash:video-track',
    kind: 'video',
    delivery: 'dash',
    label: '1080p HD',
    configUrl: 'https://player.vimeo.com/video/1196869805/config?h=controlled',
    dashPlaylistUrl: 'https://vod-adaptive-ak.vimeocdn.com/controlled/master.json',
    videoTrackId: 'video-track'
  }
  return {
    id: descriptor.sourceId,
    messageId: descriptor.videoId,
    index: 0,
    url: 'https://vod-adaptive-ak.vimeocdn.com/controlled/master.json',
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    mimeType: 'video/mp4',
    title: 'Demo Video',
    author: 'Blender Foundation',
    filename: 'Demo-Video-1080p.mp4',
    documentId: encodeVimeoSourceDescriptor(descriptor),
    metadata: { messageId: descriptor.videoId },
    ...fields
  }
}

/** 固定设置读取，隔离 chrome.storage。 */
function mockSettings(filenamePattern?: string): void {
  vi.spyOn(SettingsManager, 'getSettings').mockResolvedValue({
    language: 'en-US',
    downloadPath: DEFAULT_DOWNLOAD_PATH,
    filenamePattern: filenamePattern ?? FILENAME_PATTERN_DEFAULT
  })
}

describe('buildResourceFilename', () => {
  it('默认模板按任务上下文渲染：title/author 取 resource，quality/videoId 取 descriptor', async () => {
    mockSettings()
    const filename = await buildResourceFilename(vimeoResource())
    expect(filename).toBe('Demo Video_1080p HD_video.mp4')
  })

  it('自定义模板全变量渲染，date 为下载时刻 YYYY-MM-DD', async () => {
    mockSettings('{author}/{date}_{title}_{videoId}_{quality}_{type}')
    vi.setSystemTime(new Date(2026, 8, 3, 12, 0, 0))
    try {
      const filename = await buildResourceFilename(vimeoResource())
      expect(filename).toBe('Blender Foundation/2026-09-03_Demo Video_1196869805_1080p HD_video.mp4')
      // 渲染结果落盘前统一过 normalizeFilename：模板引入的 `/` 换成空格，其余字符保持原样
      expect(buildDownloadFilename(undefined, filename)).toBe(
        `${DEFAULT_DOWNLOAD_PATH}/Blender Foundation 2026-09-03_Demo Video_1196869805_1080p HD_video.mp4`
      )
      // popup 预览走同一函数（纯函数），保证「预览 = 落盘」
      expect(normalizeFilename(filename)).toBe(
        'Blender Foundation 2026-09-03_Demo Video_1196869805_1080p HD_video.mp4'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('MP3 目标格式显式覆盖音频扩展名，缺省音频按 MIME 落 .m4a', async () => {
    mockSettings('{title}_{quality}')
    const audio = (targetFormat?: 'mp3'): MediaResource =>
      vimeoResource({
        type: RESOURCE_TYPES.AUDIO,
        sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO,
        mimeType: 'audio/mp4',
        title: 'Demo Audio',
        filename: 'Demo-Audio-195kbps.m4a',
        ...(targetFormat ? { targetFormat } : {})
      })
    expect(await buildResourceFilename(audio('mp3'))).toBe('Demo Audio_1080p HD.mp3')
    expect(await buildResourceFilename(audio())).toBe('Demo Audio_1080p HD.m4a')
  })

  it('缺字段变量渲染为空后主干为空时，回退 resource.filename 主干，再退固定名', async () => {
    mockSettings('{author}')
    expect(await buildResourceFilename(vimeoResource({ author: undefined }))).toBe(
      'Demo-Video-1080p.mp4'
    )
    expect(
      await buildResourceFilename(vimeoResource({ author: undefined, filename: undefined }))
    ).toBe('vimeo-download.mp4')
  })

  it('descriptor 不可解时 quality/videoId 缺失，分隔符收敛后仍产出合法主干', async () => {
    mockSettings('{title}_{quality}_{type}_{videoId}')
    const resource = vimeoResource({ documentId: undefined })
    const filename = await buildResourceFilename(resource)
    expect(filename).toBe('Demo Video_video_1196869805.mp4')
  })
})
