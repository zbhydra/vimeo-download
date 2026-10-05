/** HTTP 拦截器的请求头、信封、重试与认证刷新合同测试。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { API_CONFIG, STORAGE_KEYS } from '../../src/core/api/config'
import {
  acceptLanguageInjector,
  authRefreshInterceptor,
  dataExtractor,
  defaultErrorHandler,
  deviceIdInjector,
  headersInjector,
  requestLogger,
  responseLogger,
  retryInterceptor,
  tokenInjector
} from '../../src/core/api/client/interceptors'
import { ApiError, type HttpResponse, type RequestContext } from '../../src/core/api/client/types'

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  translate: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('../../src/core/storage', () => ({
  storageManager: {
    get: mocks.get,
    set: mocks.set,
    remove: mocks.remove
  }
}))

vi.mock('../../src/core/utils/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}))

vi.mock('../../src/locales', () => ({
  I18nService: {
    getCurrentLanguage: () => 'zh-CN',
    t: mocks.translate
  }
}))

vi.mock('../../src/core/composables/useToast', () => ({
  toastService: {
    error: mocks.toastError
  }
}))

describe('HTTP request and response interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.storage.clear()
    mocks.get.mockImplementation((key: string) => Promise.resolve(mocks.storage.get(key) ?? null))
    mocks.set.mockImplementation((key: string, value: string) => {
      mocks.storage.set(key, value)
      return Promise.resolve()
    })
    mocks.remove.mockImplementation((key: string) => {
      mocks.storage.delete(key)
      return Promise.resolve()
    })
    mocks.translate.mockImplementation((key: string) => key)
  })

  it('injects standard headers, device, token and current language', async () => {
    mocks.storage.set(STORAGE_KEYS.DEVICE_ID, 'device-1')
    mocks.storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access-1')
    const context = createContext({ headers: { Existing: 'yes' } })

    headersInjector(context)
    await deviceIdInjector(context)
    await tokenInjector(context)
    acceptLanguageInjector(context)

    expect(context.options.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Client-Product': 'extension',
      Existing: 'yes',
      'X-Device-Id': 'device-1',
      Authorization: 'Bearer access-1',
      'Accept-Language': 'zh-CN'
    })
  })

  it('leaves optional device and authentication headers absent', async () => {
    const context = createContext({ requireAuth: false })

    await deviceIdInjector(context)
    await tokenInjector(context)

    expect(context.options.headers).toBeUndefined()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith(STORAGE_KEYS.DEVICE_ID)
  })

  it('does not add Authorization when authenticated storage is empty', async () => {
    const context = createContext()

    await tokenInjector(context)

    expect(context.options.headers).toBeUndefined()
    expect(mocks.get).toHaveBeenCalledWith(STORAGE_KEYS.ACCESS_TOKEN)
  })

  it('logs full request metadata normally and URL-only for sensitive requests', () => {
    const regular = createContext({ params: { page: 2 }, body: { name: 'value' } })
    const sensitive = createContext({ skipRequestLog: true, body: { token: 'secret' } })

    requestLogger(regular)
    requestLogger(sensitive)

    expect(mocks.loggerInfo).toHaveBeenNthCalledWith(
      1,
      '[HttpClient] GET https://api.example.test/items',
      {
        params: { page: 2 },
        body: { name: 'value' }
      }
    )
    expect(mocks.loggerInfo).toHaveBeenNthCalledWith(
      2,
      '[HttpClient] GET https://api.example.test/items'
    )
  })

  it('logs response status and returns the same response', () => {
    const context = createContext()
    const response = createResponse({ ok: true }, 201)

    expect(responseLogger(response, context)).toBe(response)
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      '[HttpClient] GET https://api.example.test/items -> 201'
    )
  })

  it('extracts data from a successful backend envelope', () => {
    const response = createResponse({ code: 10000, data: { id: 7 }, msg: 'ok' })

    expect(dataExtractor(response, createContext())).toMatchObject({ data: { id: 7 } })
  })

  it('leaves a response without a backend code untouched', () => {
    const response = createResponse({ direct: true })

    expect(dataExtractor(response, createContext())).toBe(response)
    expect(response.data).toEqual({ direct: true })
  })

  it('shows a translated backend error and throws ApiError', () => {
    mocks.translate.mockReturnValue('translated failure')
    const response = createResponse({ code: 10106, data: {}, msg: 'raw failure' }, 200)

    expect(() => dataExtractor(response, createContext())).toThrow(
      expect.objectContaining({
        name: 'ApiError',
        message: 'raw failure',
        backendCode: 10106
      })
    )
    expect(mocks.toastError).toHaveBeenCalledWith('translated failure')
  })

  it('uses a stable error-code fallback and supports suppressing the toast', () => {
    const response = createResponse({ code: 50123, data: {}, msg: '' }, 200)

    expect(() => dataExtractor(response, createContext({ skipErrorToast: true }))).toThrow(
      'error code:50123'
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})

describe('HTTP retry and authentication interceptors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.storage.clear()
    mocks.get.mockImplementation((key: string) => Promise.resolve(mocks.storage.get(key) ?? null))
    mocks.set.mockImplementation((key: string, value: string) => {
      mocks.storage.set(key, value)
      return Promise.resolve()
    })
    mocks.remove.mockImplementation((key: string) => {
      mocks.storage.delete(key)
      return Promise.resolve()
    })
  })

  it('marks a server failure for retry until the configured count is exhausted', async () => {
    const context = createContext()

    await retryInterceptor(new ApiError('server', 503), context)
    expect(context).toMatchObject({ _retryCount: 1, _shouldRetry: true })

    context._shouldRetry = false
    await retryInterceptor(new ApiError('server', 503), context)
    expect(context).toMatchObject({ _retryCount: 2, _shouldRetry: true })

    context._shouldRetry = false
    await retryInterceptor(new ApiError('server', 503), context)
    expect(context._shouldRetry).toBe(false)
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(API_CONFIG.RETRY_COUNT)
  })

  it.each([
    [new ApiError('client', 400), createContext()],
    [new ApiError('network'), createContext()],
    [new ApiError('server', 503), createContext({ skipRetry: true })]
  ])('does not retry an ineligible error', async (error, context) => {
    await retryInterceptor(error, context)

    expect(context._shouldRetry).toBeUndefined()
    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })

  it.each([
    [new ApiError('forbidden', 403), createContext()],
    [new ApiError('unauthorized', 401), createContext({ requireAuth: false })],
    [new ApiError('unauthorized', 401), { ...createContext(), _authRefreshAttempted: true }]
  ])('does not refresh an ineligible authorization error', async (error, context) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await authRefreshInterceptor(error, context)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(context._shouldRetry).toBeUndefined()
  })

  it('stops after one refresh attempt when no refresh token exists', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const context = createContext()

    await authRefreshInterceptor(new ApiError('unauthorized', 401), context)

    expect(context._authRefreshAttempted).toBe(true)
    expect(context._shouldRetry).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears all authentication keys for an unhandled 401', async () => {
    mocks.storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access')
    mocks.storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh')
    mocks.storage.set(STORAGE_KEYS.USER_INFO, 'user')

    await defaultErrorHandler(new ApiError('unauthorized', 401), createContext())

    expect(mocks.remove.mock.calls.map(call => call[0])).toEqual([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.REFRESH_TOKEN,
      STORAGE_KEYS.USER_INFO
    ])
  })

  it.each([
    [new ApiError('server', 503), createContext()],
    [new ApiError('unauthorized', 401), createContext({ preserveAuthOnUnauthorized: true })],
    [new ApiError('unauthorized', 401), { ...createContext(), _shouldRetry: true }],
    [new ApiError('unauthorized', 401), { ...createContext(), _preserveAuthOnUnauthorized: true }]
  ])(
    'keeps auth storage when the failure is not a final unauthorized result',
    async (error, context) => {
      await defaultErrorHandler(error, context)

      expect(mocks.remove).not.toHaveBeenCalled()
      expect(mocks.loggerError).toHaveBeenCalledOnce()
    }
  )

  it('keeps auth storage when the error explicitly preserves authentication', async () => {
    const error = new ApiError('unauthorized', 401)
    error.preserveAuthState = true

    await defaultErrorHandler(error, createContext())

    expect(mocks.remove).not.toHaveBeenCalled()
  })
})

function createContext(options: RequestContext['options'] = {}): RequestContext {
  return {
    url: 'https://api.example.test/items',
    method: 'GET',
    options,
    timestamp: 1
  }
}

function createResponse(data: object, status = 200): HttpResponse<object> {
  return {
    data,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' })
  }
}
