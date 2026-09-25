/**
 * 统一 HTTP 客户端
 *
 * 提供带拦截器、超时控制、自动重试的 fetch 封装
 */

import type {
  HttpMethod,
  RequestOptions,
  RequestContext,
  HttpResponse,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor
} from './types'
import { ApiError } from './types'
import { API_CONFIG } from '../config'

export class HttpClient {
  private requestInterceptors: RequestInterceptor[] = []
  private responseInterceptors: ResponseInterceptor[] = []
  private errorInterceptors: ErrorInterceptor[] = []
  private baseURL: string

  constructor(baseURL: string) {
    this.baseURL = baseURL
  }

  /**
   * 添加请求拦截器
   */
  useRequest(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor)
  }

  /**
   * 添加响应拦截器
   */
  useResponse(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor)
  }

  /**
   * 添加错误拦截器
   */
  useError(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor)
  }

  /**
   * 构建 URL
   */
  private buildUrl(endpoint: string, params?: Record<string, string | number>): string {
    const url = `${this.baseURL}${endpoint}`

    if (!params) return url

    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value))
    }

    return `${url}?${searchParams.toString()}`
  }

  /**
   * 带超时的 fetch
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Request timeout', undefined, 'TIMEOUT', error)
      }
      throw error
    }
  }

  /**
   * 执行请求
   */
  async request<T = unknown>(
    method: HttpMethod,
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const timeout = options.timeout ?? API_CONFIG.TIMEOUT

    // 构建请求上下文
    let context: RequestContext = {
      url: this.buildUrl(endpoint, options.params),
      method,
      options,
      timestamp: Date.now()
    }

    // 执行请求拦截器
    for (const interceptor of this.requestInterceptors) {
      context = await interceptor(context)
    }

    // 执行请求（带重试）
    let lastError: Error | null = null
    const maxAttempts = (options.skipRetry ? 1 : API_CONFIG.RETRY_COUNT + 1) + 1

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // 每次重试都重建 headers，确保认证刷新后使用新 token
        const fetchOptions: RequestInit = {
          method,
          headers: context.options.headers,
          signal: options.signal
        }

        if (options.body) {
          fetchOptions.body = JSON.stringify(options.body)
        }

        const response = await this.fetchWithTimeout(context.url, fetchOptions, timeout)

        // 处理错误响应
        if (!response.ok) {
          let errorData: unknown
          try {
            errorData = await response.json()
          } catch {
            errorData = { message: 'Unknown error' }
          }

          // 解析后端错误格式: {code: number, data: unknown, msg: string}
          const backendError = errorData as { code?: number; msg?: string; message?: string }
          const errorCode = backendError.code
          const errorMessage = backendError.msg || backendError.message || `HTTP ${response.status}`

          const apiError = new ApiError(errorMessage, response.status, errorCode, errorData)

          // 执行错误拦截器
          for (const interceptor of this.errorInterceptors) {
            await interceptor(apiError, context)
          }

          // 检查是否需要重试
          if (context._shouldRetry && attempt < maxAttempts - 1) {
            context._shouldRetry = false
            await this.delay(API_CONFIG.RETRY_DELAY)
            continue
          }

          throw apiError
        }

        // 文本响应必须直接读取；Response body 被 json() 消费后无法再回退到 text()。
        let data: unknown
        const contentType = response.headers.get('Content-Type')
        if (contentType?.includes('text/')) {
          data = await response.text()
        } else {
          try {
            data = await response.json()
          } catch {
            data = null
          }
        }

        // 构建响应对象
        let httpResponse: HttpResponse<T> = {
          data: data as T,
          status: response.status,
          headers: response.headers
        }

        // 执行响应拦截器
        try {
          for (const interceptor of this.responseInterceptors) {
            const result = await interceptor(httpResponse as HttpResponse<unknown>, context)
            httpResponse = result as HttpResponse<T>
          }
        } catch (interceptorError) {
          // 响应拦截器抛出的错误（如 dataExtractor 检测到业务错误）
          if (interceptorError instanceof ApiError) {
            // 执行错误拦截器
            for (const interceptor of this.errorInterceptors) {
              await interceptor(interceptorError, context)
            }
            throw interceptorError
          }
          throw interceptorError
        }

        return httpResponse.data
      } catch (error) {
        lastError = error as Error

        // 如果是 ApiError，检查是否需要重试
        if (lastError instanceof ApiError) {
          // ApiError 已经在某个地方执行过拦截器了（HTTP 错误处理或响应拦截器）
          // 只需要检查重试标记
          if (context._shouldRetry && attempt < maxAttempts - 1) {
            context._shouldRetry = false
            await this.delay(API_CONFIG.RETRY_DELAY)
            continue
          }
          // 不重试，抛出错误
          break
        }

        // 网络错误或其他错误，包装为 ApiError
        const networkError = new ApiError(
          lastError.message || 'Network error',
          undefined,
          'NETWORK_ERROR',
          lastError
        )
        lastError = networkError

        // 执行错误拦截器
        for (const interceptor of this.errorInterceptors) {
          await interceptor(networkError, context)
        }

        // 网络错误通常不重试（fetch 已经处理超时）
        break
      }
    }

    throw lastError
  }

  /**
   * GET 请求
   */
  get<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', endpoint, options)
  }

  /**
   * POST 请求
   */
  post<T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', endpoint, { ...options, body })
  }

  /**
   * PUT 请求
   */
  put<T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', endpoint, { ...options, body })
  }

  /**
   * DELETE 请求
   */
  delete<T = unknown>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', endpoint, options)
  }

  /**
   * PATCH 请求
   */
  patch<T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', endpoint, { ...options, body })
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
