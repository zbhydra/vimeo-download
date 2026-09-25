/**
 * Content 运行时配置同步。
 *
 * Content 从 background 获取扩展配置，应用到自身后再同步给 MAIN world。
 */

import { BackgroundChannel } from '@/content/rpc/background.rpc'
import { injectedClient } from '@/content/rpc/injectedClient'
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from '@/core/runtimeConfig'
import { logger } from '@/core/utils/logger'

const backgroundClient = new BackgroundChannel()

/** 获取并应用当前页面两个运行上下文的运行时配置。 */
export async function synchronizeRuntimeConfig(): Promise<void> {
  let config: RuntimeConfig = DEFAULT_RUNTIME_CONFIG
  try {
    config = await backgroundClient.getRuntimeConfig()
  } catch (error) {
    logger.error('[ContentRuntimeConfig] 从 background 读取运行时配置失败:', error)
  }

  logger.applyRuntimeConfig(config)

  try {
    await injectedClient.applyRuntimeConfig(config)
  } catch (error) {
    logger.error('[ContentRuntimeConfig] 向 injected 同步运行时配置失败:', error)
  }
}
