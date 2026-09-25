/**
 * 插件本地登录 API 合同测试。
 *
 * 覆盖两条路径的请求体、令牌写入与失败分支：邮箱验证码登录、Google 一次性 code 兑换。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/core/api/client/types'
import type { LoginResponse } from '../../src/core/api/auth/api'
import type { StorageValue } from '../../src/core/storage'

const DEVICE_ID = '9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c'
const FIRST_OPENED_AT = 1_700_000_000_000

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  storage: new Map<string, StorageValue>(),
  get: vi.fn(),
  setMany: vi.fn()
}))

vi.mock('../../src/core/api/index', () => ({
  httpClient: {
    post: mocks.post
  }
}))

vi.mock('../../src/core/storage', () => ({
  storageManager: {
    get: mocks.get,
    setMany: mocks.setMany,
    set: vi.fn(),
    remove: vi.fn()
  }
}))

/** 构造后端登录响应的最小完整形态。 */
function loginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 86400,
    user: {
      user_id: 2,
      email: 'user@example.com',
      full_name: 'User',
      avatar_url: null,
      created_at: 200
    },
    ...overrides
  }
}

describe('extension local login auth api', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false)
    vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeo-video-downloader.example')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeo-video-downloader.example')
    vi.resetModules()
    mocks.post.mockReset()
    mocks.setMany.mockReset()
    mocks.storage.clear()
    mocks.get.mockImplementation((key: string) => Promise.resolve(mocks.storage.get(key) ?? null))
    mocks.setMany.mockImplementation((items: Record<string, StorageValue>) => {
      for (const [key, value] of Object.entries(items)) {
        mocks.storage.set(key, value)
      }
      return Promise.resolve()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('邮箱验证码登录成功后写入认证三键，并携带注册归因', async () => {
    const { STORAGE_KEYS } = await import('../../src/core/api/config')
    mocks.storage.set(STORAGE_KEYS.DEVICE_ID, DEVICE_ID)
    mocks.storage.set(STORAGE_KEYS.FIRST_OPENED_AT, FIRST_OPENED_AT)
    mocks.post.mockResolvedValue(loginResponse())

    const { authApi } = await import('../../src/core/api/auth/api')
    const result = await authApi.loginWithEmailCode('user@example.com', '123456')

    expect(result.access_token).toBe('access-token')
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/client/auth/email-verify-login',
      {
        email: 'user@example.com',
        code: '123456',
        registration_entry: 'extension_v3',
        register_device_id: DEVICE_ID,
        first_opened_at: FIRST_OPENED_AT
      },
      expect.objectContaining({
        requireAuth: false,
        skipRetry: true,
        skipErrorToast: true,
        skipRequestLog: true
      })
    )
    expect(mocks.setMany).toHaveBeenCalledWith({
      [STORAGE_KEYS.ACCESS_TOKEN]: 'access-token',
      [STORAGE_KEYS.REFRESH_TOKEN]: 'refresh-token',
      [STORAGE_KEYS.USER_INFO]: {
        user_id: 2,
        email: 'user@example.com',
        full_name: 'User',
        avatar_url: null,
        created_at: 200
      }
    })
  })

  it('设备身份缺失时留空注册归因，不阻塞登录', async () => {
    mocks.post.mockResolvedValue(loginResponse())

    const { authApi } = await import('../../src/core/api/auth/api')
    await authApi.loginWithEmailCode('user@example.com', '123456')

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/client/auth/email-verify-login',
      {
        email: 'user@example.com',
        code: '123456',
        registration_entry: 'extension_v3',
        register_device_id: null,
        first_opened_at: null
      },
      expect.anything()
    )
  })

  it('验证码错误时保留原登录态且不写任何键', async () => {
    const { STORAGE_KEYS } = await import('../../src/core/api/config')
    mocks.storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'old-access')
    mocks.storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'old-refresh')
    mocks.post.mockRejectedValue(new ApiError('EMAIL_VERIFY_CODE_INVALID', 200, 10106))

    const { authApi } = await import('../../src/core/api/auth/api')

    await expect(authApi.loginWithEmailCode('user@example.com', '000000')).rejects.toThrow(
      'EMAIL_VERIFY_CODE_INVALID'
    )
    expect(mocks.setMany).not.toHaveBeenCalled()
    expect(mocks.storage.get(STORAGE_KEYS.ACCESS_TOKEN)).toBe('old-access')
    expect(mocks.storage.get(STORAGE_KEYS.REFRESH_TOKEN)).toBe('old-refresh')
  })

  it('登录响应不完整时抛错且不写半截登录态', async () => {
    mocks.post.mockResolvedValue(loginResponse({ refresh_token: '' }))

    const { authApi } = await import('../../src/core/api/auth/api')

    await expect(authApi.loginWithEmailCode('user@example.com', '123456')).rejects.toThrow(
      'Login response is incomplete'
    )
    expect(mocks.setMany).not.toHaveBeenCalled()
  })

  it('发送邮箱验证码只携带邮箱，不写入任何登录态', async () => {
    mocks.post.mockResolvedValue(undefined)

    const { authApi } = await import('../../src/core/api/auth/api')
    await authApi.sendEmailCode('user@example.com')

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/client/auth/send-email-code',
      { email: 'user@example.com' },
      expect.objectContaining({ requireAuth: false, skipRetry: true, skipErrorToast: true })
    )
    expect(mocks.setMany).not.toHaveBeenCalled()
  })

  it('Google 一次性 code 兑换成功后写入认证三键', async () => {
    const { STORAGE_KEYS } = await import('../../src/core/api/config')
    mocks.post.mockResolvedValue(loginResponse({ access_token: 'google-access' }))

    const { authApi } = await import('../../src/core/api/auth/api')
    const result = await authApi.exchangeGoogleLoginCode('one-time-code')

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/client/auth/google/exchange',
      { code: 'one-time-code' },
      expect.objectContaining({
        requireAuth: false,
        skipRetry: true,
        skipErrorToast: true,
        skipRequestLog: true
      })
    )
    expect(result.access_token).toBe('google-access')
    expect(mocks.storage.get(STORAGE_KEYS.ACCESS_TOKEN)).toBe('google-access')
  })

  it('Google code 已过期时不写入任何登录态', async () => {
    const { STORAGE_KEYS } = await import('../../src/core/api/config')
    mocks.storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'old-access')
    mocks.post.mockRejectedValue(new ApiError('AUTH_INVALID_CREDENTIALS', 200, 10101))

    const { authApi } = await import('../../src/core/api/auth/api')

    await expect(authApi.exchangeGoogleLoginCode('expired-code')).rejects.toThrow(
      'AUTH_INVALID_CREDENTIALS'
    )
    expect(mocks.setMany).not.toHaveBeenCalled()
    expect(mocks.storage.get(STORAGE_KEYS.ACCESS_TOKEN)).toBe('old-access')
  })
})
