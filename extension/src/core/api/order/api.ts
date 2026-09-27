/**
 * 订单 API。
 *
 * 负责创建通用订单、查询订单状态，以及支付 URL 提取与订单状态归类等纯协议逻辑；
 * 与 website-shared `order-checkout-api.ts` 消费同一套后端合同，协议细节以对方为准。
 */

import { httpClient } from '../index'
import { ApiError } from '../client/types'
import { API } from '../config'
import {
  CALLBACK_STATUS_FAILED,
  CALLBACK_STATUS_MAX_RETRY,
  CALLBACK_STATUS_SUCCESS,
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_EXPIRED,
  ORDER_STATUS_PAID,
  ORDER_STATUS_REFUNDED
} from './types'
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  OrderPaymentChannel,
  OrderStatusOutcome,
  OrderStatusResponse
} from './types'
import type { JsonObject, JsonValue } from '../../rpc/types'

/** 后端业务码：订单不存在或不属于当前用户。 */
export const ORDER_NOT_FOUND_CODE = 20001

/** 后端业务码：订单已过期。 */
export const ORDER_EXPIRED_CODE = 20003

/** 后端业务码：支付网关创建支付入口失败。 */
export const PAYMENT_GATEWAY_ERROR_CODE = 21001

/** 后端业务码：当前支付方式后端未实现。 */
export const PAYMENT_UNSUPPORTED_METHOD_CODE = 21004

/** 后端业务码：价格配置已变化，需要重新拉取套餐配置。 */
export const PAYMENT_PRICE_UPDATED_CODE = 21005

/** 默认优先选中的支付方式，与官网下单保持一致。 */
export const DEFAULT_ORDER_PAYMENT_METHODS = ['clink', 'paypal'] as const

/** 订单状态自动轮询间隔，毫秒。 */
export const ORDER_POLL_INTERVAL_MS = 2000

/** 订单状态自动轮询最长等待时间，毫秒。 */
export const ORDER_POLL_TIMEOUT_MS = 10 * 60 * 1000

/** 创建订单。 */
export async function createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
  return httpClient.post<CreateOrderResponse>(API.ENDPOINTS.ORDER_CREATE, request)
}

/** 查询订单状态。 */
export async function getOrderStatus(orderNo: string): Promise<OrderStatusResponse> {
  return httpClient.get<OrderStatusResponse>(
    `${API.ENDPOINTS.ORDER_STATUS}/${encodeURIComponent(orderNo)}`
  )
}

/** 根据套餐快照和选中渠道构造 create order 请求。 */
export function buildCreateOrderRequest(
  product: {
    product_class: number
    product_id: string
    auto_renew: boolean
    period: CreateOrderRequest['period']
  },
  channel: OrderPaymentChannel
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
export function getDefaultOrderPaymentChannel<T extends OrderPaymentChannel>(
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

/** 校验并提取外部支付 URL；域名不在渠道白名单时返回 null，防止 payment_data 注入跳转。 */
export function readPaymentUrl(paymentData: JsonValue, paymentMethod: string): string | null {
  if (!isJsonObject(paymentData)) {
    return null
  }

  const value =
    paymentData.checkoutUrl ??
    paymentData.payment_url ??
    paymentData.url ??
    paymentData.approval_url
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

/** 根据后端订单状态归类支付状态；pending 且轮询超时由调用方另行判断。 */
export function classifyOrderStatus(status: OrderStatusResponse): OrderStatusOutcome {
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
export function hasOrderPollingTimedOut(pollStartedAt: number | null): boolean {
  return pollStartedAt !== null && Date.now() - pollStartedAt >= ORDER_POLL_TIMEOUT_MS
}

/** 当前错误是否订单不存在或已过期。 */
export function isRecoverableOrderStatusError(error: Error): boolean {
  return (
    error instanceof ApiError &&
    (error.backendCode === ORDER_NOT_FOUND_CODE || error.backendCode === ORDER_EXPIRED_CODE)
  )
}

/** 当前错误是否价格已更新（需要重新拉取套餐配置）。 */
export function isPaymentPriceUpdatedError(error: Error): boolean {
  return error instanceof ApiError && error.backendCode === PAYMENT_PRICE_UPDATED_CODE
}

/** 当前错误是否支付网关失败或支付方式未实现。 */
export function isPaymentGatewayError(error: Error): boolean {
  return (
    error instanceof ApiError &&
    (error.backendCode === PAYMENT_GATEWAY_ERROR_CODE ||
      error.backendCode === PAYMENT_UNSUPPORTED_METHOD_CODE)
  )
}

/** 判断 JSON 值是否为可按字段读取的对象。 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
