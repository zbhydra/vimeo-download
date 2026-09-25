import { storageManager } from './index'
import { LanguageService } from '../services/languageService'
import type { SupportedLanguage } from '../constants/i18n'
import { SUPPORTED_LANGUAGES } from '../constants/i18n'
import { logger } from '../utils/logger'

/**
 * 默认保存子目录。
 *
 * 下载文件落在浏览器下载目录下的这一层，用户可以改成别的子目录；空值或非法值同样回退到这里
 * （见 `BrowserDownloadService` 的路径归一化）。
 */
export const DEFAULT_DOWNLOAD_PATH = 'vimeo-video-downloader'

// 内部类型定义
interface AppSettings {
  language: SupportedLanguage
  /** 保存子目录，相对浏览器下载目录；不存绝对路径。 */
  downloadPath?: string
  maxConcurrent?: number
}

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  language: SUPPORTED_LANGUAGES.EN_US,
  downloadPath: DEFAULT_DOWNLOAD_PATH
}

type SettingsCallback = (settings: AppSettings) => void

export class SettingsManager {
  private static callbacks: Set<SettingsCallback> = new Set()
  private static unsubscribe: (() => void) | null = null

  static async initialize(): Promise<void> {
    // 初始化默认设置
    let currentSettings = await this.getSettings()
    if (!currentSettings) {
      currentSettings = { ...DEFAULT_SETTINGS }
      currentSettings.language = await LanguageService.detectLanguage()
      await this.updateSettings(currentSettings)
    }
    if (currentSettings && !currentSettings.language) {
      currentSettings.language = await LanguageService.detectLanguage()
      await this.updateSettings(currentSettings)
    }

    logger.info('initialize', currentSettings)
    // 设置变化监听
    this.setupChangeListener()
  }

  static getDefaultSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS }
  }

  static async getSettings(): Promise<AppSettings> {
    let settings = await storageManager.get<AppSettings>('settings')
    if (!settings) {
      settings = { ...DEFAULT_SETTINGS }
    }
    logger.info('getSettings', settings)
    return settings
  }

  static async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const currentSettings = (await this.getSettings()) || DEFAULT_SETTINGS
    const newSettings = { ...currentSettings, ...updates }
    logger.info('newSettings', newSettings)
    await storageManager.set('settings', newSettings)
    return newSettings
  }

  static async resetSettings(): Promise<AppSettings> {
    await storageManager.set('settings', DEFAULT_SETTINGS)
    return { ...DEFAULT_SETTINGS }
  }

  static onSettingsChanged(callback: SettingsCallback): () => void {
    this.callbacks.add(callback)

    // 返回移除监听器的函数
    return () => this.callbacks.delete(callback)
  }

  private static async notifyCallbacks(settings: AppSettings): Promise<void> {
    for (const callback of this.callbacks) {
      try {
        callback(settings)
      } catch (error) {
        logger.error('Error in settings callback:', error)
      }
    }
  }

  private static setupChangeListener(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
    }

    this.unsubscribe = storageManager.onChanged<AppSettings>('settings', async newSettings => {
      if (newSettings) {
        await this.notifyCallbacks(newSettings)
      }
    })
  }

  static destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    this.callbacks.clear()
  }
}

// 初始化设置管理器
SettingsManager.initialize().catch(error =>
  logger.error('SettingsManager initialization failed:', error)
)
