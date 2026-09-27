import { storageManager } from './index'
import type { LanguageSetting } from '../constants/i18n'
import { LANGUAGE_AUTO } from '../constants/i18n'
import { logger } from '../utils/logger'

/**
 * 默认保存子目录。
 *
 * 下载文件落在浏览器下载目录下的这一层，用户可以改成别的子目录；空值或非法值同样回退到这里
 * （见 background `downloadFilename.ts` 的路径归一化）。
 */
export const DEFAULT_DOWNLOAD_PATH = 'vimeo-video-downloader'

// 内部类型定义
interface AppSettings {
  /** 界面语言；`auto` 表示跟随浏览器语言（读取时即时解析，不落具体值）。 */
  language: LanguageSetting
  /** 保存子目录，相对浏览器下载目录；不存绝对路径。 */
  downloadPath?: string
  maxConcurrent?: number
}

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  language: LANGUAGE_AUTO,
  downloadPath: DEFAULT_DOWNLOAD_PATH
}

type SettingsCallback = (settings: AppSettings) => void

export class SettingsManager {
  private static callbacks: Set<SettingsCallback> = new Set()
  private static unsubscribe: (() => void) | null = null

  static async initialize(): Promise<void> {
    // 初始化默认设置
    const currentSettings = await this.getSettings()
    if (!currentSettings.language) {
      // 旧版本留下的无语言设置统一归一为 Auto，交给 LanguageService 按浏览器解析。
      await this.updateSettings({ language: LANGUAGE_AUTO })
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
