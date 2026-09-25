/**
 * 公共订单 checkout 弹窗对外类型。
 *
 * 调用方只传商品快照、展示文案和支付渠道；弹窗内部统一完成下单、
 * 打开外部支付页、轮询订单状态，并通过事件广播最终结果。
 */

import type {
  OrderCheckoutPaymentChannel,
  OrderCheckoutPeriod,
  OrderStatusResponse
} from './order-checkout-api'

/** 公共 checkout 的单个支付选项及其本地化摘要。 */
export interface OrderCheckoutPaymentOption extends OrderCheckoutPaymentChannel {
  /** 该选项的价格摘要；为空时使用商品级摘要。 */
  priceText?: string
  /** 该选项的周期、续费方式等说明；为空时使用商品级提示。 */
  detailText?: string
}

/** 公共 checkout 弹窗文案。 */
export interface OrderCheckoutCopy {
  /** 支付方式选择小标题。 */
  paymentMethodLabel: string
  /** 支付方式选择标题。 */
  paymentTitle: string
  /** 已选商品摘要标签。 */
  selectedPackageLabel: string
  /** 确认购买按钮。 */
  confirmPurchase: string
  /** 返回/取消按钮。 */
  backToProducts: string
  /** 关闭按钮无障碍文案。 */
  close: string
  /** 协议勾选文案。 */
  agreementText: string
  /** 创建订单中文案。 */
  creatingOrder: string
  /** 支付中默认文案。 */
  pendingPayment: string
  /** 订单等待弹窗标题。 */
  pendingPaymentTitle: string
  /** 取消支付按钮文案。 */
  cancelPayment: string
  /** 支付等待页支持邮箱前缀。 */
  supportMailPrefix: string
  /** 默认 success 态标题。 */
  successTitle: string
  /** 默认 success 态说明。 */
  successDescription: string
  /** 失败态标题/文案。 */
  failed: string
  /** 创建订单失败文案。 */
  createFailed: string
  /** 支付数据不合法文案。 */
  invalidPaymentData: string
  /** 价格更新文案。 */
  priceUpdated: string
  /** 支付网关失败文案。 */
  gatewayFailed: string
  /** 用户主动取消外部支付后的文案。 */
  paymentCanceled: string
  /** 轮询失败文案。 */
  pollFailed: string
  /** 轮询超时文案。 */
  pollTimeout: string
  /** 订单不存在文案。 */
  orderNotFound: string
  /** 订单过期文案。 */
  orderExpired: string
  /** 履约失败文案。 */
  fulfillmentFailed: string
  /** 登录失效文案。 */
  authExpired: string
}

/** 公共 checkout 可售商品。 */
export interface OrderCheckoutProduct {
  /** 商品类别。 */
  productClass: number
  /** 商品标识。 */
  productId: string
  /** 是否由渠道自动续费。 */
  autoRenew: boolean
  /** 商业与权益周期。 */
  period: OrderCheckoutPeriod
  /** 摘要主文案，如 100 Credits / Extension Unlimited。 */
  title: string
  /** 摘要价格展示。 */
  priceText: string
  /** 摘要提示文案，例如 Web only / Extension only。 */
  usageNotice?: string
  /** 支付成功标题；为空时使用全局文案。 */
  successTitle?: string
  /** 支付成功说明；为空时使用全局文案。 */
  successDescription?: string
  /** 成功态摘要第一行；调用方必须显式传入，避免 success panel 只有图标没有业务结果。 */
  successPrimaryText: string
  /** 成功态摘要第二行。 */
  successSecondaryText?: string
  /** Credits 商品到账数量，非 Credits 商品为空。 */
  creditsAmount?: number
  /** 当前商品可用支付渠道。 */
  paymentChannels: OrderCheckoutPaymentOption[]
}

/** 打开公共 checkout 弹窗的参数。 */
export interface OrderCheckoutOpenOptions {
  /** 触发 checkout 的业务来源。 */
  source: string
  /** 要购买的商品快照。 */
  product: OrderCheckoutProduct
  /** 恢复购买意图时优先选中的支付方式。 */
  initialPaymentMethod?: string
}

/** 公共 checkout 成功事件 payload。 */
export interface OrderCheckoutSuccessPayload {
  /** 触发 checkout 的业务来源。 */
  source: string
  /** 成功履约的订单号。 */
  orderNo: string
  /** 商品类别。 */
  productClass: number
  /** 商品标识。 */
  productId: string
  /** Credits 商品到账数量，非 Credits 商品为空。 */
  creditsAmount: number | null
  /** 最近一次订单状态响应。 */
  orderStatus: OrderStatusResponse
  /** 成功态第二行文案可由业务入口刷新，例如 Credits 最新余额。 */
  updateSuccessSecondaryText(text: string): void
}

/** 公共 checkout 登录失效事件 payload。 */
export interface OrderCheckoutAuthInvalidPayload {
  /** 登录失效提示。 */
  message: string
}

/** 公共 checkout 价格变更事件 payload。 */
export interface OrderCheckoutPriceUpdatedPayload {
  /** 触发 checkout 的业务来源。 */
  source: string
  /** 商品类别。 */
  productClass: number
  /** 商品标识。 */
  productId: string
}

/** 公共 checkout controller。 */
export interface OrderCheckoutController {
  /** 直接打开支付方式选择弹窗。 */
  open(options: OrderCheckoutOpenOptions): Promise<void>
  /** 关闭弹窗，关闭时停止轮询且不恢复 pending 订单。 */
  close(): void
  /** 当前弹窗是否打开。 */
  isOpen(): boolean
}

/** 弹窗成功事件名。 */
export const ORDER_CHECKOUT_SUCCESS_EVENT = 'order-checkout:success'

/** 弹窗关闭事件名。 */
export const ORDER_CHECKOUT_CLOSE_EVENT = 'order-checkout:close'

/** 弹窗遇到登录失效事件名。 */
export const ORDER_CHECKOUT_AUTH_INVALID_EVENT = 'order-checkout:auth-invalid'

/** 创建订单时发现价格已更新事件名。 */
export const ORDER_CHECKOUT_PRICE_UPDATED_EVENT = 'order-checkout:price-updated'

declare global {
  interface Window {
    /** 全站唯一公共订单 checkout controller。 */
    orderCheckoutController?: OrderCheckoutController
  }
}
