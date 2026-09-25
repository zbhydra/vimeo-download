import { createI18n } from 'vue-i18n'
import { LanguageService } from './services/languageService'
import { SUPPORTED_LANGUAGES } from './constants/i18n'
import { logger } from './utils/logger'
import TRANSLATIONS from '../locales/messages'
import type { Language } from './services/languageService'

/**
 * 统一的 i18n 初始化函数
 * 带有错误处理和降级策略
 */
export async function createI18nInstance() {
  let locale: Language = SUPPORTED_LANGUAGES.EN_US // 默认英文

  try {
    locale = await LanguageService.getLanguage()
    logger.info('Language detected:', locale)
  } catch (error) {
    logger.error('Failed to detect language, using fallback:', error)
    locale = SUPPORTED_LANGUAGES.EN_US // 降级到英文
  }

  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: SUPPORTED_LANGUAGES.EN_US,
    messages: TRANSLATIONS
  })
}

/**
 * 初始化扩展
 * 确保所有必要的初始化步骤完成
 */
export async function initializeExtension() {
  try {
    // 可以添加其他初始化步骤
    logger.info('Extension initializing...')
    return true
  } catch (error) {
    logger.error('Extension initialization failed:', error)
    throw error
  }
}
