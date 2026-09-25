/**
 * 请求/响应拦截器实现
 */

import type { RequestInterceptor, ResponseInterceptor, ErrorInterceptor } from './types'
import { ApiError } from './types'
import { API, API_CONFIG, HTTP_HEADERS, STORAGE_KEYS } from '../config'
import { storageManager } from '../../storage'
import { logger } from '../../utils/logger'
import { I18nService } from '../../../locales'
import { toastService } from '../../composables/useToast'
import { isAuthFailureCode, isAuthFailureStatus } from '../auth/sessionFailure'
import type { JsonObject, JsonValue } from '../../rpc/types'

interface RefreshTokenResponse {
  /** 新访问令牌。 */
  access_token: string
  /** 新刷新令牌。 */
  refresh_token: string
}

type RefreshAccessTokenResult = 'refreshed' | 'auth_failed' | 'transient_failed' | 'missing_refresh'

let refreshPromise: Promise<RefreshAccessTokenResult> | null = null

/** 判断 HTTP JSON 响应是否为可读取字段的对象。 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 从成功信封读取完整 token 对；任何异常形状都返回 null。 */
function readRefreshTokenResponse(body: JsonValue): RefreshTokenResponse | null {
  if (!isJsonObject(body) || body.code !== 10000 || !isJsonObject(body.data)) {
    return null
  }

  const accessToken = body.data.access_token
  const refreshToken = body.data.refresh_token
  if (
    typeof accessToken !== 'string' ||
    accessToken.trim().length === 0 ||
    typeof refreshToken !== 'string' ||
    refreshToken.trim().length === 0
  ) {
    return null
  }

  return { access_token: accessToken, refresh_token: refreshToken }
}

/** 从错误信封读取业务码，用于非 200 响应的认证失败分类。 */
function readRefreshErrorCode(body: JsonValue): string | number | undefined {
  if (!isJsonObject(body)) {
    return undefined
  }

  const code = body.code
  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

async function parseRefreshResponse(response: Response): Promise<RefreshAccessTokenResult> {
  let body: JsonValue

  try {
    body = (await response.json()) as JsonValue
  } catch (err) {
    logger.warn('[HttpClient] Failed to parse auth refresh response:', err)
    if (response.status === 200) {
      return 'auth_failed'
    }
    return isAuthFailureStatus(response.status) ? 'auth_failed' : 'transient_failed'
  }

  if (!response.ok) {
    if (isAuthFailureStatus(response.status) || isAuthFailureCode(readRefreshErrorCode(body))) {
      return 'auth_failed'
    }
    return 'transient_failed'
  }

  const tokenResponse = readRefreshTokenResponse(body)
  if (!tokenResponse) {
    // 后端业务错误使用 HTTP 200；没有返回完整 token 对时，旧会话已无法恢复。
    return response.status === 200 ? 'auth_failed' : 'transient_failed'
  }

  await storageManager.set(STORAGE_KEYS.ACCESS_TOKEN, tokenResponse.access_token)
  await storageManager.set(STORAGE_KEYS.REFRESH_TOKEN, tokenResponse.refresh_token)
  return 'refreshed'
}

async function refreshAccessToken(): Promise<RefreshAccessTokenResult> {
  const refreshToken = await storageManager.get<string>(STORAGE_KEYS.REFRESH_TOKEN)
  if (!refreshToken) {
    return 'missing_refresh'
  }

  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}${API.ENDPOINTS.AUTH_REFRESH}`, {
      method: 'POST',
      headers: {
        'Content-Type': HTTP_HEADERS.CONTENT_TYPE,
        [HTTP_HEADERS.CLIENT_PRODUCT]: 'extension'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    })

    return parseRefreshResponse(response)
  } catch (err) {
    logger.warn('[HttpClient] Auth refresh request failed:', err)
    return 'transient_failed'
  }
}

/**
 * Device ID 注入拦截器
 * 从 storage 获取 device_id 并添加到 X-Device-Id header
 * device_id 由 background service worker 初始化，避免竞态条件
 */
export const deviceIdInjector: RequestInterceptor = async context => {
  const deviceId = await storageManager.get<string>(STORAGE_KEYS.DEVICE_ID)
  if (deviceId) {
    context.options.headers = {
      ...context.options.headers,
      [HTTP_HEADERS.DEVICE_ID]: deviceId
    }
  }
  return context
}

/**
 * Token 注入拦截器
 * 自动从 storage 获取 token 并添加到 Authorization header
 */
export const tokenInjector: RequestInterceptor = async context => {
  // 默认需要认证，除非明确设置为 false
  if (context.options.requireAuth !== false) {
    const token = await storageManager.get<string>(STORAGE_KEYS.ACCESS_TOKEN)
    if (token) {
      context.options.headers = {
        ...context.options.headers,
        Authorization: HTTP_HEADERS.AUTH_PREFIX + token
      }
    }
  }
  return context
}

/**
 * 基础 Headers 注入拦截器
 */
export const headersInjector: RequestInterceptor = context => {
  context.options.headers = {
    'Content-Type': HTTP_HEADERS.CONTENT_TYPE,
    [HTTP_HEADERS.CLIENT_PRODUCT]: 'extension',
    ...context.options.headers
  }
  return context
}

/**
 * Accept-Language 注入拦截器
 * 自动从 I18nService 获取当前语言并添加到 Accept-Language header
 */
export const acceptLanguageInjector: RequestInterceptor = context => {
  // 获取当前语言（已经是标准 Accept-Language 格式，如 en-US、zh-CN）
  const currentLang = I18nService.getCurrentLanguage()

  context.options.headers = {
    ...context.options.headers,
    [HTTP_HEADERS.ACCEPT_LANGUAGE]: currentLang
  }
  return context
}

/**
 * 请求日志拦截器
 */
export const requestLogger: RequestInterceptor = context => {
  if (context.options.skipRequestLog === true) {
    logger.info(`[HttpClient] ${context.method} ${context.url}`)
    return context
  }

  logger.info(`[HttpClient] ${context.method} ${context.url}`, {
    params: context.options.params,
    body: context.options.body
  })
  return context
}

/**
 * 响应日志拦截器
 */
export const responseLogger: ResponseInterceptor = (response, context) => {
  logger.info(`[HttpClient] ${context.method} ${context.url} -> ${response.status}`)
  return response
}

/**
 * 数据提取拦截器
 * 提取后端响应中的 data 字段
 * 后端返回格式: {code: 10000, data: {...}, msg: "success"}
 * 后端错误格式: {code: 10106, data: {}, msg: "EMAIL_VERIFY_CODE_INVALID"}
 */
export const dataExtractor: ResponseInterceptor = (response, context) => {
  const responseBody = response.data as { code: number; data: unknown; msg: string }

  // 检查是否是后端响应格式
  if (responseBody && typeof responseBody === 'object' && 'code' in responseBody) {
    if (responseBody.code === 10000) {
      // 成功响应，提取 data 字段
      response.data = responseBody.data as typeof response.data
    } else {
      // 错误响应，显示 Toast 并抛出 ApiError
      const apiError = new ApiError(
        responseBody.msg || `error code:${responseBody.code}`,
        response.status,
        responseBody.code,
        responseBody
      )

      // 全局错误提示 - 除非请求明确禁用了错误提示
      if (context.options.skipErrorToast !== true) {
        const errorMessage = apiError.getDisplayMessage()
        toastService.error(errorMessage)
      }

      // 触发错误拦截器
      throw apiError
    }
  }

  return response
}

/**
 * 错误重试拦截器
 * 对 5xx 错误自动重试
 */
export const retryInterceptor: ErrorInterceptor = async (error, context) => {
  const isRetryable =
    !context.options.skipRetry &&
    error.status &&
    error.status >= 500 &&
    (context._retryCount || 0) < API_CONFIG.RETRY_COUNT

  if (isRetryable) {
    context._retryCount = (context._retryCount || 0) + 1
    logger.warn(`[HttpClient] Retrying request (${context._retryCount}/${API_CONFIG.RETRY_COUNT})`)
    // 标记需要重试
    context._shouldRetry = true
  }
}

/**
 * Access Token 过期刷新拦截器
 * 收到 401 时用 refresh token 换新 token，并让 HttpClient 重试原请求
 */
export const authRefreshInterceptor: ErrorInterceptor = async (error, context) => {
  if (
    error.status !== 401 ||
    context.options.requireAuth === false ||
    context._authRefreshAttempted
  ) {
    return
  }

  context._authRefreshAttempted = true

  try {
    refreshPromise = refreshPromise ?? refreshAccessToken()
    const refreshResult = await refreshPromise
    if (refreshResult === 'transient_failed') {
      error.preserveAuthState = true
      context._preserveAuthOnUnauthorized = true
      return
    }
    if (refreshResult !== 'refreshed') {
      return
    }

    const token = await storageManager.get<string>(STORAGE_KEYS.ACCESS_TOKEN)
    if (!token) {
      return
    }

    context.options.headers = {
      ...context.options.headers,
      Authorization: HTTP_HEADERS.AUTH_PREFIX + token
    }
    context._shouldRetry = true
  } catch (err) {
    logger.warn('[HttpClient] Token refresh failed:', err)
    error.preserveAuthState = true
    context._preserveAuthOnUnauthorized = true
  } finally {
    refreshPromise = null
  }
}

/**
 * 默认错误处理拦截器
 */
export const defaultErrorHandler: ErrorInterceptor = async (error, context) => {
  logger.error(`[HttpClient] Request failed: ${context.method} ${context.url}`, error)

  // 401 错误：清除认证状态
  if (
    error.status === 401 &&
    context.options.preserveAuthOnUnauthorized !== true &&
    !context._shouldRetry &&
    !context._preserveAuthOnUnauthorized &&
    !error.preserveAuthState
  ) {
    logger.warn('[HttpClient] Unauthorized, clearing auth')
    await storageManager.remove(STORAGE_KEYS.ACCESS_TOKEN)
    await storageManager.remove(STORAGE_KEYS.REFRESH_TOKEN)
    await storageManager.remove(STORAGE_KEYS.USER_INFO)
  }
}
