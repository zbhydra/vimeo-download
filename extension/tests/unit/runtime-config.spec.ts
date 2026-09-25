/**
 * 跨上下文运行时配置测试。
 *
 * 验证 background 所有权、content 分发与 MAIN world 输入边界。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  storageGet: vi.fn(),
  loggerApplyRuntimeConfig: vi.fn(),
  loggerError: vi.fn(),
  backgroundGetRuntimeConfig: vi.fn(),
  injectedApplyRuntimeConfig: vi.fn()
}))

vi.mock('@/core/storage', () => ({
  storageManager: {
    get: mocks.storageGet
  }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: {
    applyRuntimeConfig: mocks.loggerApplyRuntimeConfig,
    error: mocks.loggerError
  }
}))

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: vi.fn(() => ({
    getRuntimeConfig: mocks.backgroundGetRuntimeConfig
  }))
}))

vi.mock('@/content/rpc/injectedClient', () => ({
  injectedClient: {
    applyRuntimeConfig: mocks.injectedApplyRuntimeConfig
  }
}))

beforeEach(() => {
  vi.resetModules()
  mocks.storageGet.mockReset()
  mocks.loggerApplyRuntimeConfig.mockReset()
  mocks.loggerError.mockReset()
  mocks.backgroundGetRuntimeConfig.mockReset()
  mocks.injectedApplyRuntimeConfig.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('background runtime config', () => {
  it('只接受扩展存储中的严格布尔 true', async () => {
    mocks.storageGet.mockResolvedValueOnce(true).mockResolvedValueOnce('true')
    const { getRuntimeConfig } = await import('@/background/runtimeConfig')

    await expect(getRuntimeConfig()).resolves.toEqual({ debugLogging: true })
    await expect(getRuntimeConfig()).resolves.toEqual({ debugLogging: false })
    expect(mocks.storageGet).toHaveBeenNthCalledWith(1, 'debug_logging')
    expect(mocks.storageGet).toHaveBeenNthCalledWith(2, 'debug_logging')
  })

  it('background 启动时应用扩展配置', async () => {
    mocks.storageGet.mockResolvedValue(true)
    const { initializeRuntimeLogger } = await import('@/background/runtimeConfig')

    await initializeRuntimeLogger()

    expect(mocks.loggerApplyRuntimeConfig).toHaveBeenCalledWith({ debugLogging: true })
  })
})

describe('content runtime config', () => {
  it('从 background 获取后依次应用到 content 与 injected', async () => {
    const config = { debugLogging: true }
    mocks.backgroundGetRuntimeConfig.mockResolvedValue(config)
    mocks.injectedApplyRuntimeConfig.mockResolvedValue({ applied: true })
    const { synchronizeRuntimeConfig } = await import('@/content/runtimeConfig')

    await synchronizeRuntimeConfig()

    expect(mocks.loggerApplyRuntimeConfig).toHaveBeenCalledWith(config)
    expect(mocks.injectedApplyRuntimeConfig).toHaveBeenCalledWith(config)
  })

  it('background 不可用时应用关闭 DEBUG 的默认配置', async () => {
    mocks.backgroundGetRuntimeConfig.mockRejectedValue(new Error('background unavailable'))
    mocks.injectedApplyRuntimeConfig.mockResolvedValue({ applied: true })
    const { synchronizeRuntimeConfig } = await import('@/content/runtimeConfig')

    await synchronizeRuntimeConfig()

    expect(mocks.loggerApplyRuntimeConfig).toHaveBeenCalledWith({ debugLogging: false })
    expect(mocks.injectedApplyRuntimeConfig).toHaveBeenCalledWith({ debugLogging: false })
    expect(mocks.loggerError).toHaveBeenCalledOnce()
  })
})

describe('injected runtime config', () => {
  it('只应用布尔日志配置', async () => {
    const { applyInjectedRuntimeConfig } = await import('@/core/injected/runtimeConfig')

    expect(applyInjectedRuntimeConfig({ debugLogging: true })).toEqual({ applied: true })
    expect(mocks.loggerApplyRuntimeConfig).toHaveBeenCalledWith({ debugLogging: true })
    expect(() => applyInjectedRuntimeConfig({ debugLogging: 'true' })).toThrow(
      '[InjectedRuntimeConfig] debugLogging 必须是 boolean'
    )
  })
})
