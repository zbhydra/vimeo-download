// 统一导出所有共享模块
export * from './types'

export { storageManager } from './storage/index'
export { SettingsManager } from './storage/settings'

export { I18nService } from '../locales/index'

export { logger } from './utils/logger'
export * from './constants'

export { LanguageService } from './services/languageService'

export { createI18nInstance, initializeExtension } from './bootstrap'
