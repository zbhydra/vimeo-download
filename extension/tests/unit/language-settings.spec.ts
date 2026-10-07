/**
 * 语言设置 Auto 模型测试。
 *
 * settings.language 支持 `auto`（跟随浏览器，读取时即时解析、不固化）与具体 locale；
 * 旧数据的空语言在 LanguageService.getLanguage 里解析并固化为具体 locale。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsManager, DEFAULT_DOWNLOAD_PATH } from '@/core/storage/settings'
import { FILENAME_PATTERN_DEFAULT } from '@/core/utils/filenameTemplate'
import { LANGUAGE_AUTO, SUPPORTED_LANGUAGES } from '@/core/constants/i18n'

/** chrome.storage.local 的测试后备存储。 */
const storageData = new Map<string, unknown>()

/** 动态导入，配合 vi.resetModules 隔离各用例的模块级状态。 */
async function importLanguageService() {
  vi.resetModules()
  return import('@/core/services/languageService')
}

describe('语言设置 Auto 模型', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageData.clear()
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(async keys => {
      const result: Record<string, unknown> = {}
      const keyList = typeof keys === 'string' ? [keys] : []
      for (const key of keyList) {
        if (storageData.has(key)) {
          result[key] = storageData.get(key)
        }
      }
      return result
    })
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(async items => {
      for (const [key, value] of Object.entries(items)) {
        storageData.set(key, value)
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('默认设置为 Auto 跟随浏览器，下载子目录默认值不变', () => {
    expect(SettingsManager.getDefaultSettings()).toEqual({
      language: LANGUAGE_AUTO,
      downloadPath: DEFAULT_DOWNLOAD_PATH,
      filenamePattern: FILENAME_PATTERN_DEFAULT,
      splitMode: 'auto',
      autoSplitThresholdGB: 1.5,
      useBackgroundBlobDownload: false
    })
  })

  it('读取中间版本默认目录和模板时迁移到竞品默认，并保留其他自定义值', async () => {
    storageData.set('settings', {
      language: LANGUAGE_AUTO,
      downloadPath: 'vimeo-video-downloader',
      filenamePattern: '{title}'
    })

    const migrated = await SettingsManager.getSettings()
    expect(migrated.filenamePattern).toBe(FILENAME_PATTERN_DEFAULT)
    expect(migrated.downloadPath).toBe(DEFAULT_DOWNLOAD_PATH)
    expect(storageData.get('settings')).toMatchObject({
      downloadPath: DEFAULT_DOWNLOAD_PATH,
      filenamePattern: FILENAME_PATTERN_DEFAULT
    })

    storageData.set('settings', {
      language: LANGUAGE_AUTO,
      downloadPath: 'my-videos',
      filenamePattern: '{date}_{title}'
    })
    const custom = await SettingsManager.getSettings()
    expect(custom.filenamePattern).toBe('{date}_{title}')
    expect(custom.downloadPath).toBe('my-videos')
    expect(storageData.get('settings')).toMatchObject({
      downloadPath: 'my-videos',
      filenamePattern: '{date}_{title}'
    })
  })

  it('language=auto 时按浏览器语言即时解析，不固化具体 locale', async () => {
    storageData.set('settings', { language: 'auto' })
    ;(chrome.i18n.getAcceptLanguages as ReturnType<typeof vi.fn>).mockResolvedValue(['zh-CN', 'zh'])
    const { LanguageService } = await importLanguageService()

    const language = await LanguageService.getLanguage()
    expect(language).toBe('zh-CN')
    // Auto 不回写：存储里保持 auto
    expect(storageData.get('settings')).toEqual({ language: 'auto' })
  })

  it('language 为具体 locale 时直接使用，不再探测浏览器', async () => {
    storageData.set('settings', { language: 'fr-FR' })
    const getAcceptLanguages = (
      chrome.i18n.getAcceptLanguages as ReturnType<typeof vi.fn>
    ).mockResolvedValue(['ja-JP'])
    const { LanguageService } = await importLanguageService()

    const language = await LanguageService.getLanguage()
    expect(language).toBe('fr-FR')
    expect(getAcceptLanguages).not.toHaveBeenCalled()
  })

  it('浏览器语言不在支持列表时回退默认英文', async () => {
    storageData.set('settings', { language: 'auto' })
    ;(chrome.i18n.getAcceptLanguages as ReturnType<typeof vi.fn>).mockResolvedValue(['xx-YY', 'zz'])
    const { LanguageService } = await importLanguageService()

    const language = await LanguageService.getLanguage()
    expect(language).toBe(SUPPORTED_LANGUAGES.EN_US)
  })
})
