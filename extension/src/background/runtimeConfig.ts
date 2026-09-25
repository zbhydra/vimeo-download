/**
 * Background 运行时配置所有者。
 *
 * 运行时配置只从扩展自有 chrome.storage.local 读取。
 */

import { STORAGE_KEYS } from '@/core/api/config'
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from '@/core/runtimeConfig'
import { storageManager } from '@/core/storage'
import { logger } from '@/core/utils/logger'

/** 读取当前扩展运行时配置。 */
export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const debugLogging = await storageManager.get<boolean>(STORAGE_KEYS.DEBUG_LOGGING)
  return {
    ...DEFAULT_RUNTIME_CONFIG,
    debugLogging: debugLogging === true
  }
}

/** 在 background 启动时应用运行时日志配置。 */
export async function initializeRuntimeLogger(): Promise<void> {
  logger.applyRuntimeConfig(await getRuntimeConfig())
}
