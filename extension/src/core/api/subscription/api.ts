/**
 * 订阅 API
 */

import { httpClient } from '../index'
import { API } from '../config'
import type { SubscriptionStatus } from './types'
import type { JsonObject, JsonValue } from '../../rpc/types'

export const subscriptionApi = {
  /**
   * 获取订阅状态
   */
  async getStatus(): Promise<SubscriptionStatus> {
    return parseSubscriptionStatus(
      await httpClient.get<JsonValue>(API.ENDPOINTS.SUBSCRIPTION_STATUS)
    )
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
