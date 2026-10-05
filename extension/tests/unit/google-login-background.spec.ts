/** Google 授权地址与回调的纯协议检查；不伪造后端兑换结果。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirectUrl = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-login'

describe('Google 登录协议', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('__DEV__', true)
    vi.stubGlobal('__API_BASE_URL__', 'http://127.0.0.1:7900')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'http://localhost:7910')
  })

  it('授权地址指向本地后端并保留插件回跳地址', async () => {
    const { buildGoogleAuthorizeUrl } = await import('@/background/services/GoogleLoginService')
    const url = new URL(await buildGoogleAuthorizeUrl(redirectUrl))
    expect(url.origin).toBe('http://127.0.0.1:7900')
    expect(url.pathname).toBe('/api/client/auth/google/oauth/authorize')
    expect(url.searchParams.get('return_to')).toBe(redirectUrl)
  })

  it('回调区分 code、非权威邮箱、取消和失败', async () => {
    const { parseGoogleCallbackResult } = await import('@/background/services/GoogleLoginService')
    expect(parseGoogleCallbackResult(`${redirectUrl}?google_login_code=code-1`)).toEqual({
      status: 'code',
      code: 'code-1'
    })
    expect(
      parseGoogleCallbackResult(`${redirectUrl}?google_email_verification=user%40example.com`)
    ).toEqual({ status: 'email_verification', email: 'user@example.com' })
    expect(parseGoogleCallbackResult(`${redirectUrl}?google_login_error=access_denied`)).toEqual({
      status: 'cancelled',
      reason: 'access_denied'
    })
    expect(
      parseGoogleCallbackResult(`${redirectUrl}?google_login_error=invalid_return_to`)
    ).toEqual({ status: 'failed', reason: 'invalid_return_to' })
    expect(parseGoogleCallbackResult(redirectUrl)).toEqual({
      status: 'failed',
      reason: 'missing_code'
    })
  })
})
