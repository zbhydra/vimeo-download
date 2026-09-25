/**
 * HTTP 客户端核心类型定义
 */

import { I18nService } from '../../../locales'

/** HTTP 请求方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/** 请求配置选项 */
export interface RequestOptions {
  /** URL 参数 */
  params?: Record<string, string | number>
  /** 请求体 */
  body?: unknown
  /** 请求头 */
  headers?: Record<string, string>
  /** 是否需要认证（默认自动注入 token） */
  requireAuth?: boolean
  /** 超时时间（毫秒），覆盖全局配置 */
  timeout?: number
  /** 是否跳过重试 */
  skipRetry?: boolean
  /** 是否跳过自动错误 Toast 提示 */
  skipErrorToast?: boolean
  /** 是否跳过请求日志，token 交换等敏感请求必须开启 */
  skipRequestLog?: boolean
  /** 401 时是否保留本地认证状态 */
  preserveAuthOnUnauthorized?: boolean
  /** AbortSignal 用于取消请求 */
  signal?: AbortSignal
}

/** 请求上下文 */
export interface RequestContext {
  /** 完整 URL */
  url: string
  /** 请求方法 */
  method: HttpMethod
  /** 请求配置 */
  options: RequestOptions
  /** 请求时间戳 */
  timestamp: number
  /** 内部：当前重试次数 */
  _retryCount?: number
  /** 内部：是否应该重试 */
  _shouldRetry?: boolean
  /** 内部：是否已经尝试过认证刷新 */
  _authRefreshAttempted?: boolean
  /** 内部：认证刷新遇到短暂故障时保留本地登录态 */
  _preserveAuthOnUnauthorized?: boolean
}

/** HTTP 响应 */
export interface HttpResponse<T = unknown> {
  /** 响应数据 */
  data: T
  /** 响应状态码 */
  status: number
  /** 响应头 */
  headers: Headers
}

/** API 错误类 */
export class ApiError extends Error {
  /** true 表示本次错误来自短暂故障，调用方应保留本地登录态。 */
  preserveAuthState = false

  constructor(
    message: string,
    public status?: number,
    public backendCode?: string | number,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** 获取错误显示消息 */
  getDisplayMessage(): string {
    if (typeof this.backendCode === 'number') {
      // 后端返回的错误码，优先用错误码查找 i18n 翻译
      const translated = I18nService.t(`apiError.${this.backendCode}`)
      // 如果翻译结果等于 key（说明没找到翻译），则使用 message
      if (translated === `apiError.${this.backendCode}`) {
        return this.message || `error code:${this.backendCode}`
      }
      return translated
    }
    return this.message
  }
}

/** 拦截器类型定义 */
export type RequestInterceptor = (
  context: RequestContext
) => RequestContext | Promise<RequestContext>

export type ResponseInterceptor<T = unknown> = (
  response: HttpResponse<T>,
  context: RequestContext
) => HttpResponse<T> | Promise<HttpResponse<T>>

export type ErrorInterceptor = (error: ApiError, context: RequestContext) => void | Promise<void>
