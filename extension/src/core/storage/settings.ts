import { storageManager } from './index'
import type { LanguageSetting } from '../constants/i18n'
import { LANGUAGE_AUTO } from '../constants/i18n'
import { FILENAME_PATTERN_DEFAULT } from '../utils/filenameTemplate'
import { logger } from '../utils/logger'
import { STORAGE_KEYS } from '../api/config'

/**
 * 默认保存子目录。
 *
 * 下载文件落在浏览器下载目录下的这一层，用户可以改成别的子目录；空值或非法值同样回退到这里
 * （见 background `downloadFilename.ts` 的路径归一化）。
 */
export const DEFAULT_DOWNLOAD_PATH = 'vimeoMediaDownloader'

/** 中间版本的默认值，仅用于读取时迁移，不作为新的用户可选默认值。 */
const LEGACY_DOWNLOAD_PATH = 'vimeo-video-downloader'
const LEGACY_FILENAME_PATTERN_DEFAULT = '{title}'

export type SplitMode = 'auto' | 'never'

export const AUTO_SPLIT_THRESHOLD_MIN_GB = 0.5
export const AUTO_SPLIT_THRESHOLD_MAX_GB = 8
export const AUTO_SPLIT_THRESHOLD_STEP_GB = 0.1
export const DEFAULT_AUTO_SPLIT_THRESHOLD_GB = 1.5

// 内部类型定义
export interface AppSettings {
  /** 界面语言；`auto` 表示跟随浏览器语言（读取时即时解析，不落具体值）。 */
  language: LanguageSetting
  /** 保存子目录，相对浏览器下载目录；不存绝对路径。 */
  downloadPath?: string
  /** 下载文件名模板（默认 `{title}_{quality}_{type}`，可由用户自定义）；background 在命名边界统一渲染。 */
  filenamePattern: string
  maxConcurrent?: number
  /** 大文件下载模式：自动按阈值分割，或保持单文件流式下载。 */
  splitMode: SplitMode
  /** 自动分割阈值，单位 GB，按 0.1GB 保存。 */
  autoSplitThresholdGB: number
  /** 是否使用备用 Blob 交付路径。 */
  useBackgroundBlobDownload: boolean
}

// 默认设置
const DEFAULT_SETTINGS: AppSettings = {
  language: LANGUAGE_AUTO,
  downloadPath: DEFAULT_DOWNLOAD_PATH,
  filenamePattern: FILENAME_PATTERN_DEFAULT,
  splitMode: 'auto',
  autoSplitThresholdGB: DEFAULT_AUTO_SPLIT_THRESHOLD_GB,
  useBackgroundBlobDownload: false
}

/** 把用户输入限制到合法的 0.1GB 步进。 */
export function normalizeAutoSplitThresholdGB(value: number | string | undefined): number {
  if (typeof value === 'string' && value.trim() === '') {
    return DEFAULT_AUTO_SPLIT_THRESHOLD_GB
  }
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    return DEFAULT_AUTO_SPLIT_THRESHOLD_GB
  }

  const clamped = Math.min(
    AUTO_SPLIT_THRESHOLD_MAX_GB,
    Math.max(AUTO_SPLIT_THRESHOLD_MIN_GB, parsed)
  )
  return (
    Math.round((clamped + Number.EPSILON) / AUTO_SPLIT_THRESHOLD_STEP_GB) *
    AUTO_SPLIT_THRESHOLD_STEP_GB
  )
}

export function normalizeSplitMode(value: SplitMode | string | undefined): SplitMode {
  return value === 'never' ? 'never' : 'auto'
}

export function normalizeSettings(settings: Partial<AppSettings> | null): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings ?? {}),
    splitMode: normalizeSplitMode(settings?.splitMode),
    autoSplitThresholdGB: normalizeAutoSplitThresholdGB(settings?.autoSplitThresholdGB),
    useBackgroundBlobDownload: settings?.useBackgroundBlobDownload === true
  }
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
    const stored = await storageManager.get<AppSettings>(STORAGE_KEYS.SETTINGS)
    const settings = normalizeSettings(stored)
    const migrated = {
      ...settings,
      ...(settings.downloadPath === LEGACY_DOWNLOAD_PATH
        ? { downloadPath: DEFAULT_DOWNLOAD_PATH }
        : {}),
      ...(settings.filenamePattern === LEGACY_FILENAME_PATTERN_DEFAULT
        ? { filenamePattern: FILENAME_PATTERN_DEFAULT }
        : {})
    }
    if (
      (stored &&
        stored.downloadPath !== undefined &&
        migrated.downloadPath !== stored.downloadPath) ||
      (stored &&
        stored.filenamePattern !== undefined &&
        migrated.filenamePattern !== stored.filenamePattern) ||
      (stored && stored.splitMode !== undefined && migrated.splitMode !== stored.splitMode) ||
      (stored &&
        stored.autoSplitThresholdGB !== undefined &&
        migrated.autoSplitThresholdGB !== stored.autoSplitThresholdGB) ||
      (stored &&
        stored.useBackgroundBlobDownload !== undefined &&
        migrated.useBackgroundBlobDownload !== stored.useBackgroundBlobDownload)
    ) {
      await storageManager.set(STORAGE_KEYS.SETTINGS, migrated)
    }
    logger.info('getSettings', migrated)
    return migrated
  }

  static async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const currentSettings = await this.getSettings()
    const newSettings = normalizeSettings({ ...currentSettings, ...updates })
    logger.info('newSettings', newSettings)
    await storageManager.set(STORAGE_KEYS.SETTINGS, newSettings)
    return newSettings
  }

  static async resetSettings(): Promise<AppSettings> {
    await storageManager.set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
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

    this.unsubscribe = storageManager.onChanged<AppSettings>(
      STORAGE_KEYS.SETTINGS,
      async newSettings => {
        if (newSettings) {
          await this.notifyCallbacks(normalizeSettings(newSettings))
        }
      }
    )
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
