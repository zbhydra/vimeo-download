/**
 * 支付回跳页脚本（PayPal / Clink 共用）。
 *
 * success 页轮询本地订单状态确认到账；本页无法确认订单时显示中性「已提交」。
 * cancel 页把本地订单落为取消。两者都通知原购买弹窗支付页已跳回网站。
 */

import { getStoredAccessToken } from '../../scripts/runtime/auth'
import { ensureDeviceId } from '../../scripts/runtime/device'
import {
  HomepageApiError,
  postJson,
  type RequestContext
} from '../../scripts/runtime/api'
import {
  classifyOrderStatus,
  getOrderStatus,
  isOrderCheckoutAuthFailure,
  isRecoverableOrderStatusError,
  ORDER_NOT_FOUND_CODE
} from '../order-checkout/order-checkout-api'

/** 回跳页初始化参数。 */
export interface PaymentReturnOptions {
  /** 支付渠道。 */
  provider: 'paypal' | 'clink'
  /** 当前页面类型。 */
  status: 'success' | 'cancel'
}

/** success 页展示状态；submitted 表示本页无法确认订单。 */
type SuccessViewState = 'waiting' | 'confirmed' | 'failed' | 'submitted'

/** 与 order-checkout-controller 监听的广播频道、postMessage type 保持一致。 */
const PAYMENT_RETURN_CHANNEL = 'credit_purchase_paypal_return'
/** success 回跳页订单状态轮询间隔，毫秒。 */
export const PAYMENT_RETURN_POLL_INTERVAL_MS = 3000

let successPollTimer: number | null = null
let successPollRunning = false

/** 初始化支付回跳页行为。 */
export function initPaymentReturnPage(options: PaymentReturnOptions): void {
  const orderNo = new URLSearchParams(window.location.search).get('order_no')?.trim() || null

  if (options.status === 'success') {
    notifyOpener(options, orderNo)
    startSuccessPolling(options, orderNo)
    return
  }

  if (!orderNo) {
    notifyOpener(options, orderNo)
    return
  }

  void finishCancelPage(options, orderNo)
}

/** 启动 success 页订单状态轮询；没有订单号时本页无法确认。 */
function startSuccessPolling(options: PaymentReturnOptions, orderNo: string | null): void {
  stopSuccessPolling()
  if (!orderNo) {
    setSuccessViewState('submitted')
    return
  }

  successPollTimer = window.setInterval(() => {
    void pollSuccessOrderStatus(options, orderNo)
  }, PAYMENT_RETURN_POLL_INTERVAL_MS)
  setSuccessViewState('waiting')
  void pollSuccessOrderStatus(options, orderNo)
}

/** 停止 success 页订单状态轮询。 */
function stopSuccessPolling(): void {
  if (successPollTimer === null) {
    return
  }
  window.clearInterval(successPollTimer)
  successPollTimer = null
}

/** 终止轮询并展示最终状态。 */
function finishSuccessPolling(state: SuccessViewState): void {
  stopSuccessPolling()
  setSuccessViewState(state)
}

/** 查询本地订单状态，只按后端已确认的订单状态更新 success 回跳页。 */
async function pollSuccessOrderStatus(
  options: PaymentReturnOptions,
  orderNo: string
): Promise<void> {
  if (successPollRunning) {
    return
  }
  successPollRunning = true

  try {
    const context = await buildRequestContext()
    if (!context) {
      finishSuccessPolling('submitted')
      return
    }

    const outcome = classifyOrderStatus(await getOrderStatus(context, orderNo))
    if (outcome === 'paid') {
      finishSuccessPolling('confirmed')
      notifyOpener(options, orderNo)
      return
    }
    if (outcome !== 'pending') {
      finishSuccessPolling('failed')
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      console.error(
        new Error(
          `[payment-return] pollSuccessOrderStatus failed with non-error value: order_no=${orderNo}, value=${String(error)}`
        )
      )
      finishSuccessPolling('submitted')
      return
    }
    console.error(error)
    if (isOrderCheckoutAuthFailure(error) || isOrderNotFound(error)) {
      finishSuccessPolling('submitted')
    } else if (isRecoverableOrderStatusError(error)) {
      finishSuccessPolling('failed')
    }
  } finally {
    successPollRunning = false
  }
}

/** 订单不属于当前网站账号时后端同样返回订单不存在。 */
function isOrderNotFound(error: Error): boolean {
  return error instanceof HomepageApiError && error.code === ORDER_NOT_FOUND_CODE
}

/** 按 data-payment-return-copy 更新 success 回跳页标题和说明。 */
function setSuccessViewState(state: SuccessViewState): void {
  const root = document.querySelector<HTMLElement>('[data-payment-return]')
  if (!root) {
    return
  }
  const copy = root.querySelector<HTMLElement>(`[data-payment-return-copy="${state}"]`)
  const title = root.querySelector<HTMLElement>('[data-payment-return-title]')
  const description = root.querySelector<HTMLElement>('[data-payment-return-description]')
  root.dataset.paymentReturnState = state
  if (title) {
    title.textContent = copy?.dataset.title ?? ''
  }
  if (description) {
    description.textContent = copy?.dataset.description ?? ''
  }
}

/** 通知原购买弹窗支付页已跳回网站。 */
function notifyOpener(options: PaymentReturnOptions, orderNo: string | null): void {
  const payload = { provider: options.provider, status: options.status, orderNo }

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(PAYMENT_RETURN_CHANNEL)
    channel.postMessage(payload)
    channel.close()
  }

  if (window.opener) {
    window.opener.postMessage({ type: PAYMENT_RETURN_CHANNEL, ...payload }, window.location.origin)
  }
}

/** cancel 页把本地订单落为取消并通知原购买弹窗；无登录态时只通知。 */
async function finishCancelPage(options: PaymentReturnOptions, orderNo: string): Promise<void> {
  try {
    const context = await buildRequestContext()
    if (context) {
      await postJson('/api/client/order/cancel', context, { order_no: orderNo })
    }
  } catch (error) {
    console.error(error)
  }
  notifyOpener(options, orderNo)
}

/** 构建请求上下文；没有网站登录态返回 null。 */
async function buildRequestContext(): Promise<RequestContext | null> {
  const token = getStoredAccessToken()
  if (!token) {
    return null
  }

  return { deviceId: await ensureDeviceId(), token }
}
