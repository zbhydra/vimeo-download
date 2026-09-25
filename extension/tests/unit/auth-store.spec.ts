/**
 * Auth Store 的官网统一登录回归测试。
 *
 * 证明 website auth bridge 写入的插件 token 可以恢复和登出，同时锁定 Popup 内旧邮箱验证码
 * action 已从 Store 公共面删除。
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/core/api/client/types'
import type { UserInfo } from '../../src/core/types'

const mocks = vi.hoisted(() => ({
  getStoredUserInfo: vi.fn(),
  getAccessToken: vi.fn(),
  clearLocalAuth: vi.fn(),
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
  refreshQuota: vi.fn(),
  clearQuota: vi.fn()
}))

vi.mock('../../src/core/api', () => ({
  authApi: {
    getStoredUserInfo: mocks.getStoredUserInfo,
    getAccessToken: mocks.getAccessToken,
    clearLocalAuth: mocks.clearLocalAuth,
    getCurrentUser: mocks.getCurrentUser,
    logout: mocks.logout
  }
}))

vi.mock('../../src/core/stores/quotaStore', () => ({
  useQuotaStore: () => ({
    refreshQuota: mocks.refreshQuota,
    clearQuota: mocks.clearQuota
  })
}))

vi.mock('../../src/core/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const storedUser: UserInfo = {
  user_id: 7,
  email: 'stored@example.com',
  full_name: 'Stored User',
  avatar_url: null,
  created_at: 100
}

const currentUser: UserInfo = {
  ...storedUser,
  full_name: 'Current User'
}

describe('Auth Store 官网统一登录', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.getStoredUserInfo.mockResolvedValue(storedUser)
    mocks.getAccessToken.mockResolvedValue('website-bridge-extension-token')
    mocks.getCurrentUser.mockResolvedValue(currentUser)
    mocks.clearLocalAuth.mockResolvedValue(undefined)
    mocks.logout.mockResolvedValue(undefined)
    mocks.refreshQuota.mockResolvedValue(undefined)
  })

  it('恢复 website auth bridge 保存的插件登录态并刷新当前用户', async () => {
    const { useAuthStore } = await import('../../src/core/stores/authStore')
    const store = useAuthStore()

    await store.initialize()

    expect(store.token).toBe('website-bridge-extension-token')
    expect(store.user).toEqual(currentUser)
    expect(store.isAuthenticated).toBe(true)
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce()
    expect(mocks.refreshQuota).toHaveBeenCalledOnce()
  })

  it('退出时清除插件本地状态和配额状态', async () => {
    const { useAuthStore } = await import('../../src/core/stores/authStore')
    const store = useAuthStore()
    await store.initialize()

    await store.logout()

    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.clearQuota).toHaveBeenCalledOnce()
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('初始化认证永久失败时清除持久化和内存登录态', async () => {
    mocks.getCurrentUser.mockRejectedValue(
      new ApiError('Refresh returned HTTP 200 without a complete token pair', 401, 10104)
    )
    const { useAuthStore } = await import('../../src/core/stores/authStore')
    const store = useAuthStore()

    await store.initialize()

    expect(mocks.clearLocalAuth).toHaveBeenCalledOnce()
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(mocks.refreshQuota).toHaveBeenCalledOnce()
  })

  it('不再暴露 Popup 邮箱验证码 actions', async () => {
    const { useAuthStore } = await import('../../src/core/stores/authStore')
    const store = useAuthStore()

    expect(store).not.toHaveProperty('sendCode')
    expect(store).not.toHaveProperty('login')
    expect(store).not.toHaveProperty('clearError')
  })
})
