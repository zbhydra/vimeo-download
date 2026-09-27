/**
 * 订单协议类型定义。
 *
 * 与 website-shared `order-checkout-api.ts` 消费同一套后端合同
 * （/api/client/order/create 与 /api/client/order/status/{order_no}），字段不增不减。
 */

import type { JsonValue } from '../../rpc/types'

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

/** 后端订单状态数字枚举。 */
export type OrderStatus = 1 | 2 | 3 | 4 | 5

/** 后端履约回调状态数字枚举。 */
export type CallbackStatus = 1 | 2 | 3 | 4 | 5

/** 下单使用的商业与权益周期；非订阅商品使用 none，lifetime 为一次性终生权益。 */
export type OrderPeriod = 'none' | 'month' | 'quarter' | 'year' | 'lifetime'

/** 单个支付渠道价格快照。 */
export interface OrderPaymentChannel {
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

/** 创建订单请求。 */
export interface CreateOrderRequest {
  /** 商品类别，订阅为 1。 */
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
  period: OrderPeriod
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
  /** 支付等待页使用的支持邮箱；空字符串表示不展示反馈入口。 */
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

/** 订单状态归类结果；pending 表示继续轮询，其余为终态。 */
export type OrderStatusOutcome = 'pending' | 'paid' | 'cancelled' | 'failed' | 'expired'
