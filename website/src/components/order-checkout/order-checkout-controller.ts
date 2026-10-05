/**
 * 公共订单 checkout 弹窗控制器。
 *
 * 负责支付渠道选择、创建通用订单、打开外部支付页、订单轮询、
 * success/failed 展示和全局事件广播。业务入口通过 window.orderCheckoutController.open 调用。
 */

import { clearStoredAccessToken, getStoredAccessToken } from '../../scripts/runtime/auth'
import { ensureDeviceId } from '../../scripts/runtime/device'
import type { RequestContext } from '../../scripts/runtime/api'
import {
  buildCreateOrderRequest,
  classifyOrderStatus,
  createOrder,
  getDefaultOrderPaymentChannel,
  getOrderStatus,
  hasOrderCheckoutPollingTimedOut,
  isOrderCheckoutAuthFailure,
  isPaymentGatewayError,
  isPaymentPriceUpdatedError,
  isRecoverableOrderStatusError,
  ORDER_CHECKOUT_POLL_INTERVAL_MS,
  readPaymentUrl,
  type OrderStatusResponse
} from './order-checkout-api'
import {
  getOrderCheckoutElements,
  setOrderCheckoutHidden,
  type OrderCheckoutElements
} from './order-checkout-elements'
import {
  ORDER_CHECKOUT_AUTH_INVALID_EVENT,
  ORDER_CHECKOUT_CLOSE_EVENT,
  ORDER_CHECKOUT_PRICE_UPDATED_EVENT,
  ORDER_CHECKOUT_SUCCESS_EVENT,
  type OrderCheckoutAuthInvalidPayload,
  type OrderCheckoutController,
  type OrderCheckoutCopy,
  type OrderCheckoutOpenOptions,
  type OrderCheckoutPaymentOption,
  type OrderCheckoutPriceUpdatedPayload,
  type OrderCheckoutProduct,
  type OrderCheckoutSuccessPayload
} from './order-checkout-types'

/** 公共 checkout 状态机枚举。 */
type OrderCheckoutStatus =
  | 'idle'
  | 'selecting_payment_method'
  | 'creating_order'
  | 'pending_payment'
  | 'success'
  | 'failed'

/** 组件内部可变状态。 */
interface OrderCheckoutState {
  /** 弹窗是否打开。 */
  open: boolean
  /** 当前状态机状态。 */
  status: OrderCheckoutStatus
  /** 当前打开参数。 */
  options: OrderCheckoutOpenOptions | null
  /** 当前选中的支付渠道。 */
  selectedPaymentMethod: string | null
  /** 协议是否已勾选。 */
  agreementAccepted: boolean
  /** 当前创建出的订单号。 */
  orderNo: string | null
  /** 当前订单支付等待页使用的支持邮箱。 */
  supportMail: string | null
  /** 用户可见错误文案。 */
  error: string | null
  /** 最近一次订单状态响应。 */
  lastOrderStatus: OrderStatusResponse | null
  /** 自动轮询开始时间。 */
  pollStartedAt: number | null
}

/** 支付返回页和原购买弹窗之间的同源通知通道。 */
const PAYPAL_RETURN_CHANNEL = 'credit_purchase_paypal_return'

let deviceIdPromise: Promise<string> | null = null

interface PayPalReturnMessage {
  provider?: string
  status?: string
  orderNo?: string | null
  type?: string
}

/** 支付方式图标元信息。 */
interface PaymentChannelIcon {
  /** 图标资源路径。 */
  src: string
  /** 无障碍标签。 */
  label: string
}

/** 读取稳定 device_id，避免弹窗每次打开重复初始化。 */
function getOrderCheckoutDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = ensureDeviceId()
  }
  return deviceIdPromise
}

/** 从 DOM script payload 读取弹窗文案。 */
function getOrderCheckoutCopy(root: HTMLElement): OrderCheckoutCopy {
  const element = root.querySelector<HTMLScriptElement>('[data-order-checkout-copy]')
  if (!element?.textContent) {
    throw new Error('[order-checkout-controller] Missing order checkout copy payload.')
  }
  return JSON.parse(element.textContent) as OrderCheckoutCopy
}

/** 创建初始状态。 */
function createOrderCheckoutState(): OrderCheckoutState {
  return {
    open: false,
    status: 'idle',
    options: null,
    selectedPaymentMethod: null,
    agreementAccepted: true,
    orderNo: null,
    supportMail: null,
    error: null,
    lastOrderStatus: null,
    pollStartedAt: null
  }
}

/** 重置一次打开流程的交易态。 */
function resetTransactionState(state: OrderCheckoutState): void {
  state.status = 'idle'
  state.selectedPaymentMethod = null
  state.agreementAccepted = true
  state.orderNo = null
  state.supportMail = null
  state.error = null
  state.lastOrderStatus = null
  state.pollStartedAt = null
}

/** 构建接口请求上下文。 */
async function buildRequestContext(): Promise<RequestContext | null> {
  const token = getStoredAccessToken()
  if (!token) {
    return null
  }

  return {
    deviceId: await getOrderCheckoutDeviceId(),
    token
  }
}

/** 写入元素文本并控制 hidden。 */
function setMessage(element: HTMLElement, message: string): void {
  element.textContent = message
  setOrderCheckoutHidden(element, message.length === 0)
}

/** 广播全局自定义事件。 */
function dispatchOrderCheckoutEvent<T>(root: HTMLElement, eventName: string, detail: T): void {
  const event = new CustomEvent<T>(eventName, { detail })
  root.dispatchEvent(event)
  window.dispatchEvent(event)
}

/** 根据支付方式选择支付按钮前置图标。 */
function getPaymentChannelIcon(paymentMethod: string): PaymentChannelIcon {
  if (paymentMethod === 'paypal') {
    return {
      src: '/payment-icons/paypal-monogram.png',
      label: 'PayPal'
    }
  }
  if (paymentMethod === 'clink') {
    return {
      src: '/payment-icons/bank-card.svg',
      label: ''
    }
  }
  return {
    src: '',
    label: 'Payment method'
  }
}

/** 渲染支付方式按钮内容。 */
function appendPaymentChannelButtonContent(
  button: HTMLButtonElement,
  channel: OrderCheckoutPaymentOption
): void {
  const icon = getPaymentChannelIcon(channel.payment_method)
  const iconElement = document.createElement('span')
  iconElement.className = 'order-checkout-channel-icon'
  if (icon.src) {
    const image = document.createElement('img')
    image.src = icon.src
    image.alt = icon.label
    image.decoding = 'async'
    image.loading = 'lazy'
    iconElement.append(image)
  } else {
    iconElement.setAttribute('aria-hidden', 'true')
  }

  const labelElement = document.createElement('span')
  labelElement.className = 'order-checkout-channel-label'
  labelElement.textContent = channel.payment_method_name || channel.payment_method

  button.append(iconElement, labelElement)
  if (channel.payment_method === 'clink') {
    const methods = document.createElement('span')
    methods.className = 'order-checkout-channel-methods'
    methods.textContent = document.querySelector<HTMLElement>('[data-order-checkout-modal]')?.dataset.clinkMethods ?? ''
    button.append(methods)
  }
}

/** 当前选中商品。 */
function getCurrentProduct(state: OrderCheckoutState): OrderCheckoutProduct | null {
  return state.options?.product ?? null
}

/** 读取当前商品下选中的支付渠道。 */
function getSelectedPaymentChannel(state: OrderCheckoutState): OrderCheckoutPaymentOption | null {
  const product = getCurrentProduct(state)
  if (!product || !state.selectedPaymentMethod) {
    return null
  }
  return product.paymentChannels.find(
    channel => channel.payment_method === state.selectedPaymentMethod
  ) ?? null
}

/** 第二层支付确认按钮在这些状态下可以提交订单。 */
function canSubmitPayment(state: OrderCheckoutState): boolean {
  return (
    state.open &&
    state.agreementAccepted &&
    state.status === 'selecting_payment_method' &&
    Boolean(getCurrentProduct(state))
  )
}

/** 把外部支付 URL 拉起到新窗口。 */
function openPaymentUrl(url: string): void {
  window.open(url, '_blank')
}

/** 根据错误映射用户可见文案。 */
function mapOrderCheckoutError(copy: OrderCheckoutCopy, error: Error): string {
  if (isPaymentPriceUpdatedError(error)) {
    return copy.priceUpdated
  }
  if (isPaymentGatewayError(error)) {
    return copy.gatewayFailed
  }
  if (isRecoverableOrderStatusError(error)) {
    return copy.orderNotFound
  }
  return error.message || copy.createFailed
}

/** 判断支付返回页通知是否属于当前订单。 */
function isCurrentPayPalReturnMessage(
  value: PayPalReturnMessage,
  state: OrderCheckoutState
): boolean {
  return (
    value.provider === state.selectedPaymentMethod &&
    typeof value.status === 'string' &&
    Boolean(state.orderNo) &&
    value.orderNo === state.orderNo
  )
}

/** 把弹窗根节点提升到 body，避免 fixed 定位被外层容器裁剪。 */
function mountOrderCheckoutModalToBody(root: HTMLElement): void {
  if (root.parentElement === document.body) {
    return
  }
  document.body.append(root)
}

/** 渲染支付方式选择弹窗。 */
function renderPaymentDialog(
  elements: OrderCheckoutElements,
  copy: OrderCheckoutCopy,
  state: OrderCheckoutState
): void {
  const product = getCurrentProduct(state)
  elements.channelList.textContent = ''

  elements.paymentTitle.textContent = copy.paymentTitle
  elements.selectedTitle.textContent = product?.title ?? ''

  if (!product) {
    elements.submitButton.textContent = copy.confirmPurchase
    elements.submitButton.disabled = true
    return
  }

  const selectedChannel =
    getSelectedPaymentChannel(state) ?? getDefaultOrderPaymentChannel(product.paymentChannels)
  state.selectedPaymentMethod = selectedChannel?.payment_method ?? null
  elements.selectedPrice.textContent = selectedChannel?.priceText ?? product.priceText
  setMessage(elements.selectedUsage, selectedChannel?.detailText ?? product.usageNotice ?? '')

  for (const channel of product.paymentChannels) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'order-checkout-channel-button'
    button.dataset.orderCheckoutPaymentMethod = channel.payment_method
    button.setAttribute('data-order-checkout-payment-method', channel.payment_method)
    button.setAttribute('aria-pressed', String(channel.payment_method === state.selectedPaymentMethod))
    button.classList.toggle(
      'is-selected',
      channel.payment_method === state.selectedPaymentMethod
    )
    appendPaymentChannelButtonContent(button, channel)
    elements.channelList.append(button)
  }

  elements.submitButton.textContent =
    state.status === 'creating_order' ? copy.creatingOrder : copy.confirmPurchase
  elements.submitButton.disabled =
    !canSubmitPayment(state) || state.status === 'creating_order' || !selectedChannel
}

/** 渲染弹窗状态到 DOM。 */
function render(
  elements: OrderCheckoutElements,
  copy: OrderCheckoutCopy,
  state: OrderCheckoutState
): void {
  setOrderCheckoutHidden(elements.root, !state.open)
  elements.root.dataset.orderCheckoutStatus = state.status

  const showOrderDialog =
    Boolean(state.orderNo) &&
    (state.status === 'pending_payment' || state.status === 'success' || state.status === 'failed')
  const showPaymentDialog =
    !showOrderDialog &&
    (state.status === 'selecting_payment_method' || state.status === 'creating_order')
  const showSupportMail =
    Boolean(state.supportMail) &&
    (state.status === 'pending_payment' || state.status === 'failed')
  const product = getCurrentProduct(state)

  setOrderCheckoutHidden(elements.paymentDialog, !showPaymentDialog)
  setOrderCheckoutHidden(elements.orderDialog, !showOrderDialog)
  setMessage(elements.paymentError, showPaymentDialog ? state.error ?? '' : '')

  elements.agreement.checked = state.agreementAccepted
  const failedOrderMessage = state.error ?? copy.failed
  elements.orderTitle.textContent = state.status === 'success'
    ? product?.successTitle ?? copy.successTitle
    : state.status === 'failed'
      ? copy.failed
      : copy.pendingPaymentTitle
  elements.orderMessage.textContent = state.status === 'success'
    ? product?.successDescription ?? copy.successDescription
    : state.status === 'failed'
      ? failedOrderMessage
      : copy.pendingPayment
  elements.orderCloseButton.textContent =
    state.status === 'pending_payment' ? copy.cancelPayment : copy.close
  setMessage(elements.orderError, showOrderDialog && state.status !== 'failed' ? state.error ?? '' : '')
  setOrderCheckoutHidden(elements.orderSupport, !showSupportMail)
  if (showSupportMail && state.supportMail) {
    elements.orderSupportPrefix.textContent = copy.supportMailPrefix
    elements.orderSupportMail.textContent = state.supportMail
    elements.orderSupportMail.href = `mailto:${state.supportMail}`
  } else {
    elements.orderSupportPrefix.textContent = ''
    elements.orderSupportMail.textContent = ''
    elements.orderSupportMail.removeAttribute('href')
  }
  setOrderCheckoutHidden(elements.orderSpinner, state.status !== 'pending_payment')
  setOrderCheckoutHidden(elements.successPanel, state.status !== 'success')
  setOrderCheckoutHidden(elements.successPrimary, state.status !== 'success' || !product?.successPrimaryText)
  setOrderCheckoutHidden(elements.successSecondary, state.status !== 'success' || !product?.successSecondaryText)

  if (state.status === 'success') {
    elements.successPrimary.textContent = product?.successPrimaryText ?? ''
    elements.successSecondary.textContent = product?.successSecondaryText ?? ''
  } else {
    elements.successPrimary.textContent = ''
    elements.successSecondary.textContent = ''
  }

  if (showPaymentDialog) {
    renderPaymentDialog(elements, copy, state)
  }
}

/** 创建公共订单 checkout controller。 */
export function createOrderCheckoutController(root: HTMLElement): OrderCheckoutController {
  const elements = getOrderCheckoutElements(root)
  const copy = getOrderCheckoutCopy(root)
  const state = createOrderCheckoutState()
  let pollTimer: number | null = null

  const stopPolling = (): void => {
    if (pollTimer === null) {
      return
    }
    window.clearInterval(pollTimer)
    pollTimer = null
  }

  const closeIntoIdle = (): void => {
    state.open = false
    state.options = null
    resetTransactionState(state)
  }

  const handleAuthFailure = (message: string): void => {
    stopPolling()
    clearStoredAccessToken()
    closeIntoIdle()
    render(elements, copy, state)
    const payload: OrderCheckoutAuthInvalidPayload = { message }
    dispatchOrderCheckoutEvent(elements.root, ORDER_CHECKOUT_AUTH_INVALID_EVENT, payload)
  }

  const finishSuccess = (status: OrderStatusResponse): void => {
    const product = getCurrentProduct(state)
    if (!state.open || !state.orderNo || !state.options || !product) {
      return
    }

    state.lastOrderStatus = status
    state.status = 'success'
    state.error = null
    stopPolling()
    render(elements, copy, state)

    const payload: OrderCheckoutSuccessPayload = {
      source: state.options.source,
      orderNo: state.orderNo,
      productClass: product.productClass,
      productId: product.productId,
      orderStatus: status
    }
    dispatchOrderCheckoutEvent(elements.root, ORDER_CHECKOUT_SUCCESS_EVENT, payload)
  }

  const pollOrderStatus = async (): Promise<void> => {
    if (!state.orderNo) {
      return
    }

    const context = await buildRequestContext()
    if (!context) {
      handleAuthFailure(copy.authExpired)
      return
    }

    try {
      const status = await getOrderStatus(context, state.orderNo)
      if (!state.open) {
        return
      }

      state.lastOrderStatus = status
      const outcome = classifyOrderStatus(status)
      if (outcome === 'paid') {
        finishSuccess(status)
        return
      }
      if (outcome === 'expired') {
        stopPolling()
        state.status = 'failed'
        state.error = copy.orderExpired
        return
      }
      if (outcome === 'cancelled') {
        stopPolling()
        state.status = 'failed'
        state.error = copy.paymentCanceled
        return
      }
      if (outcome === 'failed') {
        stopPolling()
        state.status = 'failed'
        state.error = copy.fulfillmentFailed
        return
      }
      if (hasOrderCheckoutPollingTimedOut(state.pollStartedAt)) {
        stopPolling()
        state.status = 'failed'
        state.error = copy.pollTimeout
      }
    } catch (error) {
      if (!state.open) {
        return
      }

      if (error instanceof Error && isOrderCheckoutAuthFailure(error)) {
        handleAuthFailure(copy.authExpired)
        return
      }
      if (error instanceof Error) {
        console.error(error)
        stopPolling()
        state.status = 'failed'
        state.error = mapOrderCheckoutError(copy, error)
      } else {
        stopPolling()
        state.status = 'failed'
        state.error = copy.pollFailed
      }
    } finally {
      render(elements, copy, state)
    }
  }

  const startPolling = (): void => {
    stopPolling()
    state.pollStartedAt = Date.now()
    pollTimer = window.setInterval(() => {
      void pollOrderStatus()
    }, ORDER_CHECKOUT_POLL_INTERVAL_MS)
  }

  const handlePayPalReturn = (message: PayPalReturnMessage): void => {
    if (!isCurrentPayPalReturnMessage(message, state)) {
      return
    }
    void pollOrderStatus()
  }

  const createOrderForSelectedProduct = async (): Promise<void> => {
    if (!canSubmitPayment(state)) {
      return
    }

    const product = getCurrentProduct(state)
    const channel = getSelectedPaymentChannel(state)
    if (!product || !channel) {
      state.error = copy.gatewayFailed
      render(elements, copy, state)
      return
    }

    const context = await buildRequestContext()
    if (!context) {
      handleAuthFailure(copy.authExpired)
      return
    }

    state.status = 'creating_order'
    state.error = null
    state.orderNo = null
    state.supportMail = null
    render(elements, copy, state)

    try {
      const response = await createOrder(
        context,
        buildCreateOrderRequest(
          {
            product_class: product.productClass,
            product_id: product.productId,
            auto_renew: product.autoRenew,
            period: product.period,
            payment_channels: product.paymentChannels
          },
          channel
        )
      )
      const paymentUrl = readPaymentUrl(response.payment_data, channel.payment_method)
      if (!paymentUrl) {
        state.status = 'selecting_payment_method'
        state.error = copy.invalidPaymentData
        render(elements, copy, state)
        return
      }

      state.orderNo = response.order_no
      state.supportMail = response.support_mail.trim() || null
      state.status = 'pending_payment'
      state.error = null
      render(elements, copy, state)
      openPaymentUrl(paymentUrl)
      startPolling()
    } catch (error) {
      if (error instanceof Error && isOrderCheckoutAuthFailure(error)) {
        handleAuthFailure(copy.authExpired)
        return
      }
      if (error instanceof Error) {
        console.error(error)
        if (isPaymentPriceUpdatedError(error)) {
          const payload: OrderCheckoutPriceUpdatedPayload = {
            source: state.options?.source ?? '',
            productClass: product.productClass,
            productId: product.productId
          }
          closeIntoIdle()
          render(elements, copy, state)
          dispatchOrderCheckoutEvent(elements.root, ORDER_CHECKOUT_PRICE_UPDATED_EVENT, payload)
          return
        }
        state.status = 'selecting_payment_method'
        state.error = mapOrderCheckoutError(copy, error)
      } else {
        state.status = 'selecting_payment_method'
        state.error = copy.createFailed
      }
      render(elements, copy, state)
    }
  }

  const controller: OrderCheckoutController = {
    async open(options: OrderCheckoutOpenOptions): Promise<void> {
      stopPolling()
      resetTransactionState(state)
      state.open = true
      state.options = options
      state.status = 'selecting_payment_method'
      const intendedChannel = options.product.paymentChannels.find(
        channel => channel.payment_method === options.initialPaymentMethod
      )
      state.selectedPaymentMethod =
        (intendedChannel ?? getDefaultOrderPaymentChannel(options.product.paymentChannels))
          ?.payment_method ?? null

      if (!state.selectedPaymentMethod) {
        state.error = copy.gatewayFailed
      }
      render(elements, copy, state)
    },
    close(): void {
      stopPolling()
      closeIntoIdle()
      render(elements, copy, state)
      dispatchOrderCheckoutEvent(elements.root, ORDER_CHECKOUT_CLOSE_EVENT, {})
    },
    isOpen(): boolean {
      return state.open
    }
  }

  mountOrderCheckoutModalToBody(elements.root)

  for (const button of elements.closeButtons) {
    button.addEventListener('click', () => {
      controller.close()
    })
  }

  elements.agreement.addEventListener('change', () => {
    state.agreementAccepted = elements.agreement.checked
    render(elements, copy, state)
  })

  elements.channelList.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const button = target.closest<HTMLButtonElement>('[data-order-checkout-payment-method]')
    if (!button) {
      return
    }
    state.selectedPaymentMethod = button.dataset.orderCheckoutPaymentMethod ?? null
    render(elements, copy, state)
  })

  elements.backButton.addEventListener('click', () => {
    controller.close()
  })

  elements.submitButton.addEventListener('click', () => {
    void createOrderForSelectedProduct()
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.open) {
      controller.close()
    }
  })

  if ('BroadcastChannel' in window) {
    const paypalReturnChannel = new BroadcastChannel(PAYPAL_RETURN_CHANNEL)
    paypalReturnChannel.addEventListener('message', event => {
      handlePayPalReturn(event.data as PayPalReturnMessage)
    })
  }

  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin) {
      return
    }
    const data = event.data as PayPalReturnMessage
    if (data.type !== PAYPAL_RETURN_CHANNEL) {
      return
    }
    handlePayPalReturn(data)
  })

  render(elements, copy, state)
  root.dataset.orderCheckoutReady = 'true'
  root.dispatchEvent(new CustomEvent('order-checkout-ready'))
  return controller
}

const root = document.querySelector<HTMLElement>('[data-order-checkout-modal]')
if (root) {
  window.orderCheckoutController = createOrderCheckoutController(root)
}
