/**
 * Pricing 订阅商品接口客户端。
 *
 * 本模块消费订阅配置、管理入口与好评赠送接口；下单统一交给公共 OrderCheckout。
 */

import {
  getJson,
  postJson,
  type JsonObject,
  type JsonValue,
  type RequestContext
} from '../../scripts/runtime/api'
import type {
  OrderCheckoutPaymentChannel,
  OrderCheckoutPeriod
} from '../order-checkout/order-checkout-api'

/** 订阅商品类别。 */
export const SUBSCRIPTION_PRODUCT_CLASS = 1

/** 订阅 checkout configs 响应。 */
export interface SubscriptionCheckoutConfigsResponse {
  /** 可购买订阅商品列表。 */
  checkout_configs: SubscriptionCheckoutPlan[]
  /** 是否开放好评赠送活动。 */
  review_reward_enabled: boolean
  /** 好评赠送资格状态位：0 可领，1 不可领（已领过，或资格推导失败按不可领降级）；匿名请求与活动关闭时为 0。 */
  review_reward_claimed_count: number
}

/** 好评赠送领取结果。 */
export type ReviewRewardClaimResult = 'granted' | 'already_claimed'

/** 好评赠送领取响应。 */
export interface ReviewRewardClaimResponse {
  /** 本次领取结果。 */
  result: ReviewRewardClaimResult
  /** 好评赠送资格状态位：领取请求成功返回时恒为 1。 */
  review_reward_claimed_count: number
}

/** 订阅配置与当前账号的好评赠送资格。 */
export interface SubscriptionCheckoutData {
  /** 可购买订阅商品列表。 */
  plans: SubscriptionCheckoutPlan[]
  /** 是否开放好评赠送活动。 */
  reviewRewardEnabled: boolean
  /** 好评赠送资格状态位：0 可领，1 不可领（已领过，或资格推导失败按不可领降级）。 */
  reviewRewardClaimedCount: number
}

/** 当前订阅的渠道管理动作。 */
export interface SubscriptionManagementResult {
  /** 渠道 Web 管理入口；为空表示客户端展示渠道内指引。 */
  url: string | null
}

/** 单个订阅商品配置。 */
export interface SubscriptionCheckoutPlan {
  /** 商品类别，订阅为 1。 */
  product_class: number
  /** 商品标识。 */
  product_id: string
  /** 后端配置商品名。 */
  product_name: string
  /** 商业与权益周期。 */
  period: Exclude<OrderCheckoutPeriod, 'none'>
  /** 是否由渠道自动续费。 */
  auto_renew: boolean
  /** 商品卡默认展示币种。 */
  display_currency: string
  /** 商品卡默认展示金额，6 位精度。 */
  display_amount: number
  /** 每日下载额度；小于 0 表示无限。 */
  daily_limit: number
  /** 当前商品可用支付渠道。 */
  payment_channels: SubscriptionCheckoutPaymentChannel[]
}

/** 订阅商品的单个可购买价格选项。 */
export interface SubscriptionCheckoutPaymentChannel extends OrderCheckoutPaymentChannel {
  /** 购买选项 ID。 */
  product_price_id: number
}

/** 请求订阅 checkout configs。 */
export async function listSubscriptionCheckoutConfigs(
  context: RequestContext
): Promise<SubscriptionCheckoutData> {
  const response = await getJson<JsonValue>(
    '/api/client/subscription/checkout-configs',
    context
  )

  if (!isJsonObject(response)) {
    throw new Error(
      '[pricing-checkout] GET /api/client/subscription/checkout-configs returned invalid data: expected an object.'
    )
  }
  if (!Array.isArray(response.checkout_configs)) {
    throw new Error(
      '[pricing-checkout] GET /api/client/subscription/checkout-configs returned invalid data: checkout_configs must be an array.'
    )
  }
  const invalidPlanIndex = response.checkout_configs.findIndex(value => !isSubscriptionCheckoutPlan(value))
  if (invalidPlanIndex !== -1) {
    throw new Error(
      `[pricing-checkout] GET /api/client/subscription/checkout-configs returned invalid data: checkout_configs[${invalidPlanIndex}] is not a valid subscription plan.`
    )
  }
  const plans = response.checkout_configs.filter(isSubscriptionCheckoutPlan)
  if (typeof response.review_reward_enabled !== 'boolean') {
    throw new Error(
      '[pricing-checkout] GET /api/client/subscription/checkout-configs returned invalid data: review_reward_enabled must be a boolean.'
    )
  }
  if (!isNonNegativeInteger(response.review_reward_claimed_count)) {
    throw new Error(
      '[pricing-checkout] GET /api/client/subscription/checkout-configs returned invalid data: review_reward_claimed_count must be a non-negative integer.'
    )
  }

  return {
    plans,
    reviewRewardEnabled: response.review_reward_enabled,
    reviewRewardClaimedCount: response.review_reward_claimed_count
  }
}

/** 领取好评赠送订阅。 */
export async function claimSubscriptionReviewReward(
  context: RequestContext
): Promise<ReviewRewardClaimResponse> {
  const response = await postJson<JsonValue>(
    '/api/client/subscription/review-reward/claim',
    context,
    {}
  )

  if (!isJsonObject(response)) {
    throw new Error(
      '[pricing-checkout] POST /api/client/subscription/review-reward/claim returned invalid data: expected an object.'
    )
  }
  if (response.result !== 'granted' && response.result !== 'already_claimed') {
    throw new Error(
      '[pricing-checkout] POST /api/client/subscription/review-reward/claim returned invalid data: result must be granted or already_claimed.'
    )
  }
  if (!isNonNegativeInteger(response.review_reward_claimed_count)) {
    throw new Error(
      '[pricing-checkout] POST /api/client/subscription/review-reward/claim returned invalid data: review_reward_claimed_count must be a non-negative integer.'
    )
  }
  return {
    result: response.result,
    review_reward_claimed_count: response.review_reward_claimed_count
  }
}

/** 请求服务端按当前登录账号的订阅渠道生成管理入口。 */
export async function createSubscriptionManagement(
  context: RequestContext
): Promise<SubscriptionManagementResult> {
  const response = await postJson<JsonValue>('/api/client/subscription/management', context)
  if (!isJsonObject(response)) {
    throw new Error(
      '[pricing-checkout] POST /api/client/subscription/management returned invalid data: expected an object.'
    )
  }
  const url = response.url
  if (url !== null && typeof url !== 'string') {
    throw new Error(
      '[pricing-checkout] POST /api/client/subscription/management returned invalid data: url must be a string or null.'
    )
  }
  return { url: typeof url === 'string' ? url : null }
}

/** 格式化展示价；后端金额为 6 位精度。 */
export function formatPricingDisplayPrice(
  price:
    | Pick<SubscriptionCheckoutPlan, 'display_amount' | 'display_currency'>
    | Pick<SubscriptionCheckoutPaymentChannel, 'amount' | 'currency'>
): string {
  const amount = ('amount' in price ? price.amount : price.display_amount) / 1_000_000
  const currency = 'currency' in price ? price.currency : price.display_currency
  if (currency === 'USD') {
    return `$${amount.toFixed(2)}`
  }
  return `${currency} ${formatSixDecimalAmount(amount)}`
}

/** 按当前语言展示商品周期；月/年/终生沿用站点业务文案，其余周期回退 Intl 单位格式。 */
export function formatSubscriptionPeriod(
  period: SubscriptionCheckoutPlan['period'],
  monthlyLabel: string,
  yearlyLabel: string,
  lifetimeLabel: string,
  locale: string
): string {
  if (period === 'month') {
    return monthlyLabel
  }
  if (period === 'year') {
    return yearlyLabel
  }
  if (period === 'lifetime') {
    return lifetimeLabel
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'month', unitDisplay: 'long' }).format(3)
}

/** 格式化最多 6 位小数的金额，去掉尾部 0。 */
function formatSixDecimalAmount(amount: number): string {
  return amount.toFixed(6).replace(/\.?0+$/, '')
}

/** 运行时校验订阅 plan，过滤半升级或历史坏数据。 */
function isSubscriptionCheckoutPlan(
  value: JsonValue
): value is JsonObject & SubscriptionCheckoutPlan {
  if (!isJsonObject(value)) {
    return false
  }
  return (
    value.product_class === SUBSCRIPTION_PRODUCT_CLASS &&
    typeof value.product_id === 'string' &&
    value.product_id.length > 0 &&
    typeof value.product_name === 'string' &&
    (value.period === 'month' || value.period === 'quarter' || value.period === 'year' || value.period === 'lifetime') &&
    typeof value.auto_renew === 'boolean' &&
    typeof value.display_currency === 'string' &&
    typeof value.display_amount === 'number' &&
    Number.isFinite(value.display_amount) &&
    typeof value.daily_limit === 'number' &&
    Number.isFinite(value.daily_limit) &&
    Array.isArray(value.payment_channels) &&
    value.payment_channels.every(isSubscriptionCheckoutPaymentChannel)
  )
}

/** 运行时校验订阅购买选项身份，避免用半升级响应创建错误订单。 */
function isSubscriptionCheckoutPaymentChannel(
  value: JsonValue
): value is JsonObject & SubscriptionCheckoutPaymentChannel {
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

/** 判断 JSON 值是否为可按字段读取的对象。 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 资格状态位合同只接受非负整数，拒绝缺字段、负数和小数。 */
function isNonNegativeInteger(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
