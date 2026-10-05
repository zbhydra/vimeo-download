/**
 * API 请求封装模块
 *
 * 提供统一的 HTTP 请求处理，包括：
 * - 请求头构建（设备ID、认证token、语言）
 * - URL 构建（基础路径、查询参数）
 * - 响应解析（标准信封格式、错误处理）
 * - 专用请求方法（GET/POST/下载）
 */

import { reportHomepageMarkToSls } from './sls-mark'
import { sanitizeMarkText } from './mark-sanitizer'

/**
 * 请求上下文，包含认证和设备信息
 */
export interface RequestContext {
  /** 设备唯一标识符 */
  deviceId: string
  /** 用户认证token，可选 */
  token?: string | null
}

/** JSON 基础值。 */
export type JsonPrimitive = string | number | boolean | null

/** 可安全序列化为 JSON 的值。 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray

/** JSON 对象。 */
export interface JsonObject {
  /** JSON 字段。 */
  [key: string]: JsonValue
}

/** JSON 数组。 */
export type JsonArray = JsonValue[]

/**
 * 后端标准响应信封格式。
 */
interface ApiEnvelope<T> {
  /** 业务状态码，10000 表示成功。 */
  code?: number
  /** 响应数据；错误响应可携带结构化失败原因。 */
  data?: T | JsonObject
  /** 错误消息（msg 或 message 字段）。 */
  msg?: string
  message?: string
}

/** API 请求选项。 */
export interface RequestOptions {
  /** 请求超时时间，毫秒。 */
  timeoutMs?: number
}

/** 后端连接类失败原因。 */
export type BackendConnectFailureReason = 'NETWORK_ERROR' | 'REQUEST_TIMEOUT'

/** 后端请求方法，用于 SLS 连接失败日志。 */
export type BackendConnectFailureMethod = 'GET' | 'POST'

/** 后端连接失败 SLS-only 事件名。 */
const BACKEND_CONNECT_FAILED_MARK_TYPE = 'web_backend_connect_failed'

/** 后端连接失败排障字段最大长度。 */
const MAX_BACKEND_CONNECT_FIELD_LENGTH = 256

/** 已脱敏 key=value 再次进入 SLS JSON 时，避免最终脱敏规则破坏 JSON。 */
const REDACTED_KEY_VALUE_RE =
  /\b(cookie|set-cookie|authorization|proxy-authorization|direct_url|download_url|access_token|refresh_token|id_token|auth_token|token|sig|signature|client_secret|secret|session|sessionid|sid)\s*[:=]\s*\[redacted\]/gi

/**
 * 自定义 API 错误类
 *
 * 包含 HTTP 状态码和业务错误码，便于错误分类处理。
 */
export class HomepageApiError extends Error {
  /** HTTP 状态码 */
  status: number
  /** 业务错误码 */
  code?: number | string
  /** 后端错误响应 data。 */
  data?: JsonObject
  /** 后端解析失败等内部可定位原因。 */
  failureReason?: string

  constructor(message: string, status = 500, code?: number | string, data?: JsonObject) {
    super(message)
    this.name = 'HomepageApiError'
    this.status = status
    this.code = code
    this.data = data

    const failureReason = normalizeFailureReason(data)
    if (failureReason) {
      this.failureReason = failureReason
    }
  }
}

/** 把错误响应 data 规范为 JSON 对象。 */
function normalizeApiErrorData<T>(value: T | JsonObject | undefined): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as JsonObject
}

/** 读取后端给前端埋点使用的详细失败原因。 */
function normalizeFailureReason(data: JsonObject | undefined): string | undefined {
  const value =
    typeof data?.failure_reason === 'string' ? data.failure_reason : data?.reason
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }

  return value
}

/** 规范化请求超时时间。 */
function normalizeTimeoutMs(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return Math.floor(value)
}

/** 裁剪后端连接失败排障文本字段。 */
function truncateBackendConnectText(value: string): string {
  return value.length > MAX_BACKEND_CONNECT_FIELD_LENGTH
    ? value.slice(0, MAX_BACKEND_CONNECT_FIELD_LENGTH)
    : value
}

/** 预脱敏单个诊断字段，保持 JSON 字符串在最终 SLS 脱敏后仍可解析。 */
function sanitizeBackendConnectText(value: string): string {
  return truncateBackendConnectText(sanitizeMarkText(value).replace(REDACTED_KEY_VALUE_RE, '$1_redacted'))
}

/** 只保留 API path，避免把 base URL、query 或 fragment 写入 SLS。 */
function normalizeTelemetryApiPath(pathOrUrl: string): string {
  try {
    return truncateBackendConnectText(new URL(pathOrUrl, getApiBaseUrl()).pathname)
  } catch {
    return truncateBackendConnectText(pathOrUrl.split('?')[0]?.split('#')[0] || pathOrUrl)
  }
}

/** 只向 SLS 上报后端连接失败，不写后端 mark_logs。 */
export function reportBackendConnectFailureToSls(
  method: BackendConnectFailureMethod,
  pathOrUrl: string,
  context: RequestContext,
  reason: BackendConnectFailureReason,
  errorName: string,
  errorMessage: string,
  timeoutMs?: number
): void {
  reportHomepageMarkToSls(
    BACKEND_CONNECT_FAILED_MARK_TYPE,
    context,
    JSON.stringify({
      method,
      api_path: normalizeTelemetryApiPath(pathOrUrl),
      failure_reason: reason,
      error_name: sanitizeBackendConnectText(errorName),
      error_message: sanitizeBackendConnectText(errorMessage),
      timeout_ms: typeof timeoutMs === 'number' ? timeoutMs : null
    })
  )
}

/** 判断错误是否需要清理网站端本地 token。 */
export function isHomepageAuthFailure(error: Error): boolean {
  if (!(error instanceof HomepageApiError)) {
    return false
  }
  return error.status === 401
}

/**
 * 获取 API 基础 URL
 *
 * 使用构建期 PUBLIC_API_BASE_URL。生产必须由部署配置显式注入，避免域名迁移后继续请求历史 API。
 *
 * @returns 不带尾部斜杠的基础 URL
 */
export function getApiBaseUrl(): string {
  const envBaseUrl = import.meta.env.PUBLIC_API_BASE_URL
  if (!envBaseUrl) {
    throw new Error('homepage api: missing PUBLIC_API_BASE_URL build env; set it before building website assets')
  }

  return envBaseUrl.endsWith('/') ? envBaseUrl.slice(0, -1) : envBaseUrl
}

/**
 * 获取当前页面语言，用于 Accept-Language 请求头
 *
 * 优先级：HTML lang 属性 > 浏览器语言 > 默认英语
 *
 * @returns 语言标签，如 "zh-CN"、"en-US"
 */
function getAcceptLanguage(): string {
  return document.documentElement.lang || navigator.language || 'en-US'
}

/**
 * 构建请求头
 *
 * 包含标准头信息：
 * - Accept-Language: 当前语言
 * - X-Device-Id: 设备标识
 * - X-Client-Product: 客户端产品标识（固定为 "web"）
 * - Authorization: Bearer token（如果已登录）
 *
 * @param context - 请求上下文
 * @param extraHeaders - 额外的请求头
 * @returns 构建好的 Headers 对象
 */
export function buildRequestHeaders(context: RequestContext, extraHeaders: HeadersInit = {}): Headers {
  const headers = new Headers(extraHeaders)
  headers.set('Accept-Language', getAcceptLanguage())
  headers.set('X-Device-Id', context.deviceId)
  headers.set('X-Client-Product', 'web')

  if (context.token) {
    headers.set('Authorization', `Bearer ${context.token}`)
  }

  return headers
}

/**
 * 构建完整请求 URL
 *
 * @param path - API 路径，如 "/api/client/auth/me"
 * @param params - 查询参数，undefined 值会被跳过
 * @returns 完整的 URL 字符串
 */
function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path, getApiBaseUrl())

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue
      }

      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

/**
 * 解析 API 响应信封
 *
 * 处理两种响应格式：
 * 1. 标准信封格式（包含 code/data/msg）：code=10000 时返回 data
 * 2. 直接数据格式：无 code 字段时直接返回整个响应体
 *
 * @param response - fetch Response 对象
 * @returns 解析后的数据
 * @throws HomepageApiError 当 HTTP 错误或业务错误时抛出
 */
async function parseEnvelope<T>(response: Response): Promise<T> {
  let body: ApiEnvelope<T> | null = null

  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch (error) {
    console.error(error)
    throw new HomepageApiError(`HTTP ${response.status}`, response.status)
  }

  // HTTP 层面错误
  if (!response.ok) {
    throw new HomepageApiError(
      body?.msg || body?.message || `HTTP ${response.status}`,
      response.status,
      body?.code,
      normalizeApiErrorData(body?.data)
    )
  }

  // 检查标准信封格式
  if (body && typeof body === 'object' && 'code' in body) {
    // 10000 是业务成功码
    if (body.code === 10000) {
      return body.data as T
    }

    throw new HomepageApiError(
      body.msg || body.message || 'Request failed',
      response.status,
      body.code,
      normalizeApiErrorData(body.data)
    )
  }

  // 非信封格式，直接返回
  return body as T
}

/**
 * 发送 GET 请求并返回 JSON 数据
 *
 * @param path - API 路径
 * @param context - 请求上下文
 * @param params - 查询参数
 * @returns 解析后的响应数据
 */
export async function getJson<T>(
  path: string,
  context: RequestContext,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: buildRequestHeaders(context)
    })
  } catch (error) {
    console.error(error)
    const errorName = error instanceof Error ? error.name || 'Error' : 'NonError'
    const errorMessage = error instanceof Error ? error.message : String(error)
    reportBackendConnectFailureToSls('GET', path, context, 'NETWORK_ERROR', errorName, errorMessage)
    throw new HomepageApiError(
      `GET ${path} network failed: ${errorName}: ${errorMessage}`,
      0,
      'NETWORK_ERROR',
      {
        failure_reason: `api_get_failed: path=${path}, reason=NETWORK_ERROR, error=${errorName}: ${errorMessage}`
      }
    )
  }

  return parseEnvelope<T>(response)
}

/**
 * 发送 POST 请求并返回 JSON 数据
 *
 * @param path - API 路径
 * @param context - 请求上下文
 * @param body - 请求体数据，会被序列化为 JSON
 * @returns 解析后的响应数据
 */
export async function postJson<T>(
  path: string,
  context: RequestContext,
  body?: JsonObject,
  options: RequestOptions = {}
): Promise<T> {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs)
  const controller = timeoutMs === undefined ? undefined : new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  if (controller && timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: buildRequestHeaders(context, {
        'Content-Type': 'application/json'
      }),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal
    })
  } catch (error) {
    console.error(error)
    const errorName = error instanceof Error ? error.name || 'Error' : 'NonError'
    const errorMessage = error instanceof Error ? error.message : String(error)
    const code: BackendConnectFailureReason = timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR'
    const timeoutText = timedOut && timeoutMs !== undefined ? ` after ${timeoutMs}ms` : ''
    reportBackendConnectFailureToSls('POST', path, context, code, errorName, errorMessage, timeoutMs)
    throw new HomepageApiError(
      `POST ${path} ${timedOut ? `timed out${timeoutText}` : `network failed: ${errorName}: ${errorMessage}`}`,
      0,
      code,
      {
        failure_reason: `api_post_failed: path=${path}, reason=${code}${timeoutText}, error=${errorName}: ${errorMessage}`
      }
    )
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }

  return parseEnvelope<T>(response)
}

/**
 * 发送离页场景可继续投递的 POST 请求
 *
 * 用于点击外链等场景的 fire-and-forget 埋点。调用方不依赖响应结果。
 */
export function postJsonKeepalive(
  path: string,
  context: RequestContext,
  body?: JsonObject
): void {
  void fetch(buildUrl(path), {
    method: 'POST',
    headers: buildRequestHeaders(context, {
      'Content-Type': 'application/json'
    }),
    body: body ? JSON.stringify(body) : undefined,
    keepalive: true
  }).catch(() => {})
}

/**
 * 发送下载请求
 *
 * 与普通 GET 请求不同，此函数：
 * - 不解析响应为 JSON
 * - 直接返回 Response 对象供调用方处理 Blob
 * - 如果响应是 JSON（错误情况），会抛出 HomepageApiError
 *
 * @param path - API 路径
 * @param context - 请求上下文
 * @param params - 查询参数
 * @returns fetch Response 对象
 * @throws HomepageApiError 当响应为 JSON 错误时抛出
 */
export async function requestDownload(
  path: string,
  context: RequestContext,
  params: Record<string, string | number | undefined>,
  extraHeaders: HeadersInit = {}
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: buildRequestHeaders(context, extraHeaders)
    })
  } catch (error) {
    console.error(error)
    const errorName = error instanceof Error ? error.name || 'Error' : 'NonError'
    const errorMessage = error instanceof Error ? error.message : String(error)
    reportBackendConnectFailureToSls('GET', path, context, 'NETWORK_ERROR', errorName, errorMessage)
    throw new HomepageApiError(
      `GET ${path} download request network failed: ${errorName}: ${errorMessage}`,
      0,
      'NETWORK_ERROR',
      {
        failure_reason: `api_download_failed: path=${path}, reason=NETWORK_ERROR, error=${errorName}: ${errorMessage}`
      }
    )
  }

  const contentType = response.headers.get('content-type') || ''
  // 如果返回了 JSON，说明是错误响应
  if (!response.ok || contentType.includes('application/json')) {
    let body: ApiEnvelope<JsonValue> | null = null

    try {
      body = (await response.json()) as ApiEnvelope<JsonValue>
    } catch (error) {
      console.error(error)
      throw new HomepageApiError(`HTTP ${response.status}`, response.status)
    }

    throw new HomepageApiError(
      body?.msg || body?.message || `HTTP ${response.status}`,
      response.status,
      body?.code,
      normalizeApiErrorData(body?.data)
    )
  }

  return response
}
