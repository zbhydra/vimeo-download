/** 主扩展订阅状态 API 合同测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('../../src/core/api/index', () => ({
  httpClient: { get: mocks.get }
}))

import { subscriptionApi } from '../../src/core/api/subscription/api'

function subscriptionStatus(period: 'quarter' | 'year') {
  return {
    status: 'active',
    period,
    display_name: 'Unlimited',
    expires_at: 1_905_076_800_000,
    daily_limit: -1,
    used: 0,
    remaining: -1,
    extension_download: { use: 0, remaining: -1, limit: -1 },
    auto_renew: true,
    reset_date: '2026-09-03'
  }
}

describe('subscriptionApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accepts quarter/year and rejects unsupported periods', async () => {
    for (const period of ['quarter', 'year'] as const) {
      mocks.get.mockResolvedValueOnce(subscriptionStatus(period))
      await expect(subscriptionApi.getStatus()).resolves.toMatchObject({ period, auto_renew: true })
    }

    mocks.get.mockResolvedValueOnce({ ...subscriptionStatus('year'), period: 'week' })
    await expect(subscriptionApi.getStatus()).rejects.toThrow('返回合同不完整')
  })
})
