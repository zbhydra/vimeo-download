/**
 * Background RPC 路由合同测试。
 *
 * 验证调用边界、运行时配置与 Vimeo 播放页协议。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JsonObject, JsonValue, RpcContext, RpcServeHandlers } from '../../src/core/rpc/types'
import { chrome as chromeMock } from '../mocks/chrome-api'

const mocks = vi.hoisted(() => ({
  handlers: null as RpcServeHandlers | null,
  getRuntimeConfig: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  serve: vi.fn((channel: string, handlers: RpcServeHandlers) => {
    mocks.handlers = handlers
    return {
      channel,
      stop: vi.fn()
    }
  })
}))

vi.mock('../../src/core/rpc/serve', () => ({
  serve: mocks.serve
}))

vi.mock('../../src/background/runtimeConfig', () => ({
  getRuntimeConfig: mocks.getRuntimeConfig
}))

vi.mock('../../src/core/utils/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}))

/** 取出已注册的 RPC handler。 */
function getHandler(name: string) {
  const handler = mocks.handlers?.[name]
  if (!handler) {
    throw new Error(`missing test handler: ${name}`)
  }
  return handler
}

/** 兜底测试使用的 Vimeo video id。 */
const VIMEO_VIDEO_ID = '1196869805'

/** 播放页兜底请求的固定 URL。 */
const VIMEO_PLAYER_PAGE_URL = `https://player.vimeo.com/video/${VIMEO_VIDEO_ID}`

/** config 自带的原生 signed refresh URL。 */
const VIMEO_REFRESH_CONFIG_URL = `https://player.vimeo.com/video/${VIMEO_VIDEO_ID}/config/request?expires=1999999999&signature=refresh`

/** 最小但结构合法的 Vimeo config。 */
function vimeoConfigFixture(): JsonObject {
  return {
    request: {
      timestamp: 1_999_996_399,
      expires: 3600,
      config_refresh_url: VIMEO_REFRESH_CONFIG_URL,
      files: { progressive: [] }
    },
    video: { id: Number(VIMEO_VIDEO_ID), title: 'Router fixture', thumbs: {} }
  }
}

/** 把 config 内联进播放页 HTML，模拟 Vimeo 初始 HTML。 */
function playerPageHtml(config: JsonObject): string {
  return `<!doctype html><html><head><script>window.playerConfig = ${JSON.stringify(config)};</script></head></html>`
}

/** 构造播放页响应。 */
function playerPageResponse(html: string): Response {
  const response = new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
  Object.defineProperty(response, 'url', { configurable: true, value: VIMEO_PLAYER_PAGE_URL })
  return response
}

/** content 调用者的最小上下文。 */
function createContentContext(): RpcContext {
  return {
    transport: 'chrome',
    caller: 'content',
    tabId: 7,
    origin: 'https://vimeo.com'
  }
}

describe('background rpc router', () => {
  beforeEach(async () => {
    vi.stubGlobal('__DEV__', false)
    vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeodownloader.app')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeodownloader.app')
    vi.resetModules()
    mocks.handlers = null
    mocks.serve.mockClear()
    mocks.getRuntimeConfig.mockReset().mockResolvedValue({ debugLogging: false })
    mocks.loggerInfo.mockReset()
    mocks.loggerWarn.mockReset()
    mocks.loggerError.mockReset()

    const { BackgroundMessageRouter } =
      await import('../../src/background/services/BackgroundMessageRouter')
    new BackgroundMessageRouter().setupListener()
  })

  it('parseStartGoogleLoginRequest 只接受已声明的登录入口', async () => {
    const { parseStartGoogleLoginRequest } =
      await import('../../src/background/services/BackgroundMessageRouter')
    expect(parseStartGoogleLoginRequest({ source: 'popup' })).toEqual({ source: 'popup' })
    expect(parseStartGoogleLoginRequest({ source: 'popup_quota_counter' })).toEqual({
      source: 'popup_quota_counter'
    })

    const invalidParams: Array<JsonObject | undefined> = [
      undefined,
      {},
      { source: null },
      { source: '' },
      { source: 'popup_unknown' }
    ]
    for (const params of invalidParams) {
      expect(() => parseStartGoogleLoginRequest(params)).toThrow()
    }
  })

  it('Google 邮箱二次确认只回传结果，由发起页原地展示验证码步骤', async () => {
    const email = 'user@example.com'
    chromeMock.identity.launchWebAuthFlow.mockResolvedValue(
      `https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google-login?google_email_verification=${encodeURIComponent(email)}`
    )
    const createTab = vi.mocked(chrome.tabs.create)
    createTab.mockReset()
    const handler = getHandler('startGoogleLogin')
    const params = { source: 'popup_upgrade_now' }
    const expected = { status: 'email_verification', email }
    await expect(
      handler(params, {
        transport: 'chrome',
        caller: 'popup',
        tabId: 3,
        origin: 'chrome-extension://x/'
      })
    ).resolves.toEqual(expected)
    expect(createTab).not.toHaveBeenCalled()
  })

  it('返回扩展自有运行时配置', async () => {
    const config = { debugLogging: true }
    mocks.getRuntimeConfig.mockResolvedValue(config)

    await expect(
      getHandler('getRuntimeConfig')(undefined, createContentContext())
    ).resolves.toEqual(config)
    expect(mocks.getRuntimeConfig).toHaveBeenCalledOnce()
  })

  it('getVimeoPlayerConfig 只接受数字 videoId 与 Vimeo 调用方', async () => {
    const handler = getHandler('getVimeoPlayerConfig')

    const invalidParams: Array<JsonValue | undefined> = [
      undefined,
      {},
      { videoId: '1196869805x' },
      { videoId: 1196869805 }
    ]
    for (const params of invalidParams) {
      await expect(handler(params, createContentContext())).rejects.toThrow()
    }

    await expect(
      handler(
        { videoId: VIMEO_VIDEO_ID },
        { ...createContentContext(), origin: 'https://attacker.example' }
      )
    ).rejects.toThrow('拒绝非 Vimeo 页面调用')
  })

  it('getVimeoPlayerConfig 由 background 直连播放页取回内嵌 config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(playerPageResponse(playerPageHtml(vimeoConfigFixture()))))
    )

    await expect(
      getHandler('getVimeoPlayerConfig')({ videoId: VIMEO_VIDEO_ID }, createContentContext())
    ).resolves.toEqual({
      snapshot: {
        videoId: VIMEO_VIDEO_ID,
        configUrl: VIMEO_REFRESH_CONFIG_URL,
        config: vimeoConfigFixture()
      }
    })
  })

  it('refreshSignatureRequest 把合法访问口令带到播放页请求，其它情况请求不带 query', async () => {
    const unlistedHash = '43f047633a'
    const descriptor = {
      version: 2,
      videoId: VIMEO_VIDEO_ID,
      sourceId: `vimeo:${VIMEO_VIDEO_ID}:video:best`,
      optionId: 'best',
      kind: 'video',
      delivery: 'dash',
      label: '1080p',
      configUrl: VIMEO_REFRESH_CONFIG_URL
    }
    const cases: Array<{ descriptor: JsonObject; url: string }> = [
      {
        descriptor: { ...descriptor, unlistedHash },
        url: `${VIMEO_PLAYER_PAGE_URL}?h=${unlistedHash}`
      },
      { descriptor, url: VIMEO_PLAYER_PAGE_URL },
      { descriptor: { ...descriptor, unlistedHash: 'abc&x=1' }, url: VIMEO_PLAYER_PAGE_URL }
    ]

    for (const testCase of cases) {
      const fetchMock = vi.fn(() => Promise.resolve(new Response('forbidden', { status: 403 })))
      vi.stubGlobal('fetch', fetchMock)

      // 播放页 403 让重签在请求之后立刻结束，这里只关心请求发往哪里。
      await expect(
        getHandler('refreshSignatureRequest')(
          { taskId: 'task-1', descriptor: testCase.descriptor },
          createContentContext()
        )
      ).rejects.toThrow('player page 请求失败')
      expect(fetchMock).toHaveBeenCalledWith(testCase.url, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      })
    }
  })
})
