/**
 * background Google 授权登录合同测试。
 *
 * 固定四件事：authorize URL 与插件回调地址的拼装（含设备归因）、回调参数解析、
 * 「取消 / 失败」的区分与打点，以及**兑换与登录态写入由 background 完成**——
 * popup 在授权窗口获焦时会被销毁，登录态只能靠重开 popup 从 storage 恢复。
 */

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MARK_TYPE } from '../../src/core/api/mark/types'
import type { StorageValue } from '../../src/core/storage'

const DEVICE_ID = '9f1c2f60-6f2e-4c1a-9d3e-0d0a3f9a1b2c'
const FIRST_OPENED_AT = 1_700_000_000_000
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop'
const REDIRECT_URL = `https://${EXTENSION_ID}.chromiumapp.org/google-login`
/** Chrome 关闭授权窗口时的固定错误文案。 */
const USER_CANCELLED_MESSAGE = 'The user did not approve access.'
/** 后端在非权威邮箱分支回跳的参数。 */
const EMAIL_VERIFICATION_PARAM = 'google_email_verification'
/** 后端在失败分支回跳的参数。 */
const LOGIN_ERROR_PARAM = 'google_login_error'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  storage: new Map<string, StorageValue>(),
  storageGet: vi.fn(),
  storageSetMany: vi.fn(),
  storageSet: vi.fn(),
  recordMark: vi.fn(),
  refreshQuota: vi.fn()
}))

// 只替换 HTTP 客户端：authApi 与 storage 都走真实实现，才能覆盖「兑换 → 写入三键 →
// 重开 popup 从 storage 恢复」这条链路（部分 mock barrel 会让 popup 与 background 拿到
// 两份不同的 authApi，恢复断言就失去意义）。
vi.mock('../../src/core/api/client/HttpClient', () => ({
  HttpClient: class {
    post = mocks.post
    get = mocks.get
    useRequest = vi.fn()
    useResponse = vi.fn()
    useError = vi.fn()
  }
}))

vi.mock('../../src/core/storage', () => ({
  storageManager: {
    get: mocks.storageGet,
    set: mocks.storageSet,
    setMany: mocks.storageSetMany,
    remove: vi.fn()
  }
}))

vi.mock('../../src/background/services/ExtensionMarkReporter', () => ({
  recordBackgroundMark: mocks.recordMark
}))

vi.mock('../../src/core/stores/quotaStore', () => ({
  useQuotaStore: () => ({ refreshQuota: mocks.refreshQuota, clearQuota: vi.fn() })
}))

/** 后端登录响应的最小完整形态。 */
function loginResponse() {
  return {
    access_token: 'google-access-token',
    refresh_token: 'google-refresh-token',
    token_type: 'bearer',
    expires_in: 86400,
    user: {
      user_id: 7,
      email: 'google@example.com',
      full_name: 'Google User',
      avatar_url: null,
      created_at: 200
    }
  }
}

/** 让授权窗口返回指定回调地址。 */
function mockCallbackUrl(callbackUrl: string): void {
  vi.mocked(chrome.identity.launchWebAuthFlow).mockImplementation(async () => callbackUrl)
}

/** 让授权窗口以指定错误收尾。 */
function mockLaunchFailure(message: string): void {
  vi.mocked(chrome.identity.launchWebAuthFlow).mockImplementation(async () => {
    throw new Error(message)
  })
}

describe('background google login service', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('__DEV__', false)
    vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeo-video-downloader.example')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeo-video-downloader.example')
    vi.resetModules()
    mocks.storage.clear()
    mocks.post.mockReset()
    mocks.get.mockReset()
    mocks.storageGet.mockReset()
    mocks.storageSetMany.mockReset()
    mocks.storageSet.mockReset()
    mocks.recordMark.mockReset()
    mocks.refreshQuota.mockReset()
    mocks.storageGet.mockImplementation((key: string) =>
      Promise.resolve(mocks.storage.get(key) ?? null)
    )
    mocks.storageSet.mockImplementation((key: string, value: StorageValue) => {
      mocks.storage.set(key, value)
      return Promise.resolve()
    })
    mocks.storageSetMany.mockImplementation((items: Record<string, StorageValue>) => {
      for (const [key, value] of Object.entries(items)) {
        mocks.storage.set(key, value)
      }
      return Promise.resolve()
    })
    mocks.post.mockResolvedValue(loginResponse())
    mocks.recordMark.mockResolvedValue({ recorded: true })
    mocks.refreshQuota.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(chrome.identity.getRedirectURL).mockClear()
    vi.mocked(chrome.identity.launchWebAuthFlow).mockReset()
  })

  it('authorize URL 指向后端并携带插件回调与设备归因', async () => {
    mocks.storage.set('counter_device_id', DEVICE_ID)
    mocks.storage.set('first_opened_at', FIRST_OPENED_AT)

    const { buildGoogleAuthorizeUrl } = await import(
      '../../src/background/services/GoogleLoginService'
    )
    const authorizeUrl = new URL(await buildGoogleAuthorizeUrl(REDIRECT_URL))

    expect(authorizeUrl.origin).toBe('https://api.vimeo-video-downloader.example')
    expect(authorizeUrl.pathname).toBe('/api/client/auth/google/oauth/authorize')
    const returnTo = new URL(authorizeUrl.searchParams.get('return_to') ?? '')
    expect(returnTo.origin).toBe(`https://${EXTENSION_ID}.chromiumapp.org`)
    expect(returnTo.pathname).toBe('/google-login')
    expect(returnTo.searchParams.get('register_device_id')).toBe(DEVICE_ID)
    expect(returnTo.searchParams.get('first_opened_at')).toBe(String(FIRST_OPENED_AT))
  })

  it('设备身份不合后端形态时回跳地址不携带归因', async () => {
    // 旧安装可能存着非 UUID 的 device_id：本地继续沿用，但不能提交给后端。
    mocks.storage.set('counter_device_id', 'existing-device')
    mocks.storage.set('first_opened_at', FIRST_OPENED_AT)

    const { buildGoogleAuthorizeUrl } = await import(
      '../../src/background/services/GoogleLoginService'
    )
    const returnTo = new URL(
      new URL(await buildGoogleAuthorizeUrl(REDIRECT_URL)).searchParams.get('return_to') ?? ''
    )

    expect(returnTo.searchParams.has('register_device_id')).toBe(false)
    expect(returnTo.searchParams.has('first_opened_at')).toBe(false)
  })

  it('授权完成后由 background 兑换并写入认证三键', async () => {
    const { STORAGE_KEYS } = await import('../../src/core/api/config')
    mockCallbackUrl(`${REDIRECT_URL}?google_login_code=one-time-code`)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )
    const result = await googleLoginService.start({ source: 'popup' })

    const launchDetails = vi.mocked(chrome.identity.launchWebAuthFlow).mock.calls[0][0]
    expect(chrome.identity.getRedirectURL).toHaveBeenCalledWith('google-login')
    expect(launchDetails.interactive).toBe(true)
    expect(launchDetails.url).toContain('/api/client/auth/google/oauth/authorize?')
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/client/auth/google/exchange',
      { code: 'one-time-code' },
      expect.objectContaining({ requireAuth: false, skipRetry: true, skipRequestLog: true })
    )
    expect(mocks.storage.get(STORAGE_KEYS.ACCESS_TOKEN)).toBe('google-access-token')
    expect(mocks.storage.get(STORAGE_KEYS.REFRESH_TOKEN)).toBe('google-refresh-token')
    expect(mocks.storage.get(STORAGE_KEYS.USER_INFO)).toEqual(
      expect.objectContaining({ user_id: 7, email: 'google@example.com' })
    )
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_SUCCESS,
      JSON.stringify({ source: 'popup' })
    )
    expect(result).toEqual({ status: 'completed' })
  })

  it('background 写入登录态后，popup 重开可由 authStore 从 storage 恢复', async () => {
    const { STORAGE_KEYS } = await import('../../src/core/api/config')
    mockCallbackUrl(`${REDIRECT_URL}?google_login_code=one-time-code`)
    mocks.get.mockResolvedValue(loginResponse().user)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )
    await googleLoginService.start({ source: 'popup' })
    // 模拟 popup 在授权窗口期间被销毁后再重新打开：内存态为空，只能读 storage。
    const { useAuthStore } = await import('../../src/core/stores/authStore')
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)

    await store.initialize()

    expect(mocks.storage.get(STORAGE_KEYS.ACCESS_TOKEN)).toBe('google-access-token')
    expect(store.token).toBe('google-access-token')
    expect(store.isAuthenticated).toBe(true)
  })

  it('用户关闭授权窗口时记取消打点并返回 cancelled', async () => {
    mockLaunchFailure(USER_CANCELLED_MESSAGE)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )
    const result = await googleLoginService.start({ source: 'popup_quota_counter' })

    expect(result).toEqual({ status: 'cancelled', reason: 'user_closed_window' })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_CANCELLED,
      JSON.stringify({ source: 'popup_quota_counter', stage: 'google', reason: 'user_closed_window' })
    )
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('Google 授权页拒绝授权同样归入取消', async () => {
    mocks.recordMark.mockClear()
    mockCallbackUrl(`${REDIRECT_URL}?${LOGIN_ERROR_PARAM}=access_denied`)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )
    const result = await googleLoginService.start({ source: 'popup' })

    expect(result).toEqual({ status: 'cancelled', reason: 'access_denied' })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_CANCELLED,
      JSON.stringify({ source: 'popup', stage: 'google', reason: 'access_denied' })
    )
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('其他授权窗口错误记失败打点并返回 failed', async () => {
    mockLaunchFailure('Authorization page could not be loaded.')

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )

    await expect(googleLoginService.start({ source: 'popup' })).resolves.toEqual({
      status: 'failed',
      reason: 'Authorization page could not be loaded.'
    })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_FAILED,
      JSON.stringify({
        source: 'popup',
        stage: 'google',
        reason: 'Authorization page could not be loaded.'
      })
    )
  })

  it('未返回回调地址时返回 failed 并记失败打点', async () => {
    vi.mocked(chrome.identity.launchWebAuthFlow).mockImplementation(async () => undefined)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )

    await expect(googleLoginService.start({ source: 'popup' })).resolves.toEqual({
      status: 'failed',
      reason: 'missing_callback_url'
    })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_FAILED,
      JSON.stringify({ source: 'popup', stage: 'google', reason: 'missing_callback_url' })
    )
  })

  it('后端回跳带错误原因时返回 failed 并记失败打点', async () => {
    mockCallbackUrl(`${REDIRECT_URL}?${LOGIN_ERROR_PARAM}=invalid_credentials`)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )

    await expect(googleLoginService.start({ source: 'popup' })).resolves.toEqual({
      status: 'failed',
      reason: 'invalid_credentials'
    })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_FAILED,
      JSON.stringify({ source: 'popup', stage: 'google', reason: 'invalid_credentials' })
    )
  })

  it('邮箱非权威时记失败打点且不兑换', async () => {
    mockCallbackUrl(`${REDIRECT_URL}?${EMAIL_VERIFICATION_PARAM}=user%40example.com`)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )
    const result = await googleLoginService.start({ source: 'popup' })

    expect(result).toEqual({ status: 'email_verification', email: 'user@example.com' })
    expect(mocks.post).not.toHaveBeenCalled()
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_FAILED,
      JSON.stringify({
        source: 'popup',
        stage: 'google',
        reason: 'email_verification_required'
      })
    )
  })

  it('兑换失败时记失败打点并返回 failed', async () => {
    mocks.post.mockRejectedValue(new Error('AUTH_INVALID_CREDENTIALS'))
    mockCallbackUrl(`${REDIRECT_URL}?google_login_code=expired-code`)

    const { googleLoginService } = await import(
      '../../src/background/services/GoogleLoginService'
    )

    await expect(googleLoginService.start({ source: 'popup' })).resolves.toEqual({
      status: 'failed',
      reason: 'AUTH_INVALID_CREDENTIALS'
    })
    expect(mocks.recordMark).toHaveBeenCalledWith(
      MARK_TYPE.LOGIN_FAILED,
      JSON.stringify({ source: 'popup', stage: 'google', reason: 'AUTH_INVALID_CREDENTIALS' })
    )
  })

  it('回调解析优先取 code，其次待验证邮箱，access_denied 归取消，最后取后端错误原因', async () => {
    const { parseGoogleCallbackResult } = await import(
      '../../src/background/services/GoogleLoginService'
    )

    expect(parseGoogleCallbackResult(`${REDIRECT_URL}?google_login_code=code-1`)).toEqual({
      status: 'code',
      code: 'code-1'
    })
    expect(
      parseGoogleCallbackResult(`${REDIRECT_URL}?${EMAIL_VERIFICATION_PARAM}=user%40example.com`)
    ).toEqual({ status: 'email_verification', email: 'user@example.com' })
    expect(
      parseGoogleCallbackResult(`${REDIRECT_URL}?${LOGIN_ERROR_PARAM}=access_denied`)
    ).toEqual({ status: 'cancelled', reason: 'access_denied' })
    expect(
      parseGoogleCallbackResult(`${REDIRECT_URL}?${LOGIN_ERROR_PARAM}=invalid_return_to`)
    ).toEqual({ status: 'failed', reason: 'invalid_return_to' })
    expect(parseGoogleCallbackResult(REDIRECT_URL)).toEqual({
      status: 'failed',
      reason: 'missing_code'
    })
    expect(parseGoogleCallbackResult(`${REDIRECT_URL}?google_login_code=%20`)).toEqual({
      status: 'failed',
      reason: 'missing_code'
    })
    expect(parseGoogleCallbackResult('not-a-url')).toEqual({
      status: 'failed',
      reason: 'invalid_callback_url'
    })
  })
})
