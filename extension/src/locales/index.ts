import { createI18n } from 'vue-i18n'
import { SettingsManager } from '@/core/storage/settings'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/core/constants/i18n'
import { logger } from '@/core/utils/logger'
import TRANSLATIONS from './messages'

// Vue I18n instance type (from vue-i18n)
export type VueI18nInstance = {
  global: {
    locale: { value: SupportedLanguage }
  }
}

type I18nParams = Record<string, string | number>

type InternalI18nInstance = VueI18nInstance & {
  global: VueI18nInstance['global'] & {
    t: (key: string, params?: I18nParams) => string
  }
}

// 内部 i18n 实例，用于 I18nService.t() 方法
let internalI18nInstance: InternalI18nInstance | null = null

function getInternalI18n(): InternalI18nInstance {
  if (!internalI18nInstance) {
    internalI18nInstance = createI18n({
      legacy: false,
      locale: SUPPORTED_LANGUAGES.EN_US,
      fallbackLocale: SUPPORTED_LANGUAGES.EN_US,
      messages: TRANSLATIONS
    }) as InternalI18nInstance
  }
  return internalI18nInstance
}

export class I18nService {
  private static currentLanguage: SupportedLanguage = SUPPORTED_LANGUAGES.EN_US
  private static callbacks: Set<() => void> = new Set()
  private static vueI18nInstances: Set<VueI18nInstance> = new Set()

  static async initialize(): Promise<void> {
    // 初始化内部 i18n 实例的语言
    const settings = await SettingsManager.getSettings()
    if (settings?.language) {
      I18nService.currentLanguage = settings.language as SupportedLanguage
      getInternalI18n().global.locale.value = I18nService.currentLanguage
    }

    SettingsManager.onSettingsChanged(settings => {
      if (settings.language && settings.language !== I18nService.currentLanguage) {
        I18nService.currentLanguage = settings.language as SupportedLanguage
        getInternalI18n().global.locale.value = I18nService.currentLanguage
        I18nService.notifyLanguageChange()
      }
    })
  }

  static t(key: string, params?: I18nParams, lang?: SupportedLanguage): string {
    const i18n = getInternalI18n()

    if (lang && lang !== I18nService.currentLanguage) {
      // 临时切换语言获取翻译
      const originalLocale = i18n.global.locale.value
      i18n.global.locale.value = lang
      const result = i18n.global.t(key, params ?? {})
      i18n.global.locale.value = originalLocale
      return result
    }

    return i18n.global.t(key, params ?? {})
  }

  static getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage
  }

  static async setLanguage(language: SupportedLanguage): Promise<void> {
    await SettingsManager.updateSettings({ language })
  }

  static onLanguageChange(callback: () => void): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  private static notifyLanguageChange(): void {
    // Update all registered Vue I18n instances
    for (const instance of this.vueI18nInstances) {
      try {
        instance.global.locale.value = this.currentLanguage
      } catch (error) {
        logger.error('[I18nService] Error updating Vue I18n instance:', error)
      }
    }

    // Notify custom callbacks
    for (const callback of this.callbacks) {
      try {
        callback()
      } catch (error) {
        logger.error('[I18nService] Error in language change callback:', error)
      }
    }
  }

  static getAvailableLanguages(): SupportedLanguage[] {
    return Object.keys(TRANSLATIONS) as SupportedLanguage[]
  }

  /**
   * Register a Vue I18n instance to be automatically updated when language changes
   * @param instance The Vue I18n instance to register
   * @returns A function to unregister the instance
   */
  static registerVueI18nInstance(instance: VueI18nInstance): () => void {
    this.vueI18nInstances.add(instance)
    // Sync current language immediately
    instance.global.locale.value = this.currentLanguage
    return () => this.vueI18nInstances.delete(instance)
  }

  static destroy(): void {
    this.callbacks.clear()
  }
}

export default TRANSLATIONS

I18nService.initialize().catch(error => {
  logger.error('[I18nService] Initialization failed:', error)
})
