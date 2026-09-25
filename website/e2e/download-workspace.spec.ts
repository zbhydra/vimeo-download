import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request,
  type Route
} from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { registerE2eBrowserIdentity } from '../../scripts/playwright-browser-identity.mjs'
import { DEVELOPER_EMAIL } from '../src/lib/site.mjs'

registerE2eBrowserIdentity(test)

/** 本测试写入/读取的 localStorage key 集合。 */
const STORAGE_KEYS = {
  accessToken: 'homepage_access_token',
  deviceId: 'homepage_device_id_v2',
  obsoleteDeviceId: 'homepage_device_id',
  workspaceSnapshot: 'download:workspace:snapshot:v2',
  resumeRecord: 'download:resume:record:v1'
} as const

/** 新版恢复记录 IndexedDB 名称。 */
const DOWNLOAD_RESUME_IDB_DATABASE_NAME = 'download_resume_store_v1'
/** 新版恢复记录 IndexedDB store 名称。 */
const DOWNLOAD_RESUME_IDB_STORE_NAME = 'records'
/** 新版恢复记录唯一 pending key。 */
const DOWNLOAD_RESUME_IDB_PENDING_KEY = 'pending'

/** e2e 固定 device ID；当前合同只接受 UUID，固定值让请求头与快照 owner 可断言。 */
const STABLE_DEVICE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
/** 工作区状态机启动必然记录的 mark（与解析行为无关），断言解析 mark 时过滤掉。 */
const WORKSPACE_LIFECYCLE_MARKS = new Set(['web_first_opened'])

/** 网站端 device ID 形态。 */
const UUID_DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
/** 旧 v1 下载 URL,用于验证 V2 后不再走 query 下载路径。 */
const LEGACY_MEDIA_DOWNLOAD_URL_PATTERN =
  /^http:\/\/homepage-api\.test\/api\/client\/media\/download(?:\?|$)/
/** client_mux 多轨合成固定样本链接。 */
const CLIENT_MUX_SAMPLE_LINK = 'https://vimeo.com/1194296700'
/** 网站端 unsafe 文件类型统一引导文案。 */
const UNSAFE_FILE_TYPE_EXTENSION_COPY =
  'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.'
/** 网站端 unsafe 文件类型确认弹窗标题。 */
const UNSAFE_FILE_TYPE_CONFIRM_TITLE = 'Use the browser extension'
/** e2e mock 专用 resource_token 前缀；只用于测试内从 opaque token 找回 fixture。 */
const E2E_RESOURCE_TOKEN_PREFIX = 'e2e-resource-token:'

type JsonPrimitive = string | number | boolean | null
type JsonObject = { [key: string]: JsonValue | undefined }
type JsonArray = JsonValue[]
type JsonValue = JsonPrimitive | JsonObject | JsonArray
type V2DownloadMode = 'direct' | 'client_mux'
type RouteFulfillOptions = NonNullable<Parameters<Route['fulfill']>[0]>
type GoogleCredentialCallback = (response: { credential: string; select_by: string }) => void

interface TestResourceTokenPayload {
  sourceId: string
  platform: string
  downloadMode: V2DownloadMode
  link: string
  size: number | null
}

interface ParseV2MockRoute {
  request(): ReturnType<Route['request']>
  fulfill(options: RouteFulfillOptions): ReturnType<Route['fulfill']>
  abort(errorCode?: Parameters<Route['abort']>[0]): ReturnType<Route['abort']>
  fetch(options?: Parameters<Route['fetch']>[0]): ReturnType<Route['fetch']>
  continue(options?: Parameters<Route['continue']>[0]): ReturnType<Route['continue']>
}

function readFixtureBytes(filename: string): Buffer {
  const content = readFileSync(resolve('e2e/fixtures', filename), 'utf8')
  return Buffer.from(content.replace(/\s+/g, ''), 'base64')
}

/** 生成与目标 URL 同源同路径的替换 URL，用于表达“同一轨道的另一种状态”。 */
function floatUrl(url: string, marker: string): string {
  const parsed = new URL(url)
  const segments = parsed.pathname.split('/')
  const last = segments.length - 1
  segments[last] = `${marker}-${segments[last]}`
  parsed.pathname = segments.join('/')
  return parsed.toString()
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toJsonValue(value: string): JsonValue {
  return JSON.parse(value) as JsonValue
}

function asDownloadMode(value: JsonValue | undefined): V2DownloadMode {
  if (value === 'direct' || value === 'client_mux') {
    return value
  }
  // 缺省按 direct 编码 resource token；fixture 声明未知模式时仍由后端响应触发 parse 失败。
  return 'direct'
}

function buildResourceToken({
  sourceId,
  platform,
  downloadMode,
  link,
  size
}: TestResourceTokenPayload): string {
  const serialized = JSON.stringify({
    sourceId,
    platform,
    downloadMode,
    link,
    size
  })
  return `${E2E_RESOURCE_TOKEN_PREFIX}${Buffer.from(serialized, 'utf8').toString('base64url')}`
}

function parseResourceToken(resourceToken: string): TestResourceTokenPayload {
  if (!resourceToken.startsWith(E2E_RESOURCE_TOKEN_PREFIX)) {
    throw new Error(`[v2-test] invalid e2e resource token prefix: ${resourceToken}`)
  }

  const decoded = JSON.parse(
    Buffer.from(resourceToken.slice(E2E_RESOURCE_TOKEN_PREFIX.length), 'base64url').toString('utf8')
  ) as Partial<TestResourceTokenPayload>
  if (
    typeof decoded.sourceId !== 'string' ||
    typeof decoded.platform !== 'string' ||
    (decoded.downloadMode !== 'direct' &&
      decoded.downloadMode !== 'client_mux') ||
    typeof decoded.link !== 'string' ||
    (decoded.size !== null && typeof decoded.size !== 'number')
  ) {
    throw new Error(`[v2-test] invalid e2e resource token payload: ${resourceToken}`)
  }

  return {
    sourceId: decoded.sourceId,
    platform: decoded.platform,
    downloadMode: decoded.downloadMode,
    link: decoded.link,
    size: decoded.size
  }
}

function expectDownloadPrePayloadContract(payload: V2DownloadPrePayload): void {
  expect(Object.keys(payload).sort()).toEqual([
    'preferred_node_id',
    'resource_token'
  ])
  expect(payload.resource_token).toMatch(new RegExp(`^${E2E_RESOURCE_TOKEN_PREFIX}`))
  expect(
    payload.preferred_node_id === null ||
      (typeof payload.preferred_node_id === 'number' && Number.isInteger(payload.preferred_node_id))
  ).toBe(true)
}

function getPayloadResource(payload: V2DownloadPrePayload): TestResourceTokenPayload {
  return parseResourceToken(payload.resource_token)
}

function getPayloadSourceId(payload: V2DownloadPrePayload): string {
  return getPayloadResource(payload).sourceId
}

function getPayloadDownloadMode(payload: V2DownloadPrePayload): V2DownloadMode {
  return getPayloadResource(payload).downloadMode
}

function getPayloadLink(payload: V2DownloadPrePayload): string {
  return getPayloadResource(payload).link
}

function getPayloadSourceIds(payloads: readonly V2DownloadPrePayload[]): string[] {
  return payloads.map(getPayloadSourceId)
}

function getPayloadDownloadModes(payloads: readonly V2DownloadPrePayload[]): V2DownloadMode[] {
  return payloads.map(getPayloadDownloadMode)
}

function withResourceTokensInParseV2Body(body: string): string {
  const envelope = toJsonValue(body)
  if (!isJsonObject(envelope) || !isJsonObject(envelope.data)) {
    return body
  }

  const data = envelope.data
  const canonicalLink =
    typeof data.canonical_link === 'string'
      ? data.canonical_link
      : typeof data.original_link === 'string'
        ? data.original_link
        : ''
  const fallbackPlatform = typeof data.platform === 'string' ? data.platform : 'vimeo'
  const attachToken = (source: JsonValue): JsonValue => {
    if (!isJsonObject(source) || typeof source.source_id !== 'string') {
      return source
    }
    if (typeof source.resource_token === 'string' && source.resource_token.length > 0) {
      return source
    }

    const platform = typeof source.platform === 'string' ? source.platform : fallbackPlatform
    const downloadMode = asDownloadMode(source.download_mode)
    const size = typeof source.size === 'number' && Number.isFinite(source.size) ? source.size : null
    return {
      ...source,
      download_mode: typeof source.download_mode === 'string' ? source.download_mode : downloadMode,
      resource_token: buildResourceToken({
        sourceId: source.source_id,
        platform,
        downloadMode,
        link: canonicalLink,
        size
      })
    }
  }

  const resources = Array.isArray(data.resources)
    ? data.resources.map(attachToken)
    : data.resources
  const messages = Array.isArray(data.messages)
    ? data.messages.map(message => {
        if (!isJsonObject(message) || !Array.isArray(message.sources)) {
          return message
        }
        return {
          ...message,
          sources: message.sources.map(attachToken)
        }
      })
    : data.messages

  return JSON.stringify({
    ...envelope,
    data: {
      ...data,
      resources,
      messages
    }
  })
}

function buildParseV2MockRoute(route: Route): ParseV2MockRoute {
  return {
    request: () => route.request(),
    fulfill: options => {
      const body = typeof options.body === 'string'
        ? withResourceTokensInParseV2Body(options.body)
        : options.body
      return route.fulfill({ ...options, body })
    },
    abort: errorCode => route.abort(errorCode),
    fetch: options => route.fetch(options),
    continue: options => route.continue(options)
  }
}

async function waitForMarkMessage(readMarkMessage: () => string): Promise<string> {
  await expect.poll(() => readMarkMessage().length).toBeGreaterThan(0)
  return readMarkMessage()
}

/**
 * client_mux 多轨合成 fixture 的轨道 URL。
 *
 * 轨道材料走 no-referrer 直连抓取，这里用测试内固定 CDN 域名，只由 e2e 路由提供字节。
 */
const CLIENT_MUX_VIDEO_TRACK_URL = 'https://vimeo-cdn.test/dash/video-1080.mp4'
const CLIENT_MUX_AUDIO_TRACK_URL = 'https://vimeo-cdn.test/dash/audio-128.m4a'
/** client_mux 视频轨 fixture。 */
const CLIENT_MUX_VIDEO_TRACK_BYTES = readFixtureBytes('client-mux-video.mp4.b64')
/** client_mux 音频轨 fixture。 */
const CLIENT_MUX_AUDIO_TRACK_BYTES = readFixtureBytes('client-mux-audio.m4a.b64')

async function readStoredDeviceId(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.deviceId)
}

async function waitForStoredDeviceId(page: import('@playwright/test').Page): Promise<string | null> {
  let deviceId: string | null = null
  await expect
    .poll(async () => {
      deviceId = await readStoredDeviceId(page)
      return deviceId
    })
    .not.toBeNull()
  return deviceId
}

/**
 * 站点 origin，由 Playwright `baseURL` 派生。
 *
 * `E2E_WEB_PORT` 会改变实际端口，写 cookie 的 url 必须与 baseURL 同源，否则 addCookies 静默失效。
 */
function siteOrigin(): string {
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) {
    throw new Error('[e2e] Playwright baseURL is required to write the language cookie.')
  }
  return new URL('/', baseURL).origin
}

/** 写入站点语言 cookie，页面按该语言渲染。 */
async function setLanguageCookie(context: BrowserContext, language: string): Promise<void> {
  await context.addCookies([{ name: 'user-language', value: language, url: siteOrigin() }])
}

/**
 * 等待下载工作区可交互。
 *
 * 匿名首屏以 deferRuntime 渲染，`data-download-workspace-ready` 由 workspace 状态机在
 * 完成初始化后写入，而状态机只对已登录 / 有本地快照的访问立即加载，其余访问由首次交互
 * （pointerdown / focusin / 提交）触发。所以这里先聚焦解析输入框触发加载，再断言就绪标志，
 * 而不是等到超时。
 */
async function waitForWorkspaceReady(page: Page): Promise<void> {
  const root = page.locator('[data-download-workspace]')
  const parseInput = page.locator('[data-download-parse-input]')
  await expect(page.locator('[data-download-workspace-shell]')).toBeVisible()

  if ((await root.getAttribute('data-download-workspace-ready')) !== 'true') {
    await parseInput.focus()
  }

  await expect(root).toHaveAttribute('data-download-workspace-ready', 'true')
  await expect(parseInput).toBeEnabled()
}

async function gotoWorkspace(page: Page, path = '/'): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await waitForWorkspaceReady(page)
}

async function reloadWorkspace(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForWorkspaceReady(page)
}

async function isBeforeUnloadPrevented(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
}

/** 旧订阅快照参数保留给历史用例调用；workspace 只用 creditsBalance。 */
interface SessionSnapshot {
  used: number
  dailyLimit: number
  creditsBalance?: number
  period?: 'free' | 'month'
  playUsed?: number
  dailyPlayLimit?: number
}

/** 签到 entry mock。 */
interface CheckinEntryMock {
  campaign_ended: boolean
  start_date: string
  end_date: string
  today: string
  day_index: number
  today_reward_credits: number
  today_claimed: boolean
  total_claim_days: number
  credits_balance: number
  next_claim_at: string | null
  next_claim_at_ts: number | null
}

/** 签到 entry mock 构造参数。 */
interface CheckinEntryMockOptions {
  creditsBalance: number
  todayClaimed: boolean
  campaignEnded: boolean
  today?: string
  dayIndex?: number
  todayRewardCredits?: number
  totalClaimDays?: number
  nextClaimAt?: string | null
  nextClaimAtTs?: number | null
}

/** download-pre-v2 请求体 mock。 */
interface V2DownloadPrePayload {
  resource_token: string
  preferred_node_id: number | null
}

/** V2 direct intent 响应 mock 可配置项。 */
interface V2DirectIntentMockOptions {
  filename?: string
  mimeType?: string
  size?: number
}

/** V2 direct 流式下载 mock 可配置项。 */
interface V2DirectDownloadMockOptions {
  cdnUrl?: string
  creditsBalance?: number
  filename?: string | ((payload: V2DownloadPrePayload) => string)
  status?: number
  contentType?: string
  body?: string | Buffer
  headers?: Record<string, string> | ((payload: V2DownloadPrePayload) => Record<string, string>)
  onPrePayload?: (payload: V2DownloadPrePayload, headers: Record<string, string>) => void
  onCdnRequest?: (payload: V2DownloadPrePayload, headers: Record<string, string>) => void
}

/**
 * mock download-pre-v2 + download-v2 + CDN 直链，覆盖 direct 的完整下载链路。
 *
 * 返回的 download-v2 是 direct intent JSON；实际字节由 CDN URL 提供，
 * 因此 Range/进度/文件名断言都落在 CDN 请求上。
 */
async function mockV2DirectDownload(
  page: import('@playwright/test').Page,
  {
    cdnUrl = 'https://cdn.example.test/direct/download.mp4',
    creditsBalance = 88,
    filename,
    status = 200,
    contentType = 'video/mp4',
    body = 'demo',
    headers,
    onPrePayload,
    onCdnRequest
  }: V2DirectDownloadMockOptions = {}
): Promise<void> {
  const bodyByteLength = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength
  const declaredContentLength =
    typeof headers === 'object' && headers?.['content-length']
      ? Number(headers['content-length'])
      : bodyByteLength
  let payload: V2DownloadPrePayload | null = null
  let callIndex = 0

  await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
    const requestPayload = route.request().postDataJSON() as V2DownloadPrePayload
    expectDownloadPrePayloadContract(requestPayload)
    const tokenPayload = parseResourceToken(requestPayload.resource_token)
    callIndex += 1
    payload = requestPayload
    onPrePayload?.(requestPayload, route.request().headers())

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          token: `v2-direct-token-${callIndex}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          credits_balance: creditsBalance,
          download_mode: tokenPayload.downloadMode,
          nodes: [{ node_id: 21, url: buildNodeUrl(21, 'download-v2') }]
        }
      })
    })
  })

  await page.route(buildNodeUrl(21, 'download-v2'), async route => {
    const tokenPayload = route.request().postDataJSON() as { token: string }
    if (!payload) {
      throw new Error(`[v2-test] missing direct download-pre payload for token=${tokenPayload.token}`)
    }
    const activePayload = payload
    const activeFilename =
      typeof filename === 'function' ? filename(activePayload) : filename ?? 'demo-video.mp4'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          source_id: parseResourceToken(activePayload.resource_token).sourceId,
          platform: 'vimeo',
          download_mode: 'direct',
          download_url: cdnUrl,
          filename: activeFilename,
          mime_type: contentType,
          size: declaredContentLength,
          expires_at: null
        }
      })
    })
  })

  await page.route(cdnUrl, async route => {
    if (!payload) {
      throw new Error('[v2-test] missing direct download-pre payload for CDN request')
    }
    const activePayload = payload
    onCdnRequest?.(activePayload, route.request().headers())
    const responseHeaders =
      typeof headers === 'function' ? headers(activePayload) : headers ?? { 'content-type': contentType }
    await route.fulfill({
      status,
      headers: {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
        ...responseHeaders
      },
      body
    })
  })
}

/** Credits checkout config mock。 */
interface CreditCheckoutConfigMock {
  product_class: number
  product_id: string
  product_name: string
  credits_amount: number
  display_currency: string
  display_amount: number
  payment_channels: CreditCheckoutPaymentChannelMock[]
}

/** Credits checkout 支付渠道 mock。 */
interface CreditCheckoutPaymentChannelMock {
  payment_method: string
  payment_method_name: string
  currency: string
  amount: number
  provider_sku: string
}

/** Credits 创建订单请求体。 */
interface CreditCreateOrderPayload {
  product_class: number
  product_id: string
  payment_method: string
  currency: string
  amount: number
}

/** mark/record 请求体。 */
interface MarkRecordPayload {
  mark_type: string
  mark_msg: string
}

interface GoogleIdentityStubWindow extends Window {
  google?: {
    accounts: {
      id: {
        initialize(config: { callback(response: { credential: string; select_by: string }): void }): void
        prompt(): void
        cancel(): void
      }
    }
  }
  __triggerGoogleCredential?: () => void
}

declare global {
  interface Window {
    /** E2E 中手动触发公共订单 checkout 轮询 interval，避免用固定 sleep 等真实时间。 */
    __runOrderCheckoutPollingIntervals?: () => number
  }
}

/** Credits checkout 默认商品配置。 */
const CREDIT_CHECKOUT_CONFIGS: CreditCheckoutConfigMock[] = [
  {
    product_class: 2,
    product_id: 'credit_50',
    product_name: '50 Credits',
    credits_amount: 50,
    display_currency: 'USD',
    display_amount: 6300000,
    payment_channels: [
      {
        payment_method: 'clink',
        payment_method_name: 'Credit or debit card',
        currency: 'USD',
        amount: 6300000,
        provider_sku: 'credit-50-clink'
      }
    ]
  },
  {
    product_class: 2,
    product_id: 'credit_200',
    product_name: '200 Credits',
    credits_amount: 200,
    display_currency: 'USD',
    display_amount: 15300000,
    payment_channels: [
      {
        payment_method: 'clink',
        payment_method_name: 'Credit or debit card',
        currency: 'USD',
        amount: 15300000,
        provider_sku: 'credit-200-clink'
      }
    ]
  },
  {
    product_class: 2,
    product_id: 'credit_1000',
    product_name: '1000 Credits',
    credits_amount: 1000,
    display_currency: 'USD',
    display_amount: 63000000,
    payment_channels: [
      {
        payment_method: 'clink',
        payment_method_name: 'Credit or debit card',
        currency: 'USD',
        amount: 63000000,
        provider_sku: 'credit-1000-clink'
      }
    ]
  }
]

/** workspace snapshot 资源 fixture。 */
interface WorkspaceSnapshotResourceFixture {
  sourceId?: string
  filename?: string
  type?: string
  size?: number | null
  link?: string
  mimeType?: string
}

/** parse-v2 多资源 fixture。 */
interface MediaParseResourceFixture {
  sourceId: string
  filename: string
  mimeType: string
  size: number | null
  type?: string
  platform?: string
  downloadMode?: V2DownloadMode
}

function buildApiUrl(path: string): string {
  return `**${path}`
}

function buildNodeUrl(nodeId: number, path: 'parse-v2' | 'download-v2'): string {
  return `http://media-node-${nodeId}.test/api/client/media/${path}`
}

function buildWorkspaceSnapshotResource(
  fixture: WorkspaceSnapshotResourceFixture = {}
): Record<string, string | number | boolean | object | null> {
  const sourceId = fixture.sourceId ?? 'source-video-1'
  const link = fixture.link ?? 'https://vimeo.com/1194296700'
  const size = fixture.size ?? 1024
  return {
    sourceId,
    resourceToken: buildResourceToken({
      sourceId,
      platform: 'vimeo',
      downloadMode: 'direct',
      link,
      size
    }),
    filename: fixture.filename ?? 'demo-video.mp4',
    type: fixture.type ?? 'video',
    size,
    link,
    mimeType: fixture.mimeType ?? 'video/mp4',
    platform: 'vimeo',
    downloadMode: 'direct',
    capabilities: {
      download: true,
    }
  }
}

async function installV2OldMainPathGuards(page: import('@playwright/test').Page): Promise<void> {
  await page.route(buildApiUrl('/api/client/media/parse'), async route => {
    throw new Error(`[v2-test] old parse path should not be called: ${route.request().url()}`)
  })
  await page.route(LEGACY_MEDIA_DOWNLOAD_URL_PATTERN, async route => {
    throw new Error(`[v2-test] legacy download path should not be called: ${route.request().url()}`)
  })
  await page.route(buildApiUrl('/api/client/media/direct-download-intent'), async route => {
    throw new Error(`[v2-test] old direct intent path should not be called: ${route.request().url()}`)
  })
  await page.route(buildApiUrl('/api/client/media/client-mux-intent'), async route => {
    throw new Error(`[v2-test] old client_mux intent path should not be called: ${route.request().url()}`)
  })
}

async function mockMediaParseV2(
  page: import('@playwright/test').Page,
  handler: (route: ParseV2MockRoute) => Promise<void>
): Promise<void> {
  await mockV2ParsePre(page, [11])
  await page.route(buildNodeUrl(11, 'parse-v2'), async route => {
    await handler(buildParseV2MockRoute(route))
  })
}

async function mockV2ParsePre(
  page: import('@playwright/test').Page,
  nodeIds: readonly number[] = [11, 12]
): Promise<void> {
  await page.route(buildApiUrl('/api/client/media/parse-pre-v2'), async route => {
    const parsePayload = route.request().postDataJSON() as { link: string }
    expect(parsePayload.link.length).toBeGreaterThan(0)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          nodes: nodeIds.map(nodeId => ({
            node_id: nodeId,
            url: buildNodeUrl(nodeId, 'parse-v2')
          }))
        }
      })
    })
  })
}

async function openDownloadEmailAuthForm(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const modal = document.querySelector<HTMLElement>('[data-download-auth-modal]')
    if (!modal) {
      throw new Error('Download auth modal is missing')
    }

    modal.hidden = false
  })
  await page.click('[data-download-email-entry-button]')
  await expect(page.locator('[data-download-login-email]')).toBeVisible()
}

async function installGoogleCredentialStub(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    let credentialCallback: GoogleCredentialCallback | null = null
    const stubWindow = window as GoogleIdentityStubWindow
    stubWindow.google = {
      accounts: {
        id: {
          initialize(config: { callback(response: { credential: string; select_by: string }): void }) {
            credentialCallback = config.callback
          },
          prompt() {},
          cancel() {}
        }
      }
    }
    stubWindow.__triggerGoogleCredential = () => {
      if (!credentialCallback) {
        throw new Error('[e2e] Google credential callback is not initialized.')
      }
      credentialCallback({
        credential: 'google-e2e-credential',
        select_by: 'user_1tap'
      })
    }
  })
}

async function mockV2ParseNode(
  page: import('@playwright/test').Page,
  {
    nodeId,
    platform = 'vimeo',
    downloadMode = 'direct',
    sourceId = 'source-video-1',
    canonicalLink = 'https://vimeo.com/1194296700',
    filename = 'demo-video.mp4',
    size = 4
  }: {
    nodeId: number
    platform?: string
    downloadMode?: V2DownloadMode
    sourceId?: string
    canonicalLink?: string
    filename?: string
    size?: number | null
  }
): Promise<void> {
  await page.route(buildNodeUrl(nodeId, 'parse-v2'), async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          status: 'ok',
          original_link: canonicalLink,
          canonical_link: canonicalLink,
          platform,
          resources: [
            {
              source_id: sourceId,
              resource_token: buildResourceToken({
                sourceId,
                platform,
                downloadMode,
                link: canonicalLink,
                size
              }),
              platform,
              download_mode: downloadMode,
              capabilities: {
                download: true,
              },
              filename,
              type: 'video',
              size,
              mime_type: 'video/mp4'
            }
          ]
        }
      })
    })
  })
}

async function mockV2DownloadPre(
  page: import('@playwright/test').Page,
  {
    nodeIds = [21, 22],
    tokenPrefix = 'v2-token',
    onPayload
  }: {
    nodeIds?: readonly number[]
    tokenPrefix?: string
    onPayload?: (payload: V2DownloadPrePayload, headers: Record<string, string>) => void
  } = {}
): Promise<void> {
  let callIndex = 0
  await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
    const payload = route.request().postDataJSON() as V2DownloadPrePayload
    expectDownloadPrePayloadContract(payload)
    const tokenPayload = parseResourceToken(payload.resource_token)
    callIndex += 1
    onPayload?.(payload, route.request().headers())
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          token: `${tokenPrefix}-${callIndex}`,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          download_mode: tokenPayload.downloadMode,
          nodes: nodeIds.map(nodeId => ({
            node_id: nodeId,
            url: buildNodeUrl(nodeId, 'download-v2')
          }))
        }
      })
    })
  })
}

async function mockV2DirectIntent(
  page: import('@playwright/test').Page,
  downloadUrl: string | ((payload: V2DownloadPrePayload, index: number) => string),
  onPayload?: (payload: V2DownloadPrePayload) => void,
  options: V2DirectIntentMockOptions = {}
): Promise<void> {
  let callIndex = 0
  const payloadByToken = new Map<string, V2DownloadPrePayload>()

  await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
    const payload = route.request().postDataJSON() as V2DownloadPrePayload
    expectDownloadPrePayloadContract(payload)
    const tokenPayload = parseResourceToken(payload.resource_token)
    callIndex += 1
    const token = `v2-direct-token-${callIndex}`
    payloadByToken.set(token, payload)
    onPayload?.(payload)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          token,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          download_mode: tokenPayload.downloadMode,
          nodes: [{ node_id: 21, url: buildNodeUrl(21, 'download-v2') }]
        }
      })
    })
  })

  await page.route(buildNodeUrl(21, 'download-v2'), async route => {
    const tokenPayload = route.request().postDataJSON() as { token: string }
    const payload = payloadByToken.get(tokenPayload.token)
    if (!payload) {
      throw new Error(`[v2-test] missing direct download-pre payload for token=${tokenPayload.token}`)
    }
    const index = Number(tokenPayload.token.replace('v2-direct-token-', '')) || 1
    const filename = options.filename ?? 'vimeo-demo.mp4'
    const mimeType = options.mimeType ?? 'video/mp4'
    const size = options.size ?? 8192
    const activeDownloadUrl =
      typeof downloadUrl === 'function' ? downloadUrl(payload, index) : downloadUrl

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          source_id: parseResourceToken(payload.resource_token).sourceId,
          platform: 'vimeo',
          download_mode: 'direct',
          download_url: activeDownloadUrl,
          filename,
          mime_type: mimeType,
          size,
          expires_at: null
        }
      })
    })
  })
}

async function mockV2ClientMuxIntent(
  page: import('@playwright/test').Page,
  onPayload?: (payload: V2DownloadPrePayload) => void,
  urls: (
    {
    videoUrl: string
    audioUrl: string
    } | ((payload: V2DownloadPrePayload, index: number) => {
      videoUrl: string
      audioUrl: string
    })
  ) = {
    videoUrl: CLIENT_MUX_VIDEO_TRACK_URL,
    audioUrl: CLIENT_MUX_AUDIO_TRACK_URL
  }
): Promise<void> {
  let callIndex = 0
  const payloadByToken = new Map<string, V2DownloadPrePayload>()

  await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
    const payload = route.request().postDataJSON() as V2DownloadPrePayload
    expectDownloadPrePayloadContract(payload)
    const tokenPayload = parseResourceToken(payload.resource_token)
    callIndex += 1
    const token = `v2-client-mux-token-${callIndex}`
    payloadByToken.set(token, payload)
    onPayload?.(payload)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          token,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          download_mode: tokenPayload.downloadMode,
          nodes: [{ node_id: 21, url: buildNodeUrl(21, 'download-v2') }]
        }
      })
    })
  })

  await page.route(buildNodeUrl(21, 'download-v2'), async route => {
    const tokenPayload = route.request().postDataJSON() as { token: string }
    const payload = payloadByToken.get(tokenPayload.token)
    if (!payload) {
      throw new Error(`[v2-test] missing client_mux download-pre payload for token=${tokenPayload.token}`)
    }
    const index = Number(tokenPayload.token.replace('v2-client-mux-token-', '')) || 1
    const activeUrls = typeof urls === 'function' ? urls(payload, index) : urls

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          source_id: parseResourceToken(payload.resource_token).sourceId,
          platform: 'vimeo',
          download_mode: 'client_mux',
          filename: 'vimeo-demo.mp4',
          mime_type: 'video/mp4',
          size: CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength + CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength,
          expires_at: null,
          video_track: {
            delivery: 'file',
            kind: 'video',
            url: activeUrls.videoUrl,
            mime_type: 'video/mp4',
            size: CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength
          },
          audio_track: {
            delivery: 'file',
            kind: 'audio',
            url: activeUrls.audioUrl,
            mime_type: 'audio/mp4',
            size: CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength
          }
        }
      })
    })
  })
}

/**
 * 匿名下载授权：status=3 表示后端要求登录。
 *
 * 未登录用户点击下载会先请求该接口，前端据此打开登录弹窗而不是直接失败。
 */
async function mockAnonymousDownloadRequiresLogin(page: Page): Promise<void> {
  await page.route(buildApiUrl('/api/client/media/download-anonymous-pre-v2'), async route => {
    expect(route.request().method()).toBe('POST')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 10000, msg: 'success', data: { status: 3 } })
    })
  })
}

async function mockAuthenticatedSession(
  page: import('@playwright/test').Page,
  {
    email = 'hydra@example.com',
    snapshots = [{ used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' }],
    avatarUrl = null,
    checkinClaimed = true,
    checkinEnded = false,
    checkinEntries,
    onMe,
    onCheckinEntry
  }: {
    email?: string
    avatarUrl?: string | null
    snapshots?: SessionSnapshot[]
    onMe?: (creditsBalance: number, callIndex: number) => void
    checkinClaimed?: boolean
    checkinEnded?: boolean
    checkinEntries?: CheckinEntryMock[]
    onCheckinEntry?: (request: Request, callIndex: number) => void
  } = {}
): Promise<void> {
  const safeSnapshots =
    snapshots.length > 0 ? snapshots : [{ used: 0, dailyLimit: 1, creditsBalance: 0, period: 'free' }]
  let authMeCallIndex = 0
  let checkinEntryCallIndex = 0

  await page.route(buildApiUrl('/api/client/auth/me'), async route => {
    const snapshot = safeSnapshots[Math.min(authMeCallIndex, safeSnapshots.length - 1)]
    const creditsBalance = snapshot?.creditsBalance ?? 88
    onMe?.(creditsBalance, authMeCallIndex)
    authMeCallIndex += 1

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          id: 42,
          username: 'hydra',
          email,
          avatar_url: avatarUrl,
          full_name: 'Hydra',
          credits_balance: creditsBalance,
          created_at: Date.now(),
          updated_at: Date.now()
        }
      })
    })
  })

  await page.route(buildApiUrl('/api/client/subscription/status'), async route => {
    throw new Error(`[credits-test] workspace must not request subscription/status: ${route.request().url()}`)
  })

  await page.route(buildApiUrl('/api/client/checkin/entry'), async route => {
    const request = route.request()
    const callIndex = checkinEntryCallIndex
    const snapshot = safeSnapshots[Math.min(callIndex, safeSnapshots.length - 1)]
    const entryCreditsBalance = snapshot?.creditsBalance ?? 88
    const entry =
      checkinEntries?.[Math.min(callIndex, checkinEntries.length - 1)] ??
      buildCheckinEntryMock({
        creditsBalance: entryCreditsBalance,
        todayClaimed: checkinClaimed,
        campaignEnded: checkinEnded
      })
    checkinEntryCallIndex += 1
    onCheckinEntry?.(request, callIndex)

    expect(request.method()).toBe('POST')
    expect(request.headers()['x-client-product']).toBe('web')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: entry
      })
    })
  })

  await page.route(buildApiUrl('/api/client/checkin/claim'), async route => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    const snapshot = safeSnapshots[Math.min(checkinEntryCallIndex, safeSnapshots.length - 1)]
    const claimedBalance = (snapshot?.creditsBalance ?? 88) + 6

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          claim_date: '2026-06-18',
          day_index: 1,
          reward_credits: 6,
          credits_balance: claimedBalance,
          today_claimed: true,
          campaign_ended: false,
          next_claim_at: '2026-06-19T00:00:00-04:00',
          next_claim_at_ts: Date.now() + 60 * 60 * 1000
        }
      })
    })
  })
}

async function mockCreditCheckout(
  page: import('@playwright/test').Page,
  {
    configs = CREDIT_CHECKOUT_CONFIGS,
    orderNo = 'ORD-CREDIT-E2E',
    invoiceUrl = 'https://checkout.clinkbill.com/pay/e2e-credit-invoice',
    supportMail = DEVELOPER_EMAIL,
    createOrderErrorCode = null,
    orderStatus = 2,
    callbackStatus = 3,
    onConfigs,
    onStatus
  }: {
    configs?: CreditCheckoutConfigMock[] | CreditCheckoutConfigMock[][]
    orderNo?: string
    invoiceUrl?: string
    supportMail?: string
    createOrderErrorCode?: number | null
    orderStatus?: number
    callbackStatus?: number
    onConfigs?: (callIndex: number) => void
    onStatus?: (callIndex: number) => void
  } = {}
): Promise<{
  createOrderPayloads: CreditCreateOrderPayload[]
  getConfigsCallCount(): number
  getStatusCallCount(): number
}> {
  const createOrderPayloads: CreditCreateOrderPayload[] = []
  let configsCallCount = 0
  let statusCallCount = 0

  await page.route(buildApiUrl('/api/client/credit/checkout-configs'), async route => {
    const callIndex = configsCallCount
    configsCallCount += 1
    onConfigs?.(callIndex)
    const responseConfigs = Array.isArray(configs[0])
      ? (configs[Math.min(callIndex, configs.length - 1)] as CreditCheckoutConfigMock[])
      : (configs as CreditCheckoutConfigMock[])

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          checkout_configs: responseConfigs
        }
      })
    })
  })

  await page.route(buildApiUrl('/api/client/order/create'), async route => {
    const payload = route.request().postDataJSON() as CreditCreateOrderPayload
    createOrderPayloads.push(payload)
    if (createOrderErrorCode !== null) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: createOrderErrorCode,
          msg: 'price changed',
          data: {}
        })
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          order_no: orderNo,
          amount: payload.amount,
          currency: payload.currency,
          expired_at: Date.now() + 30 * 60 * 1000,
          support_mail: supportMail,
          payment_data: {
            url: invoiceUrl
          }
        }
      })
    })
  })

  await page.route(buildApiUrl(`/api/client/order/status/${orderNo}`), async route => {
    onStatus?.(statusCallCount)
    statusCallCount += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          order_no: orderNo,
          product_class: 2,
          product_id: 'credit_50',
          product_name: '50 Credits',
          amount: 6300000,
          currency: 'USD',
          order_status: orderStatus,
          callback_status: callbackStatus,
          payment_method: orderStatus === 2 ? 'clink' : null,
          paid_at: orderStatus === 2 ? Date.now() : null,
          created_at: Date.now(),
          expired_at: Date.now() + 30 * 60 * 1000
        }
      })
    })
  })

  await page.route('https://checkout.clinkbill.com/**', async route => {
    await route.abort('aborted')
  })

  return {
    createOrderPayloads,
    getConfigsCallCount: () => configsCallCount,
    getStatusCallCount: () => statusCallCount
  }
}

function buildCheckinEntryMock({
  creditsBalance,
  todayClaimed,
  campaignEnded,
  today = '2026-06-18',
  dayIndex = campaignEnded ? 14 : 1,
  todayRewardCredits = campaignEnded ? 0 : 6,
  totalClaimDays = todayClaimed ? 1 : 0,
  nextClaimAt = todayClaimed ? '2026-06-19T00:00:00-04:00' : null,
  nextClaimAtTs = todayClaimed ? Date.now() + 60 * 60 * 1000 : null
}: CheckinEntryMockOptions): CheckinEntryMock {
  return {
    campaign_ended: campaignEnded,
    start_date: '2026-06-18',
    end_date: '2026-07-01',
    today,
    day_index: dayIndex,
    today_reward_credits: todayRewardCredits,
    today_claimed: todayClaimed,
    total_claim_days: totalClaimDays,
    credits_balance: creditsBalance,
    next_claim_at: nextClaimAt,
    next_claim_at_ts: nextClaimAtTs
  }
}

async function installStreamedDownloadMock(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input, init) => {
      const requestUrl =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)

      if (requestUrl.includes('/api/client/media/download-v2')) {
        return new Response(JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            source_id: 'source-video-1',
            platform: 'vimeo',
            download_mode: 'direct',
            download_url: 'https://vimeo-cdn.test/stream-video.mp4',
            filename: 'stream-video.mp4',
            mime_type: 'video/mp4',
            size: 6,
            expires_at: null
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      if (!requestUrl.startsWith('https://vimeo-cdn.test/')) {
        return originalFetch(input, init)
      }

      const firstChunk = new Uint8Array([1, 2])
      const secondChunk = new Uint8Array([3, 4, 5, 6])

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(firstChunk)
          setTimeout(() => {
            controller.enqueue(secondChunk)
            controller.close()
          }, 300)
        }
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '6',
          'accept-ranges': 'bytes'
        }
      })
    }
  })
}

async function installNeverEndingDownloadMock(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    type DownloadGuardTestWindow = Window & {
      __resolveNeverEndingDownload?: () => void
    }
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input, init) => {
      const requestUrl =
        typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)

      if (requestUrl.includes('/api/client/media/download-v2')) {
        return new Response(JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            source_id: 'source-video-1',
            platform: 'vimeo',
            download_mode: 'direct',
            download_url: 'https://vimeo-cdn.test/guarded-download.mp4',
            filename: 'guarded-download.mp4',
            mime_type: 'video/mp4',
            size: 8,
            expires_at: null
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }

      if (!requestUrl.startsWith('https://vimeo-cdn.test/')) {
        return originalFetch(input, init)
      }

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3, 4]))
          ;(window as DownloadGuardTestWindow).__resolveNeverEndingDownload = () => {
            controller.enqueue(new Uint8Array([5, 6, 7, 8]))
            controller.close()
          }
        }
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': '8',
          'accept-ranges': 'bytes'
        }
      })
    }
  })
}

async function installDownloadCapture(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    let lastDownloadName = ''
    let lastDownloadBytes: number[] = []
    let lastDownloadBytesReady: Promise<number[]> | null = null
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL)

    URL.createObjectURL = object => {
      if (object instanceof Blob) {
        lastDownloadBytesReady = object.arrayBuffer().then(buffer => {
          lastDownloadBytes = Array.from(new Uint8Array(buffer))
          return lastDownloadBytes
        })
      }
      return originalCreateObjectUrl(object)
    }

    HTMLAnchorElement.prototype.click = function click() {
      lastDownloadName = this.download
    }
    ;(window as Window & { __getLastDownloadName?: () => string }).__getLastDownloadName = () =>
      lastDownloadName
    ;(window as Window & { __getLastDownloadBytes?: () => number[] }).__getLastDownloadBytes = () =>
      lastDownloadBytes
    ;(window as Window & { __getLastDownloadBytesReady?: () => Promise<number[]> | null }).__getLastDownloadBytesReady = () =>
      lastDownloadBytesReady
  })
}

async function installLargeFileExtensionScrollCapture(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    type ScrollCaptureWindow = Window & {
      __largeFileExtensionScrollCount?: number
      __largeFileExtensionScrollTop?: number | null
      __getLargeFileExtensionScrollCount?: () => number
      __getLargeFileExtensionScrollTop?: () => number | null
    }
    const scrollWindow = window as ScrollCaptureWindow
    const originalScrollTo = window.scrollTo.bind(window)
    scrollWindow.__largeFileExtensionScrollCount = 0
    scrollWindow.__largeFileExtensionScrollTop = null
    window.scrollTo = function scrollTo(
      arg?: number | ScrollToOptions,
      y?: number
    ): void {
      const targetTop =
        typeof arg === 'number'
          ? y ?? window.scrollY
          : typeof arg?.top === 'number'
            ? arg.top
            : null
      if (targetTop !== null && typeof arg !== 'number' && arg.behavior === 'smooth') {
        scrollWindow.__largeFileExtensionScrollCount =
          (scrollWindow.__largeFileExtensionScrollCount ?? 0) + 1
        scrollWindow.__largeFileExtensionScrollTop = targetTop
      }
      if (typeof arg === 'number') {
        originalScrollTo(arg, y ?? window.scrollY)
        return
      }
      if (arg === undefined) {
        originalScrollTo()
        return
      }
      originalScrollTo(arg)
    }
    scrollWindow.__getLargeFileExtensionScrollCount = () =>
      scrollWindow.__largeFileExtensionScrollCount ?? 0
    scrollWindow.__getLargeFileExtensionScrollTop = () =>
      scrollWindow.__largeFileExtensionScrollTop ?? null
  })
}

async function readLargeFileExtensionScrollCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const scrollWindow = window as Window & {
      __getLargeFileExtensionScrollCount?: () => number
    }
    return scrollWindow.__getLargeFileExtensionScrollCount?.() ?? 0
  })
}

async function readLargeFileExtensionScrollTop(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(() => {
    const scrollWindow = window as Window & {
      __getLargeFileExtensionScrollTop?: () => number | null
    }
    return scrollWindow.__getLargeFileExtensionScrollTop?.() ?? null
  })
}

async function expectLargeFileExtensionScrollAvoidsHeader(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(async () => await readLargeFileExtensionScrollCount(page)).toBe(1)
  const scrollTop = await readLargeFileExtensionScrollTop(page)
  if (scrollTop === null) {
    throw new Error('[download-workspace e2e] Missing captured extension guide scroll top.')
  }

  const snapshot = await page.evaluate(capturedScrollTop => {
    const guide = document.querySelector<HTMLElement>(
      '[data-download-large-file-extension-inline]'
    )
    const header = document.querySelector<HTMLElement>('.header')
    if (!guide || !header) {
      throw new Error('[download-workspace e2e] Missing guide or header for scroll assertion.')
    }

    return {
      gap: guide.getBoundingClientRect().top + window.scrollY - capturedScrollTop,
      headerBottom: header.getBoundingClientRect().bottom
    }
  }, scrollTop)

  expect(snapshot.gap).toBeGreaterThan(snapshot.headerBottom)
}

async function expectUnsafeFileTypeConfirmVisible(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('[data-site-confirm-modal]')).toBeVisible()
  await expect(page.locator('[data-site-confirm-title]')).toContainText(
    UNSAFE_FILE_TYPE_CONFIRM_TITLE
  )
  await expect(page.locator('[data-site-confirm-message]')).toContainText(
    UNSAFE_FILE_TYPE_EXTENSION_COPY
  )
}

async function cancelUnsafeFileTypeConfirm(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-site-confirm-cancel].site-confirm-action').click()
  await expect(page.locator('[data-site-confirm-modal]')).toBeHidden()
}

async function confirmUnsafeFileTypeExtensionGuide(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.locator('[data-site-confirm-submit]').click()
  await expect(page.locator('[data-site-confirm-modal]')).toBeHidden()
}

async function readIndexedDbCheckpoint(
  page: import('@playwright/test').Page
): Promise<{
  downloadedBytes: number | null
  tempSize: number
  version: number | null
  storageType: string | null
  recoveryMode: string | null
}> {
  return page.evaluate(async () => {
    try {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('tg_homepage_download_checkpoint_v1')
        request.onupgradeneeded = () => {
          request.transaction?.abort()
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      if (!database.objectStoreNames.contains('checkpoint')) {
        database.close()
        return {
          downloadedBytes: null,
          tempSize: 0,
          version: null,
          storageType: null,
          recoveryMode: null
        }
      }

      const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

      const transaction = database.transaction('checkpoint', 'readonly')
      const store = transaction.objectStore('checkpoint')
      const status = await requestValue<{
        version?: number
        downloadedBytes?: number
        storageType?: string
        recoveryMode?: string
      } | undefined>(store.get('status'))
      const temp = await requestValue<Blob | undefined>(store.get('temp'))
      database.close()

      return {
        downloadedBytes:
          typeof status?.downloadedBytes === 'number' ? status.downloadedBytes : null,
        tempSize: temp?.size ?? 0,
        version: typeof status?.version === 'number' ? status.version : null,
        storageType: typeof status?.storageType === 'string' ? status.storageType : null,
        recoveryMode: typeof status?.recoveryMode === 'string' ? status.recoveryMode : null
      }
    } catch {
      return {
        downloadedBytes: null,
        tempSize: 0,
        version: null,
        storageType: null,
        recoveryMode: null
      }
    }
  })
}

async function mockSingleVideoParse(
  page: import('@playwright/test').Page,
  size = 1024
): Promise<void> {
  await mockMediaParseV2(page, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          original_link: 'https://vimeo.com/1194296700',
          canonical_link: 'https://vimeo.com/1194296700',
          platform: 'vimeo',
          resources: [
            {
              source_id: 'source-video-1',
              message_id: 'message-123',
              platform: 'vimeo',
              capabilities: {
                download: true,
              },
              filename: 'demo-video.mp4',
              type: 'video',
              size,
              mime_type: 'video/mp4',
              duration: 120,
              width: 1280,
              height: 720
            }
          ]
        }
      })
    })
  })
}

async function mockMediaParseResourceList(
  page: import('@playwright/test').Page,
  resources: readonly MediaParseResourceFixture[],
  canonicalLink = 'https://vimeo.com/1194296700'
): Promise<void> {
  await mockMediaParseV2(page, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          status: 'ok',
          original_link: canonicalLink,
          canonical_link: canonicalLink,
          platform: 'vimeo',
          resources: resources.map(resource => {
            const platform = resource.platform ?? 'vimeo'
            const downloadMode = resource.downloadMode ?? 'direct'
            return {
              source_id: resource.sourceId,
              message_id: resource.sourceId,
              resource_token: buildResourceToken({
                sourceId: resource.sourceId,
                platform,
                downloadMode,
                link: canonicalLink,
                size: resource.size
              }),
              platform,
              download_mode: downloadMode,
              capabilities: {
                download: true,
              },
              filename: resource.filename,
              kind: resource.type ?? 'video',
              type: resource.type ?? 'video',
              size: resource.size,
              mime_type: resource.mimeType
            }
          })
        }
      })
    })
  })
}

async function mockSingleVimeoParse(
  page: import('@playwright/test').Page,
  size = 8192
): Promise<void> {
  await mockMediaParseV2(page, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          original_link: 'https://vimeo.com/1194296700',
          canonical_link: 'https://vimeo.com/1194296700',
          platform: 'vimeo',
          resources: [
            {
              source_id: 'vimeo:1194296700:http-1080p',
              platform: 'vimeo',
              download_mode: 'direct',
              capabilities: {
                download: true,
              },
              filename: 'vimeo-demo.mp4',
              kind: 'video',
              size,
              mime_type: 'video/mp4',
              duration: 30,
              width: 1920,
              height: 1080,
              extra: {
                thumbnail_url: 'https://vimeo-cdn.test/thumb.jpg'
              }
            }
          ]
        }
      })
    })
  })
}

async function mockSingleClientMuxParse(page: import('@playwright/test').Page): Promise<void> {
  await mockMediaParseV2(page, async route => {
    const parsePayload = route.request().postDataJSON() as { link: string }
    expect(parsePayload.link).toBe(CLIENT_MUX_SAMPLE_LINK)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 10000,
        msg: 'success',
        data: {
          original_link: CLIENT_MUX_SAMPLE_LINK,
          canonical_link: CLIENT_MUX_SAMPLE_LINK,
          platform: 'vimeo',
          resources: [
            {
              source_id: 'vimeo:1194296700:client_mux:video-1080:audio-128',
              platform: 'vimeo',
              download_mode: 'client_mux',
              capabilities: {
                download: true,
              },
              filename: 'vimeo-demo.mp4',
              type: 'video',
              size: CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength + CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength,
              mime_type: 'video/mp4',
              duration: 14,
              width: 854,
              height: 480,
              extra: {
                video_size: CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength,
                audio_size: CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength
              }
            }
          ]
        }
      })
    })
  })
}

async function fulfillClientMuxTracks(page: import('@playwright/test').Page): Promise<void> {
  await page.route(floatUrl(CLIENT_MUX_VIDEO_TRACK_URL, 'expired'), async route => {
    await route.fulfill({
      status: 403,
      headers: { 'access-control-allow-origin': '*' },
      body: ''
    })
  })
  await page.route(floatUrl(CLIENT_MUX_AUDIO_TRACK_URL, 'expired'), async route => {
    await route.fulfill({
      status: 403,
      headers: { 'access-control-allow-origin': '*' },
      body: ''
    })
  })
  await page.route(CLIENT_MUX_VIDEO_TRACK_URL, async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'video/mp4',
        'content-length': String(CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength)
      },
      body: CLIENT_MUX_VIDEO_TRACK_BYTES
    })
  })
  await page.route(CLIENT_MUX_AUDIO_TRACK_URL, async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'audio/mp4',
        'content-length': String(CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength)
      },
      body: CLIENT_MUX_AUDIO_TRACK_BYTES
    })
  })
}

async function writeV2IndexedDbCheckpoint(
  page: import('@playwright/test').Page,
  updatedAt: number
): Promise<void> {
  await page.evaluate(async timestamp => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tg_homepage_download_checkpoint_v1', 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('checkpoint')) {
          database.createObjectStore('checkpoint')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('checkpoint', 'readwrite')
      const store = transaction.objectStore('checkpoint')
      store.put(
        {
          version: 2,
          link: 'https://vimeo.com/1194296700',
          sourceId: 'source-video-1',
          filename: 'idb-video.mp4',
          downloadedBytes: 4,
          totalBytes: 12,
          mimeType: 'video/mp4',
          updatedAt: timestamp,
          platform: 'vimeo',
          downloadMode: 'direct'
        },
        'status'
      )
      store.put(new Blob([new Uint8Array([1, 2, 3, 4])]), 'temp')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })

    database.close()
  }, updatedAt)
}

async function writeV3OpfsCheckpoint(
  page: import('@playwright/test').Page,
  updatedAt: number
): Promise<void> {
  await page.evaluate(async timestamp => {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>
    }
    if (typeof storage.getDirectory !== 'function') {
      throw new Error('OPFS is unavailable in this browser.')
    }

    const root = await storage.getDirectory()
    const tempHandle = await root.getFileHandle('download_tmp', { create: true })
    const tempWritable = await tempHandle.createWritable()
    await tempWritable.write(new Uint8Array([1, 2, 3, 4]))
    await tempWritable.close()

    const statusHandle = await root.getFileHandle('download_status_json', { create: true })
    const statusWritable = await statusHandle.createWritable()
    await statusWritable.write(JSON.stringify({
      version: 3,
      link: 'https://vimeo.com/1194296700',
      sourceId: 'source-video-1',
      filename: 'opfs-v3-video.mp4',
      downloadedBytes: 4,
      totalBytes: 12,
      mimeType: 'video/mp4',
      updatedAt: timestamp,
      platform: 'vimeo',
      downloadMode: 'direct',
      storageType: 'opfs',
      recoveryMode: 'resumable'
    }))
    await statusWritable.close()
  }, updatedAt)
}

async function readOpfsCheckpointStatus(
  page: import('@playwright/test').Page
): Promise<{ version: number | null; storageType: string | null; recoveryMode: string | null }> {
  return page.evaluate(async () => {
    try {
      const storage = navigator.storage as StorageManager & {
        getDirectory?: () => Promise<FileSystemDirectoryHandle>
      }
      if (typeof storage.getDirectory !== 'function') {
        return { version: null, storageType: null, recoveryMode: null }
      }
      const root = await storage.getDirectory()
      const handle = await root.getFileHandle('download_status_json')
      const file = await handle.getFile()
      const status = JSON.parse(await file.text()) as {
        version?: number
        storageType?: string
        recoveryMode?: string
      }
      return {
        version: typeof status.version === 'number' ? status.version : null,
        storageType: typeof status.storageType === 'string' ? status.storageType : null,
        recoveryMode: typeof status.recoveryMode === 'string' ? status.recoveryMode : null
      }
    } catch {
      return { version: null, storageType: null, recoveryMode: null }
    }
  })
}

async function writeOpfsResumeRecord(
  page: import('@playwright/test').Page,
  {
    mode = 'direct',
    filename = 'resume-video.mp4',
    tempFileName = 'download_resume_e2e_direct',
    bytes = [1, 2, 3, 4],
    totalBytes = 10,
    downloadUrl
  }: {
    mode?: V2DownloadMode
    filename?: string
    tempFileName?: string
    bytes?: number[]
    totalBytes?: number | null
    downloadUrl?: string
  } = {}
): Promise<void> {
  await page.evaluate(
    async fixture => {
      const storage = navigator.storage as StorageManager & {
        getDirectory?: () => Promise<FileSystemDirectoryHandle>
      }
      if (typeof storage.getDirectory !== 'function') {
        throw new Error('[e2e] writeOpfsResumeRecord: OPFS is unavailable.')
      }

      const root = await storage.getDirectory()
      const handle = await root.getFileHandle(fixture.tempFileName, { create: true })
      const writable = await handle.createWritable()
      await writable.write(new Uint8Array(fixture.bytes))
      await writable.close()

      window.localStorage.setItem(
        fixture.resumeKey,
        JSON.stringify({
          version: 1,
          mode: fixture.mode,
          platform: 'vimeo',
          link: 'https://vimeo.com/1194296700',
          sourceId: 'source-video-1',
          resourceToken: fixture.resourceToken,
          filename: fixture.filename,
          mimeType: 'video/mp4',
          downloadedBytes: fixture.bytes.length,
          totalBytes: fixture.totalBytes,
          updatedAt: Date.now(),
          persistent: true,
          storageType: 'opfs',
          recoveryMode: 'resumable',
          preferredNodeId: 21,
          methodState: {
            kind: 'single_file_range',
            tempFileName: fixture.tempFileName,
            downloadUrl: fixture.downloadUrl
          }
        })
      )
    },
    {
      mode,
      filename,
      tempFileName,
      bytes,
      totalBytes,
      downloadUrl,
      resourceToken: buildResourceToken({
        sourceId: 'source-video-1',
        platform: 'vimeo',
        downloadMode: mode,
        link: 'https://vimeo.com/1194296700',
        size: totalBytes
      }),
      resumeKey: STORAGE_KEYS.resumeRecord
    }
  )
}

/**
 * 探测当前浏览器能否真实写入 OPFS。
 *
 * 探测必须在站点源上执行：测试体开头页面停在 `about:blank`，它不是安全上下文，
 * `navigator.storage` 不存在，会恒判为不支持。用静态文件导航避免触发应用脚本副作用。
 *
 * 只认「能真实写入」的 OPFS，与 `download-storage-preflight.ts` 的能力判定一致：
 * 仅看 `getDirectory` 是否存在会把 WebKit 误判为支持（API 在但写入抛 UnknownError），
 * 用例会在无法恢复的环境里跑出与 OPFS 无关的失败。
 */
async function hasOpfsSupport(page: import('@playwright/test').Page): Promise<boolean> {
  if (!page.url().startsWith('http')) {
    await page.goto('/robots.txt', { waitUntil: 'domcontentloaded' })
  }
  return page.evaluate(async () => {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>
    }
    if (typeof storage?.getDirectory !== 'function') {
      return false
    }

    const probeFileName = `e2e_opfs_probe_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
    let root: FileSystemDirectoryHandle | null = null
    try {
      root = await storage.getDirectory()
      const handle = await root.getFileHandle(probeFileName, { create: true })
      const writable = await handle.createWritable()
      await writable.write(new Uint8Array([1]))
      await writable.close()
      return true
    } catch (error) {
      console.error(error)
      return false
    } finally {
      if (root) {
        try {
          await root.removeEntry(probeFileName)
        } catch (error) {
          console.error(error)
        }
      }
    }
  })
}

async function writeIndexedDbResumeRecord(
  page: import('@playwright/test').Page,
  mode: V2DownloadMode = 'direct',
  options: {
    resourceToken?: string
    omitResourceToken?: boolean
    filename?: string
  } = {}
): Promise<void> {
  const resourceToken = options.resourceToken ?? buildResourceToken({
    sourceId: 'source-video-1',
    platform: 'vimeo',
    downloadMode: mode,
    link: 'https://vimeo.com/123456789',
    size: 10
  })

  await page.evaluate(
    async fixture => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(fixture.databaseName, 1)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(fixture.storeName)) {
            database.createObjectStore(fixture.storeName)
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(fixture.storeName, 'readwrite')
        const store = transaction.objectStore(fixture.storeName)
        const record = {
            version: 1,
            mode: fixture.mode,
            platform: 'vimeo',
            link: 'https://vimeo.com/123456789',
            sourceId: 'source-video-1',
            filename: fixture.filename,
            mimeType: 'video/mp4',
            downloadedBytes: 0,
            totalBytes: 10,
            updatedAt: Date.now(),
            persistent: true,
            storageType: 'indexeddb',
            recoveryMode: 'restartable',
            preferredNodeId: 21,
            methodState: { kind: 'restartable_task' }
          }
        if (!fixture.omitResourceToken) {
          Object.assign(record, { resourceToken: fixture.resourceToken })
        }
        store.put(record, fixture.pendingKey)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      database.close()
    },
    {
      databaseName: DOWNLOAD_RESUME_IDB_DATABASE_NAME,
      storeName: DOWNLOAD_RESUME_IDB_STORE_NAME,
      pendingKey: DOWNLOAD_RESUME_IDB_PENDING_KEY,
      mode,
      resourceToken,
      omitResourceToken: options.omitResourceToken === true,
      filename: options.filename ?? 'restart-video.mp4'
    }
  )
}

async function readResumeRecord(
  page: import('@playwright/test').Page
): Promise<{ storageType: string | null; recoveryMode: string | null; downloadedBytes: number | null }> {
  return page.evaluate(
    async fixture => {
      const raw = window.localStorage.getItem(fixture.resumeKey)
      if (raw) {
        const parsed = JSON.parse(raw) as {
          storageType?: string
          recoveryMode?: string
          downloadedBytes?: number
        }
        return {
          storageType: parsed.storageType ?? null,
          recoveryMode: parsed.recoveryMode ?? null,
          downloadedBytes:
            typeof parsed.downloadedBytes === 'number' ? parsed.downloadedBytes : null
        }
      }

      try {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(fixture.databaseName)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        if (!database.objectStoreNames.contains(fixture.storeName)) {
          database.close()
          return { storageType: null, recoveryMode: null, downloadedBytes: null }
        }
        const value = await new Promise<{
          storageType?: string
          recoveryMode?: string
          downloadedBytes?: number
        } | undefined>((resolve, reject) => {
          const transaction = database.transaction(fixture.storeName, 'readonly')
          const request = transaction.objectStore(fixture.storeName).get(fixture.pendingKey)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        database.close()
        return {
          storageType: value?.storageType ?? null,
          recoveryMode: value?.recoveryMode ?? null,
          downloadedBytes:
            typeof value?.downloadedBytes === 'number' ? value.downloadedBytes : null
        }
      } catch {
        return { storageType: null, recoveryMode: null, downloadedBytes: null }
      }
    },
    {
      resumeKey: STORAGE_KEYS.resumeRecord,
      databaseName: DOWNLOAD_RESUME_IDB_DATABASE_NAME,
      storeName: DOWNLOAD_RESUME_IDB_STORE_NAME,
      pendingKey: DOWNLOAD_RESUME_IDB_PENDING_KEY
    }
  )
}

async function writeWorkspaceSnapshot(
  page: import('@playwright/test').Page,
  {
    ownerSub = `device:${STABLE_DEVICE_ID}`,
    deviceId = STABLE_DEVICE_ID,
    playback = null,
    legacyDownloadRequests = [],
    omitResourceToken = false
  }: {
    ownerSub?: string
    deviceId?: string
    playback?: Record<string, string | number | boolean | object | null> | null
    legacyDownloadRequests?: Array<Record<string, string | number | boolean | object | null>>
    omitResourceToken?: boolean
  } = {}
): Promise<void> {
  const parseResource = {
    ...buildWorkspaceSnapshotResource(),
    duration: 120,
    width: 1280,
    height: 720
  }
  if (omitResourceToken) {
    delete parseResource.resourceToken
  }

  await page.addInitScript(
    ({
      keys,
      ownerSubValue,
      deviceIdValue,
      playbackValue,
      parseResourceValue,
      legacyDownloadRequestValues
    }) => {
      const now = Date.now()
      window.localStorage.setItem(keys.deviceId, deviceIdValue)
      window.localStorage.setItem(
        keys.workspaceSnapshot,
        JSON.stringify({
          version: 2,
          updatedAtMs: now,
          expiresAtMs: now + 12 * 60 * 60 * 1000,
          owner: {
            sub: ownerSubValue,
            deviceId: deviceIdValue
          },
          parse: {
            originalLink: 'https://vimeo.com/1194296700',
            canonicalLink: 'https://vimeo.com/1194296700',
            resources: [parseResourceValue]
          },
          playback: playbackValue,
          downloadRequests: legacyDownloadRequestValues
        })
      )
    },
    {
      keys: STORAGE_KEYS,
      ownerSubValue: ownerSub,
      deviceIdValue: deviceId,
      playbackValue: playback,
      parseResourceValue: parseResource,
      legacyDownloadRequestValues: legacyDownloadRequests
    }
  )
}

test.describe('Download Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(keys => {
      window.localStorage.removeItem(keys.accessToken)
      window.localStorage.removeItem(keys.deviceId)
      window.localStorage.removeItem(keys.obsoleteDeviceId)
    }, STORAGE_KEYS)
  })

  test('localized homepage keeps parse only and shows the save-video guide', async ({
    page,
    context
  }) => {
    await setLanguageCookie(context, 'zh-CN')

    await gotoWorkspace(page, '/zh-cn/')

    await expect(page.locator('[data-download-parse-input]')).toBeVisible()
    await expect(page.locator('[data-download-parse-submit]')).toContainText(
      '粘贴 Vimeo 视频链接'
    )
    await expect(page.locator('[data-homepage-auth-panel]')).toHaveCount(0)
    await expect(page.locator('[data-download-account-entry]')).toBeHidden()
    await expect(page.locator('body')).not.toContainText('先解析，再决定是否安装')
    await expect(page.locator('body')).not.toContainText('首页现在就是最快的 Vimeo 下载入口。')
    await expect(page.locator('body')).not.toContainText('VIMEO 链接')
    await expect(page.locator('.download-results-helper')).toContainText(
      '粘贴公开的 Vimeo 视频链接，查看 Vimeo 提供的清晰度，并下载你需要的分辨率。'
    )

    const panelOrder = await page
      .locator('[data-download-workspace-shell]')
      .evaluate(shell => Array.from(shell.children).map(child => child.getAttribute('data-panel')))

    expect(panelOrder).toEqual(['parse'])

    await expect(page.locator('[data-homepage-howto]')).toContainText('3 步下载 Vimeo 视频')
    await expect(page.locator('[data-homepage-howto]')).toContainText(
      '最快的路径是上方的链接下载器'
    )
    await expect(page.locator('[data-homepage-howto-step]')).toHaveCount(3)
    await expect(page.locator('[data-homepage-faq]')).toContainText('常见问题')
    await expect(page.locator('[data-homepage-faq]')).toContainText(
      '可以下载私密或需要密码的 Vimeo 视频吗？'
    )
    await expect(page.locator('[data-homepage-faq]')).toContainText(
      '为什么下载器提示这个 Vimeo 视频是私密的？'
    )
    await expect(page.locator('[data-homepage-faq-item]')).toHaveCount(8)
    await expect(page.locator('[data-homepage-faq-item][open]')).toHaveCount(8)
  })

  test('visible homepage extension logos load eagerly while hidden reuse-page logos stay lazy', async ({
    page
  }) => {
    await gotoWorkspace(page)

    const homepageGuide = page.locator('[data-download-large-file-extension-inline]')
    const homepageNavLogo = page.locator('.nav-install-icon')
    const homepageChromeLogo = page.locator('.download-large-file-extension-logo-chrome')
    const homepageEdgeLogo = page.locator('.download-large-file-extension-logo-edge')

    await expect(homepageGuide).toBeVisible()
    await expect(homepageNavLogo).toHaveAttribute('fetchpriority', 'high')
    await expect(homepageChromeLogo).toHaveAttribute('loading', 'eager')
    await expect(homepageChromeLogo).toHaveAttribute('fetchpriority', 'high')
    await expect(homepageChromeLogo).toHaveAttribute('width', '50')
    await expect(homepageChromeLogo).toHaveAttribute('height', '50')
    await expect(homepageEdgeLogo).toHaveAttribute('loading', 'eager')
    await expect(homepageEdgeLogo).toHaveAttribute('width', '50')
    await expect(homepageEdgeLogo).toHaveAttribute('height', '50')

    await gotoWorkspace(page, '/vimeo-downloader/')

    const reusePageGuide = page.locator('[data-download-large-file-extension-inline]')
    const reusePageNavLogo = page.locator('.nav-install-icon')
    const reusePageChromeLogo = page.locator('.download-large-file-extension-logo-chrome')
    const reusePageEdgeLogo = page.locator('.download-large-file-extension-logo-edge')

    await expect(reusePageGuide).toBeHidden()
    await expect(reusePageNavLogo).not.toHaveAttribute('fetchpriority', 'high')
    await expect(reusePageChromeLogo).toHaveAttribute('loading', 'lazy')
    await expect(reusePageChromeLogo).not.toHaveAttribute('fetchpriority', 'high')
    await expect(reusePageEdgeLogo).toHaveAttribute('loading', 'lazy')
  })

  test('parse input clear button clears the current value', async ({ page }) => {
    await gotoWorkspace(page)

    const input = page.locator('[data-download-parse-input]')
    const clearButton = page.locator('[data-download-parse-clear]')

    await expect(clearButton).toBeHidden()
    await input.fill('https://vimeo.com/1194296700')
    await expect(clearButton).toBeVisible()
    await expect(clearButton).toHaveAttribute('aria-label', 'Clear input')

    await clearButton.click()

    await expect(input).toHaveValue('')
    await expect(clearButton).toBeHidden()
    await expect(input).toBeFocused()
  })

  test('invalid URL input shows local error without calling parse API', async ({ page }) => {
    const markTypes: string[] = []
    let parseCallCount = 0

    await page.route(buildApiUrl('/api/client/mark/record'), async route => {
      const payload = route.request().postDataJSON() as { mark_type: string }
      markTypes.push(payload.mark_type)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            recorded: true
          }
        })
      })
    })

    await mockMediaParseV2(page, async route => {
      parseCallCount += 1
      await route.abort()
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'not a url')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'This is not a valid URL.'
    )
    await expect(page.locator('[data-download-result-card]')).toHaveCount(0)
    expect(markTypes.filter(type => !WORKSPACE_LIFECYCLE_MARKS.has(type))).toEqual([])
    expect(parseCallCount).toBe(0)

    await page.fill('[data-download-parse-input]', 'www.vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'This is not a valid URL.'
    )
    expect(markTypes.filter(type => !WORKSPACE_LIFECYCLE_MARKS.has(type))).toEqual([])
    expect(parseCallCount).toBe(0)
  })

  test('parse form does not navigate before workspace runtime is ready', async ({ page }) => {
    await page.route('**/*', async route => {
      if (route.request().resourceType() === 'script') {
        await route.abort()
        return
      }

      await route.continue()
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const initialUrl = page.url()
    const input = page.locator('[data-download-parse-input]')
    await input.fill('https://vimeo.com/1194296700')

    await page.locator('[data-download-parse-submit]').click()
    await expect(page).toHaveURL(initialUrl)

    await input.press('Enter')
    await expect(page).toHaveURL(initialUrl)
    await expect(input).toHaveValue('https://vimeo.com/1194296700')
  })

  test('guest visit generates and persists a UUID device_id', async ({ page }) => {
    await gotoWorkspace(page)

    const deviceId = await waitForStoredDeviceId(page)

    expect(deviceId).toMatch(UUID_DEVICE_ID_PATTERN)
  })

  test('obsolete device storage is cleared and replaced by UUID device_id', async ({ page }) => {
    const legacyDeviceId = 'web-device-legacy-fixed'

    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value)
      },
      { key: STORAGE_KEYS.obsoleteDeviceId, value: legacyDeviceId }
    )

    await gotoWorkspace(page)

    const deviceId = await readStoredDeviceId(page)

    expect(deviceId).toMatch(UUID_DEVICE_ID_PATTERN)
    expect(deviceId).not.toBe(legacyDeviceId)
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.obsoleteDeviceId)
    ).toBe(null)
  })

  test('legacy device workspace snapshot is cleared after device key rotation', async ({ page }) => {
    const legacyDeviceId = 'web-fp-v1-legacy-fixed'
    await writeWorkspaceSnapshot(page, {
      ownerSub: `device:${legacyDeviceId}`,
      deviceId: legacyDeviceId
    })

    await gotoWorkspace(page)

    const migratedDeviceId = await readStoredDeviceId(page)
    expect(migratedDeviceId).toMatch(UUID_DEVICE_ID_PATTERN)
    expect(migratedDeviceId).not.toBe(legacyDeviceId)
    await expect(page.locator('[data-download-result-card]')).toHaveCount(0)
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.workspaceSnapshot)
    ).toBe(null)
  })

  test('invalid workspace snapshot is silently cleared on page load', async ({ page }) => {
    await page.addInitScript(keys => {
      window.localStorage.setItem(
        keys.deviceId,
        STABLE_DEVICE_ID
      )
      window.localStorage.setItem(keys.workspaceSnapshot, '{broken')
    }, STORAGE_KEYS)

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-parse-error]')).toBeHidden()
    await expect(page.locator('[data-download-auth-modal]')).toBeHidden()
    await expect(page.locator('[data-download-result-card]')).toHaveCount(0)
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.workspaceSnapshot)
    ).toBe(null)
  })

  test('workspace snapshot without resourceToken is cleared on page load', async ({ page }) => {
    await writeWorkspaceSnapshot(page, {
      omitResourceToken: true
    })

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-parse-error]')).toBeHidden()
    await expect(page.locator('[data-download-result-card]')).toHaveCount(0)
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.workspaceSnapshot)
    ).toBe(null)
  })

  test('owner-mismatched workspace snapshot is silently cleared on page load', async ({ page }) => {
    await writeWorkspaceSnapshot(page, {
      ownerSub: 'user:42'
    })

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-parse-error]')).toBeHidden()
    await expect(page.locator('[data-download-auth-modal]')).toBeHidden()
    await expect(page.locator('[data-download-result-card]')).toHaveCount(0)
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.workspaceSnapshot)
    ).toBe(null)
  })

  test('clearing localStorage creates a new UUID device_id', async ({ page }) => {
    await gotoWorkspace(page)

    const firstDeviceId = await readStoredDeviceId(page)
    expect(firstDeviceId).toMatch(UUID_DEVICE_ID_PATTERN)

    await page.evaluate(key => {
      window.localStorage.removeItem(key)
    }, STORAGE_KEYS.deviceId)

    await reloadWorkspace(page)

    const regeneratedDeviceId = await readStoredDeviceId(page)
    expect(regeneratedDeviceId).toMatch(UUID_DEVICE_ID_PATTERN)
    expect(regeneratedDeviceId).not.toBe(firstDeviceId)
  })

  test('UUID device_id does not depend on canvas availability', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null
    })

    await gotoWorkspace(page)

    const deviceId = await readStoredDeviceId(page)

    expect(deviceId).toMatch(UUID_DEVICE_ID_PATTERN)
  })

  test('clicking download while signed out opens auth modal before V2 authorization', async ({
    page,
    context
  }) => {
    await setLanguageCookie(context, 'zh-CN')

    await installDownloadCapture(page)
    await installV2OldMainPathGuards(page)
    await mockAnonymousDownloadRequiresLogin(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                type: 'video',
                size: 1024
              }
            ]
          }
        })
      })
    })

    let downloadPreCalled = false
    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      downloadPreCalled = true
      await route.abort()
    })

    await gotoWorkspace(page)

    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await page.click('[data-download-resource-button]')

    await expect(page.locator('[data-download-auth-modal]')).toBeVisible()
    expect(downloadPreCalled).toBe(false)
  })

  test('single unsafe resource is blocked before auth and download-pre', async ({ page }) => {
    await installLargeFileExtensionScrollCapture(page)
    await installV2OldMainPathGuards(page)
    await mockMediaParseResourceList(page, [
      {
        sourceId: 'source-unsafe-exe',
        filename: 'setup.exe',
        mimeType: 'video/mp4',
        size: 1024
      }
    ])

    let downloadPreCalled = false
    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      downloadPreCalled = true
      await route.abort()
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await expect(page.locator('[data-download-result-card]')).toContainText('setup.exe')

    await page.click('[data-download-resource-button]')

    expect(downloadPreCalled).toBe(false)
    await expect(page.locator('[data-download-auth-modal]')).toBeHidden()
    await expect(page.locator('[data-download-parse-error]')).toContainText(
      UNSAFE_FILE_TYPE_EXTENSION_COPY
    )
    await expectUnsafeFileTypeConfirmVisible(page)
    await expect.poll(async () => await readLargeFileExtensionScrollCount(page)).toBe(0)

    await cancelUnsafeFileTypeConfirm(page)
    await expect.poll(async () => await readLargeFileExtensionScrollCount(page)).toBe(0)

    await page.click('[data-download-resource-button]')
    await expectUnsafeFileTypeConfirmVisible(page)
    await confirmUnsafeFileTypeExtensionGuide(page)
    await expect(page.locator('[data-download-large-file-extension-inline]')).toBeVisible()
    await expectLargeFileExtensionScrollAvoidsHeader(page)
  })

  test('download auth modal starts a 60 second countdown after sending the code', async ({
    page
  }) => {
    await page.route(buildApiUrl('/api/client/auth/send-email-code'), async route => {
      const payload = route.request().postDataJSON() as { email: string }
      expect(payload.email).toBe('hydra@example.com')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {}
        })
      })
    })

    await gotoWorkspace(page)
    await openDownloadEmailAuthForm(page)

    await page.fill('[data-download-login-email]', 'hydra@example.com')
    await page.click('[data-download-continue-email]')
    await expect(page.locator('[data-download-send-code]')).toBeDisabled()
    await expect(page.locator('[data-download-send-code]')).toContainText('60')
    await page.waitForTimeout(1100)
    await expect(page.locator('[data-download-send-code]')).toContainText('59')
  })

  test('email code login stores token and refreshes quota summary', async ({ page }) => {
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 0, dailyLimit: 10, creditsBalance: 88, period: 'month' }]
    })

    await page.route(buildApiUrl('/api/client/auth/send-email-code'), async route => {
      const payload = route.request().postDataJSON() as { email: string }
      expect(payload.email).toBe('hydra@example.com')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {}
        })
      })
    })

    await page.route(buildApiUrl('/api/client/auth/email-verify-login'), async route => {
      const payload = route.request().postDataJSON() as { email: string; code: string }

      expect(payload.email).toBe('hydra@example.com')
      expect(payload.code).toBe('123456')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            access_token: 'fresh-token',
            user: {
              email: 'hydra@example.com',
              avatar_url: null,
              credits_balance: 72
            }
          }
        })
      })
    })

    await gotoWorkspace(page)
    await openDownloadEmailAuthForm(page)

    await page.fill('[data-download-login-email]', 'hydra@example.com')
    await page.click('[data-download-continue-email]')
    await page.fill('[data-download-login-code]', '123456')
    await page.click('[data-download-login-submit]')

    await expect(page.locator('[data-download-auth-modal]')).toBeHidden()
    await expect(page.locator('[data-download-account-entry]')).toBeVisible()
    await expect(page.locator('[data-download-credits-pill]')).toContainText('88 Credits')

    const storedToken = await page.evaluate(
      key => window.localStorage.getItem(key),
      STORAGE_KEYS.accessToken
    )
    expect(storedToken).toBe('fresh-token')
  })

  test('Google credential login refreshes Credits from auth me', async ({ page }) => {
    await installGoogleCredentialStub(page)
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'stale-token')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [
        { used: 0, dailyLimit: 10, creditsBalance: 12, period: 'month' },
        { used: 0, dailyLimit: 10, creditsBalance: 91, period: 'month' }
      ]
    })
    await mockSingleVideoParse(page)

    await page.route(buildApiUrl('/api/client/auth/google-login'), async route => {
      const payload = route.request().postDataJSON() as { credential: string }
      expect(payload.credential).toBe('google-e2e-credential')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            access_token: 'google-credential-token',
            user: {
              email: 'google-old@example.com',
              credits_balance: 5
            }
          }
        })
      })
    })

    // 下载鉴权失效后前端清空 token，并静默发起 One-Tap：凭据回调只在这条路径上注册。
    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 10013, msg: 'invalid access token', data: {} })
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')
    await expect(page.locator('[data-download-auth-modal]')).toBeVisible()

    await page.evaluate(() => {
      const trigger = (window as GoogleIdentityStubWindow).__triggerGoogleCredential
      if (!trigger) {
        throw new Error('[e2e] Google credential trigger is missing.')
      }
      trigger()
    })

    await expect(page.locator('[data-download-auth-modal]')).toBeHidden()
    await expect(page.locator('[data-download-account-entry]')).toBeVisible()
    await expect(page.locator('[data-download-credits-pill]')).toContainText('91 Credits')
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.accessToken)
    ).toBe('google-credential-token')
  })

  test('Google redirect login refreshes Credits from auth me', async ({ page }) => {
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 0, dailyLimit: 10, creditsBalance: 93, period: 'month' }]
    })

    await page.route(buildApiUrl('/api/client/auth/google/exchange'), async route => {
      const payload = route.request().postDataJSON() as { code: string }
      expect(payload.code).toBe('redirect-e2e-code')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            access_token: 'google-redirect-token',
            user: {
              email: 'redirect-old@example.com',
              credits_balance: 7
            }
          }
        })
      })
    })

    await gotoWorkspace(page, '/?google_login_code=redirect-e2e-code')

    await expect(page.locator('[data-download-account-entry]')).toBeVisible()
    await expect(page.locator('[data-download-credits-pill]')).toContainText('93 Credits')
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.accessToken)
    ).toBe('google-redirect-token')
    expect(new URL(page.url()).searchParams.get('google_login_code')).toBe(null)
  })

  test('authenticated homepage shows account entry and Credits balance', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' }]
    })

    await gotoWorkspace(page)

    await expect(
      page.locator('[data-download-results-heading] [data-download-account-entry]')
    ).toBeVisible()
    await expect(
      page.locator('[data-download-results-heading] [data-download-credits-pill]')
    ).toContainText('88 Credits')
    await expect(page.locator('[data-download-account-initial]')).toContainText('H')
    await page.locator('[data-download-account-button]').click()
    const accountEmail = page.locator('[data-download-account-email]')
    await expect(accountEmail).toHaveText('hydra@example.com')
    await accountEmail.click()
    await expect(page.locator('[data-download-account-menu]')).toBeVisible()
    await expect(page.locator('[data-download-account-logout]')).toBeVisible()
    await expect(page.locator('.download-parse-row [data-download-account-entry]')).toHaveCount(0)
  })

  test('mobile account menu stays inside viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 })
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' }]
    })

    await gotoWorkspace(page)
    const accountButton = page.locator('[data-download-account-button]')
    await accountButton.click()

    const menu = page.locator('[data-download-account-menu]')
    await expect(menu).toBeVisible()
    const buttonBox = await accountButton.boundingBox()
    const menuBox = await menu.boundingBox()
    if (!buttonBox) {
      throw new Error('[download-workspace-e2e] account button bounding box is missing.')
    }
    if (!menuBox) {
      throw new Error('[download-workspace-e2e] account menu bounding box is missing.')
    }
    expect(menuBox.x).toBeGreaterThanOrEqual(0)
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(360)
    expect(menuBox.y).toBeGreaterThan(buttonBox.y + buttonBox.height)
    expect(menuBox.x).toBe(buttonBox.x)
  })

  test('account entry uses auth me avatar and credits fallback when checkin entry fails', async ({
    page
  }) => {
    const avatarUrl = 'https://cdn.example.test/avatar-hydra.png'
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      avatarUrl,
      snapshots: [{ used: 0, dailyLimit: 10, creditsBalance: 27, period: 'month' }]
    })
    await page.route(buildApiUrl('/api/client/checkin/entry'), async route => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 50001,
          msg: 'checkin entry unavailable',
          data: {}
        })
      })
    })

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-account-avatar]')).toBeVisible()
    await expect(page.locator('[data-download-account-avatar]')).toHaveAttribute('src', avatarUrl)
    await expect(page.locator('[data-download-account-initial]')).toBeHidden()
    await expect(page.locator('[data-download-credits-pill]')).toContainText('27 Credits')
  })

  test('claim success updates Credits pill from claim response balance', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 0, dailyLimit: 10, creditsBalance: 18, period: 'month' }],
      checkinClaimed: false
    })

    await gotoWorkspace(page)
    await expect(page.locator('[data-download-credits-pill]')).toContainText('18 Credits')
    await page.click('[data-download-checkin-claim]')

    await expect(page.locator('[data-download-credits-pill]')).toContainText('24 Credits')
    await expect(page.locator('[data-download-checkin-title]')).toContainText('Your Daily Free Credits Are Ready!')
    await expect(page.locator('[data-download-checkin-today-reward]')).toContainText("Today's reward: 6 Credits")
    await expect(page.locator('[data-download-checkin-result]')).toContainText('You claimed 6 Credits today.')
  })

  test('manual Credits click refreshes stale claimed checkin into claimable state', async ({
    page
  }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )

    const entryCalls: number[] = []
    await mockAuthenticatedSession(page, {
      checkinEntries: [
        buildCheckinEntryMock({
          creditsBalance: 18,
          todayClaimed: true,
          campaignEnded: false,
          nextClaimAt: '2026-06-19T00:00:00-04:00',
          nextClaimAtTs: Date.now() - 1_000
        }),
        buildCheckinEntryMock({
          creditsBalance: 18,
          todayClaimed: false,
          campaignEnded: false,
          today: '2026-06-19',
          dayIndex: 2,
          totalClaimDays: 1,
          nextClaimAt: null,
          nextClaimAtTs: null
        })
      ],
      onCheckinEntry: (_request, callIndex) => {
        entryCalls.push(callIndex)
      }
    })

    await gotoWorkspace(page)
    await expect(page.locator('[data-download-checkin-modal]')).toBeHidden()

    await page.click('[data-download-credits-pill]')

    await expect.poll(() => entryCalls.length).toBe(2)
    await expect(page.locator('[data-download-checkin-modal]')).toBeVisible()
    await expect(page.locator('[data-download-checkin-title]')).toContainText('Your Daily Free Credits Are Ready!')
    await expect(page.locator('[data-download-checkin-today-reward]')).toContainText("Today's reward: 6 Credits")
    await expect(page.locator('[data-download-checkin-next]')).toBeHidden()
  })

  test('open claimed checkin modal refreshes after backend next claim timestamp passes', async ({
    page
  }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )

    const entryCalls: number[] = []
    const nextClaimAtTs = Date.now() + 2_500
    await mockAuthenticatedSession(page, {
      checkinEntries: [
        buildCheckinEntryMock({
          creditsBalance: 18,
          todayClaimed: true,
          campaignEnded: false,
          nextClaimAt: '2026-06-19T00:00:00-04:00',
          nextClaimAtTs
        }),
        buildCheckinEntryMock({
          creditsBalance: 18,
          todayClaimed: true,
          campaignEnded: false,
          nextClaimAt: '2026-06-19T00:00:00-04:00',
          nextClaimAtTs
        }),
        buildCheckinEntryMock({
          creditsBalance: 18,
          todayClaimed: false,
          campaignEnded: false,
          today: '2026-06-19',
          dayIndex: 2,
          totalClaimDays: 1,
          nextClaimAt: null,
          nextClaimAtTs: null
        })
      ],
      onCheckinEntry: (_request, callIndex) => {
        entryCalls.push(callIndex)
      }
    })

    await gotoWorkspace(page)
    await page.click('[data-download-credits-pill]')

    await expect(page.locator('[data-download-checkin-modal]')).toBeVisible()
    await expect(page.locator('[data-download-checkin-title]')).toContainText('Your Daily Free Credits Are Ready!')
    await expect(page.locator('[data-download-checkin-result]')).toContainText('You claimed 6 Credits today.')
    await expect(page.locator('[data-download-checkin-next]')).toBeVisible()
    await expect(page.locator('[data-download-checkin-next-at]')).toContainText(
      /\(Next refresh: \d{1,2}:\d{2} [AP]M EST\)/
    )

    await expect.poll(() => entryCalls.length, { timeout: 6_000 }).toBe(3)
    await expect(page.locator('[data-download-checkin-title]')).toContainText('Your Daily Free Credits Are Ready!')
    await expect(page.locator('[data-download-checkin-today-reward]')).toContainText("Today's reward: 6 Credits")
    await expect(page.locator('[data-download-checkin-next]')).toBeHidden()
  })

  test('manual Credits click ignores same-day auto dismiss storage', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
      window.localStorage.setItem(keys.accessToken, 'token-from-storage')
      window.localStorage.setItem(keys.deviceId, stableDeviceId)
      window.localStorage.setItem('download_checkin_auto_dismissed:42:2026-06-18', '1')
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, { checkinClaimed: false })

    await gotoWorkspace(page)
    await expect(page.locator('[data-download-checkin-modal]')).toBeHidden()

    await page.click('[data-download-credits-pill]')

    await expect(page.locator('[data-download-checkin-modal]')).toBeVisible()
    await expect(page.locator('[data-download-checkin-title]')).toContainText('Your Daily Free Credits Are Ready!')
    await expect(page.locator('[data-download-checkin-today-reward]')).toContainText("Today's reward: 6 Credits")
  })

  test('manual Credits click does not expose an invalid zero-credit claim', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )

    const claimRequests: string[] = []
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/client/checkin/claim') {
        claimRequests.push(request.url())
      }
    })
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 0, dailyLimit: 10, creditsBalance: 18, period: 'month' }],
      checkinEntries: [
        buildCheckinEntryMock({
          creditsBalance: 18,
          todayClaimed: false,
          campaignEnded: false,
          dayIndex: 14,
          todayRewardCredits: 0
        })
      ]
    })

    await gotoWorkspace(page)
    await page.click('[data-download-credits-pill]')

    await expect(page.locator('[data-download-checkin-modal]')).toBeHidden()
    await expect(page.locator('[data-download-checkin-claim]')).toBeHidden()
    expect(claimRequests).toHaveLength(0)
  })

  test('Credits pill opens purchase modal when balance is zero and today already claimed', async ({
    page
  }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 1, dailyLimit: 1, creditsBalance: 0, period: 'free' }],
      checkinClaimed: true
    })
    await mockCreditCheckout(page)

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-credits-pill]')).toContainText('0 Credits')
    await page.click('[data-download-credits-pill]')

    await expect(page.locator('[data-download-checkin-modal]')).toBeHidden()
    await expect(page.locator('[data-credit-purchase-modal]')).toBeVisible()
    await expect(page.locator('[data-credit-purchase-modal]')).toContainText('Get more Credits')
  })

  test('Credits pill opens purchase modal when balance is zero and checkin entry is unavailable', async ({
    page
  }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 1, dailyLimit: 1, creditsBalance: 0, period: 'free' }]
    })
    await page.route(buildApiUrl('/api/client/checkin/entry'), async route => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 50001,
          msg: 'checkin entry unavailable',
          data: {}
        })
      })
    })
    await mockCreditCheckout(page)

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-credits-pill]')).toContainText('0 Credits')
    await page.click('[data-download-credits-pill]')

    await expect(page.locator('[data-download-checkin-modal]')).toBeHidden()
    await expect(page.locator('[data-credit-purchase-modal]')).toBeVisible()
    await expect(page.locator('[data-credit-purchase-modal]')).toContainText('Get more Credits')
  })

  test('ended checkin keeps Credits pill enabled but manual click does not open modal when balance remains positive', async ({
    page
  }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [{ used: 0, dailyLimit: 10, creditsBalance: 31, period: 'month' }],
      checkinClaimed: false,
      checkinEnded: true
    })

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-credits-pill]')).toContainText('31 Credits')
    await expect(page.locator('[data-download-credits-pill]')).toBeEnabled()
    await page.click('[data-download-credits-pill]')
    await expect(page.locator('[data-download-checkin-modal]')).toBeHidden()
    await expect(page.locator('[data-credit-purchase-modal]')).toBeHidden()
  })

  test('parse success renders download result cards', async ({ page }) => {
    await mockMediaParseV2(page, async route => {
      const request = route.request()
      const parsePayload = request.postDataJSON() as { link: string }

      expect(parsePayload.link).toBe('https://vimeo.com/1194296700')
      expect(request.headers()['x-client-product']).toBe('web')
      expect(request.headers()['x-device-id']).toBeTruthy()

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 2715009,
                width: 720,
                height: 1280,
                duration: 20
              }
            ]
          }
        })
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-result-card]')).toHaveCount(1)
    await expect(page.locator('[data-download-result-card]').first()).toContainText(
      'demo-video.mp4'
    )
    await expect(page.locator('[data-download-result-card]').first()).toContainText('VIDEO')
    await expect(page.locator('[data-download-result-card]').first()).toContainText('00:20')
    await expect(page.locator('[data-download-result-card]').first()).toContainText('720×1280')
    await expect(page.locator('[data-download-result-card]').first()).toContainText('2.6 MB')
  })

  test('download below 500MiB keeps the normal web download path', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await mockSingleVideoParse(page, 500 * 1024 * 1024 - 1)

    const requestedSourceIds: string[] = []
    await mockV2DirectDownload(page, {
      onPrePayload: payload => {
        requestedSourceIds.push(getPayloadSourceId(payload))
      }
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect.poll(() => requestedSourceIds).toEqual(['source-video-1'])
  })

  test('refresh warns only while a download is still running', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await installNeverEndingDownloadMock(page)
    await mockAuthenticatedSession(page)
    await mockSingleVideoParse(page, 8)
    await mockV2DownloadPre(page, { nodeIds: [21] })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await expect(page.locator('[data-download-result-card]')).toContainText('demo-video.mp4')

    expect(await isBeforeUnloadPrevented(page)).toBe(false)

    await page.click('[data-download-resource-button]')
    await expect(page.locator('[data-download-resource-button]')).toContainText('Downloading')
    expect(await isBeforeUnloadPrevented(page)).toBe(true)
    await expect
      .poll(() =>
        page.evaluate(() => {
          type DownloadGuardTestWindow = Window & {
            __resolveNeverEndingDownload?: () => void
          }
          return typeof (window as DownloadGuardTestWindow).__resolveNeverEndingDownload
        })
      )
      .toBe('function')

    await page.evaluate(() => {
      type DownloadGuardTestWindow = Window & {
        __resolveNeverEndingDownload?: () => void
      }
      ;(window as DownloadGuardTestWindow).__resolveNeverEndingDownload?.()
    })
    // 按钮文案 'Download' 是 'Downloading' 的子串，完成态必须等到 download 真正释放 activeDownload。
    await expect.poll(() => isBeforeUnloadPrevented(page)).toBe(false)

    await page.click('[data-download-resource-button]')
    await expect(page.locator('[data-download-resource-button]')).toContainText('Downloading')

    const downloadDialogPromise = page.waitForEvent('dialog')
    await page.close({ runBeforeUnload: true })
    const downloadDialog = await downloadDialogPromise
    expect(downloadDialog.type()).toBe('beforeunload')
    await downloadDialog.dismiss()
  })

  test.describe('media download v2 node flow', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
    })

    test('direct and client_mux both use download-pre-v2 and no-referrer material fetches', async ({
      page
    }) => {
      await page.addInitScript(keys => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
      }, STORAGE_KEYS)
      await mockAuthenticatedSession(page)
      await installDownloadCapture(page)
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11])

      let parseMode: 'direct' | 'client_mux' = 'direct'
      await page.route(buildNodeUrl(11, 'parse-v2'), async route => {
        await buildParseV2MockRoute(route).fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 10000,
            msg: 'success',
            data: {
              status: 'ok',
              original_link: 'https://vimeo.com/1194296700',
              canonical_link: 'https://vimeo.com/1194296700',
              platform: 'vimeo',
              resources: [
                {
                  source_id:
                    parseMode === 'direct'
                      ? 'vimeo:1194296700:http-1080p'
                      : 'vimeo:1194296700:client_mux:video-1080:audio-128',
                  platform: 'vimeo',
                  download_mode: parseMode,
                  capabilities: { download: true },
                  filename: 'vimeo-demo.mp4',
                  type: 'video',
                  size: parseMode === 'direct'
                    ? 8192
                    : CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength + CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength,
                  mime_type: 'video/mp4'
                }
              ]
            }
          })
        })
      })

      const prePayloads: V2DownloadPrePayload[] = []
      await mockV2DownloadPre(page, {
        nodeIds: [21],
        onPayload: payload => {
          prePayloads.push(payload)
        }
      })
      await page.route(buildNodeUrl(21, 'download-v2'), async route => {
        const payload = route.request().postDataJSON() as { token: string }
        const latestPrePayload = prePayloads[prePayloads.length - 1]
        const mode = latestPrePayload ? getPayloadDownloadMode(latestPrePayload) : null
        expect(payload.token).toMatch(/^v2-token-\d+$/)
        if (mode === 'direct') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 10000,
              msg: 'success',
              data: {
                source_id: 'vimeo:1194296700:http-1080p',
                platform: 'vimeo',
                download_mode: 'direct',
                download_url: 'https://cdn.vimeo.test/video.mp4?token=secret-direct-token',
                filename: 'vimeo-node.mp4',
                mime_type: 'video/mp4',
                size: 8192,
                expires_at: null
              }
            })
          })
          return
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 10000,
            msg: 'success',
            data: {
              source_id: 'vimeo:1194296700:client_mux:video-1080:audio-128',
              platform: 'vimeo',
              download_mode: 'client_mux',
              filename: 'vimeo-demo.mp4',
              mime_type: 'video/mp4',
              size: CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength + CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength,
              expires_at: null,
              video_track: {
                delivery: 'file',
                kind: 'video',
                url: `${CLIENT_MUX_VIDEO_TRACK_URL}?token=secret-video-token`,
                mime_type: 'video/mp4',
                size: CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength
              },
              audio_track: {
                delivery: 'file',
                kind: 'audio',
                url: `${CLIENT_MUX_AUDIO_TRACK_URL}?token=secret-audio-token`,
                mime_type: 'audio/mp4',
                size: CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength
              }
            }
          })
        })
      })

      const materialReferrers: string[] = []
      await page.route('https://cdn.vimeo.test/video.mp4*', async route => {
        materialReferrers.push(route.request().headers().referer ?? '')
        await route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'content-type': 'video/mp4',
            'content-length': '4'
          },
          body: 'demo'
        })
      })
      await page.route(`${CLIENT_MUX_VIDEO_TRACK_URL}*`, async route => {
        materialReferrers.push(route.request().headers().referer ?? '')
        await route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'content-type': 'video/mp4',
            'content-length': String(CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength)
          },
          body: CLIENT_MUX_VIDEO_TRACK_BYTES
        })
      })
      await page.route(`${CLIENT_MUX_AUDIO_TRACK_URL}*`, async route => {
        materialReferrers.push(route.request().headers().referer ?? '')
        await route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'content-type': 'audio/mp4',
            'content-length': String(CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength)
          },
          body: CLIENT_MUX_AUDIO_TRACK_BYTES
        })
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')
      await expect
        .poll(() => prePayloads.some(payload => getPayloadDownloadMode(payload) === 'direct'))
        .toBe(true)
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & { __getLastDownloadName?: () => string }
              ).__getLastDownloadName?.() || ''
          )
        )
        .toBe('vimeo-node.mp4')

      parseMode = 'client_mux'
      await page.fill('[data-download-parse-input]', CLIENT_MUX_SAMPLE_LINK)
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')
      await expect
        .poll(() => prePayloads.some(payload => getPayloadDownloadMode(payload) === 'client_mux'))
        .toBe(true)

      expect(getPayloadDownloadModes(prePayloads)).toContain('direct')
      expect(getPayloadDownloadModes(prePayloads)).toContain('client_mux')
      expect(materialReferrers.length).toBeGreaterThan(0)
      expect(materialReferrers.every(referrer => referrer === '')).toBe(true)
    })

    test('parse-v2 business error stops without trying the next parse node', async ({ page }) => {
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11, 12])
      let secondNodeCalled = false
      await page.route(buildNodeUrl(11, 'parse-v2'), async route => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 24031,
            msg: 'unsupported platform',
            data: {}
          })
        })
      })
      await page.route(buildNodeUrl(12, 'parse-v2'), async route => {
        secondNodeCalled = true
        await route.abort()
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://unsupported.example/video')
      await page.click('[data-download-parse-submit]')

      await expect(page.locator('[data-download-parse-error]')).toBeVisible()
      await expect(page.locator('[data-download-parse-error]')).toContainText(
        'This link platform is not supported.'
      )
      expect(secondNodeCalled).toBe(false)
    })

    test('download-pre runs once per authenticated download action', async ({
      page
    }) => {
      await installDownloadCapture(page)
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11])
      await mockV2ParseNode(page, { nodeId: 11 })

      const prePayloads: V2DownloadPrePayload[] = []
      await mockV2DownloadPre(page, {
        nodeIds: [21],
        onPayload: payload => {
          prePayloads.push(payload)
        }
      })
      await page.route(buildNodeUrl(21, 'download-v2'), async route => {
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': '4',
            'content-disposition': 'attachment; filename="node-video.mp4"'
          },
          body: 'demo'
        })
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')
      await page.click('[data-download-resource-button]')
      await expect.poll(() => prePayloads.length).toBe(2)

      expect(getPayloadSourceIds(prePayloads)).toEqual(['source-video-1', 'source-video-1'])
    })

    test('mixed Download all downloads allowed resources and guides skipped unsafe resources', async ({
      page
    }) => {
      await installDownloadCapture(page)
      await installLargeFileExtensionScrollCapture(page)
      await installV2OldMainPathGuards(page)
      await mockMediaParseResourceList(page, [
        {
          sourceId: 'source-safe-mp4',
          filename: 'safe-video.mp4',
          mimeType: 'video/mp4',
          size: 1024
        },
        {
          sourceId: 'source-unsafe-exe',
          filename: 'setup.exe',
          mimeType: 'video/mp4',
          size: 1024
        }
      ])

      const prePayloads: V2DownloadPrePayload[] = []
      await mockV2DirectDownload(page, {
        filename: '',
        onPrePayload: payload => {
          prePayloads.push(payload)
        }
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      await expect(page.locator('[data-download-result-card]')).toHaveCount(2)
      await expect(page.locator('[data-download-all-button]')).toContainText('Download all')

      await page.click('[data-download-all-button]')

      await expect.poll(() => prePayloads.length).toBe(1)
      expect(getPayloadSourceIds(prePayloads)).toEqual(['source-safe-mp4'])
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & { __getLastDownloadName?: () => string }
              ).__getLastDownloadName?.() || ''
          )
        )
        .toBe('safe-video.mp4')
      await expect(page.locator('[data-download-parse-error]')).toContainText(
        UNSAFE_FILE_TYPE_EXTENSION_COPY
      )
      await expect(page.locator('[data-download-parse-error]')).not.toContainText(
        'Some files downloaded. Some files failed.'
      )
      await expectUnsafeFileTypeConfirmVisible(page)
      await expect.poll(async () => await readLargeFileExtensionScrollCount(page)).toBe(0)

      await confirmUnsafeFileTypeExtensionGuide(page)
      await expect(page.locator('[data-download-large-file-extension-inline]')).toBeVisible()
      await expectLargeFileExtensionScrollAvoidsHeader(page)
    })

    test('download-pre file type rejection shows unsafe extension guidance', async ({
      page
    }) => {
      await installLargeFileExtensionScrollCapture(page)
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11])
      await mockV2ParseNode(page, { nodeId: 11 })

      let preCallCount = 0
      let downloadNodeCallCount = 0
      await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
        preCallCount += 1
        const payload = route.request().postDataJSON() as V2DownloadPrePayload
        expectDownloadPrePayloadContract(payload)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 24049,
            msg: 'file type not allowed',
            data: {}
          })
        })
      })
      await page.route(buildNodeUrl(21, 'download-v2'), async route => {
        downloadNodeCallCount += 1
        await route.abort()
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')

      await expect.poll(() => preCallCount).toBe(1)
      expect(downloadNodeCallCount).toBe(0)
      await expect(page.locator('[data-download-auth-modal]')).toBeHidden()
      await expect(page.locator('[data-download-parse-error]')).toContainText(
        UNSAFE_FILE_TYPE_EXTENSION_COPY
      )
      await expectUnsafeFileTypeConfirmVisible(page)
      await expect.poll(async () => await readLargeFileExtensionScrollCount(page)).toBe(0)

      await confirmUnsafeFileTypeExtensionGuide(page)
      await expect(page.locator('[data-download-large-file-extension-inline]')).toBeVisible()
      await expectLargeFileExtensionScrollAvoidsHeader(page)
    })

    test('token expired stops node switching and reauthorizes in the method runner', async ({
      page
    }) => {
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11])
      await mockV2ParseNode(page, { nodeId: 11 })

      const prePayloads: V2DownloadPrePayload[] = []
      await mockV2DownloadPre(page, {
        nodeIds: [21, 22],
        onPayload: payload => {
          prePayloads.push(payload)
        }
      })
      const downloadNodeCalls: number[] = []
      await page.route(buildNodeUrl(21, 'download-v2'), async route => {
        downloadNodeCalls.push(21)
        if (downloadNodeCalls.length === 1) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 24036,
              msg: 'token expired',
              data: {}
            })
          })
          return
        }

        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': '4',
            'content-disposition': 'attachment; filename="fresh-token.mp4"'
          },
          body: 'demo'
        })
      })
      await page.route(buildNodeUrl(22, 'download-v2'), async route => {
        downloadNodeCalls.push(22)
        await route.abort()
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')

      await expect.poll(() => prePayloads.length).toBe(2)
      expect(getPayloadSourceIds(prePayloads)).toEqual(['source-video-1', 'source-video-1'])
      await expect.poll(() => downloadNodeCalls).toEqual([21, 21])
    })

    test('auth me 401 clears stale token and opens auth before download-pre', async ({
      page
    }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await page.route(buildApiUrl('/api/client/auth/me'), async route => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 10013,
            msg: 'invalid access token',
            data: {}
          })
        })
      })
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11])
      await mockV2ParseNode(page, { nodeId: 11 })
      await mockAnonymousDownloadRequiresLogin(page)

      let downloadPreCalled = false
      await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
        downloadPreCalled = true
        await route.abort()
      })

      await gotoWorkspace(page)
      expect(
        await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.accessToken)
      ).toBe(null)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')

      await expect(page.locator('[data-download-auth-modal]')).toBeVisible()
      expect(downloadPreCalled).toBe(false)
    })

    test('download-pre invalid login identity opens auth modal without retrying', async ({
      page
    }) => {
      await installDownloadCapture(page)
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11])
      await mockV2ParseNode(page, { nodeId: 11 })

      const prePayloads: V2DownloadPrePayload[] = []
      const preHeaders: Record<string, string>[] = []
      await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
        const payload = route.request().postDataJSON() as V2DownloadPrePayload
        prePayloads.push(payload)
        preHeaders.push(route.request().headers())
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 24046,
            msg: 'invalid login identity',
            data: {}
          })
        })
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')

      await expect.poll(() => prePayloads.length).toBe(1)
      expect(preHeaders[0]?.authorization).toBe('Bearer token-from-storage')
      await expect(page.locator('[data-download-auth-modal]')).toBeVisible()
    })

    test('download-pre unavailable can be retried on the next click', async ({
      page
    }) => {
      await installV2OldMainPathGuards(page)
      await mockV2ParsePre(page, [11])
      await mockV2ParseNode(page, { nodeId: 11 })

      const prePayloads: V2DownloadPrePayload[] = []
      await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
        const payload = route.request().postDataJSON() as V2DownloadPrePayload
        prePayloads.push(payload)
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 24048,
            msg: 'download-pre unavailable',
            data: {}
          })
        })
      })

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
      await page.click('[data-download-parse-submit]')
      const downloadButton = page.locator('[data-download-resource-button]')
      await downloadButton.click()
      await expect.poll(() => prePayloads.length).toBe(1)
      await expect(downloadButton).toContainText('Download')
      await downloadButton.click()
      await expect.poll(() => prePayloads.length).toBe(2)

      expect(getPayloadSourceIds(prePayloads)).toEqual(['source-video-1', 'source-video-1'])
    })
  })

  test('download at 500MiB keeps the web path on mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile behavior is only verified in Mobile Chrome.')

    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await mockSingleVideoParse(page, 500 * 1024 * 1024)

    const requestedSourceIds: string[] = []
    await mockV2DirectDownload(page, {
      onPrePayload: payload => {
        requestedSourceIds.push(getPayloadSourceId(payload))
      }
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect.poll(() => requestedSourceIds).toEqual(['source-video-1'])
  })

  test('Vimeo media at 500MiB keeps the normal platform download path', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'Mobile Chrome', 'Desktop-only large-file warning is verified on desktop.')

    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await installDownloadCapture(page)
    await mockSingleVimeoParse(page, 500 * 1024 * 1024)

    let directIntentSourceId = ''
    await mockV2DirectIntent(page, 'https://vimeo-cdn.test/large-video.mp4', payload => {
      directIntentSourceId = getPayloadSourceId(payload)
    }, {
      size: 500 * 1024 * 1024
    })
    await page.route('https://vimeo-cdn.test/large-video.mp4', async route => {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'accept-ranges': 'bytes',
          'content-type': 'video/mp4',
          'content-length': '4'
        },
        body: 'demo'
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await page.click('[data-download-resource-button]')

    await expect.poll(() => directIntentSourceId).toBe('vimeo:1194296700:http-1080p')
  })

  test('pressing Enter in the parse input submits the current link', async ({ page }) => {
    let parsePayload: { link: string } | null = null

    await mockMediaParseV2(page, async route => {
      parsePayload = route.request().postDataJSON() as { link: string }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 2715009
              }
            ]
          }
        })
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.press('[data-download-parse-input]', 'Enter')

    await expect(page.locator('[data-download-result-card]')).toHaveCount(1)
    expect(parsePayload).toEqual({ link: 'https://vimeo.com/1194296700' })
  })

  test('Vimeo media uses direct intent and downloads from CDN', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await mockCreditCheckout(page)
    await installDownloadCapture(page)
    await mockSingleVimeoParse(page)

    let directIntentPayload: V2DownloadPrePayload | null = null
    await mockV2DirectIntent(page, 'https://vimeo-cdn.test/video.mp4', payload => {
      directIntentPayload = {
        ...payload
      }
    })

    await installV2OldMainPathGuards(page)
    await page.route('https://vimeo-cdn.test/video.mp4', async route => {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'accept-ranges': 'bytes',
          'content-type': 'video/mp4',
          'content-length': '4'
        },
        body: 'demo'
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-result-card]')).toContainText('vimeo-demo.mp4')
    await expect(page.locator('[data-download-play-button]')).toHaveCount(0)
    await expect(page.locator('.download-result-thumbnail')).toHaveAttribute(
      'src',
      'https://vimeo-cdn.test/thumb.jpg'
    )

    await page.click('[data-download-resource-button]')

    await expect
      .poll(() => (directIntentPayload ? getPayloadSourceId(directIntentPayload) : ''))
      .toBe(
      'vimeo:1194296700:http-1080p'
    )
    expect(directIntentPayload ? getPayloadDownloadMode(directIntentPayload) : null).toBe('direct')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as Window & { __getLastDownloadName?: () => string }
            ).__getLastDownloadName?.() || ''
        )
      )
      .toBe('vimeo-demo.mp4')
  })

  test.describe('client mux local stream downloads', () => {
    test.skip(
      ({ browserName }) => browserName === 'webkit',
      'WebKit has an existing local stream download limitation in CI.'
    )

    test('Vimeo multi-track video uses client mux intent and downloads an MP4', async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
      await installDownloadCapture(page)
      await mockSingleClientMuxParse(page)
      await fulfillClientMuxTracks(page)

      let clientMuxPayload: V2DownloadPrePayload | null = null
      await mockV2ClientMuxIntent(page, payload => {
        clientMuxPayload = payload
      })
      await installV2OldMainPathGuards(page)

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', CLIENT_MUX_SAMPLE_LINK)
      await page.click('[data-download-parse-submit]')

      const card = page.locator('[data-download-result-card]')
      await expect(card).toContainText('vimeo-demo.mp4')
      await expect(page.locator('[data-download-all-button]')).toBeHidden()
      await expect(page.locator('[data-download-resource-button]')).toHaveAttribute(
        'data-download-mode',
        'client_mux'
      )

      await page.click('[data-download-resource-button]')

      await expect
        .poll(() => (clientMuxPayload ? getPayloadSourceId(clientMuxPayload) : ''))
        .toBe('vimeo:1194296700:client_mux:video-1080:audio-128')
      expect(clientMuxPayload ? getPayloadLink(clientMuxPayload) : null).toBe(
        'https://vimeo.com/1194296700'
      )
      expect(clientMuxPayload ? getPayloadDownloadMode(clientMuxPayload) : null).toBe('client_mux')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & { __getLastDownloadName?: () => string }
              ).__getLastDownloadName?.() || ''
          )
        )
        .toBe('vimeo-demo.mp4')
    })

    test('client mux download clears stale pending resume record before starting', async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
      await installDownloadCapture(page)
      await mockSingleClientMuxParse(page)
      await fulfillClientMuxTracks(page)
      await mockV2ClientMuxIntent(page)
      await installV2OldMainPathGuards(page)

      await gotoWorkspace(page)
      await writeIndexedDbResumeRecord(page, 'direct')
      await page.fill('[data-download-parse-input]', CLIENT_MUX_SAMPLE_LINK)
      await page.click('[data-download-parse-submit]')
      await expect(page.locator('[data-download-resource-button]')).toHaveAttribute(
        'data-download-mode',
        'client_mux'
      )

      await page.click('[data-download-resource-button]')

      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as Window & { __getLastDownloadName?: () => string }
              ).__getLastDownloadName?.() || ''
          )
        )
        .toBe('vimeo-demo.mp4')
      await expect.poll(async () => await readResumeRecord(page)).toEqual({
        storageType: null,
        recoveryMode: null,
        downloadedBytes: null
      })

      await reloadWorkspace(page)
      await expect(page.locator('[data-download-pending-resume-actions]')).toBeHidden()
    })

    test('client mux track 403 shows download failed copy', async ({
      page
    }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
      await installDownloadCapture(page)
      await mockSingleClientMuxParse(page)
      await fulfillClientMuxTracks(page)

      const intentPayloads: V2DownloadPrePayload[] = []
      await mockV2ClientMuxIntent(
        page,
        payload => {
          intentPayloads.push(payload)
        },
        (_payload, index) =>
          index === 1
            ? {
                videoUrl: floatUrl(CLIENT_MUX_VIDEO_TRACK_URL, 'expired'),
                audioUrl: floatUrl(CLIENT_MUX_AUDIO_TRACK_URL, 'expired')
              }
            : {
                videoUrl: CLIENT_MUX_VIDEO_TRACK_URL,
                audioUrl: CLIENT_MUX_AUDIO_TRACK_URL
              }
      )

      await gotoWorkspace(page)
      await page.fill('[data-download-parse-input]', CLIENT_MUX_SAMPLE_LINK)
      await page.click('[data-download-parse-submit]')
      await page.click('[data-download-resource-button]')

      await expect.poll(() => intentPayloads.length).toBe(1)
      expect(getPayloadDownloadMode(intentPayloads[0])).toBe('client_mux')
      await expect(page.locator('[data-download-parse-error]')).toContainText(
        'Failed to download the video tracks.'
      )
    })
  })

  test('Download all skips client mux resources by default', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            original_link: CLIENT_MUX_SAMPLE_LINK,
            canonical_link: CLIENT_MUX_SAMPLE_LINK,
            platform: 'vimeo',
            resources: [
              {
                source_id: 'vimeo:1194296700:image:1',
                platform: 'vimeo',
                download_mode: 'direct',
                capabilities: {
                  download: true,
                },
                filename: 'vimeo-preview.jpg',
                type: 'image',
                size: 128,
                mime_type: 'image/jpeg'
              },
              {
                source_id: 'vimeo:1194296700:client_mux:video-1080:audio-128',
                platform: 'vimeo',
                download_mode: 'client_mux',
                capabilities: {
                  download: true,
                },
                filename: 'vimeo-demo.mp4',
                type: 'video',
                size: CLIENT_MUX_VIDEO_TRACK_BYTES.byteLength + CLIENT_MUX_AUDIO_TRACK_BYTES.byteLength,
                mime_type: 'video/mp4'
              }
            ]
          }
        })
      })
    })

    const downloadedSourceIds: string[] = []
    await mockV2DirectDownload(page, {
      contentType: 'image/jpeg',
      filename: 'vimeo-preview.jpg',
      onPrePayload: payload => {
        downloadedSourceIds.push(getPayloadSourceId(payload))
      }
    })
    await installV2OldMainPathGuards(page)

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', CLIENT_MUX_SAMPLE_LINK)
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-result-card]')).toHaveCount(2)
    await expect(page.locator('[data-download-all-button]')).toContainText('Download all (1)')
    await page.click('[data-download-all-button]')

    await expect.poll(() => downloadedSourceIds).toEqual(['vimeo:1194296700:image:1'])
  })

  test.describe('direct local stream refresh downloads', () => {
    test.skip(
      ({ browserName }) => browserName === 'webkit',
      'WebKit has an existing local stream download limitation in CI.'
    )

    test('Vimeo direct URL 403 refreshes once with a new authorization', async ({
      page
    }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await installDownloadCapture(page)
    await mockSingleVimeoParse(page)

    const intentPayloads: V2DownloadPrePayload[] = []
    await mockV2DirectIntent(
      page,
      (_payload, index) =>
        index === 1
          ? 'https://vimeo-cdn.test/video-expired.mp4'
          : 'https://vimeo-cdn.test/video-refresh.mp4',
      payload => {
        intentPayloads.push(payload)
      }
    )
    await page.route('https://vimeo-cdn.test/video-expired.mp4', async route => {
      await route.fulfill({
        status: 403,
        headers: { 'access-control-allow-origin': '*' },
        body: ''
      })
    })
    await page.route('https://vimeo-cdn.test/video-refresh.mp4', async route => {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'video/mp4',
          'content-length': '4'
        },
        body: 'demo'
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect.poll(() => intentPayloads.length).toBe(2)
    expect(getPayloadDownloadModes(intentPayloads)).toEqual(['direct', 'direct'])
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as Window & { __getLastDownloadName?: () => string }
            ).__getLastDownloadName?.() || ''
        )
      )
      .toBe('vimeo-demo.mp4')
  })
  })

  test('Vimeo direct HTTP failure shows download failed copy', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await mockSingleVimeoParse(page)
    await mockV2DirectIntent(page, 'https://vimeo-cdn.test/video-500.mp4')
    await page.route('https://vimeo-cdn.test/video-500.mp4', async route => {
      await route.fulfill({
        status: 500,
        headers: { 'access-control-allow-origin': '*' },
        body: ''
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'Failed to download this file.'
    )
  })

  test('unknown media size uses unknown size copy', async ({ page }) => {
    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            original_link: 'https://vimeo.com/1194296700',
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                source_id: 'vimeo:1194296700:http-1080p',
                platform: 'vimeo',
                capabilities: {
                  download: true
                },
                filename: 'unknown-size.mp4',
                kind: 'video',
                size: null,
                mime_type: 'video/mp4'
              }
            ]
          }
        })
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-result-card]')).toContainText('Unknown size')
  })

  test('clicking parse records the web parse mark', async ({ page }) => {
    let parseMarkCount = 0

    await page.route(buildApiUrl('/api/client/mark/record'), async route => {
      const request = route.request()
      const payload = request.postDataJSON() as { mark_type: string }

      if (payload.mark_type === 'web_parse_click') {
        parseMarkCount += 1
      }
      expect(request.headers()['x-client-product']).toBe('web')
      expect(request.headers()['x-device-id']).toBeTruthy()

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            recorded: true
          }
        })
      })
    })

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 1024
              }
            ]
          }
        })
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect.poll(() => parseMarkCount).toBe(1)
    await expect(page.locator('[data-download-result-card]')).toHaveCount(1)
  })

  test('frontend platform detection only records mark and media parse decides unsupported links', async ({
    page
  }) => {
    const markTypes: string[] = []
    let markPayload = ''
    let parseFailedMark = ''
    let parseCallCount = 0

    await page.route(buildApiUrl('/api/client/mark/record'), async route => {
      const payload = route.request().postDataJSON() as { mark_type: string; mark_msg: string }
      markTypes.push(payload.mark_type)
      if (payload.mark_type === 'web_parse_click') {
        markPayload = payload.mark_msg
      }
      if (payload.mark_type === 'web_parse_failed') {
        parseFailedMark = payload.mark_msg
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            recorded: true
          }
        })
      })
    })

    await mockMediaParseV2(page, async route => {
      parseCallCount += 1
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 24000,
          msg: 'unsupported platform',
          data: {
            failure_reason:
              'media_parse_failed: platform=unknown, code=MEDIA_PLATFORM_UNSUPPORTED(24000), detail=detect_platform: unsupported host=diskwala.com'
          }
        })
      })
    })

    await gotoWorkspace(page)
    await page.fill(
      '[data-download-parse-input]',
      'https://www.diskwala.com/app/6934f10be09d45e9de60ce4f'
    )
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'This link platform is not supported.'
    )
    await expect
      .poll(() =>
        Array.from(new Set(markTypes))
          .filter(type => !WORKSPACE_LIFECYCLE_MARKS.has(type))
          .sort()
      )
      .toEqual(['web_parse_click', 'web_parse_failed'])
    expect(markPayload).toContain('"local_platform":"unsupported"')
    const failedMarkPayload = JSON.parse(await waitForMarkMessage(() => parseFailedMark)) as {
      reason: string
      platform: string
      link_host: string
      parse_duration_ms: number
      error: {
        phase: string
        name: string
        message: string
        status: number
        code: number
      }
    }
    expect(failedMarkPayload.reason).toBe('24000')
    expect(failedMarkPayload.platform).toBe('unsupported')
    expect(failedMarkPayload.link_host).toBe('www.diskwala.com')
    expect(failedMarkPayload.parse_duration_ms).toBeGreaterThanOrEqual(0)
    expect(failedMarkPayload.error).toMatchObject({
      phase: 'parse',
      name: 'HomepageApiError',
      status: 400,
      code: 24000
    })
    expect(failedMarkPayload.error.message).toContain('media_parse_failed: platform=unknown')
    expect(parseCallCount).toBe(1)
  })

  test('unknown backend business parse errors show backend message', async ({ page }) => {
    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 24999,
          msg: 'Temporary parser policy mismatch',
          data: {}
        })
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://www.dailymotion.com/video/x9demo')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'Temporary parser policy mismatch'
    )
  })

  test('unknown download mode fails parse without falling back to another method', async ({ page }) => {
    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            original_link: 'https://www.dailymotion.com/video/x9demo',
            canonical_link: 'https://www.dailymotion.com/video/x9demo',
            platform: 'dailymotion',
            resources: [
              {
                source_id: 'dailymotion:x9demo:hls',
                platform: 'dailymotion',
                download_mode: 'hls_client_mux',
                capabilities: {
                  download: true,
                },
                filename: 'dailymotion-demo.mp4',
                type: 'video',
                size: 4096,
                mime_type: 'video/mp4'
              }
            ]
          }
        })
      })
    })
    let downloadPreCalled = false
    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      downloadPreCalled = true
      await route.abort()
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://www.dailymotion.com/video/x9demo')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'This download method is not supported yet.'
    )
    await expect(page.locator('[data-download-result-card]')).toHaveCount(0)
    expect(downloadPreCalled).toBe(false)
  })

  test('unmapped parse failure shows backend message and records parse mark', async ({ page }) => {
    let parseFailedMark = ''

    await page.route(buildApiUrl('/api/client/mark/record'), async route => {
      const payload = route.request().postDataJSON() as { mark_type: string; mark_msg: string }
      if (payload.mark_type === 'web_parse_failed') {
        parseFailedMark = payload.mark_msg
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            recorded: true
          }
        })
      })
    })

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 50001,
          msg: 'backend parse failed',
          data: {
            failure_reason:
              'media_parse_failed: platform=vimeo, code=INTERNAL_SERVER_ERROR(500), detail=vimeo parser timeout'
          }
        })
      })
    })

    await gotoWorkspace(page, '/zh-cn/')
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    // 未映射的业务错误按项目规范直接展示后端 msg。
    await expect(page.locator('[data-download-parse-error]')).toContainText('backend parse failed')
    const failedMarkPayload = JSON.parse(await waitForMarkMessage(() => parseFailedMark)) as {
      reason: string
      platform: string
      link_host: string
      parse_duration_ms: number
      error: {
        message: string
        code: number
      }
    }
    expect(failedMarkPayload.reason).toBe('50001')
    expect(failedMarkPayload.platform).toBe('vimeo')
    expect(failedMarkPayload.link_host).toBe('vimeo.com')
    expect(failedMarkPayload.parse_duration_ms).toBeGreaterThanOrEqual(0)
    expect(failedMarkPayload.error.code).toBe(50001)
    expect(failedMarkPayload.error.message).toContain('vimeo parser timeout')
  })

  test('parse network failures record network reason and elapsed time', async ({ page }) => {
    let parseFailedMark = ''

    await page.route(buildApiUrl('/api/client/mark/record'), async route => {
      const payload = route.request().postDataJSON() as { mark_type: string; mark_msg: string }
      if (payload.mark_type === 'web_parse_failed') {
        parseFailedMark = payload.mark_msg
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            recorded: true
          }
        })
      })
    })

    await mockMediaParseV2(page, async route => {
      await route.abort('failed')
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-parse-error]')).toContainText('Failed to parse this link.')
    const failedMarkPayload = JSON.parse(await waitForMarkMessage(() => parseFailedMark)) as {
      reason: string
      platform: string
      link_host: string
      parse_duration_ms: number
      error: {
        phase: string
        name: string
        message: string
        status: number
        code: string
      }
    }
    expect(failedMarkPayload.reason).toBe('NETWORK_ERROR')
    expect(failedMarkPayload.platform).toBe('vimeo')
    expect(failedMarkPayload.link_host).toBe('vimeo.com')
    expect(failedMarkPayload.parse_duration_ms).toBeGreaterThanOrEqual(0)
    expect(failedMarkPayload.error).toMatchObject({
      phase: 'parse',
      name: 'HomepageApiError',
      status: 0,
      code: 'NETWORK_ERROR'
    })
    expect(failedMarkPayload.error.message).toContain('parse-v2 node_id=11')
  })

  test('parse errors map known media codes to localized copy', async ({ page }) => {
    const errorCases = [
      { code: 24000, expected: '暂不支持这个链接平台。' },
      { code: 24031, expected: '暂不支持这个链接平台。' },
      { code: 24005, expected: '这个 Vimeo 视频为私有内容或暂时无法解析。' },
      { code: 10201, expected: '积分不足，无法下载这个文件。' },
      { code: 998, expected: '请求过于频繁，请稍后再试。' }
    ] as const
    let currentCase: (typeof errorCases)[number] = errorCases[0]

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: currentCase.code,
          msg: `error-${currentCase.code}`,
          data: {}
        })
      })
    })

    await gotoWorkspace(page, '/zh-cn/')

    for (const errorCase of errorCases) {
      currentCase = errorCase
      await page.fill('[data-download-parse-input]', `https://vimeo.com/${errorCase.code}`)
      await page.click('[data-download-parse-submit]')
      await expect(page.locator('[data-download-parse-error]')).toContainText(errorCase.expected)
    }
  })

  test('no downloadable files use inline error styling', async ({ page, context }) => {
    await setLanguageCookie(context, 'zh-CN')

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: []
          }
        })
      })
    })

    await gotoWorkspace(page, '/zh-cn/')
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-parse-error]')).toBeVisible()
    await expect(page.locator('[data-download-parse-error]')).toContainText(
      '没有找到这个视频可下载的文件。'
    )

    const errorColor = await page
      .locator('[data-download-parse-error]')
      .evaluate(element => window.getComputedStyle(element).color)

    expect(errorColor).toBe('rgb(239, 68, 68)')
  })

  test('download sends web identity metadata when already signed in', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 1024
              }
            ]
          }
        })
      })
    })

    let downloadHeaderSnapshot: Record<string, string> | null = null

    await mockV2DirectDownload(page, {
      onPrePayload: (_payload, headers) => {
        downloadHeaderSnapshot = headers
      }
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect.poll(() => downloadHeaderSnapshot?.['x-client-product']).toBe('web')
    expect(downloadHeaderSnapshot?.['x-device-id']).toBe(STABLE_DEVICE_ID)
    expect(downloadHeaderSnapshot?.authorization).toBe('Bearer token-from-storage')
  })

  test('generic download failure shows download failed copy', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await mockSingleVideoParse(page)

    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      const payload = route.request().postDataJSON() as V2DownloadPrePayload
      expectDownloadPrePayloadContract(payload)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            token: 'generic-download-failure-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            download_mode: getPayloadDownloadMode(payload),
            nodes: [{ node_id: 21, url: buildNodeUrl(21, 'download-v2') }]
          }
        })
      })
    })
    await page.route(buildNodeUrl(21, 'download-v2'), async route => {
      // 无业务码的服务端故障：不属于已知业务错误，前端必须落到通用下载失败文案。
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ msg: 'download node crashed', data: {} })
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'Failed to download this file.'
    )
  })

  test('download button double click keeps one active media download', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await mockSingleVideoParse(page)

    let downloadCount = 0
    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      const payload = route.request().postDataJSON() as V2DownloadPrePayload
      expectDownloadPrePayloadContract(payload)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            token: 'double-click-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            download_mode: getPayloadDownloadMode(payload),
            nodes: [{ node_id: 21, url: buildNodeUrl(21, 'download-v2') }]
          }
        })
      })
    })
    await page.route(buildNodeUrl(21, 'download-v2'), async route => {
      downloadCount += 1
      await new Promise(resolve => setTimeout(resolve, 250))
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="demo-video.mp4"'
        },
        body: 'demo'
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    const downloadButton = page.locator('[data-download-resource-button]')
    await Promise.all([
      downloadButton.dispatchEvent('click'),
      downloadButton.dispatchEvent('click')
    ])

    await expect.poll(() => downloadCount).toBe(1)
  })

  test('single download button shows stream progress while downloading', async ({
    page,
    context
  }) => {
    await setLanguageCookie(context, 'zh-CN')

    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)

    await installStreamedDownloadMock(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 1024,
                duration: 20
              }
            ]
          }
        })
      })
    })

    await gotoWorkspace(page, '/zh-cn/')
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect(page.locator('[data-download-resource-button]')).toContainText('下载中')
    await expect(page.locator('[data-download-resource-button]')).toContainText('下载')
  })

  test('download falls back to parsed filename when the backend intent omits a filename', async ({
    page
  }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)

    await installDownloadCapture(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 1024,
                duration: 20
              }
            ]
          }
        })
      })
    })

    await mockV2DirectDownload(page, {
      filename: ''
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as Window & { __getLastDownloadName?: () => string }
            ).__getLastDownloadName?.() || ''
        )
      )
      .toBe('demo-video.mp4')
  })

  test.describe('download resume records', () => {
    test('mobile pending resume with long filename does not create horizontal overflow', async ({
      page
    }) => {
      await page.setViewportSize({ width: 360, height: 720 })
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
        Object.defineProperty(navigator, 'storage', {
          configurable: true,
          value: {}
        })
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
      await gotoWorkspace(page)
      await writeIndexedDbResumeRecord(page, 'direct', {
        filename:
          'exXxclusivasss_2723_4990453106882907797700123456789012345678901234567890.mp4'
      })
      await reloadWorkspace(page)

      await expect(page.locator('[data-download-pending-resume-actions]')).toBeVisible()
      await expect(page.locator('[data-download-pending-resume-hint]')).toContainText(
        'exXxclusivasss_2723'
      )
      await expect
        .poll(() =>
          page.evaluate(() => {
            return Math.ceil(
              Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
            )
          })
        )
        .toBeLessThanOrEqual(361)
    })

    test('direct Continue uses stored URL only and does not request new authorization', async ({ page }) => {
      test.skip(
        !(await hasOpfsSupport(page)),
        'Direct Continue is only available in browsers with OPFS.'
      )
      const directUrl = 'https://cdn.example.test/direct/resume.mp4'
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
      await installDownloadCapture(page)
      await gotoWorkspace(page)
      await writeOpfsResumeRecord(page, {
        mode: 'direct',
        bytes: [1, 2, 3, 4],
        totalBytes: 10,
        downloadUrl: directUrl
      })
      await reloadWorkspace(page)

      let downloadPreCalled = false
      await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
        downloadPreCalled = true
        await route.abort()
      })
      const directRangeHeaders: string[] = []
      await page.route(directUrl, async route => {
        directRangeHeaders.push(route.request().headers().range ?? '')
        await route.fulfill({
          status: 206,
          headers: {
            'content-type': 'video/mp4',
            'content-length': '6',
            'content-range': 'bytes 4-9/10',
            'access-control-expose-headers': 'content-length, content-range'
          },
          body: Buffer.from([5, 6, 7, 8, 9, 10])
        })
      })

      await expect(page.locator('[data-download-pending-resume-actions]')).toBeVisible()
      await page.click('[data-download-pending-resume-continue]')

      await expect.poll(() => directRangeHeaders).toEqual(['bytes=4-'])
      expect(downloadPreCalled).toBe(false)
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              await (
                window as Window & { __getLastDownloadBytesReady?: () => Promise<number[]> | null }
              ).__getLastDownloadBytesReady?.() || []
          )
        )
        .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    test('IndexedDB restart record shows Restart, downloads from zero and refreshes Credits', async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
        Object.defineProperty(navigator, 'storage', {
          configurable: true,
          value: {}
        })
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page, {
        snapshots: [
          { used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' },
          { used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' },
          { used: 3, dailyLimit: 10, creditsBalance: 77, period: 'month' }
        ]
      })
      await installDownloadCapture(page)
      await gotoWorkspace(page)
      await writeIndexedDbResumeRecord(page, 'direct')
      await reloadWorkspace(page)

      const rangeHeaders: string[] = []
      await mockV2DirectDownload(page, {
        creditsBalance: 77,
        body: Buffer.from([1, 2, 3, 4]),
        contentType: 'video/mp4',
        headers: {
          'content-type': 'video/mp4',
          'content-length': '4'
        },
        onCdnRequest: (_payload, headers) => {
          rangeHeaders.push(headers.range ?? '')
        }
      })

      await expect(page.locator('[data-download-pending-resume-actions]')).toBeVisible()
      await expect(page.locator('[data-download-credits-pill]')).toContainText('88 Credits')
      await expect(page.locator('[data-download-pending-resume-continue]')).toContainText('Restart')
      await page.click('[data-download-pending-resume-continue]')

      await expect.poll(() => rangeHeaders).toEqual([''])
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              await (
                window as Window & { __getLastDownloadBytesReady?: () => Promise<number[]> | null }
              ).__getLastDownloadBytesReady?.() || []
          )
        )
        .toEqual([1, 2, 3, 4])
      await expect.poll(async () => await readResumeRecord(page)).toEqual({
        storageType: null,
        recoveryMode: null,
        downloadedBytes: null
      })
      await expect(page.locator('[data-download-credits-pill]')).toContainText('77 Credits')
    })

    test('IndexedDB restart record without resourceToken is cleared on load', async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
        Object.defineProperty(navigator, 'storage', {
          configurable: true,
          value: {}
        })
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
      await gotoWorkspace(page)
      await writeIndexedDbResumeRecord(page, 'direct', { omitResourceToken: true })
      await reloadWorkspace(page)

      await expect(page.locator('[data-download-pending-resume-actions]')).toBeHidden()
      await expect.poll(async () => await readResumeRecord(page)).toEqual({
        storageType: null,
        recoveryMode: null,
        downloadedBytes: null
      })
    })

    test('Ignore clears pending resume record without downloading', async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)
      await gotoWorkspace(page)
      await writeIndexedDbResumeRecord(page, 'direct')
      await reloadWorkspace(page)

      let downloadPreCalled = false
      await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
        downloadPreCalled = true
        await route.abort()
      })

      await expect(page.locator('[data-download-pending-resume-actions]')).toBeVisible()
      await page.click('[data-download-pending-resume-dismiss]')

      expect(downloadPreCalled).toBe(false)
      await expect(page.locator('[data-download-pending-resume-actions]')).toBeHidden()
      await expect.poll(async () => await readResumeRecord(page)).toEqual({
        storageType: null,
        recoveryMode: null,
        downloadedBytes: null
      })
    })
  })

  test('download all button downloads every parsed source in order and refreshes Credits', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [
        { used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' },
        { used: 4, dailyLimit: 10, creditsBalance: 66, period: 'month' }
      ]
    })

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-1.mp4',
                kind: 'video',
                size: 1024,
                duration: 20
              },
              {
                message_id: 'message-123',
                source_id: 'source-video-2',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-2.mp4',
                kind: 'video',
                size: 2048,
                duration: 35
              }
            ]
          }
        })
      })
    })

    const requestedSourceIds: string[] = []

    await mockV2DirectDownload(page, {
      creditsBalance: 66,
      filename: '',
      onPrePayload: payload => {
        requestedSourceIds.push(getPayloadSourceId(payload))
      }
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')

    await expect(page.locator('[data-download-all-button]')).toBeVisible()
    await page.click('[data-download-all-button]')

    await expect.poll(() => requestedSourceIds).toEqual(['source-video-1', 'source-video-2'])
    await expect(page.locator('[data-download-credits-pill]')).toContainText('66 Credits')
  })

  test('download all partial success refreshes Credits after non quota failure', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [
        { used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' },
        { used: 3, dailyLimit: 10, creditsBalance: 66, period: 'month' }
      ]
    })

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-1.mp4',
                kind: 'video',
                size: 1024
              },
              {
                message_id: 'message-123',
                source_id: 'source-video-2',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-2.mp4',
                kind: 'video',
                size: 2048
              }
            ]
          }
        })
      })
    })

    const payloadByToken = new Map<string, V2DownloadPrePayload>()
    const requestedSourceIds: string[] = []
    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      const payload = route.request().postDataJSON() as V2DownloadPrePayload
      expectDownloadPrePayloadContract(payload)
      const sourceId = getPayloadSourceId(payload)
      requestedSourceIds.push(sourceId)
      const token = `partial-token-${requestedSourceIds.length}`
      payloadByToken.set(token, payload)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            credits_balance: 66,
            download_mode: getPayloadDownloadMode(payload),
            nodes: [{ node_id: 21, url: buildNodeUrl(21, 'download-v2') }]
          }
        })
      })
    })
    await page.route(buildNodeUrl(21, 'download-v2'), async route => {
      const tokenPayload = route.request().postDataJSON() as { token: string }
      const prePayload = payloadByToken.get(tokenPayload.token)
      if (!prePayload) {
        throw new Error(`[v2-test] missing partial download-pre payload for token=${tokenPayload.token}`)
      }
      const sourceId = getPayloadSourceId(prePayload)
      if (sourceId === 'source-video-2') {
        await route.fulfill({
          status: 500,
          contentType: 'text/plain',
          body: 'node failed'
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            source_id: sourceId,
            platform: 'vimeo',
            download_mode: 'direct',
            download_url: 'https://vimeo-cdn.test/partial.mp4',
            filename: `${sourceId}.mp4`,
            mime_type: 'video/mp4',
            size: 4,
            expires_at: null
          }
        })
      })
    })
    await page.route('https://vimeo-cdn.test/partial.mp4', async route => {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'accept-ranges': 'bytes',
          'content-type': 'video/mp4',
          'content-length': '4'
        },
        body: 'demo'
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await expect(page.locator('[data-download-credits-pill]')).toContainText('88 Credits')
    await page.click('[data-download-all-button]')

    await expect.poll(() => requestedSourceIds).toEqual(['source-video-1', 'source-video-2'])
    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'Some files downloaded. Some files failed.'
    )
    await expect(page.locator('[data-download-credits-pill]')).toContainText('66 Credits')
  })

  test('download all stops later downloads when quota is exhausted', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    await mockCreditCheckout(page)
    await installDownloadCapture(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-1.mp4',
                kind: 'video',
                size: 1024
              },
              {
                source_id: 'source-video-2',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-2.mp4',
                kind: 'video',
                size: 2048
              },
              {
                source_id: 'source-video-3',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-3.mp4',
                kind: 'video',
                size: 4096
              }
            ]
          }
        })
      })
    })

    const requestedSourceIds: string[] = []
    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      const payload = route.request().postDataJSON() as V2DownloadPrePayload
      expectDownloadPrePayloadContract(payload)
      const sourceId = getPayloadSourceId(payload)
      requestedSourceIds.push(sourceId)
      if (sourceId === 'source-video-2') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 10201,
            msg: 'quota exceeded',
            data: {}
          })
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            token: `quota-token-${requestedSourceIds.length}`,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            download_mode: getPayloadDownloadMode(payload),
            nodes: [{ node_id: 21, url: buildNodeUrl(21, 'download-v2') }]
          }
        })
      })
    })
    await page.route(buildNodeUrl(21, 'download-v2'), async route => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="quota-demo.mp4"'
        },
        body: 'demo'
      })
    })

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-all-button]')

    await expect.poll(() => requestedSourceIds).toEqual(['source-video-1', 'source-video-2'])
    await expect(page.locator('[data-download-parse-error]')).toContainText(
      'Not enough Credits to download this file.'
    )
    await expect(page.locator('[data-credit-purchase-modal]')).toBeVisible()
    await expect(page.locator('[data-credit-purchase-modal]')).toContainText('Get more Credits')
    await expect(page.locator('[data-credit-purchase-modal]')).toContainText('$6.30')
    await expect(page.locator('[data-credit-purchase-modal]')).toContainText('$0.1260/Credits')
    const firstCreditCard = page.locator('[data-credit-purchase-card]').first()
    const creditAmountBox = await firstCreditCard.locator('[data-credit-purchase-credits]').boundingBox()
    const creditUnitPriceBox = await firstCreditCard.locator('[data-credit-purchase-unit-price]').boundingBox()
    expect(creditAmountBox).not.toBeNull()
    expect(creditUnitPriceBox).not.toBeNull()
    if (!creditAmountBox || !creditUnitPriceBox) {
      throw new Error('Home credit purchase metadata boxes were not measurable.')
    }
    expect(creditAmountBox.x).toBeLessThan(creditUnitPriceBox.x)
  })

  test('download all button shows current item progress while downloading', async ({
    page,
    context
  }) => {
    await setLanguageCookie(context, 'zh-CN')

    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)

    await installStreamedDownloadMock(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-1.mp4',
                kind: 'video',
                size: 1024,
                duration: 20
              },
              {
                message_id: 'message-123',
                source_id: 'source-video-2',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video-2.mp4',
                kind: 'video',
                size: 2048,
                duration: 35
              }
            ]
          }
        })
      })
    })

    await gotoWorkspace(page, '/zh-cn/')
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-all-button]')

    await expect(page.locator('[data-download-all-button]')).toContainText('正在下载全部 1/2')
  })

  test('successful download refreshes Credits account entry from auth me', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [
        { used: 2, dailyLimit: 10, creditsBalance: 88, period: 'month' },
        { used: 3, dailyLimit: 10, creditsBalance: 12, period: 'month' }
      ]
    })
    await installDownloadCapture(page)

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 1024
              }
            ]
          }
        })
      })
    })

    await mockV2DirectDownload(page, {
      creditsBalance: 12
    })

    await gotoWorkspace(page)
    await expect(page.locator('[data-download-credits-pill]')).toContainText('88 Credits')

    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect(page.locator('[data-download-credits-pill]')).toContainText('12 Credits')
  })

  test('download Credits insufficient opens purchase modal and refreshes balance after payment', async ({ page, context }) => {
    await setLanguageCookie(context, 'zh-CN')

    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page, {
      snapshots: [
        { used: 1, dailyLimit: 1, creditsBalance: 0, period: 'free' },
        { used: 1, dailyLimit: 1, creditsBalance: 50, period: 'free' }
      ],
      checkinEntries: [
        buildCheckinEntryMock({
          creditsBalance: 0,
          todayClaimed: true,
          campaignEnded: false
        })
      ]
    })
    const creditCheckout = await mockCreditCheckout(page)
    const markPayloads: MarkRecordPayload[] = []
    await page.route(buildApiUrl('/api/client/mark/record'), async route => {
      markPayloads.push(route.request().postDataJSON() as MarkRecordPayload)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            recorded: true
          }
        })
      })
    })

    await mockMediaParseV2(page, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-123',
                source_id: 'source-video-1',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'demo-video.mp4',
                kind: 'video',
                size: 1024
              }
            ]
          }
        })
      })
    })

    await page.route(buildApiUrl('/api/client/media/download-pre-v2'), async route => {
      const payload = route.request().postDataJSON() as V2DownloadPrePayload
      expectDownloadPrePayloadContract(payload)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10201,
          msg: 'Credits 不足',
          data: {}
        })
      })
    })

    await gotoWorkspace(page, '/zh-cn/')
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await page.click('[data-download-resource-button]')

    await expect(page).toHaveURL('/zh-cn/')
    await expect(page.locator('[data-download-parse-error]')).toContainText(
      '积分不足，无法下载这个文件。'
    )
    await expect(page.locator('[data-download-results-panel] a[href*="/pricing"], [data-download-results-panel] button:has-text("Upgrade")')).toHaveCount(0)
    const modal = page.locator('[data-credit-purchase-modal]')
    await expect(modal).toBeVisible()
    const shopDialog = modal.locator('[data-credit-purchase-shop-dialog]')
    const checkoutModal = page.locator('[data-order-checkout-modal]')
    const paymentDialog = page.locator('[data-order-checkout-payment-dialog]')
    const orderDialog = page.locator('[data-order-checkout-order-dialog]')
    await expect(shopDialog).toBeVisible()
    await expect(checkoutModal).toBeHidden()
    await expect(shopDialog.locator('[data-credit-purchase-card]')).toHaveCount(3)
    await expect(shopDialog).toContainText('$6.30')
    await expect(shopDialog).toContainText('50 积分')
    await expect(shopDialog).not.toContainText('USD')
    await expect
      .poll(() =>
        markPayloads.some(
          payload => payload.mark_type === 'web_credit_purchase_modal_open'
        )
      )
      .toBe(true)
    const openMark = markPayloads.find(
      payload => payload.mark_type === 'web_credit_purchase_modal_open'
    )
    const openMarkMsg = toJsonValue(openMark?.mark_msg ?? '{}')
    if (!isJsonObject(openMarkMsg)) {
      throw new Error('Expected Credits purchase open mark_msg to be a JSON object')
    }
    expect(openMarkMsg.source).toBe('workspace_download')
    expect(openMarkMsg.reason).toBe('credits_insufficient')

    const buyButton = shopDialog
      .locator('[data-credit-purchase-card][data-credit-purchase-product-id="credit_50"]')
      .locator('[data-credit-purchase-buy]')
    await expect(buyButton).toBeEnabled()
    await buyButton.click()
    await expect(shopDialog).toBeHidden()
    await expect(paymentDialog).toBeVisible()
    await expect(orderDialog).toBeHidden()
    await expect(paymentDialog).toContainText('选择支付方式')
    await expect(paymentDialog).toContainText('50 积分')
    await expect(paymentDialog).toContainText('$6.30')
    await expect(paymentDialog).toContainText('Credit or debit card')
    await expect(paymentDialog).not.toContainText('USD')

    const agreement = paymentDialog.locator('[data-order-checkout-agreement]')
    const paymentSubmit = paymentDialog.locator('[data-order-checkout-submit]')
    await expect(agreement).toBeChecked()
    await expect(paymentSubmit).toBeEnabled()
    await agreement.uncheck()
    await expect(paymentSubmit).toBeDisabled()
    await agreement.check()
    await expect(paymentSubmit).toBeEnabled()
    await paymentSubmit.click()
    await expect
      .poll(() =>
        markPayloads.some(
          payload => payload.mark_type === 'web_credit_purchase_buy_click'
        )
      )
      .toBe(true)
    const buyMark = markPayloads.find(
      payload => payload.mark_type === 'web_credit_purchase_buy_click'
    )
    const buyMarkMsg = toJsonValue(buyMark?.mark_msg ?? '{}')
    if (!isJsonObject(buyMarkMsg)) {
      throw new Error('Expected Credits purchase buy mark_msg to be a JSON object')
    }
    expect(buyMarkMsg.product_id).toBe('credit_50')
    expect(buyMarkMsg.product_name).toBe('50 Credits')

    await expect(shopDialog).toBeHidden()
    await expect(paymentDialog).toBeHidden()
    await expect(orderDialog).toBeVisible()
    await expect(orderDialog).toContainText('等待支付')
    await expect(orderDialog).toContainText('请在新打开的标签页中完成支付。我们会自动检查结果。')
    await expect(orderDialog).toContainText(`反馈问题：${DEVELOPER_EMAIL}`)
    await expect(orderDialog.locator('[data-order-checkout-order-refresh]')).toHaveCount(0)
    await expect(orderDialog.locator('[data-order-checkout-close]')).toBeVisible()
    await expect(orderDialog.locator('[data-order-checkout-order-spinner]')).toHaveCSS('animation-name', 'orderCheckoutSpin')
    await expect(orderDialog.locator('[data-order-checkout-order-spinner]')).not.toHaveCSS('animation-duration', '0s')
    await expect(orderDialog).toContainText('积分已到账')
    await expect(orderDialog).toContainText('+50 积分已到账')
    await expect(orderDialog).toContainText('当前余额：50 积分')
    await expect(orderDialog.locator('[data-order-checkout-order-close]')).toContainText('关闭')
    await expect(page.locator('[data-download-credits-pill]')).toContainText('50 Credits')
    expect(creditCheckout.createOrderPayloads).toEqual([
      {
        product_class: 2,
        product_id: 'credit_50',
        auto_renew: false,
        period: 'none',
        payment_method: 'clink',
        currency: 'USD',
        amount: 6300000
      }
    ])
  })

  test('Credits purchase modal reloads latest prices on every open', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    const latestConfigs = CREDIT_CHECKOUT_CONFIGS.map(config =>
      config.product_id === 'credit_50'
        ? {
            ...config,
            display_amount: 7300000
          }
        : config
    )
    const creditCheckout = await mockCreditCheckout(page, {
      configs: [CREDIT_CHECKOUT_CONFIGS, latestConfigs]
    })

    await gotoWorkspace(page)
    await page.evaluate(() => {
      void window.creditPurchaseController?.open({
        source: 'workspace_download',
        reason: 'credits_insufficient',
        userCreatedAt: Date.now(),
        productHintId: 'credit_50'
      })
    })
    const modal = page.locator('[data-credit-purchase-modal]')
    await expect(modal).toContainText('$6.30')
    await modal.locator('[data-credit-purchase-shop-dialog] [data-credit-purchase-close]').click()
    await expect(modal).toBeHidden()

    await page.evaluate(() => {
      void window.creditPurchaseController?.open({
        source: 'workspace_download',
        reason: 'credits_insufficient',
        userCreatedAt: Date.now(),
        productHintId: 'credit_50'
      })
    })

    await expect(modal).toContainText('$7.30')
    await expect(modal).not.toContainText('$6.30')
    expect(creditCheckout.getConfigsCallCount()).toBe(2)
  })

  test('Credits purchase modal reloads configs after PAYMENT_PRICE_UPDATED', async ({ page }) => {
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    const updatedConfigs = CREDIT_CHECKOUT_CONFIGS.map(config =>
      config.product_id === 'credit_50'
        ? {
            ...config,
            display_amount: 7300000
          }
        : config
    )
    const creditCheckout = await mockCreditCheckout(page, {
      configs: [CREDIT_CHECKOUT_CONFIGS, updatedConfigs],
      createOrderErrorCode: 21005
    })

    await gotoWorkspace(page)
    await page.evaluate(() => {
      void window.creditPurchaseController?.open({
        source: 'workspace_download',
        reason: 'credits_insufficient',
        userCreatedAt: Date.now(),
        productHintId: 'credit_50'
      })
    })
    const modal = page.locator('[data-credit-purchase-modal]')
    await expect(modal).toContainText('$6.30')
    await modal
      .locator('[data-credit-purchase-card][data-credit-purchase-product-id="credit_50"]')
      .locator('[data-credit-purchase-buy]')
      .click()
    await expect(page.locator('[data-order-checkout-payment-dialog]')).toBeVisible()
    await page.locator('[data-order-checkout-submit]').click()

    await expect(modal).toContainText('Price changed. Review the latest price and buy again.')
    await expect(modal).toContainText('$7.30')
    expect(creditCheckout.getConfigsCallCount()).toBe(2)
    expect(creditCheckout.createOrderPayloads).toHaveLength(1)
  })

  test('closing pending Credits purchase stops polling and next open starts fresh', async ({ page }) => {
    await page.addInitScript(() => {
      let nextIntervalId = 1
      const activeIntervals = new Map<number, () => void>()
      const nativeSetInterval = window.setInterval.bind(window)
      const nativeClearInterval = window.clearInterval.bind(window)
      window.setInterval = (handler: TimerHandler, timeout?: number) => {
        if (timeout === 2000 && typeof handler === 'function') {
          const id = nextIntervalId
          nextIntervalId += 1
          activeIntervals.set(id, () => handler())
          return id
        }
        return nativeSetInterval(handler, timeout)
      }
      window.clearInterval = (id: number | undefined) => {
        if (typeof id === 'number' && activeIntervals.delete(id)) {
          return
        }
        nativeClearInterval(id)
      }
      window.__runOrderCheckoutPollingIntervals = () => {
        const callbacks = Array.from(activeIntervals.values())
        for (const callback of callbacks) {
          callback()
        }
        return callbacks.length
      }
    })
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockAuthenticatedSession(page)
    const creditCheckout = await mockCreditCheckout(page, {
      orderNo: 'ORD-CREDIT-PENDING-E2E',
      orderStatus: 1,
      callbackStatus: 1
    })

    await gotoWorkspace(page)
    await page.evaluate(() => {
      void window.creditPurchaseController?.open({
        source: 'workspace_download',
        reason: 'credits_insufficient',
        userCreatedAt: Date.now(),
        productHintId: 'credit_50'
      })
    })
    const modal = page.locator('[data-credit-purchase-modal]')
    const shopDialog = modal.locator('[data-credit-purchase-shop-dialog]')
    const checkoutModal = page.locator('[data-order-checkout-modal]')
    const paymentDialog = page.locator('[data-order-checkout-payment-dialog]')
    const orderDialog = page.locator('[data-order-checkout-order-dialog]')
    await modal
      .locator('[data-credit-purchase-card][data-credit-purchase-product-id="credit_50"]')
      .locator('[data-credit-purchase-buy]')
      .click()
    await expect(shopDialog).toBeHidden()
    await expect(paymentDialog).toBeVisible()
    await paymentDialog.locator('[data-order-checkout-submit]').click()
    await expect(shopDialog).toBeHidden()
    await expect(paymentDialog).toBeHidden()
    await expect(orderDialog).toBeVisible()
    await expect(orderDialog).toContainText('Waiting for payment')
    await expect(orderDialog).toContainText('Complete payment in the newly opened tab. We will check the result automatically.')
    await expect(orderDialog).toContainText(`Report an issue: ${DEVELOPER_EMAIL}`)
    await expect(orderDialog).not.toContainText('ORD-CREDIT-PENDING-E2E')
    await expect(orderDialog.locator('[data-order-checkout-order-refresh]')).toHaveCount(0)
    await expect(orderDialog.locator('[data-order-checkout-close]')).toBeVisible()
    await expect(orderDialog.locator('[data-order-checkout-order-spinner]')).toHaveCSS('animation-name', 'orderCheckoutSpin')
    await expect(orderDialog.locator('[data-order-checkout-order-spinner]')).not.toHaveCSS('animation-duration', '0s')

    expect(await page.evaluate(() => window.__runOrderCheckoutPollingIntervals?.() ?? 0)).toBe(1)
    await expect.poll(() => creditCheckout.getStatusCallCount()).toBeGreaterThan(0)
    await orderDialog.locator('[data-order-checkout-close]').click()
    await expect(checkoutModal).toBeHidden()
    const statusCallsAfterClose = creditCheckout.getStatusCallCount()
    expect(await page.evaluate(() => window.__runOrderCheckoutPollingIntervals?.() ?? 0)).toBe(0)
    expect(creditCheckout.getStatusCallCount()).toBe(statusCallsAfterClose)

    await page.evaluate(() => {
      void window.creditPurchaseController?.open({
        source: 'workspace_download',
        reason: 'credits_insufficient',
        userCreatedAt: Date.now(),
        productHintId: 'credit_50'
      })
    })

    await expect(modal).toBeVisible()
    await expect(shopDialog).toBeVisible()
    await expect(orderDialog).toBeHidden()
    await expect(shopDialog).not.toContainText('ORD-CREDIT-PENDING-E2E')
    await expect(shopDialog.locator('[data-credit-purchase-card]')).toHaveCount(3)
    expect(creditCheckout.getConfigsCallCount()).toBe(2)
  })

  test('reload restores parsed workspace from local snapshot', async ({ page }) => {
    // 快照 owner 绑定 device ID，reload 前后必须是同一台设备才能恢复。
    await page.addInitScript(
      ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
      },
      { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
    )
    await mockSingleVideoParse(page)

    await gotoWorkspace(page)
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await expect(page.locator('[data-download-result-card]')).toContainText('demo-video.mp4')

    await reloadWorkspace(page)

    await expect(page.locator('[data-download-parse-input]')).toHaveValue(
      'https://vimeo.com/1194296700'
    )
    await expect(page.locator('[data-download-result-card]')).toContainText('demo-video.mp4')
  })

  test.describe('legacy restored workspace cleanup with IndexedDB fixture', () => {
    test.skip(
      ({ browserName }) => browserName === 'webkit',
      'WebKit IndexedDB fixture writes are covered by browser storage tests.'
    )

    test('submitting a new parse clears restored workspace and legacy download state', async ({
      page
    }) => {
    const deviceId = STABLE_DEVICE_ID
    await page.addInitScript(keys => {
      window.localStorage.setItem(keys.accessToken, 'token-from-storage')
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {}
      })
    }, STORAGE_KEYS)
    await writeWorkspaceSnapshot(page, {
      ownerSub: `device:${deviceId}`,
      deviceId
    })
    await mockAuthenticatedSession(page)

    await gotoWorkspace(page)
    await writeV2IndexedDbCheckpoint(page, Date.now())
    await reloadWorkspace(page)

    await expect(page.locator('[data-download-result-card]')).toContainText('demo-video.mp4')
    await expect(page.locator('[data-download-pending-resume-actions]')).toBeHidden()
    await expect.poll(async () => await readIndexedDbCheckpoint(page)).toEqual({
      downloadedBytes: null,
      tempSize: 0,
      version: null,
      storageType: null,
      recoveryMode: null
    })

    let releaseParseResponse: (() => void) | null = null
    const parseResponseReady = new Promise<void>(resolve => {
      releaseParseResponse = resolve
    })
    await mockMediaParseV2(page, async route => {
      await parseResponseReady
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 10000,
          msg: 'success',
          data: {
            original_link: 'https://vimeo.com/1194296700',
            canonical_link: 'https://vimeo.com/1194296700',
            platform: 'vimeo',
            resources: [
              {
                message_id: 'message-456',
                source_id: 'source-video-2',
                platform: 'vimeo',
                capabilities: {
                  download: true,
                },
                filename: 'new-video.mp4',
                type: 'video',
                size: 2048,
                mime_type: 'video/mp4'
              }
            ]
          }
        })
      })
    })

    const parseRequestPromise = page.waitForRequest(buildApiUrl('/api/client/media/parse-pre-v2'))
    await page.fill('[data-download-parse-input]', 'https://vimeo.com/1194296700')
    await page.click('[data-download-parse-submit]')
    await parseRequestPromise

    await expect(page.locator('[data-download-result-card]')).toHaveCount(0)
    await expect(page.locator('[data-download-pending-resume-actions]')).toBeHidden()
    await expect
      .poll(async () => await readIndexedDbCheckpoint(page))
      .toEqual({
        downloadedBytes: null,
        tempSize: 0,
        version: null,
        storageType: null,
        recoveryMode: null
      })
    expect(
      await page.evaluate(key => window.localStorage.getItem(key), STORAGE_KEYS.workspaceSnapshot)
    ).toBe(null)

    releaseParseResponse?.()

    await expect(page.locator('[data-download-result-card]')).toContainText('new-video.mp4')
  })
  })

  test('legacy homepage snapshot keys are cleared on workspace load', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('homepage:workspace:snapshot', '{"legacy":true}')
      window.localStorage.setItem('tg_homepage_workspace_snapshot_v1', '{"legacy":true}')
    })

    await gotoWorkspace(page)

    const legacyValues = await page.evaluate(() => ({
      homepage: window.localStorage.getItem('homepage:workspace:snapshot'),
      tgHomepage: window.localStorage.getItem('tg_homepage_workspace_snapshot_v1')
    }))

    expect(legacyValues).toEqual({
      homepage: null,
      tgHomepage: null
    })
  })

  test.describe('legacy persisted download state cleanup', () => {
    test.skip(
      ({ browserName }) => browserName === 'webkit',
      'WebKit storage fixture writes are covered by Chromium and Firefox storage tests.'
    )

    test('legacy download localStorage and IndexedDB state are cleared on workspace load', async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
        window.localStorage.setItem(keys.accessToken, 'token-from-storage')
        window.localStorage.setItem(keys.deviceId, stableDeviceId)
        Object.defineProperty(navigator, 'storage', {
          configurable: true,
          value: {}
        })
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)

      await gotoWorkspace(page)
      await writeV2IndexedDbCheckpoint(page, Date.now())
      await page.evaluate(() => {
        window.localStorage.setItem('tg_homepage_download_checkpoint_v1', 'legacy-idb')
        window.localStorage.setItem('tg_homepage_pending_download_task_v1', 'legacy-task')
        window.localStorage.setItem('homepage:download:pending', 'legacy-homepage')
        window.localStorage.setItem('download:pending:task', 'legacy-pending')
      })
      await reloadWorkspace(page)

      await expect(page.locator('[data-download-pending-resume-actions]')).toBeHidden()
      await expect.poll(async () => await readIndexedDbCheckpoint(page)).toEqual({
        downloadedBytes: null,
        tempSize: 0,
        version: null,
        storageType: null,
        recoveryMode: null
      })
      await expect
        .poll(() =>
          page.evaluate(() => ({
            checkpoint: window.localStorage.getItem('tg_homepage_download_checkpoint_v1'),
            pendingV1: window.localStorage.getItem('tg_homepage_pending_download_task_v1'),
            homepagePending: window.localStorage.getItem('homepage:download:pending'),
            pendingTask: window.localStorage.getItem('download:pending:task')
          }))
        )
        .toEqual({
          checkpoint: null,
          pendingV1: null,
          homepagePending: null,
          pendingTask: null
        })
    })

    test('legacy OPFS download state is cleared on workspace load', async ({ page }) => {
      await page.addInitScript(
        ({ keys, stableDeviceId }) => {
          window.localStorage.setItem(keys.accessToken, 'token-from-storage')
          window.localStorage.setItem(keys.deviceId, stableDeviceId)
        },
        { keys: STORAGE_KEYS, stableDeviceId: STABLE_DEVICE_ID }
      )
      await mockAuthenticatedSession(page)

      await gotoWorkspace(page)
      await writeV3OpfsCheckpoint(page, Date.now())
      await expect.poll(async () => await readOpfsCheckpointStatus(page)).toEqual({
        version: 3,
        storageType: 'opfs',
        recoveryMode: 'resumable'
      })
      await reloadWorkspace(page)

      await expect(page.locator('[data-download-pending-resume-actions]')).toBeHidden()
      await expect.poll(async () => await readOpfsCheckpointStatus(page)).toEqual({
        version: null,
        storageType: null,
        recoveryMode: null
      })
    })
  })

  test('playback snapshot is cleared without restoring the player', async ({ page }) => {
    await writeWorkspaceSnapshot(page, {
      playback: {
        visible: true,
        sessionId: 'session-retry',
        sessionExpiresAtMs: Date.now() + 60 * 60 * 1000,
        resource: buildWorkspaceSnapshotResource(),
        currentTime: 8,
        paused: true
      }
    })

    let resumeCalls = 0
    await page.route(buildApiUrl('/api/client/tg/play-token/resume'), async route => {
      resumeCalls += 1
      await route.abort()
    })

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-result-card]')).toContainText('demo-video.mp4')
    await expect(page.locator('[data-download-parse-error]')).toBeHidden()
    await expect(page.locator('[data-download-auth-modal]')).toBeHidden()
    await expect
      .poll(() =>
        page.evaluate(key => {
          const raw = window.localStorage.getItem(key)
          return raw ? Object.hasOwn(JSON.parse(raw), 'playback') : false
        }, STORAGE_KEYS.workspaceSnapshot)
      )
      .toBe(false)
    expect(resumeCalls).toBe(0)
  })

  test('expired playback snapshot is removed while parsed resources stay visible', async ({
    page
  }) => {
    await writeWorkspaceSnapshot(page, {
      playback: {
        visible: true,
        sessionId: 'session-expired',
        sessionExpiresAtMs: Date.now() - 1000,
        resource: buildWorkspaceSnapshotResource(),
        currentTime: 8,
        paused: true
      }
    })

    await gotoWorkspace(page)

    await expect(page.locator('[data-download-result-card]')).toContainText('demo-video.mp4')
    await expect(page.locator('[data-download-player-panel]')).toBeHidden()
  })
})
