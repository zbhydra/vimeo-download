/**
 * 订阅 API
 */

import { httpClient } from '../index'
import { API } from '../config'
import type {
  SubscriptionCheckoutPlan,
  SubscriptionManagementResult,
  SubscriptionPaymentChannel,
  SubscriptionStatus
} from './types'
import type { JsonObject, JsonValue } from '../../rpc/types'

export const subscriptionApi = {
  /**
   * 获取订阅状态
   */
  async getStatus(): Promise<SubscriptionStatus> {
    return parseSubscriptionStatus(
      await httpClient.get<JsonValue>(API.ENDPOINTS.SUBSCRIPTION_STATUS)
    )
  },

  /**
   * 获取可购买订阅套餐配置；匿名可访问，校验规则与官网 pricing 一致
   */
  async listCheckoutConfigs(): Promise<SubscriptionCheckoutPlan[]> {
    const response = await httpClient.get<JsonValue>(API.ENDPOINTS.SUBSCRIPTION_CHECKOUT_CONFIGS)
    if (!isJsonObject(response) || !Array.isArray(response.checkout_configs)) {
      throw new Error(
        '[subscriptionApi.listCheckoutConfigs] /api/client/subscription/checkout-configs 返回合同不完整'
      )
    }
    // 过滤半升级或历史坏数据的套餐，避免用残缺配置创建错误订单。
    return response.checkout_configs.filter(isSubscriptionCheckoutPlan)
  },

  /**
   * 创建当前登录账号的订阅渠道管理入口
   */
  async createManagement(): Promise<SubscriptionManagementResult> {
    const response = await httpClient.post<JsonValue>(API.ENDPOINTS.SUBSCRIPTION_MANAGEMENT, {})
    if (!isJsonObject(response) || (response.url !== null && typeof response.url !== 'string')) {
      throw new Error(
        '[subscriptionApi.createManagement] /api/client/subscription/management 返回合同不完整'
      )
    }
    return { url: typeof response.url === 'string' ? response.url : null }
  }
}

/** 收窄订阅状态响应，避免无效周期进入配额 Store。 */
function parseSubscriptionStatus(value: JsonValue): SubscriptionStatus {
  if (
    !isJsonObject(value) ||
    (value.status !== undefined && value.status !== 'active' && value.status !== 'unavailable') ||
    (value.period !== 'free' &&
      value.period !== 'month' &&
      value.period !== 'quarter' &&
      value.period !== 'year' &&
      value.period !== 'lifetime' &&
      value.period !== 'unavailable') ||
    typeof value.display_name !== 'string' ||
    (value.expires_at !== null && typeof value.expires_at !== 'number') ||
    typeof value.daily_limit !== 'number' ||
    typeof value.used !== 'number' ||
    typeof value.remaining !== 'number' ||
    typeof value.reset_date !== 'string' ||
    !isJsonObject(value.extension_download) ||
    typeof value.extension_download.use !== 'number' ||
    typeof value.extension_download.remaining !== 'number' ||
    typeof value.extension_download.limit !== 'number' ||
    typeof value.auto_renew !== 'boolean'
  ) {
    throw new Error('[subscriptionApi.getStatus] /api/client/subscription/status 返回合同不完整')
  }

  return {
    ...(value.status === 'active' || value.status === 'unavailable'
      ? { status: value.status }
      : {}),
    period: value.period,
    display_name: value.display_name,
    expires_at: value.expires_at,
    daily_limit: value.daily_limit,
    used: value.used,
    remaining: value.remaining,
    extension_download: {
      use: value.extension_download.use,
      remaining: value.extension_download.remaining,
      limit: value.extension_download.limit
    },
    auto_renew: value.auto_renew,
    reset_date: value.reset_date
  }
}

/** 判断 JSON 值是否为可按字段读取的对象。 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 运行时校验订阅套餐配置，规则与 website `components/pricing/pricing-checkout.ts` 一致。 */
function isSubscriptionCheckoutPlan(
  value: JsonValue
): value is JsonObject & SubscriptionCheckoutPlan {
  if (!isJsonObject(value)) {
    return false
  }
  return (
    value.product_class === 1 &&
    typeof value.product_id === 'string' &&
    value.product_id.length > 0 &&
    typeof value.product_name === 'string' &&
    (value.period === 'month' ||
      value.period === 'quarter' ||
      value.period === 'year' ||
      value.period === 'lifetime') &&
    typeof value.auto_renew === 'boolean' &&
    typeof value.display_currency === 'string' &&
    typeof value.display_amount === 'number' &&
    Number.isFinite(value.display_amount) &&
    typeof value.daily_limit === 'number' &&
    Number.isFinite(value.daily_limit) &&
    Array.isArray(value.payment_channels) &&
    value.payment_channels.every(isSubscriptionPaymentChannel)
  )
}

/** 运行时校验支付渠道配置，避免用半升级响应创建错误订单。 */
function isSubscriptionPaymentChannel(
  value: JsonValue
): value is JsonObject & SubscriptionPaymentChannel {
  if (!isJsonObject(value)) {
    return false
  }
  return (
    typeof value.payment_method === 'string' &&
    typeof value.payment_method_name === 'string' &&
    typeof value.product_price_id === 'number' &&
    Number.isInteger(value.product_price_id) &&
    typeof value.currency === 'string' &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount)
  )
}
