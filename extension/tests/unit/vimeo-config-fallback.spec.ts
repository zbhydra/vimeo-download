/**
 * Vimeo config 兜底通道测试。
 *
 * 覆盖 background 直连播放页的取回/校验边界，以及 content 侧「主通道超时后才兜底」的通道编排。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JsonValue } from '@/core/rpc/types'
import {
  loadVimeoCapturedConfigFromPlayerPage,
  loadVimeoResourcesFromCapturedConfig
} from '@/sites/vimeo/config'

const mocks = vi.hoisted(() => ({
  getCapturedVimeoConfig: vi.fn(),
  listCapturedVimeoConfigs: vi.fn(),
  getVimeoPlayerConfig: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('@/content/rpc/injected.rpc', () => ({
  InjectedChannel: class {
    getCapturedVimeoConfig = mocks.getCapturedVimeoConfig
    listCapturedVimeoConfigs = mocks.listCapturedVimeoConfigs
  }
}))

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    getVimeoPlayerConfig = mocks.getVimeoPlayerConfig
  }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn()
  }
}))

/** 测试视频 ID。 */
const VIDEO_ID = '1196869805'

/** 播放页兜底请求的固定 URL。 */
const PLAYER_PAGE_URL = `https://player.vimeo.com/video/${VIDEO_ID}`

/** config 自带的原生 signed refresh URL。 */
const SIGNED_REFRESH_CONFIG_URL = `https://player.vimeo.com/video/${VIDEO_ID}/config/request?expires=1999999999&signature=refresh_signature`

/** 样本 progressive 直链。 */
const PROGRESSIVE_URL = 'https://vod-progressive-ak.vimeocdn.com/video/720p.mp4?token=signed'

/** 主通道默认等待上限。 */
const CAPTURE_TIMEOUT_MS = 12_000

describe('Vimeo background 播放页 config 兜底', () => {
  /** 页面 fetch mock。 */
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('从播放页 HTML 取回内嵌 config 并进入统一解析链', async () => {
    fetchMock.mockResolvedValue(playerPageResponse(playerPageHtml(configFixture())))

    const snapshot = await loadVimeoCapturedConfigFromPlayerPage(VIDEO_ID)

    expect(fetchMock).toHaveBeenCalledWith(PLAYER_PAGE_URL, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    })
    // config 里的标题含 `}`、`"` 与转义反斜杠，必须整体取回而不是被首个括号截断。
    expect(snapshot?.videoId).toBe(VIDEO_ID)
    expect(snapshot?.configUrl).toBe(SIGNED_REFRESH_CONFIG_URL)

    const resources = await loadVimeoResourcesFromCapturedConfig(snapshot!)
    expect(resources.resources.some(resource => resource.url === PROGRESSIVE_URL)).toBe(true)
  })

  it('播放页没有内嵌 config 时返回 null', async () => {
    fetchMock.mockResolvedValue(
      playerPageResponse('<html><body><script>window.playerConfig = null;</script></body></html>')
    )

    await expect(loadVimeoCapturedConfigFromPlayerPage(VIDEO_ID)).resolves.toBeNull()
  })

  it('内嵌 config 身份与目标 videoId 不一致时返回 null', async () => {
    fetchMock.mockResolvedValue(
      playerPageResponse(playerPageHtml(configFixture({ refreshUrl: otherVideoRefreshUrl() })))
    )

    await expect(loadVimeoCapturedConfigFromPlayerPage(VIDEO_ID)).resolves.toBeNull()
  })

  it('播放页请求失败时抛错，不伪装成空结果', async () => {
    fetchMock.mockResolvedValue(
      playerPageResponse('<html>forbidden</html>', { status: 403, url: PLAYER_PAGE_URL })
    )

    await expect(loadVimeoCapturedConfigFromPlayerPage(VIDEO_ID)).rejects.toThrow(
      'player page 请求失败'
    )
  })

  it('最终响应离开播放页时拒绝解析', async () => {
    fetchMock.mockResolvedValue(
      playerPageResponse(playerPageHtml(configFixture()), {
        url: 'https://attacker.example/video'
      })
    )

    await expect(loadVimeoCapturedConfigFromPlayerPage(VIDEO_ID)).rejects.toThrow(
      '不是 Vimeo 播放页'
    )
  })
})

describe('Vimeo content config 通道编排', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { resetVimeoConfigFallback } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )
    resetVimeoConfigFallback()
  })

  it('主通道拿到 config 时不请求 background 兜底', async () => {
    const primary = primarySnapshot()
    mocks.getCapturedVimeoConfig.mockResolvedValue({ snapshot: primary })
    const { requestCapturedVimeoConfig } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await expect(requestCapturedVimeoConfig(VIDEO_ID)).resolves.toBe(primary)
    expect(mocks.getCapturedVimeoConfig).toHaveBeenCalledWith(
      { videoId: VIDEO_ID },
      { timeout: CAPTURE_TIMEOUT_MS }
    )
    expect(mocks.getVimeoPlayerConfig).not.toHaveBeenCalled()
  })

  it('主通道超时后触发 background 兜底，兜底快照进入同一解析链', async () => {
    const fallback = primarySnapshot()
    mocks.getCapturedVimeoConfig.mockResolvedValue({ snapshot: null })
    mocks.getVimeoPlayerConfig.mockResolvedValue({ snapshot: fallback })
    const { requestCapturedVimeoConfig } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    const snapshot = await requestCapturedVimeoConfig(VIDEO_ID)

    expect(mocks.getVimeoPlayerConfig).toHaveBeenCalledWith({ videoId: VIDEO_ID })
    expect(snapshot).toEqual(fallback)
    const resources = await loadVimeoResourcesFromCapturedConfig(snapshot!)
    expect(resources.resources.some(resource => resource.url === PROGRESSIVE_URL)).toBe(true)
  })

  it('主通道 RPC 失败时同样走兜底', async () => {
    const fallback = primarySnapshot()
    mocks.getCapturedVimeoConfig.mockRejectedValue(new Error('[rpc] event call timeout'))
    mocks.getVimeoPlayerConfig.mockResolvedValue({ snapshot: fallback })
    const { requestCapturedVimeoConfig } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await expect(requestCapturedVimeoConfig(VIDEO_ID)).resolves.toEqual(fallback)
    expect(mocks.loggerError).toHaveBeenCalled()
  })

  it('主通道 videoId 不匹配时改走兜底', async () => {
    mocks.getCapturedVimeoConfig.mockResolvedValue({
      snapshot: { ...primarySnapshot(), videoId: '999999' }
    })
    mocks.getVimeoPlayerConfig.mockResolvedValue({ snapshot: null })
    const { requestCapturedVimeoConfig } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await expect(requestCapturedVimeoConfig(VIDEO_ID)).resolves.toBeNull()
    expect(mocks.getVimeoPlayerConfig).toHaveBeenCalledWith({ videoId: VIDEO_ID })
  })

  it('兜底也拿不到 config 时返回 null 并记录超时告警', async () => {
    mocks.getCapturedVimeoConfig.mockResolvedValue({ snapshot: null })
    mocks.getVimeoPlayerConfig.mockResolvedValue({ snapshot: null })
    const { requestCapturedVimeoConfig } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await expect(requestCapturedVimeoConfig(VIDEO_ID)).resolves.toBeNull()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('捕获超时'))
  })

  it('同一 videoId 只兜底一次，页面切换后重新允许兜底', async () => {
    mocks.getCapturedVimeoConfig.mockResolvedValue({ snapshot: null })
    mocks.getVimeoPlayerConfig.mockResolvedValue({ snapshot: null })
    const { requestCapturedVimeoConfig, resetVimeoConfigFallback } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await requestCapturedVimeoConfig(VIDEO_ID)
    await requestCapturedVimeoConfig(VIDEO_ID)
    expect(mocks.getVimeoPlayerConfig).toHaveBeenCalledTimes(1)

    resetVimeoConfigFallback()
    await requestCapturedVimeoConfig(VIDEO_ID)
    expect(mocks.getVimeoPlayerConfig).toHaveBeenCalledTimes(2)
  })
})

describe('Vimeo content 捕获枚举', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('只保留数字形态的 videoId，伪造或畸形条目直接丢弃', async () => {
    mocks.listCapturedVimeoConfigs.mockResolvedValue({
      videos: [
        { videoId: '123' },
        { videoId: 'not-a-number' },
        null,
        {},
        { videoId: 456 },
        { videoId: '456' }
      ]
    })
    const { listCapturedVimeoVideoIds } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await expect(listCapturedVimeoVideoIds()).resolves.toEqual(['123', '456'])
    expect(mocks.listCapturedVimeoConfigs).toHaveBeenCalledWith({ timeout: CAPTURE_TIMEOUT_MS })
  })

  it('枚举结果超过单页上限时截断', async () => {
    mocks.listCapturedVimeoConfigs.mockResolvedValue({
      videos: Array.from({ length: 10 }, (_item, index) => ({ videoId: String(index + 1) }))
    })
    const { listCapturedVimeoVideoIds } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await expect(listCapturedVimeoVideoIds()).resolves.toEqual(
      Array.from({ length: 8 }, (_item, index) => String(index + 1))
    )
  })

  it('枚举 RPC 失败时返回空表并记录错误', async () => {
    mocks.listCapturedVimeoConfigs.mockRejectedValue(new Error('[rpc] event call timeout'))
    const { listCapturedVimeoVideoIds } = await import(
      '@/sites/vimeo/content/configCaptureClient'
    )

    await expect(listCapturedVimeoVideoIds()).resolves.toEqual([])
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})

/** 主通道返回的合法快照。 */
function primarySnapshot() {
  return {
    videoId: VIDEO_ID,
    configUrl: SIGNED_REFRESH_CONFIG_URL,
    config: configFixture()
  }
}

/** 最小但结构合法的 Vimeo config。 */
function configFixture(overrides: { refreshUrl?: string } = {}): JsonValue {
  return {
    request: {
      timestamp: 1_999_996_399,
      expires: 3600,
      config_refresh_url: overrides.refreshUrl ?? SIGNED_REFRESH_CONFIG_URL,
      files: {
        progressive: [
          {
            url: PROGRESSIVE_URL,
            quality: '720p',
            width: 1280,
            height: 720,
            fps: 30,
            mime: 'video/mp4'
          }
        ]
      }
    },
    video: {
      id: Number(VIDEO_ID),
      // 真实标题可能含括号与引号，用于验证内嵌 JSON 的截取边界。
      title: 'Fallback } "quoted" \\ fixture',
      thumbs: {}
    }
  }
}

/** 指向另一个 videoId 的 refresh URL。 */
function otherVideoRefreshUrl(): string {
  return 'https://player.vimeo.com/video/999999/config/request?expires=1999999999&signature=other'
}

/** 把 config 内联进播放页 HTML，模拟 Vimeo 初始 HTML。 */
function playerPageHtml(config: JsonValue): string {
  return [
    '<!doctype html><html><head><script>',
    `window.playerConfig = ${JSON.stringify(config)};`,
    '</script></head><body><div id="player"></div></body></html>'
  ].join('')
}

/** 构造播放页响应。 */
function playerPageResponse(
  html: string,
  options: { status?: number; url?: string } = {}
): Response {
  const response = new Response(html, {
    status: options.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
  Object.defineProperty(response, 'url', {
    configurable: true,
    value: options.url ?? PLAYER_PAGE_URL
  })
  return response
}
