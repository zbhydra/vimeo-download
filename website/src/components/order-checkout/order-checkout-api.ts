/**
 * 通用订单 checkout 接口客户端。
 *
 * 各类商品共用后端订单创建/状态接口；本模块只描述订单协议，
 * 不关心具体商品域，供公共支付渠道选择与等待支付弹窗复用。
 */

import {
  HomepageApiError,
  getJson,
  postJson,
  type JsonObject,
  type JsonValue,
  type RequestContext
} from '../../scripts/runtime/api'

/** 订单不存在或不属于当前用户。 */
export const ORDER_NOT_FOUND_CODE = 20001

/** 订单已过期。 */
export const ORDER_EXPIRED_CODE = 20003

/** 支付网关创建支付入口失败。 */
export const PAYMENT_GATEWAY_ERROR_CODE = 21001

/** 当前支付方式后端未实现。 */
export const PAYMENT_UNSUPPORTED_METHOD_CODE = 21004

/** 后端价格配置已变化，需要重新拉取 checkout configs。 */
export const PAYMENT_PRICE_UPDATED_CODE = 21005

/** 订单状态：待支付。 */
export const ORDER_STATUS_PENDING = 1

/** 订单状态：已支付。 */
export const ORDER_STATUS_PAID = 2

/** 订单状态：已取消。 */
export const ORDER_STATUS_CANCELLED = 3

/** 订单状态：已退款。 */
export const ORDER_STATUS_REFUNDED = 4

/** 订单状态：已过期。 */
export const ORDER_STATUS_EXPIRED = 5

/** 回调状态：未调用。 */
export const CALLBACK_STATUS_NOT_CALLED = 1

/** 回调状态：处理中。 */
export const CALLBACK_STATUS_PENDING = 2

/** 回调状态：履约成功。 */
export const CALLBACK_STATUS_SUCCESS = 3

/** 回调状态：履约失败。 */
export const CALLBACK_STATUS_FAILED = 4

/** 回调状态：达到最大重试。 */
export const CALLBACK_STATUS_MAX_RETRY = 5

/** 默认优先选中的支付方式。 */
export const DEFAULT_ORDER_PAYMENT_METHODS = ['clink', 'paypal'] as const

/** 自动轮询间隔，毫秒。 */
export const ORDER_CHECKOUT_POLL_INTERVAL_MS = 2000

/** 自动轮询最长等待时间，毫秒。 */
export const ORDER_CHECKOUT_POLL_TIMEOUT_MS = 10 * 60 * 1000

/** 后端订单状态数字枚举。 */
export type OrderStatus = 1 | 2 | 3 | 4 | 5

/** 后端履约回调状态数字枚举。 */
export type CallbackStatus = 1 | 2 | 3 | 4 | 5

/** 下单使用的商业与权益周期；非订阅商品使用 none，lifetime 为一次性终生权益。 */
export type OrderCheckoutPeriod = 'none' | 'month' | 'quarter' | 'year' | 'lifetime'

/** 单个支付渠道价格快照。 */
export interface OrderCheckoutPaymentChannel {
  /** 支付方式，例如 paypal 或 clink。 */
  payment_method: string
  /** 支付渠道展示名。 */
  payment_method_name: string
  /** 渠道币种，例如 USD。 */
  currency: string
  /** 渠道金额，6 位精度。 */
  amount: number
  /** 渠道侧 SKU。 */
  provider_sku?: string | null
}

/** 通用订单商品快照。 */
export interface OrderCheckoutProductSnapshot {
  /** 商品类别。 */
  product_class: number
  /** 商品标识。 */
  product_id: string
  /** 是否由渠道自动续费。 */
  auto_renew: boolean
  /** 商业与权益周期。 */
  period: OrderCheckoutPeriod
  /** 当前商品可用支付渠道。 */
  payment_channels: OrderCheckoutPaymentChannel[]
}

/** 创建通用订单请求。 */
export interface CreateOrderRequest {
  /** 商品类别。 */
  product_class: number
  /** 商品标识。 */
  product_id: string
  /** 支付方式。 */
  payment_method: string
  /** 渠道币种。 */
  currency: string
  /** 渠道金额，6 位精度。 */
  amount: number
  /** 是否由渠道自动续费。 */
  auto_renew: boolean
  /** 商业与权益周期。 */
  period: OrderCheckoutPeriod
}

/** 创建订单响应。 */
export interface CreateOrderResponse {
  /** 订单号。 */
  order_no: string
  /** 渠道金额，6 位精度。 */
  amount: number
  /** 渠道币种。 */
  currency: string
  /** 订单过期时间，毫秒时间戳。 */
  expired_at: number
  /** 当前订单支付等待页使用的支持邮箱；空字符串表示不展示反馈入口。 */
  support_mail: string
  /** 渠道专属支付数据。 */
  payment_data: JsonValue
}

/** 订单状态响应。 */
export interface OrderStatusResponse {
  /** 订单号。 */
  order_no: string
  /** 商品类别。 */
  product_class: number
  /** 商品标识。 */
  product_id: string
  /** 商品名称。 */
  product_name: string
  /** 渠道金额，6 位精度。 */
  amount: number
  /** 渠道币种。 */
  currency: string
  /** 订单状态数字枚举。 */
  order_status: OrderStatus
  /** 履约回调状态数字枚举。 */
  callback_status: CallbackStatus
  /** 支付方式。 */
  payment_method: string | null
  /** 支付时间。 */
  paid_at: number | null
  /** 创建时间。 */
  created_at: number
  /** 订单过期时间，毫秒时间戳。 */
  expired_at: number
}

/** 订单状态归类结果。 */
export type OrderCheckoutStatusOutcome = 'pending' | 'paid' | 'cancelled' | 'failed' | 'expired'

/** 创建通用订单。 */
export async function createOrder(
  context: RequestContext,
  request: CreateOrderRequest
): Promise<CreateOrderResponse> {
  return postJson<CreateOrderResponse>(
    '/api/client/order/create',
    context,
    createOrderRequestToJson(request)
  )
}

/** 查询订单状态。 */
export async function getOrderStatus(
  context: RequestContext,
  orderNo: string
): Promise<OrderStatusResponse> {
  return getJson<OrderStatusResponse>(
    `/api/client/order/status/${encodeURIComponent(orderNo)}`,
    context
  )
}

/** 根据商品和渠道构造 create order 请求。 */
export function buildCreateOrderRequest(
  product: OrderCheckoutProductSnapshot,
  channel: OrderCheckoutPaymentChannel
): CreateOrderRequest {
  return {
    product_class: product.product_class,
    product_id: product.product_id,
    payment_method: channel.payment_method,
    currency: channel.currency,
    amount: channel.amount,
    auto_renew: product.auto_renew,
    period: product.period
  }
}

/** 按支付方式优先级选取可用渠道，无匹配时使用配置中的首个渠道。 */
export function getDefaultOrderPaymentChannel<T extends OrderCheckoutPaymentChannel>(
  channels: T[]
): T | null {
  if (channels.length === 0) {
    return null
  }

  for (const paymentMethod of DEFAULT_ORDER_PAYMENT_METHODS) {
    const channel = channels.find(item => item.payment_method === paymentMethod)
    if (channel) {
      return channel
    }
  }

  return channels[0]
}

/** 校验并提取外部支付 URL。 */
export function readPaymentUrl(paymentData: JsonValue, paymentMethod: string): string | null {
  if (!paymentData || typeof paymentData !== 'object' || Array.isArray(paymentData)) {
    return null
  }

  const value =
    paymentData.checkoutUrl ?? paymentData.payment_url ?? paymentData.url ?? paymentData.approval_url
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    const hostname = parsed.hostname.toLowerCase()
    if (paymentMethod === 'paypal') {
      const paypalHostAllowed = hostname === 'paypal.com' || hostname.endsWith('.paypal.com')
      return parsed.protocol === 'https:' && paypalHostAllowed ? trimmed : null
    }

    if (paymentMethod === 'clink') {
      const clinkHostAllowed =
        hostname === 'uat-checkout.clinkbill.com' || hostname === 'checkout.clinkbill.com'
      return parsed.protocol === 'https:' && clinkHostAllowed ? trimmed : null
    }

    // 未知支付方式不接受任何外部跳转地址。
    return null
  } catch {
    return null
  }
}

/** 根据后端订单状态归类支付状态。 */
export function classifyOrderStatus(status: OrderStatusResponse): OrderCheckoutStatusOutcome {
  if (
    status.order_status === ORDER_STATUS_PAID &&
    status.callback_status === CALLBACK_STATUS_SUCCESS
  ) {
    return 'paid'
  }

  if (
    status.order_status === ORDER_STATUS_PAID &&
    (status.callback_status === CALLBACK_STATUS_FAILED ||
      status.callback_status === CALLBACK_STATUS_MAX_RETRY)
  ) {
    return 'failed'
  }

  if (status.order_status === ORDER_STATUS_EXPIRED) {
    return 'expired'
  }

  if (
    status.order_status === ORDER_STATUS_CANCELLED ||
    status.order_status === ORDER_STATUS_REFUNDED
  ) {
    return status.order_status === ORDER_STATUS_CANCELLED ? 'cancelled' : 'failed'
  }

  return 'pending'
}

/** 判断轮询是否超过自动等待窗口。 */
export function hasOrderCheckoutPollingTimedOut(pollStartedAt: number | null): boolean {
  return pollStartedAt !== null && Date.now() - pollStartedAt >= ORDER_CHECKOUT_POLL_TIMEOUT_MS
}

/** 当前错误是否认证失效。 */
export function isOrderCheckoutAuthFailure(error: Error): boolean {
  return error instanceof HomepageApiError && (error.status === 401 || error.code === 10001 || error.code === 10013)
}

/** 当前错误是否价格更新。 */
export function isPaymentPriceUpdatedError(error: Error): boolean {
  return error instanceof HomepageApiError && error.code === PAYMENT_PRICE_UPDATED_CODE
}

/** 当前错误是否支付网关失败。 */
export function isPaymentGatewayError(error: Error): boolean {
  return (
    error instanceof HomepageApiError &&
    (error.code === PAYMENT_GATEWAY_ERROR_CODE ||
      error.code === PAYMENT_UNSUPPORTED_METHOD_CODE)
  )
}

/** 当前错误是否订单不存在或已过期。 */
export function isRecoverableOrderStatusError(error: Error): boolean {
  return (
    error instanceof HomepageApiError &&
    (error.code === ORDER_NOT_FOUND_CODE || error.code === ORDER_EXPIRED_CODE)
  )
}

/** 把 create order 请求转为项目 JSON 类型。 */
function createOrderRequestToJson(request: CreateOrderRequest): JsonObject {
  return {
    product_class: request.product_class,
    product_id: request.product_id,
    payment_method: request.payment_method,
    currency: request.currency,
    amount: request.amount,
    auto_renew: request.auto_renew,
    period: request.period
  }
}
