/**
 * Vimeo MAIN world 原生 config 捕获。
 *
 * Vimeo player 的 config URL 带有覆盖整组查询参数的临时签名，不能通过页面身份参数重建。
 * 本模块在 document_start 包装 fetch/XHR，并读取 player 页面内嵌的 playerConfig JSON，
 * 按 videoId 保存在当前页面内存中；页面请求、响应和脚本执行保持原样。
 */

import type { InjectedCapturedVimeoConfigSummary } from '@/injected/types'
import type { JsonValue } from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'
import { createEmbeddedVimeoConfigSnapshot } from '@/sites/vimeo/embeddedConfig'
import { parseVimeoConfig, type VimeoParsedConfig } from '@/sites/vimeo/media'
import { parseVimeoConfigUrlVideoId, type VimeoCapturedConfigSnapshot } from '@/sites/vimeo/shared'

/** 单个 config 响应允许捕获的最大字节数。 */
const MAX_CAPTURE_RESPONSE_BYTES = 512 * 1024

/**
 * 单个页面最多保留的 video config 数量，超限按捕获顺序淘汰最早。
 *
 * 对齐聚合页回退检测的目标数量（content 侧枚举截断同为 16，竞品实测 12 个），
 * 保证轮播播过的视频不会因自设上限提前丢失。
 */
const MAX_CAPTURED_CONFIGS = 16

/**
 * 同时等待不同 videoId 的上限，避免不可信 DOM 通道无限占用内存。
 *
 * 不得低于聚合页回退枚举上限 16（content 侧 `MAX_FALLBACK_VIDEO_IDS`）：枚举出的每个
 * videoId 都可能触发一次等待，低于它会让尾部的点查被直接拒绝。
 */
const MAX_PENDING_VIDEO_IDS = 16

/** content 等待原生播放器 config 的最长时间。 */
const CAPTURE_WAIT_TIMEOUT_MS = 10_000

/** player.vimeo.com 初始 HTML 中 config 的赋值前缀。 */
const PLAYER_CONFIG_ASSIGNMENT_RE = /^\s*window\.playerConfig\s*=\s*/

/** fetch 原函数类型。 */
type FetchFunction = typeof window.fetch

/** XMLHttpRequest.open 原函数类型。 */
type XhrOpenFunction = typeof XMLHttpRequest.prototype.open

/** XMLHttpRequest.send 原函数类型。 */
type XhrSendFunction = typeof XMLHttpRequest.prototype.send

/** 网络捕获来源，仅用于日志定位；内嵌通道由 embeddedConfig 校验后直接入库。 */
type CaptureSource = 'fetch' | 'xhr-json' | 'xhr-text'

/** XHR 请求状态。 */
interface XhrCaptureState {
  /** HTTP 方法。 */
  method: string
  /** open 收到的原始 URL。 */
  url: string
}

/** 等待某个 videoId 原生 config 的共享任务。 */
interface PendingCapture {
  /** 多个 RPC 调用方共享的等待 Promise。 */
  promise: Promise<VimeoCapturedConfigSnapshot | null>
  /** 捕获完成或超时时结束等待。 */
  resolve(snapshot: VimeoCapturedConfigSnapshot | null): void
  /** 固定超时计时器。 */
  timer: number
}

/** 是否已安装网络包装。 */
let captureInstalled = false

/** 按 videoId 保存最近捕获的 config。 */
const capturedConfigs = new Map<string, VimeoCapturedConfigSnapshot>()

/** 按 videoId 共享等待任务。 */
const pendingCaptures = new Map<string, PendingCapture>()

/** XHR 实例与请求 URL 的关联。 */
const xhrCaptureStates = new WeakMap<XMLHttpRequest, XhrCaptureState>()

/** 安装 Vimeo 原生 config 捕获。 */
export function installVimeoConfigCapture(): void {
  if (captureInstalled) {
    return
  }

  captureInstalled = true
  installEmbeddedConfigCapture()
  installFetchCapture()
  installXhrCapture()
  logger.info('[VimeoConfigCapture] 原生内嵌 config 与 fetch/XHR 捕获已安装')
}

/** 返回已捕获 config，未命中时等待原生播放器请求一次。 */
export function waitForCapturedVimeoConfig(
  videoId: string
): Promise<VimeoCapturedConfigSnapshot | null> {
  const captured = getCapturedVimeoConfig(videoId)
  if (captured) {
    return Promise.resolve(captured)
  }

  const pending = pendingCaptures.get(videoId)
  if (pending) {
    return pending.promise
  }

  if (pendingCaptures.size >= MAX_PENDING_VIDEO_IDS) {
    return Promise.resolve(null)
  }

  let resolveCapture: (snapshot: VimeoCapturedConfigSnapshot | null) => void = () => undefined
  const promise = new Promise<VimeoCapturedConfigSnapshot | null>(resolve => {
    resolveCapture = resolve
  })
  const timer = window.setTimeout(() => {
    settlePendingCapture(videoId, null)
  }, CAPTURE_WAIT_TIMEOUT_MS)

  pendingCaptures.set(videoId, {
    promise,
    resolve: resolveCapture,
    timer
  })
  return promise
}

/** 立即读取当前捕获，供同步 RPC/测试判断使用。 */
export function getCapturedVimeoConfig(videoId: string): VimeoCapturedConfigSnapshot | null {
  return capturedConfigs.get(videoId) ?? null
}

/**
 * 列出当前已捕获 config 的概要，按捕获先后排序。
 *
 * 每条快照入库时已通过完整身份校验（URL videoId 与 config video.id 一致），这里按同一
 * configUrl 重走同一解析入口取展示元数据，必然成功且不会出现第二套解析口径。概要只作为
 * content 在无页面身份页面上的发现提示，业务数据仍须由 content 按 videoId 走校验通道获取。
 */
export function listCapturedVimeoConfigs(): InjectedCapturedVimeoConfigSummary[] {
  const summaries: InjectedCapturedVimeoConfigSummary[] = []
  for (const snapshot of capturedConfigs.values()) {
    const parsed = parseVimeoConfig(snapshot.config, snapshot.configUrl)
    const thumbnail = parsed.thumbnails[0]
    summaries.push({
      videoId: snapshot.videoId,
      title: parsed.title,
      ...(parsed.duration !== undefined ? { durationSeconds: parsed.duration } : {}),
      ...(thumbnail ? { thumbnailUrl: thumbnail.url } : {})
    })
  }
  return summaries
}

/** 包装 fetch，但不阻塞页面消费原响应。 */
function installFetchCapture(): void {
  const originalFetch = window.fetch.bind(window) as FetchFunction
  window.fetch = (async (...args: Parameters<FetchFunction>): Promise<Response> => {
    const response = await originalFetch(...args)
    void captureFetchResponse(response)
    return response
  }) as FetchFunction
}

/** 包装 XMLHttpRequest，记录请求 URL 并在 load 后读取成功 JSON。 */
function installXhrCapture(): void {
  const originalOpen = XMLHttpRequest.prototype.open as XhrOpenFunction
  const originalSend = XMLHttpRequest.prototype.send as XhrSendFunction

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ): void {
    xhrCaptureStates.set(this, { method, url: String(url) })
    originalOpen.call(this, method, url, async, username, password)
  } as XhrOpenFunction

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null
  ): void {
    const state = xhrCaptureStates.get(this)
    if (
      state?.method.toUpperCase() === 'GET' &&
      parseVimeoConfigUrlVideoId(resolveRequestUrl(state.url)) !== null
    ) {
      this.addEventListener('load', () => captureXhrResponse(this), { once: true })
    }
    originalSend.call(this, body)
  } as XhrSendFunction
}

/** 观察初始 HTML/后续 DOM 中 Vimeo 自己写入的 window.playerConfig JSON。 */
function installEmbeddedConfigCapture(): void {
  captureEmbeddedConfigScripts(document)

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        captureEmbeddedConfigNode(node)
      }
    }
  })
  observer.observe(document, {
    childList: true,
    subtree: true
  })

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      captureEmbeddedConfigScripts(document)
      observer.disconnect()
    },
    { once: true }
  )
}

/** 检查一个新增节点及其子树中的 inline script。 */
function captureEmbeddedConfigNode(node: Node): void {
  if (node instanceof HTMLScriptElement) {
    captureEmbeddedConfigScript(node)
    return
  }

  if (node instanceof Element) {
    captureEmbeddedConfigScripts(node)
  }
}

/** 扫描给定 DOM 范围内的 inline script。 */
function captureEmbeddedConfigScripts(root: ParentNode): void {
  for (const script of root.querySelectorAll<HTMLScriptElement>('script:not([src])')) {
    captureEmbeddedConfigScript(script)
  }
}

/** 解析 Vimeo player 初始 HTML 的 window.playerConfig 赋值。 */
function captureEmbeddedConfigScript(script: HTMLScriptElement): void {
  const text = script.textContent
  if (!text || !PLAYER_CONFIG_ASSIGNMENT_RE.test(text) || !isCaptureTextWithinLimit(text)) {
    return
  }

  let jsonText = text.replace(PLAYER_CONFIG_ASSIGNMENT_RE, '').trim()
  if (jsonText.endsWith(';')) {
    jsonText = jsonText.slice(0, -1).trimEnd()
  }
  if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) {
    return
  }

  try {
    const config = JSON.parse(jsonText) as JsonValue
    const snapshot = createEmbeddedVimeoConfigSnapshot(config, window.location.href)
    if (!snapshot) {
      return
    }

    storeCapturedConfig(snapshot)
    logger.info(
      `[VimeoConfigCapture] 已捕获原生 config: videoId=${snapshot.videoId}, source=embedded, host=${urlHostname(snapshot.configUrl)}`
    )
  } catch (error) {
    logger.debug('[VimeoConfigCapture] 内嵌 config JSON 解析跳过: stage=embedded-parse', error)
  }
}

/** 克隆并有界读取 fetch config 响应。 */
async function captureFetchResponse(response: Response): Promise<void> {
  if (!isCapturableResponse(response.status, response.url, response.headers)) {
    return
  }

  try {
    const text = await readResponseTextWithinLimit(response.clone())
    if (text !== null) {
      captureJsonText(text, response.url, 'fetch')
    }
  } catch (error) {
    logger.debug(
      `[VimeoConfigCapture] fetch config 读取跳过: host=${urlHostname(response.url)}, stage=read`,
      error
    )
  }
}

/** 读取 XHR config 响应。 */
function captureXhrResponse(xhr: XMLHttpRequest): void {
  const state = xhrCaptureStates.get(xhr)
  const responseUrl = xhr.responseURL || resolveRequestUrl(state?.url ?? '')
  const headers = new Headers({
    'content-type': xhr.getResponseHeader('content-type') ?? '',
    'content-length': xhr.getResponseHeader('content-length') ?? ''
  })
  if (
    state?.method.toUpperCase() !== 'GET' ||
    !isCapturableResponse(xhr.status, responseUrl, headers)
  ) {
    return
  }

  try {
    if (xhr.responseType === '' || xhr.responseType === 'text') {
      captureJsonText(xhr.responseText, responseUrl, 'xhr-text')
      return
    }

    if (xhr.responseType === 'json') {
      const text = JSON.stringify(xhr.response)
      if (typeof text === 'string') {
        captureJsonText(text, responseUrl, 'xhr-json')
      }
    }
  } catch (error) {
    logger.debug(
      `[VimeoConfigCapture] XHR config 读取跳过: host=${urlHostname(responseUrl)}, stage=read, responseType=${xhr.responseType || 'text'}`,
      error
    )
  }
}

/** 判断响应是否为可捕获的 Vimeo 原生 config。 */
function isCapturableResponse(status: number, url: string, headers: Headers): boolean {
  const contentType = headers.get('content-type')?.toLowerCase() ?? ''
  return (
    status >= 200 &&
    status < 300 &&
    parseVimeoConfigUrlVideoId(url) !== null &&
    contentType.includes('json') &&
    !exceedsDeclaredLength(headers.get('content-length'))
  )
}

/** 有界读取 clone，不让异常大响应进入内存。 */
async function readResponseTextWithinLimit(response: Response): Promise<string | null> {
  const reader = response.body?.getReader()
  if (!reader) {
    return null
  }

  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return text + decoder.decode()
    }

    bytesRead += value.byteLength
    if (bytesRead > MAX_CAPTURE_RESPONSE_BYTES) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
}

/** 解析、校验并保存一份 config JSON。 */
function captureJsonText(text: string, configUrl: string, source: CaptureSource): void {
  if (!isCaptureTextWithinLimit(text)) {
    return
  }

  try {
    const config = JSON.parse(text) as JsonValue
    const urlVideoId = parseVimeoConfigUrlVideoId(configUrl)
    if (!urlVideoId) {
      return
    }

    const parsed = parseVimeoConfig(config, configUrl)
    storeValidatedConfig(config, configUrl, parsed, urlVideoId, source)
  } catch (error) {
    logger.debug(
      `[VimeoConfigCapture] config JSON 解析跳过: host=${urlHostname(configUrl)}, source=${source}, stage=parse`,
      error
    )
  }
}

/** 统一校验 URL/响应身份并保存 config，避免内嵌与网络来源形成两套模型。 */
function storeValidatedConfig(
  config: JsonValue,
  configUrl: string,
  parsed: VimeoParsedConfig,
  urlVideoId: string,
  source: CaptureSource
): void {
  if (parsed.videoId !== urlVideoId) {
    logger.debug(
      `[VimeoConfigCapture] config URL 与响应 videoId 不一致: urlVideoId=${urlVideoId}, configVideoId=${parsed.videoId}, source=${source}`
    )
    return
  }

  storeCapturedConfig({
    videoId: parsed.videoId,
    configUrl,
    config
  })
  logger.info(
    `[VimeoConfigCapture] 已捕获原生 config: videoId=${parsed.videoId}, source=${source}, host=${urlHostname(configUrl)}`
  )
}

/** 保存 config 并唤醒等待同一 videoId 的 content 请求。 */
function storeCapturedConfig(snapshot: VimeoCapturedConfigSnapshot): void {
  capturedConfigs.delete(snapshot.videoId)
  capturedConfigs.set(snapshot.videoId, snapshot)

  while (capturedConfigs.size > MAX_CAPTURED_CONFIGS) {
    const oldestVideoId = capturedConfigs.keys().next().value
    if (typeof oldestVideoId !== 'string') {
      break
    }
    capturedConfigs.delete(oldestVideoId)
  }

  settlePendingCapture(snapshot.videoId, snapshot)
}

/** 结束某个共享等待任务。 */
function settlePendingCapture(videoId: string, snapshot: VimeoCapturedConfigSnapshot | null): void {
  const pending = pendingCaptures.get(videoId)
  if (!pending) {
    return
  }

  pendingCaptures.delete(videoId)
  window.clearTimeout(pending.timer)
  pending.resolve(snapshot)
}

/** 判断声明的 Content-Length 是否越界。 */
function exceedsDeclaredLength(value: string | null): boolean {
  if (!value) {
    return false
  }

  const length = Number(value)
  return Number.isFinite(length) && length > MAX_CAPTURE_RESPONSE_BYTES
}

/** 按 UTF-8 实际字节限制 config，避免 Unicode 文本绕过字符数上限。 */
function isCaptureTextWithinLimit(value: string): boolean {
  return (
    value.length <= MAX_CAPTURE_RESPONSE_BYTES &&
    new TextEncoder().encode(value).length <= MAX_CAPTURE_RESPONSE_BYTES
  )
}

/** 把 XHR.open 的相对地址解析为绝对 URL。 */
function resolveRequestUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl, window.location.href).href
  } catch (error) {
    logger.debug('[VimeoConfigCapture] XHR config URL 解析跳过: stage=url-resolve', error)
    return ''
  }
}

/** 日志只输出 host，不泄漏 Vimeo 签名查询参数。 */
function urlHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch (_error) {
    return 'invalid'
  }
}
