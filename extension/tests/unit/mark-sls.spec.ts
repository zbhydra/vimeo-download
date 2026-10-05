import { afterEach, describe, expect, it, vi } from 'vitest'

import { MARK_TYPE } from '../../src/core/api/mark/types'
import type { StorageValue } from '../../src/core/storage'

const enabledSlsConfig = {
  enabled: true,
  endpoint: 'https://vimeo-download.ap-southeast-1.log.aliyuncs.com',
  logstore: 'vimeo-download-mark-log',
  topic: 'mark-log',
  source: 'extension'
}

/**
 * 返回可按单键查询重新赋值的 chrome.storage.local 视图。
 *
 * 真实 API 是泛型重载，测试只依赖“按 key 返回一条记录”这一条分支，因此在这里显式收窄，
 * 避免为每个用例重复写与重载签名互不兼容的断言。
 */
function singleKeyStorageView(): {
  get: (key: string) => Promise<Record<string, StorageValue>>
} {
  return chrome.storage.local as {
    get: (key: string) => Promise<Record<string, StorageValue>>
  }
}

function stubDeviceId(deviceId: string): void {
  const values: Record<string, string | number> = {
    counter_device_id: deviceId,
    first_opened_at: 1789000000000
  }
  singleKeyStorageView().get = vi.fn((key: string) => Promise.resolve({ [key]: values[key] }))
}

function stubRuntimeGlobals(slsConfig: typeof enabledSlsConfig): void {
  vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeo-video-downloader.example')
  vi.stubGlobal('__DEV__', false)
  vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeo-video-downloader.example')
  vi.stubGlobal('__ALI_SLS_MARK_CONFIG__', slsConfig)
}

function stubSuccessfulFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    statusText: 'No Content'
  } satisfies Pick<Response, 'ok' | 'status' | 'statusText'>)

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('extension SLS mark', () => {
  it('sends mark-log to Ali SLS WebTracking with sanitized fields', async () => {
    stubRuntimeGlobals(enabledSlsConfig)
    vi.stubGlobal('chrome', {
      ...chrome,
      runtime: { ...chrome.runtime, getManifest: () => ({ version: '9.8.7' }) }
    })
    stubDeviceId('device-123')
    const fetchMock = stubSuccessfulFetch()

    const { markApi } = await import('../../src/core/api/mark')
    const { STORAGE_KEYS } = await import('../../src/core/api/config')

    const result = await markApi.record(
      MARK_TYPE.DOWNLOAD_CLICK,
      'url=https://example.com/download/video.mp4?token=secret access_token=abc123',
      { pageUrl: 'https://web.telegram.org/k/#@chat' }
    )

    expect(result).toEqual({ recorded: true })
    expect(chrome.storage.local.get).toHaveBeenCalledWith(STORAGE_KEYS.DEVICE_ID)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const url = new URL(requestUrl)

    expect(url.origin).toBe('https://vimeo-download.ap-southeast-1.log.aliyuncs.com')
    expect(url.pathname).toBe('/logstores/vimeo-download-mark-log/track')
    expect(url.searchParams.get('APIVersion')).toBe('0.6.0')
    expect(url.searchParams.get('__topic__')).toBe('mark-log')
    expect(url.searchParams.get('__source__')).toBe('extension')
    expect(url.searchParams.get('site')).toBe('extension')
    expect(url.searchParams.get('client_product')).toBe('extension')
    expect(url.searchParams.get('extension_version')).toBe('9.8.7')
    expect(url.searchParams.get('mark_type')).toBe(MARK_TYPE.DOWNLOAD_CLICK)
    expect(url.searchParams.get('device_id')).toBe('device-123')
    expect(url.searchParams.get('user_id')).toBe('0')
    expect(url.searchParams.get('page_path')).toBe('/k/')
    expect(url.searchParams.get('first_opened_at')).toBe('1789000000000')
    expect(url.searchParams.get('mark_msg')).toContain('https://example.com/download/video.mp4')
    expect(url.searchParams.get('mark_msg')).not.toContain('secret')
    expect(url.searchParams.get('mark_msg')).not.toContain('abc123')
    expect(requestInit).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      keepalive: true
    })
  })

  it('登录、换账号与退出后按当前本地登录态上报 user_id，不携带凭据', async () => {
    stubRuntimeGlobals(enabledSlsConfig)
    vi.stubGlobal('chrome', {
      ...chrome,
      runtime: { ...chrome.runtime, getManifest: () => ({ version: '1.0.1' }) }
    })
    const { STORAGE_KEYS } = await import('../../src/core/api/config')
    const { buildSlsMarkFields, buildSlsMarkUrl } = await import('../../src/core/api/mark/sls')
    const values: Record<string, import('../../src/core/storage').StorageValue> = {
      [STORAGE_KEYS.DEVICE_ID]: 'device-123',
      [STORAGE_KEYS.FIRST_OPENED_AT]: 1789000000000,
      [STORAGE_KEYS.ACCESS_TOKEN]: 'secret-login-token',
      [STORAGE_KEYS.USER_INFO]: { user_id: 123 }
    }
    singleKeyStorageView().get = vi.fn((key: string) =>
      Promise.resolve({ [key]: values[key] })
    )

    let fields = await buildSlsMarkFields(MARK_TYPE.LOGIN_SUCCESS, '')
    expect(fields.user_id).toBe(123)
    expect(buildSlsMarkUrl(enabledSlsConfig, fields)).not.toContain('secret-login-token')
    values[STORAGE_KEYS.USER_INFO] = { user_id: 456 }
    fields = await buildSlsMarkFields(MARK_TYPE.DOWNLOAD_CLICK, '')
    expect(fields.user_id).toBe(456)
    delete values[STORAGE_KEYS.ACCESS_TOKEN]
    fields = await buildSlsMarkFields(MARK_TYPE.LOGIN_CLICK, '')
    expect(fields.user_id).toBe(0)
  })

  it('does not fetch when SLS is disabled', async () => {
    stubRuntimeGlobals({
      ...enabledSlsConfig,
      enabled: false
    })
    stubDeviceId('device-123')
    const fetchMock = stubSuccessfulFetch()

    const { markApi } = await import('../../src/core/api/mark')

    await expect(markApi.record(MARK_TYPE.POPUP_OPEN)).resolves.toEqual({ recorded: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
