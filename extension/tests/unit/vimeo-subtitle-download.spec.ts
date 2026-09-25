/** Vimeo 字幕资源建模、Chrome 原生下载分派与边界测试。 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BrowserDownloadService } from '@/background/services/BrowserDownloadService'
import type {
  BackgroundBrowserDownloadSource,
  BackgroundStartBrowserDownloadRequest
} from '@/background/types'
import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES, isBrowserManagedSourceKind } from '@/core/constants/resource'
import { I18N_KEYS } from '@/core/constants/i18n'
import { downloadWithBrowserManager } from '@/core/content/download/browserDownload'
import type { RpcContext } from '@/core/rpc/types'
import { I18nService } from '@/locales'
import type { MediaResource } from '@/core/types'
import { VimeoButtonPanel } from '@/sites/vimeo/content/buttons'
import {
  applyVimeoTimeRange,
  buildVimeoDownloadOptions,
  createVimeoResource,
  parseVimeoConfig
} from '@/sites/vimeo/media'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor,
  isVimeoSubtitleUrl
} from '@/sites/vimeo/shared'

const mocks = vi.hoisted(() => ({
  startBrowserDownload: vi.fn(),
  getBrowserDownloadStatus: vi.fn(),
  loggerError: vi.fn(),
  refreshVimeoDirectResourcesFromConfigUrl: vi.fn()
}))

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    startBrowserDownload = mocks.startBrowserDownload
    getBrowserDownloadStatus = mocks.getBrowserDownloadStatus
  }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: {
    error: mocks.loggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('@/sites/vimeo/config', () => ({
  refreshVimeoDirectResourcesFromConfigUrl: mocks.refreshVimeoDirectResourcesFromConfigUrl
}))

const VIDEO_ID = '1201819515'
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config?h=dc93ef4923&s=native_signature`
const REFRESH_CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?signature=refresh`
const ENGLISH_SUBTITLE_URL = `https://player.vimeo.com/texttrack/1234567.vtt?token=signed`
const CHINESE_SUBTITLE_URL = `https://captions.vimeocdn.com/captions/${VIDEO_ID}-zh.vtt?token=signed`

describe('Vimeo 字幕资源建模', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('每个语言生成一条字幕选项，并把相对 texttrack 地址解析为绝对 URL', () => {
    const config = parseVimeoConfig(
      configFixture({
        textTracks: [
          {
            url: '/texttrack/1234567.vtt?token=signed',
            lang: 'en',
            label: 'English',
            kind: 'captions'
          },
          { url: CHINESE_SUBTITLE_URL, lang: 'zh', label: '中文' },
          { url: '/texttrack/9999.vtt', label: '无语言' }
        ]
      }),
      CONFIG_URL
    )
    const resources = buildVimeoDownloadOptions(config, null).map((option, index) =>
      createVimeoResource(option, index)
    )

    // 没有 lang 时以 label 作为语言标识，避免静默丢掉仍然可下载的字幕。
    expect(config.textTracks.map(track => track.lang)).toEqual(['en', 'zh', '无语言'])
    expect(config.textTracks[0].url).toBe(ENGLISH_SUBTITLE_URL)

    const english = resources.find(resource => resource.id === `vimeo:${VIDEO_ID}:subtitle:en`)
    const chinese = resources.find(resource => resource.id === `vimeo:${VIDEO_ID}:subtitle:zh`)
    expect(english).toMatchObject({
      type: RESOURCE_TYPES.SUBTITLE,
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL,
      url: ENGLISH_SUBTITLE_URL,
      mimeType: 'text/vtt'
    })
    expect(english?.filename).toBe('Demo Video-English.vtt')
    expect(chinese).toMatchObject({
      url: CHINESE_SUBTITLE_URL,
      filename: 'Demo Video-中文.vtt'
    })
    expect(decodeVimeoSourceDescriptor(english?.documentId)).toMatchObject({
      kind: 'subtitle',
      delivery: 'subtitle',
      optionId: 'subtitle:en',
      sourceId: `vimeo:${VIDEO_ID}:subtitle:en`
    })
  })

  it('按 URL 扩展名识别 WebVTT / TTML / SRT，未识别时按 WebVTT 处理', () => {
    const config = parseVimeoConfig(
      configFixture({
        textTracks: [
          { url: 'https://player.vimeo.com/texttrack/1.ttml', lang: 'en', label: 'English' },
          { url: 'https://player.vimeo.com/texttrack/2.srt', lang: 'de', label: 'Deutsch' },
          { url: 'https://player.vimeo.com/texttrack/3', lang: 'fr', label: 'Français' }
        ]
      }),
      CONFIG_URL
    )
    const byLang = new Map(
      buildVimeoDownloadOptions(config, null).map(option => [option.optionId, option])
    )

    expect(byLang.get('subtitle:en')).toMatchObject({
      mimeType: 'application/ttml+xml',
      filename: 'Demo Video-English.ttml'
    })
    expect(byLang.get('subtitle:de')).toMatchObject({
      mimeType: 'application/x-subrip',
      filename: 'Demo Video-Deutsch.srt'
    })
    expect(byLang.get('subtitle:fr')).toMatchObject({
      mimeType: 'text/vtt',
      filename: 'Demo Video-Français.vtt'
    })
  })

  it('丢弃不在字幕白名单、缺少语言或重复的 text track', () => {
    const config = parseVimeoConfig(
      configFixture({
        textTracks: [
          { url: 'https://attacker.example/evil.vtt', lang: 'en', label: 'English' },
          { url: `https://player.vimeo.com/video/${VIDEO_ID}/config`, lang: 'de', label: 'Deutsch' },
          { url: 'http://player.vimeo.com/texttrack/1.vtt', lang: 'fr', label: 'Français' },
          { url: ENGLISH_SUBTITLE_URL, lang: 'es', label: 'Español' },
          { url: `${ENGLISH_SUBTITLE_URL}&dup=1`, lang: 'es', label: 'Español 2' }
        ]
      }),
      CONFIG_URL
    )

    expect(config.textTracks).toEqual([
      { lang: 'es', label: 'Español', url: ENGLISH_SUBTITLE_URL }
    ])
    expect(isVimeoSubtitleUrl('https://player.vimeo.com/texttrack/1.vtt')).toBe(true)
    expect(isVimeoSubtitleUrl(`https://player.vimeo.com/video/${VIDEO_ID}/config`)).toBe(false)
    expect(isVimeoSubtitleUrl('https://captions.vimeocdn.com/captions/1.vtt')).toBe(true)
    expect(isVimeoSubtitleUrl('https://vimeo.com/1.vtt')).toBe(false)
    expect(isVimeoSubtitleUrl('http://player.vimeo.com/texttrack/1.vtt')).toBe(false)
  })

  it('没有字幕时不出字幕选项，面板字幕行显示禁用占位', () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="vd-wrapper">
          <h1>Demo</h1>
          <div data-testid="action-bar">actions</div>
        </div>
      </main>
    `
    const config = parseVimeoConfig(configFixture(), CONFIG_URL)
    const resources = buildVimeoDownloadOptions(config, null).map((option, index) =>
      createVimeoResource(option, index)
    )
    const panel = new VimeoButtonPanel()

    panel.render(VIDEO_ID, resources, 1999999999)

    expect(resources.some(resource => resource.type === RESOURCE_TYPES.SUBTITLE)).toBe(false)
    const subtitleRow = document.querySelector('[data-testid="vdl-vimeo-row-subtitle"]')
    const buttons = subtitleRow?.querySelectorAll('[data-testid="vdl-vimeo-option"]')
    expect(buttons).toHaveLength(1)
    expect(buttons?.[0].getAttribute('data-vdl-choice')).toBe('unavailable')
    expect(buttons?.[0].hasAttribute('disabled')).toBe(true)
    const label = subtitleRow?.querySelector('[data-testid="vdl-vimeo-row-label"]')
    expect(label?.textContent).toBe('Subtitle')
    // 占位按钮的读屏名称必须走 i18n：行名是词条，不能再出现硬编码英文。
    expect(buttons?.[0].getAttribute('aria-label')).toBe(
      I18nService.t(I18N_KEYS.RESOURCE_ITEM.NO_OPTION_AVAILABLE, {
        kind: I18nService.t(I18N_KEYS.RESOURCE_ITEM.TYPE_SUBTITLE)
      })
    )
  })

  it('有字幕时面板字幕行按语言渲染可点按钮', () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="vd-wrapper">
          <h1>Demo</h1>
        </div>
      </main>
    `
    const config = parseVimeoConfig(
      configFixture({
        textTracks: [
          { url: ENGLISH_SUBTITLE_URL, lang: 'en', label: 'English' },
          { url: CHINESE_SUBTITLE_URL, lang: 'zh', label: '中文' }
        ]
      }),
      CONFIG_URL
    )
    const resources = buildVimeoDownloadOptions(config, null).map((option, index) =>
      createVimeoResource(option, index)
    )
    const clicked: string[] = []
    const panel = new VimeoButtonPanel()
    panel.onClick(resourceId => {
      clicked.push(resourceId)
    })

    panel.render(VIDEO_ID, resources, 1999999999)

    const subtitleRow = document.querySelector('[data-testid="vdl-vimeo-row-subtitle"]')
    const buttons = Array.from(
      subtitleRow?.querySelectorAll<HTMLButtonElement>('[data-testid="vdl-vimeo-option"]') ?? []
    )
    expect(buttons.map(button => button.getAttribute('data-vdl-choice'))).toEqual([
      'subtitle:en',
      'subtitle:zh'
    ])
    expect(buttons.map(button => button.textContent)).toEqual(['English', '中文'])

    buttons[1].click()
    expect(clicked).toEqual([`vimeo:${VIDEO_ID}:subtitle:zh`])
  })

  it('字幕按 Chrome 原生下载来源分派，且不支持片段裁剪', () => {
    const config = parseVimeoConfig(
      configFixture({ textTracks: [{ url: ENGLISH_SUBTITLE_URL, lang: 'en', label: 'English' }] }),
      CONFIG_URL
    )
    const subtitle = buildVimeoDownloadOptions(config, null)
      .map((option, index) => createVimeoResource(option, index))
      .find(resource => resource.type === RESOURCE_TYPES.SUBTITLE)

    expect(subtitle && isBrowserManagedSourceKind(subtitle.sourceKind)).toBe(true)
    expect(() =>
      applyVimeoTimeRange(subtitle as MediaResource, { startSeconds: 1, endSeconds: 2 })
    ).toThrow('只有 DASH/HLS 交付支持片段裁剪')
  })
})

describe('Vimeo 字幕 Chrome 原生下载', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.startBrowserDownload.mockReset()
    mocks.getBrowserDownloadStatus.mockReset()
    mocks.loggerError.mockReset()
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockReset()
  })

  it('content 侧把字幕资源交给 background 创建原生下载', async () => {
    mocks.startBrowserDownload.mockResolvedValue({ download_id: 51 })
    mocks.getBrowserDownloadStatus.mockResolvedValue({
      state: 'complete',
      bytes_received: 1024,
      total_bytes: 1024
    })

    await downloadWithBrowserManager('subtitle-task-1', subtitleResource(), 'Demo-English.vtt')

    expect(mocks.startBrowserDownload).toHaveBeenCalledWith({
      source: expect.objectContaining({
        source_id: `vimeo:${VIDEO_ID}:subtitle:en`,
        url: ENGLISH_SUBTITLE_URL,
        type: RESOURCE_TYPES.SUBTITLE,
        source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL,
        mime_type: 'text/vtt',
        filename: 'Demo-English.vtt'
      }),
      refresh_source: false
    })
  })

  it('background 校验字幕来源后交给 Chrome 下载管理器，并拒绝越界 URL 与 MIME', async () => {
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(61))
    const service = new BrowserDownloadService()

    await expect(service.start(subtitleRequest(), vimeoContext())).resolves.toEqual({
      download_id: 61
    })
    expect(chrome.downloads.download).toHaveBeenCalledWith({
      url: ENGLISH_SUBTITLE_URL,
      // 保存位置默认子目录由 background 拼在文件名前，路径始终相对下载目录。
      filename: 'vimeo-video-downloader/Demo-English.vtt',
      conflictAction: 'uniquify',
      saveAs: false
    })

    await expect(
      service.start(
        subtitleRequest({ url: `https://player.vimeo.com/video/${VIDEO_ID}/config` }),
        vimeoContext()
      )
    ).rejects.toThrow('URL 不在允许的白名单')
    await expect(
      service.start(subtitleRequest({ url: 'https://attacker.example/evil.vtt' }), vimeoContext())
    ).rejects.toThrow('URL 不在允许的白名单')
    await expect(
      service.start(subtitleRequest({ mime_type: 'video/mp4' }), vimeoContext())
    ).rejects.toThrow('直连来源合同不匹配')
    await expect(
      service.start(subtitleRequest({ type: RESOURCE_TYPES.AUDIO }), vimeoContext())
    ).rejects.toThrow('直连来源合同不匹配')
  })

  it('状态查询接受 text/* 响应，阻断被换成视频的最终响应', async () => {
    const service = new BrowserDownloadService()
    vi.spyOn(chrome.downloads, 'search')
      .mockImplementationOnce(() => Promise.resolve([subtitleDownloadItem()]))
      .mockImplementationOnce(() => Promise.resolve([subtitleDownloadItem({ mime: 'video/mp4' })]))
      .mockImplementationOnce(() =>
        Promise.resolve([subtitleDownloadItem({ finalUrl: 'https://attacker.example/evil.vtt' })])
      )
    vi.spyOn(chrome.downloads, 'cancel').mockResolvedValue()

    await expect(
      service.getStatus(
        { download_id: 61, source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL },
        vimeoContext()
      )
    ).resolves.toEqual({ state: 'in_progress', bytes_received: 128, total_bytes: 256 })
    await expect(
      service.getStatus(
        { download_id: 61, source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL },
        vimeoContext()
      )
    ).rejects.toThrow('原生下载响应越界')
    await expect(
      service.getStatus(
        { download_id: 61, source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL },
        vimeoContext()
      )
    ).rejects.toThrow('原生下载响应越界')
    expect(chrome.downloads.cancel).toHaveBeenCalledTimes(2)
  })

  it('字幕响应为 octet-stream 时放行，不取消下载', async () => {
    const service = new BrowserDownloadService()
    vi.spyOn(chrome.downloads, 'search')
      .mockImplementationOnce(() =>
        Promise.resolve([subtitleDownloadItem({ mime: 'application/octet-stream' })])
      )
      .mockImplementationOnce(() =>
        Promise.resolve([subtitleDownloadItem({ mime: 'binary/octet-stream' })])
      )
    const cancel = vi.spyOn(chrome.downloads, 'cancel').mockResolvedValue()

    // Vimeo CDN 对同一批直连文件会返回 octet-stream（DASH media segment 已按此放行）：
    // 拒绝对纯文本字幕不增加安全价值，却会产生一条取消后不可恢复的失败路径。
    await expect(
      service.getStatus(
        { download_id: 61, source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL },
        vimeoContext()
      )
    ).resolves.toEqual({ state: 'in_progress', bytes_received: 128, total_bytes: 256 })
    await expect(
      service.getStatus(
        { download_id: 61, source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL },
        vimeoContext()
      )
    ).resolves.toEqual({ state: 'in_progress', bytes_received: 128, total_bytes: 256 })
    expect(cancel).not.toHaveBeenCalled()
  })

  it('直连中断刷新 config 后恢复同一语言的字幕', async () => {
    vi.spyOn(chrome.downloads, 'download').mockImplementation(() => Promise.resolve(62))
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([
      { ...subtitleResource(), url: `${CHINESE_SUBTITLE_URL}` }
    ])

    const result = await new BrowserDownloadService().start(
      { ...subtitleRequest(), refresh_source: true },
      vimeoContext()
    )

    expect(result).toEqual({ download_id: 62 })
    expect(mocks.refreshVimeoDirectResourcesFromConfigUrl).toHaveBeenCalledWith(REFRESH_CONFIG_URL)
    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: CHINESE_SUBTITLE_URL })
    )
  })

  it('刷新后缺少同语言字幕时明确失败', async () => {
    mocks.refreshVimeoDirectResourcesFromConfigUrl.mockResolvedValue([])

    await expect(
      new BrowserDownloadService().start({ ...subtitleRequest(), refresh_source: true }, vimeoContext())
    ).rejects.toThrow('刷新 Vimeo config 后找不到直连资源')
    expect(chrome.downloads.download).not.toHaveBeenCalled()
  })
})

interface ConfigFixtureOptions {
  readonly textTracks?: readonly Record<string, string>[]
}

/** 构造只含字幕信息的最小 Vimeo config。 */
function configFixture(options: ConfigFixtureOptions = {}) {
  return {
    request: {
      timestamp: 1_999_996_399,
      expires: 3600,
      config_refresh_url: REFRESH_CONFIG_URL,
      files: {
        progressive: [
          {
            quality: '1080p',
            width: 1920,
            height: 1080,
            fps: 30,
            mime: 'video/mp4',
            url: 'https://vod-progressive-ak.vimeocdn.com/1080.mp4'
          }
        ]
      },
      ...(options.textTracks === undefined ? {} : { text_tracks: options.textTracks })
    },
    video: {
      id: Number(VIDEO_ID),
      title: 'Demo Video',
      thumbs: { 1280: 'https://i.vimeocdn.com/video/high.jpg' }
    }
  }
}

/** 构造字幕页面资源。 */
function subtitleResource(): MediaResource {
  const sourceId = `vimeo:${VIDEO_ID}:subtitle:en`
  return {
    id: sourceId,
    messageId: VIDEO_ID,
    index: 3,
    url: ENGLISH_SUBTITLE_URL,
    type: RESOURCE_TYPES.SUBTITLE,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL,
    filename: 'Demo-English.vtt',
    mimeType: 'text/vtt',
    documentId: encodeVimeoSourceDescriptor({
      version: 2,
      videoId: VIDEO_ID,
      sourceId,
      optionId: 'subtitle:en',
      kind: 'subtitle',
      delivery: 'subtitle',
      label: 'English',
      configUrl: CONFIG_URL,
      refreshConfigUrl: REFRESH_CONFIG_URL
    }),
    metadata: { messageId: VIDEO_ID }
  }
}

/** 构造 background 启动请求。 */
function subtitleRequest(
  overrides: Partial<BackgroundBrowserDownloadSource> = {}
): BackgroundStartBrowserDownloadRequest {
  return {
    source: {
      source_id: `vimeo:${VIDEO_ID}:subtitle:en`,
      url: ENGLISH_SUBTITLE_URL,
      type: RESOURCE_TYPES.SUBTITLE,
      source_kind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL,
      filename: 'Demo-English.vtt',
      mime_type: 'text/vtt',
      document_id: subtitleResource().documentId ?? '',
      ...overrides
    },
    refresh_source: false
  }
}

/** 构造合法 Vimeo content RPC 上下文。 */
function vimeoContext(): RpcContext {
  return {
    transport: 'chrome',
    caller: 'content',
    tabId: 8,
    frameId: 0,
    origin: `https://vimeo.com/${VIDEO_ID}`
  }
}

/** 构造 Chrome 下载项。 */
function subtitleDownloadItem(
  overrides: Partial<chrome.downloads.DownloadItem> = {}
): chrome.downloads.DownloadItem {
  return {
    id: 61,
    url: ENGLISH_SUBTITLE_URL,
    finalUrl: ENGLISH_SUBTITLE_URL,
    filename: '/tmp/Demo-English.vtt',
    danger: 'safe',
    mime: 'text/vtt',
    startTime: new Date(0).toISOString(),
    state: 'in_progress',
    paused: false,
    canResume: false,
    bytesReceived: 128,
    totalBytes: 256,
    fileSize: -1,
    exists: true,
    incognito: false,
    referrer: '',
    byExtensionId: chrome.runtime.id,
    ...overrides
  }
}
