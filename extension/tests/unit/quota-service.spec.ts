/** QuotaService 的明确不足与异常 fail-open 契约测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkQuota: vi.fn(),
  showWithFallback: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn()
}))

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: vi.fn(() => ({ checkQuota: mocks.checkQuota }))
}))

vi.mock('@/core/content/services/UpgradeModalManager', () => ({
  upgradeModalManager: { showWithFallback: mocks.showWithFallback }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: mocks.loggerInfo
  }
}))

import { quotaService } from '@/core/content/services/QuotaService'

describe('QuotaService', () => {
  const resetAt = 2_000_000_000_000

  beforeEach(() => {
    mocks.checkQuota.mockReset()
    mocks.showWithFallback.mockReset()
    mocks.loggerWarn.mockReset()
    mocks.loggerError.mockReset()
    mocks.loggerInfo.mockReset()
  })

  it('Background quota RPC 失败时记录错误并 fail-open', async () => {
    const rpcError = new Error('controlled quota transport failure')
    mocks.checkQuota.mockRejectedValue(rpcError)

    await expect(quotaService.checkAndConsume(1)).resolves.toBe(true)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[QuotaService] 配额 API 请求失败，允许下载:',
      rpcError
    )
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
    expect(mocks.showWithFallback).not.toHaveBeenCalled()
  })

  it('后端明确返回额度不足时保留 warn 并拒绝下载', async () => {
    mocks.checkQuota.mockResolvedValue({ status: 0, reset_at: resetAt })

    await expect(quotaService.checkAndConsume(1)).resolves.toBe(false)
    expect(mocks.loggerWarn).toHaveBeenCalledWith('[QuotaService] 配额不足，显示升级弹窗')
    expect(mocks.loggerError).not.toHaveBeenCalled()
    expect(mocks.showWithFallback).toHaveBeenCalledOnce()
    expect(mocks.showWithFallback).toHaveBeenCalledWith(resetAt)
  })

  it('旧后端未返回刷新时间时仍只按 status 拒绝下载', async () => {
    mocks.checkQuota.mockResolvedValue({ status: 0 })

    await expect(quotaService.checkAndConsume(1)).resolves.toBe(false)
    expect(mocks.showWithFallback).toHaveBeenCalledWith(undefined)
    expect(mocks.loggerError).not.toHaveBeenCalled()
  })

  it('升级弹窗异常时仍只按 status 拒绝下载', async () => {
    const modalError = new Error('controlled modal failure')
    mocks.checkQuota.mockResolvedValue({ status: 0, reset_at: resetAt })
    mocks.showWithFallback.mockImplementationOnce(() => {
      throw modalError
    })

    await expect(quotaService.checkAndConsume(1)).resolves.toBe(false)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      '[QuotaService] 配额不足，但显示升级弹窗失败:',
      modalError
    )
  })

  it('status 允许时不读取刷新时间也不显示弹窗', async () => {
    mocks.checkQuota.mockResolvedValue({ status: 1 })

    await expect(quotaService.checkAndConsume(1)).resolves.toBe(true)
    expect(mocks.showWithFallback).not.toHaveBeenCalled()
  })

  it('每次只按数量检查额度', async () => {
    mocks.checkQuota.mockResolvedValue({ status: 0 })

    await expect(quotaService.checkAndConsume(2)).resolves.toBe(false)
    expect(mocks.checkQuota).toHaveBeenLastCalledWith({ count: 2 })
  })
})
