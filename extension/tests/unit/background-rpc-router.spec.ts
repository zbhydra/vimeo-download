/**
 * Background RPC 路由合同测试。
 *
 * 固定远端配置读取走 background API client、配额参数形状与运行时配置直读。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  JsonObject,
  JsonValue,
  RpcContext,
  RpcServeHandlers
} from '../../src/core/rpc/types'

const mocks = vi.hoisted(() => ({
  handlers: null as RpcServeHandlers | null,
  getRemoteConfig: vi.fn(),
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

vi.mock('../../src/core/api/remote-config', () => ({
  remoteConfigApi: {
    getConfig: mocks.getRemoteConfig
  }
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
    vi.stubGlobal('__API_BASE_URL__', 'https://api.vimeo-video-downloader.example')
    vi.stubGlobal('__WEBSITE_BASE_URL__', 'https://vimeo-video-downloader.example')
    vi.resetModules()
    mocks.handlers = null
    mocks.serve.mockClear()
    mocks.getRemoteConfig.mockReset().mockResolvedValue({})
    mocks.getRuntimeConfig.mockReset().mockResolvedValue({ debugLogging: false })
    mocks.loggerInfo.mockReset()
    mocks.loggerWarn.mockReset()
    mocks.loggerError.mockReset()

    const { BackgroundMessageRouter } = await import(
      '../../src/background/services/BackgroundMessageRouter'
    )
    new BackgroundMessageRouter().setupListener()
  })

  it('parseStartGoogleLoginRequest 只接受已声明的登录入口', async () => {
    const { parseStartGoogleLoginRequest } = await import(
      '../../src/background/services/BackgroundMessageRouter'
    )
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

  it('通过独立 background API client 读取远端分组配置', async () => {
    const config = { vimeo: { muxMaxBytes: 1024 } }
    mocks.getRemoteConfig.mockResolvedValue(config)

    await expect(
      getHandler('getRemoteConfig')(undefined, createContentContext())
    ).resolves.toEqual(config)
    expect(mocks.getRemoteConfig).toHaveBeenCalledOnce()
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
      vi.fn(() =>
        Promise.resolve(playerPageResponse(playerPageHtml(vimeoConfigFixture())))
      )
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
})
