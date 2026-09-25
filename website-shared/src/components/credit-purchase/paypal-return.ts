/**
 * PayPal 返回页脚本。
 *
 * success 页轮询本地订单状态确认到账；cancel 页查询订单商品类别后取消本地订单；
 * 两者都按订单商品类别改写「返回价格页」链接，并通知原购买弹窗。
 */

import { getStoredAccessToken } from '../../homepage-runtime/auth'
import { ensureDeviceId } from '../../homepage-runtime/device'
import { postJson, type RequestContext } from '../../homepage-runtime/api'
import {
  classifyOrderStatus,
  getOrderStatus,
  isOrderCheckoutAuthFailure,
  isRecoverableOrderStatusError
} from '../order-checkout/order-checkout-api'
import { SUBSCRIPTION_PRODUCT_CLASS } from '../pricing/pricing-checkout'

/** PayPal 返回页结果类型。 */
export type PayPalReturnStatus = 'success' | 'cancel'

/** PayPal 返回页初始化参数。 */
export interface PayPalReturnOptions {
  /** 当前页面类型。 */
  status: PayPalReturnStatus
  /** PayPal 返回携带的本地订单号。 */
  orderNo: string | null
}

/** 通用支付回跳页初始化参数。 */
export interface PaymentReturnOptions extends PayPalReturnOptions {
  /** 支付渠道。 */
  provider: 'paypal' | 'clink'
}

const PAYPAL_RETURN_CHANNEL = 'credit_purchase_paypal_return'
/** PayPal success 回跳页订单状态轮询间隔，毫秒。 */
export const PAYPAL_SUCCESS_POLL_INTERVAL_MS = 3000

/** success 回跳页等待状态。 */
type PayPalSuccessViewState = 'waiting' | 'confirmed' | 'failed'

/** success 页状态文案。 */
interface PayPalSuccessViewCopy {
  /** 标题文案。 */
  title: string
  /** 描述文案。 */
  message: string
}

/** success 页可更新状态文案集合。 */
const PAYPAL_SUCCESS_VIEW_COPY: Record<PayPalSuccessViewState, PayPalSuccessViewCopy> = {
  waiting: {
    title: 'Payment submitted',
    message:
      'You can return to the original tab. We are checking PayPal confirmation every 3 seconds, and your Credits will appear automatically after the order is confirmed.'
  },
  confirmed: {
    title: 'Credits added',
    message:
      'Your PayPal payment is confirmed and the Credits have been added. You can close this tab and continue in the original window.'
  },
  failed: {
    title: 'Payment needs attention',
    message:
      'We could not confirm this order automatically. Return to the original window or try refreshing your payment status there.'
  }
}

let successPollTimer: number | null = null
let successPollRunning = false

/** 初始化支付返回页行为。 */
export function initPaymentReturnPage(options: PaymentReturnOptions): void {
  const normalizedOptions: PaymentReturnOptions = {
    provider: options.provider,
    status: options.status,
    orderNo: resolveReturnOrderNo(options.orderNo)
  }

  if (normalizedOptions.status === 'success') {
    notifyOpener(normalizedOptions)
    startSuccessPolling(normalizedOptions)
    return
  }

  if (!normalizedOptions.orderNo) {
    notifyOpener(normalizedOptions)
    return
  }

  void finishCancelPage(normalizedOptions.orderNo, normalizedOptions.provider)
}

/** 从运行时 URL 兜底解析支付回跳携带的本地订单号。 */
function resolveReturnOrderNo(orderNo: string | null): string | null {
  const normalizedOrderNo = orderNo?.trim() || null
  if (normalizedOrderNo) {
    return normalizedOrderNo
  }

  return new URLSearchParams(window.location.search).get('order_no')?.trim() || null
}

/** 启动 success 页订单状态轮询。 */
function startSuccessPolling(options: PaymentReturnOptions): void {
  stopSuccessPolling()
  const { orderNo } = options
  if (!orderNo) {
    setSuccessViewState('failed')
    return
  }

  successPollTimer = window.setInterval(() => {
    void pollSuccessOrderStatus(orderNo, options.provider)
  }, PAYPAL_SUCCESS_POLL_INTERVAL_MS)
  setSuccessViewState('waiting')
  void pollSuccessOrderStatus(orderNo, options.provider)
}

/** 停止 success 页订单状态轮询。 */
function stopSuccessPolling(): void {
  if (successPollTimer === null) {
    return
  }
  window.clearInterval(successPollTimer)
  successPollTimer = null
}

/** 查询本地订单状态，只按后端已确认的订单状态更新 success 回跳页。 */
async function pollSuccessOrderStatus(
  orderNo: string,
  provider: PaymentReturnOptions['provider']
): Promise<void> {
  if (successPollRunning) {
    return
  }
  successPollRunning = true

  try {
    const context = await buildRequestContext()
    if (!context) {
      stopSuccessPolling()
      setSuccessViewState('failed')
      return
    }

    const status = await getOrderStatus(context, orderNo)
    applySubscriptionPricingLink(status.product_class)
    const outcome = classifyOrderStatus(status)
    if (outcome === 'paid') {
      stopSuccessPolling()
      setSuccessViewState('confirmed')
      notifyOpener({ provider, status: 'success', orderNo })
      return
    }
    if (outcome !== 'pending') {
      stopSuccessPolling()
      setSuccessViewState('failed')
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error)
      if (isOrderCheckoutAuthFailure(error) || isRecoverableOrderStatusError(error)) {
        stopSuccessPolling()
        setSuccessViewState('failed')
      }
      return
    }
    console.error(
      new Error(
        `[payment-return] pollSuccessOrderStatus failed with non-error value: order_no=${orderNo}, value=${String(error)}`
      )
    )
    stopSuccessPolling()
    setSuccessViewState('failed')
  } finally {
    successPollRunning = false
  }
}

/** 更新 success 回跳页标题和说明。 */
function setSuccessViewState(state: PayPalSuccessViewState): void {
  const root = document.querySelector<HTMLElement>('[data-payment-return]')
  const copyElement = root?.querySelector<HTMLElement>(`[data-payment-return-copy="${state}"]`)
  const copy = copyElement
    ? {
        title: copyElement.dataset.title ?? '',
        message: copyElement.dataset.description ?? ''
      }
    : PAYPAL_SUCCESS_VIEW_COPY[state]
  const title = root?.querySelector<HTMLElement>('[data-payment-return-title]')
    ?? document.querySelector<HTMLElement>('[data-paypal-return-title]')
  const message = root?.querySelector<HTMLElement>('[data-payment-return-description]')
    ?? document.querySelector<HTMLElement>('[data-paypal-return-message]')
  if (root) {
    root.dataset.paymentReturnState = state
  }
  if (title) {
    title.textContent = copy.title
  }
  if (message) {
    message.textContent = copy.message
  }
}

/** 通知原购买弹窗支付页已跳回网站。 */
function notifyOpener(options: PaymentReturnOptions): void {
  const payload = {
    provider: options.provider,
    status: options.status,
    orderNo: options.orderNo
  }

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(PAYPAL_RETURN_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  }

  if (window.opener) {
    window.opener.postMessage(
      {
        type: PAYPAL_RETURN_CHANNEL,
        ...payload
      },
      window.location.origin
    )
  }
}

/** 初始化 PayPal 返回页，保留现有页面入口。 */
export function initPayPalReturnPage(options: PayPalReturnOptions): void {
  initPaymentReturnPage({ ...options, provider: 'paypal' })
}

/** 调用现有取消订单接口，把用户取消落到本地订单状态。 */
async function cancelOrder(orderNo: string): Promise<void> {
  const context = await buildRequestContext()
  if (!context) {
    return
  }

  await postJson('/api/client/order/cancel', context, {
    order_no: orderNo
  })
}

/** cancel 页先查一次订单商品类别改写返回链接，再把本地订单落为取消并通知原购买弹窗。 */
async function finishCancelPage(
  orderNo: string,
  provider: PaymentReturnOptions['provider']
): Promise<void> {
  try {
    const context = await buildRequestContext()
    if (context) {
      const status = await getOrderStatus(context, orderNo)
      applySubscriptionPricingLink(status.product_class)
    }
  } catch (error) {
    console.error(error)
  }

  try {
    await cancelOrder(orderNo)
  } catch (error) {
    console.error(error)
  }
  notifyOpener({ provider, status: 'cancel', orderNo })
}

/** 订单属于订阅时把返回价格按钮改指订阅价格页；查不到类别（未登录、订单缺失）保持积分页默认链接。 */
function applySubscriptionPricingLink(productClass: number): void {
  if (productClass !== SUBSCRIPTION_PRODUCT_CLASS) {
    return
  }
  const link = document.querySelector<HTMLAnchorElement>('[data-subscription-href]')
  const href = link?.dataset.subscriptionHref
  if (link && href) {
    link.setAttribute('href', href)
  }
}

/** 构建取消订单所需请求上下文。 */
async function buildRequestContext(): Promise<RequestContext | null> {
  const token = getStoredAccessToken()
  if (!token) {
    return null
  }

  return {
    deviceId: await ensureDeviceId(),
    token
  }
}
