/**
 * Vimeo 字幕资源建模与面板渲染。
 *
 * 直连下载分派/边界已随 content 下载链退役：URL/MIME/刷新合同由 direct-source.spec 覆盖，
 * 真实落盘由 download-orchestrator.spec 与 e2e 覆盖。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES, isBrowserManagedSourceKind } from '@/core/constants/resource'
import { I18N_KEYS } from '@/core/constants/i18n'
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
  isVimeoSubtitleUrl
} from '@/sites/vimeo/shared'

const VIDEO_ID = '1201819515'
const CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config?h=dc93ef4923&s=native_signature`
const REFRESH_CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?signature=refresh`
const ENGLISH_SUBTITLE_URL = `https://player.vimeo.com/texttrack/1234567.vtt?token=signed`
const VIMEO_SUBTITLE_URL = `https://vimeo.com/texttrack/1234567.vtt?token=signed`
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
    expect(config.textTracks[0].url).toBe(VIMEO_SUBTITLE_URL)

    const english = resources.find(resource => resource.id === `vimeo:${VIDEO_ID}:subtitle:en`)
    const chinese = resources.find(resource => resource.id === `vimeo:${VIDEO_ID}:subtitle:zh`)
    expect(english).toMatchObject({
      type: RESOURCE_TYPES.SUBTITLE,
      sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_SUBTITLE_URL,
      url: VIMEO_SUBTITLE_URL,
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
    expect(isVimeoSubtitleUrl('https://vimeo.com/texttrack/1.vtt')).toBe(true)
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
    expect(clicked).toEqual([])
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
