/** Vimeo MAIN world 原生 config 捕获边界测试。 */

import type { JsonValue } from '@/core/rpc/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 测试视频 ID。 */
const VIDEO_ID = '1196869805'

/** Vimeo 原生播放器生成的完整签名 config URL。 */
const SIGNED_CONFIG_URL =
  `https://player.vimeo.com/video/${VIDEO_ID}/config?airplay=1&context=player&h=c6ee9b5b8f&s=signature_1999999999`

/** Vimeo player 初始 config 自带的签名刷新 URL。 */
const SIGNED_REFRESH_CONFIG_URL =
  `https://player.vimeo.com/video/${VIDEO_ID}/config/request?expires=1999999999&signature=refresh_signature`

/** 可配置的假 XHR 响应。 */
interface FakeXhrResponse {
  /** HTTP 状态。 */
  status?: number
  /** XHR 响应类型。 */
  responseType?: XMLHttpRequestResponseType
  /** 文本响应。 */
  responseText?: string
  /** JSON 响应。 */
  response?: JsonValue
  /** 最终响应 URL。 */
  responseURL?: string
  /** 响应头。 */
  headers?: Record<string, string>
}

/** 能触发 load 事件的最小 XMLHttpRequest fake。 */
class FakeXMLHttpRequest extends EventTarget {
  /** 下一实例使用的响应。 */
  static nextResponse: FakeXhrResponse = {}

  /** HTTP 状态。 */
  status = 200

  /** XHR 响应类型。 */
  responseType: XMLHttpRequestResponseType = ''

  /** 文本响应。 */
  responseText = ''

  /** JSON 响应。 */
  response: JsonValue = null

  /** 最终响应 URL。 */
  responseURL = ''

  /** 规范化响应头。 */
  private readonly headers = new Map<string, string>()

  constructor() {
    super()
    const configured = FakeXMLHttpRequest.nextResponse
    this.status = configured.status ?? 200
    this.responseType = configured.responseType ?? ''
    this.responseText = configured.responseText ?? ''
    this.response = configured.response ?? null
    this.responseURL = configured.responseURL ?? ''
    for (const [name, value] of Object.entries(configured.headers ?? {})) {
      this.headers.set(name.toLowerCase(), value)
    }
  }

  /** 原始 open 由捕获包装调用，fake 无需执行网络操作。 */
  open(): void {}

  /** 同步发布 load，模拟 XHR 完成。 */
  send(): void {
    this.dispatchEvent(new Event('load'))
  }

  /** 读取假响应头。 */
  getResponseHeader(name: string): string | null {
    return this.headers.get(name.toLowerCase()) ?? null
  }
}

describe('Vimeo config capture', () => {
  /** 页面原始 fetch mock。 */
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    FakeXMLHttpRequest.nextResponse = {}
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('captures a successful native XHR config and preserves its complete signed URL', async () => {
    const config = configFixture()
    FakeXMLHttpRequest.nextResponse = {
      responseType: 'json',
      response: config,
      responseURL: SIGNED_CONFIG_URL,
      headers: { 'content-type': 'application/json' }
    }
    const capture = await import('@/sites/vimeo/injected/configCapture')
    capture.installVimeoConfigCapture()

    const xhr = new XMLHttpRequest()
    xhr.open('GET', SIGNED_CONFIG_URL)
    xhr.send()

    expect(capture.getCapturedVimeoConfig(VIDEO_ID)).toEqual({
      videoId: VIDEO_ID,
      configUrl: SIGNED_CONFIG_URL,
      config
    })
  })

  it('captures fetch config from a clone without consuming the page response', async () => {
    const config = configFixture()
    const response = responseWithUrl(
      new Response(JSON.stringify(config), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }),
      SIGNED_CONFIG_URL
    )
    fetchMock.mockResolvedValue(response)
    const capture = await import('@/sites/vimeo/injected/configCapture')
    capture.installVimeoConfigCapture()

    const returned = await window.fetch(SIGNED_CONFIG_URL)
    const snapshot = await capture.waitForCapturedVimeoConfig(VIDEO_ID)

    expect(returned).toBe(response)
    expect(await returned.json()).toEqual(config)
    expect(snapshot?.configUrl).toBe(SIGNED_CONFIG_URL)
  })

  it('captures embedded playerConfig with its native signed refresh URL', async () => {
    const config = configFixture()
    const capture = await import('@/sites/vimeo/injected/configCapture')
    capture.installVimeoConfigCapture()

    const script = document.createElement('script')
    script.textContent = `window.playerConfig = ${JSON.stringify(config)}`
    document.head.appendChild(script)

    await expect(capture.waitForCapturedVimeoConfig(VIDEO_ID)).resolves.toEqual({
      videoId: VIDEO_ID,
      configUrl: SIGNED_REFRESH_CONFIG_URL,
      config
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores failed, refresh-endpoint and non-JSON network responses', async () => {
    const capture = await import('@/sites/vimeo/injected/configCapture')
    capture.installVimeoConfigCapture()
    fetchMock
      .mockResolvedValueOnce(
        responseWithUrl(
          new Response('<html>forbidden</html>', {
            status: 403,
            headers: { 'content-type': 'text/html' }
          }),
          `https://player.vimeo.com/video/${VIDEO_ID}/config`
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          new Response(JSON.stringify(configFixture()), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }),
          `https://player.vimeo.com/video/${VIDEO_ID}/config/request?signature=refresh`
        )
      )
      .mockResolvedValueOnce(
        responseWithUrl(
          new Response('<html>ok</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' }
          }),
          SIGNED_CONFIG_URL
        )
      )

    await window.fetch(`https://player.vimeo.com/video/${VIDEO_ID}/config`)
    await window.fetch(`https://player.vimeo.com/video/${VIDEO_ID}/config/request`)
    await window.fetch(SIGNED_CONFIG_URL)
    await Promise.resolve()

    expect(capture.getCapturedVimeoConfig(VIDEO_ID)).toBeNull()
  })

  it('enumerates captured configs as ordered display summaries', async () => {
    const firstConfig = configFixture()
    const secondId = '1196869806'
    const secondConfig = configFixture({ videoId: secondId })
    const capture = await import('@/sites/vimeo/injected/configCapture')
    capture.installVimeoConfigCapture()

    expect(capture.listCapturedVimeoConfigs()).toEqual([])

    FakeXMLHttpRequest.nextResponse = {
      responseType: 'json',
      response: firstConfig,
      responseURL: SIGNED_CONFIG_URL,
      headers: { 'content-type': 'application/json' }
    }
    const firstXhr = new XMLHttpRequest()
    firstXhr.open('GET', SIGNED_CONFIG_URL)
    firstXhr.send()

    FakeXMLHttpRequest.nextResponse = {
      responseType: 'json',
      response: secondConfig,
      responseURL: signedConfigUrl(secondId),
      headers: { 'content-type': 'application/json' }
    }
    const secondXhr = new XMLHttpRequest()
    secondXhr.open('GET', signedConfigUrl(secondId))
    secondXhr.send()

    expect(capture.listCapturedVimeoConfigs()).toEqual([
      {
        videoId: VIDEO_ID,
        title: 'Capture fixture',
        durationSeconds: 61,
        thumbnailUrl: 'https://i.vimeocdn.com/video/1280.jpg'
      },
      {
        videoId: secondId,
        title: 'Capture fixture',
        durationSeconds: 61,
        thumbnailUrl: 'https://i.vimeocdn.com/video/1280.jpg'
      }
    ])
  })
})

/** 最小但结构合法的 Vimeo config。 */
function configFixture(overrides: { videoId?: string } = {}): JsonValue {
  const videoId = overrides.videoId ?? VIDEO_ID
  return {
    request: {
      timestamp: 1_999_996_399,
      expires: 3600,
      config_refresh_url: `https://player.vimeo.com/video/${videoId}/config/request?expires=1999999999&signature=refresh_signature`,
      files: {
        progressive: []
      }
    },
    video: {
      id: Number(videoId),
      title: 'Capture fixture',
      duration: 61,
      thumbs: {
        '1280': 'https://i.vimeocdn.com/video/1280.jpg'
      }
    }
  }
}

/** 构造指定 videoId 的完整签名 config URL。 */
function signedConfigUrl(videoId: string): string {
  return `https://player.vimeo.com/video/${videoId}/config?airplay=1&context=player&h=c6ee9b5b8f&s=signature_1999999999`
}

/** 给标准 Response 补上浏览器只读 url。 */
function responseWithUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { configurable: true, value: url })
  return response
}
