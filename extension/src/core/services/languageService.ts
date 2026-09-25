import { SettingsManager } from '../storage/settings'
import { logger } from '../utils/logger'
import type { SupportedLanguage } from '../constants/i18n'

// 语言配置接口
interface LanguageConfig {
  value: SupportedLanguage
  label: string
  displayName: string
  keyWords: string[]
  isDefault?: boolean
}

// 语言配置常量（唯一来源）
export const LANGUAGES: readonly LanguageConfig[] = [
  {
    value: 'en-US',
    label: 'English',
    displayName: 'English',
    keyWords: ['en', 'en-US', 'en-us'],
    isDefault: true
  },
  {
    value: 'zh-CN',
    label: '简体中文',
    displayName: '简体中文',
    keyWords: ['zh', 'zh-CN', 'zh-cn', 'zh-hans']
  },
  {
    value: 'zh-TW',
    label: '繁體中文',
    displayName: '繁體中文',
    keyWords: ['zh-TW', 'zh-tw', 'zh-hk', 'zh-mo', 'zh-hant']
  },
  {
    value: 'ja-JP',
    label: '日本語',
    displayName: '日本語',
    keyWords: ['ja', 'ja-JP', 'ja-jp']
  },
  {
    value: 'ko-KR',
    label: '한국어',
    displayName: '한국어',
    keyWords: ['ko', 'ko-KR', 'ko-kr']
  },
  {
    value: 'es-ES',
    label: 'Español',
    displayName: 'Español',
    keyWords: ['es', 'es-ES', 'es-es']
  },
  {
    value: 'pt-BR',
    label: 'Português',
    displayName: 'Português (Brasil)',
    keyWords: ['pt', 'pt-BR', 'pt-br']
  },
  {
    value: 'de-DE',
    label: 'Deutsch',
    displayName: 'Deutsch',
    keyWords: ['de', 'de-DE', 'de-de']
  },
  {
    value: 'fr-FR',
    label: 'Français',
    displayName: 'Français',
    keyWords: ['fr', 'fr-FR', 'fr-fr']
  },
  {
    value: 'ru-RU',
    label: 'Русский',
    displayName: 'Русский',
    keyWords: ['ru', 'ru-RU', 'ru-ru']
  },
  {
    value: 'it-IT',
    label: 'Italiano',
    displayName: 'Italiano',
    keyWords: ['it', 'it-IT', 'it-it']
  },
  {
    value: 'vi-VN',
    label: 'Tiếng Việt',
    displayName: 'Tiếng Việt',
    keyWords: ['vi', 'vi-VN', 'vi-vn']
  },
  {
    value: 'th-TH',
    label: 'ไทย',
    displayName: 'ภาษาไทย',
    keyWords: ['th', 'th-TH', 'th-th']
  },
  {
    value: 'id-ID',
    label: 'Bahasa Indonesia',
    displayName: 'Bahasa Indonesia',
    keyWords: ['id', 'id-ID', 'id-id']
  }
] as const

export type Language = SupportedLanguage

export class LanguageService {
  static async getLanguage(): Promise<Language> {
    let language: Language | '' = ''
    //先获取设置里面的语言
    const settings = await SettingsManager.getSettings()
    language = settings.language || ''

    //如果设置没有 ， 获取浏览器语言
    if (!language) {
      language = await this.detectLanguage()
      //保存
      await SettingsManager.updateSettings({ language: language })
    }
    return language
  }

  static async detectLanguage(): Promise<Language> {
    //如果设置没有 ， 获取浏览器语言
    let language = await this.getBrowserLanguage()

    //如果浏览器没有 ， 获取配置里面的默认语言
    if (!language) {
      language = this.getDefaultLanguage()
    }

    //选择的语言是否支持
    if (!this.getLanguageConfig(language)) {
      language = this.getDefaultLanguage()
    }
    return language
  }

  // 获取默认语言
  static getDefaultLanguage(): Language {
    const defaultLang = LANGUAGES.find(lang => lang.isDefault)
    return defaultLang ? defaultLang.value : LANGUAGES[0].value
  }

  // 获取语言选项（用于UI选择器）
  static getLanguageOptions = () => {
    return LANGUAGES.map(lang => ({
      value: lang.value,
      label: lang.label
    }))
  }

  // 根据值获取语言配置
  static getLanguageConfig = (value: string): LanguageConfig | undefined => {
    return LANGUAGES.find(lang => lang.value === value)
  }

  /**
   * 获取浏览器语言
   */
  private static async getBrowserLanguage(): Promise<Language> {
    const languages = await chrome.i18n.getAcceptLanguages()
    logger.info('getBrowserLanguage', languages)
    let returnStr: Language = '' as Language
    for (let i = 0; i < languages.length; i++) {
      //检查
      const langLower = languages[i].toLocaleLowerCase()
      const lang = LANGUAGES.find(lang =>
        lang.keyWords.some(pattern => langLower.startsWith(pattern))
      )
      if (lang) {
        returnStr = lang.value
        break
      }
    }
    return returnStr
  }
}
