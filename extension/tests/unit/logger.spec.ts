/**
 * Logger 运行时配置测试。
 *
 * 验证日志级别只受构建环境与显式扩展配置控制。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOG_LEVELS } from '@/core/constants/logging'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.stubGlobal('__DEV__', false)
})

describe('logger runtime config', () => {
  it('加载正式版 Logger 时不访问 Web Storage', async () => {
    vi.stubGlobal('__DEV__', false)
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

    const { logger } = await import('@/core/utils/logger')

    expect(logger.getLevel()).toBe(LOG_LEVELS.ERROR)
    expect(getItemSpy).not.toHaveBeenCalled()
  })

  it('显式扩展配置可以在正式构建中启用 DEBUG', async () => {
    vi.stubGlobal('__DEV__', false)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const { logger } = await import('@/core/utils/logger')

    logger.applyRuntimeConfig({ debugLogging: true })
    logger.debug('runtime debug message')

    expect(logger.getLevel()).toBe(LOG_LEVELS.DEBUG)
    expect(debugSpy).toHaveBeenCalledWith('[DEBUG]', 'runtime debug message')
  })

  it('开发构建不会被关闭的运行时开关降级', async () => {
    vi.stubGlobal('__DEV__', true)
    const { logger } = await import('@/core/utils/logger')

    logger.applyRuntimeConfig({ debugLogging: false })

    expect(logger.getLevel()).toBe(LOG_LEVELS.DEBUG)
  })
})
