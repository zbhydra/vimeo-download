/**
 * API 统一导出入口
 *
 * @example
 * import { authApi, quotaApi, httpClient } from '@/core/api'
 */

import { API_CONFIG } from './config'
import {
  deviceIdInjector,
  tokenInjector,
  headersInjector,
  acceptLanguageInjector,
  requestLogger,
  responseLogger,
  dataExtractor,
  retryInterceptor,
  authRefreshInterceptor,
  defaultErrorHandler
} from './client/interceptors'
import { HttpClient } from './client/HttpClient'

/**
 * 全局 HTTP 客户端单例
 *
 * 已配置完整的拦截器链：
 * - deviceId 注入
 * - token 自动注入
 * - Accept-Language 注入
 * - 基础 headers
 * - 请求/响应日志
 * - 5xx 自动重试
 * - 401 自动清除认证
 */
export const httpClient = new HttpClient(API_CONFIG.BASE_URL)

// 注册拦截器（顺序重要）
httpClient.useRequest(deviceIdInjector)
httpClient.useRequest(headersInjector)
httpClient.useRequest(tokenInjector)
httpClient.useRequest(acceptLanguageInjector)
httpClient.useRequest(requestLogger)
httpClient.useResponse(dataExtractor)
httpClient.useResponse(responseLogger)
httpClient.useError(retryInterceptor)
httpClient.useError(authRefreshInterceptor)
httpClient.useError(defaultErrorHandler)

// API 函数
export { authApi } from './auth/api'
export { subscriptionApi } from './subscription/api'
export { quotaApi } from './quota/api'
export { remoteConfigApi } from './remote-config/api'

// 导出 subscription 类型
export type { SubscriptionPeriod, SubscriptionStatus } from './subscription/types'

// 导出 quota 类型
export type { QuotaPeriod, QuotaStatus, QuotaCheckRequest, QuotaCheckResponse } from './quota/types'

// 导出远端配置类型
export type { RemoteConfig } from './remote-config/types'

// HTTP 客户端（用于创建自定义 API）
export { HttpClient } from './client/HttpClient'
export type { RequestOptions, RequestContext, HttpResponse, ApiError } from './client/types'

// 创建 HTTP 客户端的工厂函数（向后兼容）
/**
 * 创建配置好的 HTTP 客户端实例
 *
 * @deprecated 优先使用全局 httpClient 实例
 *
 * @example
 * const client = createHttpClient('http://api.example.com')
 * const data = await client.get('/endpoint')
 */
export const createHttpClient = (baseURL: string = API_CONFIG.BASE_URL) => {
  const client = new HttpClient(baseURL)

  // 注册默认拦截器
  client.useRequest(deviceIdInjector)
  client.useRequest(headersInjector)
  client.useRequest(tokenInjector)
  client.useRequest(acceptLanguageInjector)
  client.useRequest(requestLogger)
  client.useResponse(dataExtractor)
  client.useResponse(responseLogger)
  client.useError(retryInterceptor)
  client.useError(authRefreshInterceptor)
  client.useError(defaultErrorHandler)

  return client
}

// 配置
export {
  API,
  API_CONFIG,
  API_PATHS,
  API_ENDPOINTS,
  ALI_SLS_MARK,
  HTTP_HEADERS,
  STORAGE_KEYS
} from './config'
