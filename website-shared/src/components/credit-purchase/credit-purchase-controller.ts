/**
 * Credits 购买弹窗控制器。
 *
 * 只负责打开/关闭、加载 Credits 商品配置和渲染商品列表；具体支付渠道选择、
 * 下单、打开外部支付页和订单轮询统一交给公共 OrderCheckoutModal。
 */

import {
  clearStoredAccessToken,
  getCurrentUser,
  getStoredAccessToken
} from '../../homepage-runtime/auth'
import { ensureDeviceId } from '../../homepage-runtime/device'
import type { RequestContext } from '../../homepage-runtime/api'
import {
  HOMEPAGE_MARK_TYPE,
  recordHomepageMark
} from '../../homepage-runtime/mark'
import { sanitizeMarkText } from '../../homepage-runtime/mark-sanitizer'
import type { DownloadWorkspaceContent } from '../../download/schema'
import {
  formatCreditDisplayPrice,
  formatCreditDisplayUnitPrice,
  formatCreditUnitLabel,
  listCreditCheckoutConfigs,
  type CreditCheckoutPaymentChannel,
  type CreditCheckoutPlan
} from './credit-checkout'
import {
  getDefaultOrderPaymentChannel,
  isOrderCheckoutAuthFailure
} from '../order-checkout/order-checkout-api'
import {
  getCreditPurchaseElements,
  setCreditPurchaseHidden,
  type CreditPurchaseElements
} from './credit-purchase-elements'
import {
  createCreditPurchaseState,
  resetCreditPurchaseTransactionState,
  type CreditPurchaseState
} from './credit-purchase-state'
import {
  CREDIT_PURCHASE_AUTH_INVALID_EVENT,
  CREDIT_PURCHASE_CLOSE_EVENT,
  CREDIT_PURCHASE_SUCCESS_EVENT,
  type CreditPurchaseController,
  type CreditPurchaseOpenOptions,
  type CreditPurchaseSuccessPayload
} from './credit-purchase-types'
import {
  ORDER_CHECKOUT_AUTH_INVALID_EVENT,
  ORDER_CHECKOUT_PRICE_UPDATED_EVENT,
  ORDER_CHECKOUT_SUCCESS_EVENT,
  type OrderCheckoutAuthInvalidPayload,
  type OrderCheckoutPriceUpdatedPayload,
  type OrderCheckoutSuccessPayload
} from '../order-checkout/order-checkout-types'

/** Credits 购买弹窗文案。 */
type CreditPurchaseCopy = DownloadWorkspaceContent['creditPurchase']

/** Credits 购买弹窗使用的网页 mark 类型。 */
type CreditPurchaseMarkType = (typeof HOMEPAGE_MARK_TYPE)[keyof typeof HOMEPAGE_MARK_TYPE]

/** 按钮和状态刷新所需的卡片 DOM。 */
interface RenderedCreditCard {
  /** 商品卡片根节点。 */
  card: HTMLElement
  /** 商品购买按钮。 */
  buyButton: HTMLButtonElement
}

let deviceIdPromise: Promise<string> | null = null

/** Credits 购买 mark_msg 普通文本字段最大长度。 */
const MAX_CREDIT_PURCHASE_MARK_TEXT_LENGTH = 160

/** 读取稳定 device_id，避免弹窗每次打开重复初始化。 */
function getCreditPurchaseDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = ensureDeviceId()
  }
  return deviceIdPromise
}

/** 从 DOM script payload 读取弹窗文案。 */
function getCreditPurchaseCopy(root: HTMLElement): CreditPurchaseCopy {
  const element = root.querySelector<HTMLScriptElement>('[data-credit-purchase-copy]')
  if (!element?.textContent) {
    throw new Error('[credit-purchase-controller] Missing credit purchase copy payload.')
  }
  return JSON.parse(element.textContent) as CreditPurchaseCopy
}

/** 构建 Credits 购买接口请求上下文。 */
async function buildRequestContext(): Promise<RequestContext | null> {
  const token = getStoredAccessToken()
  if (!token) {
    return null
  }

  return {
    deviceId: await getCreditPurchaseDeviceId(),
    token
  }
}

/** 写入元素文本并控制 hidden。 */
function setMessage(element: HTMLElement, message: string): void {
  element.textContent = message
  setCreditPurchaseHidden(element, message.length === 0)
}

/** 替换简单占位符。 */
function replaceTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

/** 规范化 Credits 购买 mark_msg 文本字段。 */
function normalizeCreditPurchaseMarkText(value: string): string {
  const sanitized = sanitizeMarkText(value)
  return sanitized.length > MAX_CREDIT_PURCHASE_MARK_TEXT_LENGTH
    ? sanitized.slice(0, MAX_CREDIT_PURCHASE_MARK_TEXT_LENGTH)
    : sanitized
}

/** 规范化 Credits 购买 mark_msg 数字字段。 */
function normalizeCreditPurchaseMarkNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.floor(value)
}

/** 构造打开 Credits 购买弹窗的 mark_msg。 */
function buildCreditPurchaseOpenMarkMessage(options: CreditPurchaseOpenOptions): string {
  const payload: {
    source: string
    reason: string
    required_credits?: number
    product_hint_id?: string
  } = {
    source: normalizeCreditPurchaseMarkText(options.source),
    reason: normalizeCreditPurchaseMarkText(options.reason)
  }
  const requiredCredits = normalizeCreditPurchaseMarkNumber(options.requiredCredits)
  if (requiredCredits !== undefined) {
    payload.required_credits = requiredCredits
  }
  if (options.productHintId) {
    payload.product_hint_id = normalizeCreditPurchaseMarkText(options.productHintId)
  }

  return JSON.stringify(payload)
}

/** 构造点击 Credits 购买按钮的 mark_msg。 */
function buildCreditPurchaseBuyMarkMessage(
  plan: CreditCheckoutPlan,
  channel: CreditCheckoutPaymentChannel
): string {
  return JSON.stringify({
    product_id: normalizeCreditPurchaseMarkText(plan.product_id),
    product_name: normalizeCreditPurchaseMarkText(plan.product_name),
    credits_amount: plan.credits_amount,
    display_currency: normalizeCreditPurchaseMarkText(plan.display_currency),
    display_amount: plan.display_amount,
    payment_method: normalizeCreditPurchaseMarkText(channel.payment_method),
    currency: normalizeCreditPurchaseMarkText(channel.currency),
    amount: channel.amount
  })
}

/** fire-and-forget 记录 Credits 购买打点，避免埋点失败影响购买流程。 */
function recordCreditPurchaseMarkSilently(
  markType: CreditPurchaseMarkType,
  context: RequestContext,
  markMsg: string
): void {
  void recordHomepageMark(markType, context, markMsg).catch(() => {})
}

/** 商品列表的 Buy Now 只进入公共支付方式选择，不直接创建订单。 */
function canOpenPaymentSelection(state: CreditPurchaseState): boolean {
  return state.open && state.status === 'ready' && state.configs.length > 0
}

/** 关闭弹窗时只回到 idle。 */
function closeIntoIdle(state: CreditPurchaseState): void {
  state.open = false
  state.openOptions = null
  resetCreditPurchaseTransactionState(state)
}

/** 广播全局自定义事件。 */
function dispatchCreditPurchaseEvent<T>(root: HTMLElement, eventName: string, detail: T): void {
  const event = new CustomEvent<T>(eventName, { detail })
  root.dispatchEvent(event)
  window.dispatchEvent(event)
}

/** 把弹窗根节点提升到 body，避免 fixed 定位被外层容器裁剪。 */
function mountCreditPurchaseModalToBody(root: HTMLElement): void {
  if (root.parentElement === document.body) {
    return
  }
  document.body.append(root)
}

/** 从模板克隆商品卡片。 */
function cloneCreditCard(elements: CreditPurchaseElements): HTMLElement {
  const firstElement = elements.cardTemplate.content.firstElementChild
  if (!(firstElement instanceof HTMLElement)) {
    throw new Error('[credit-purchase-controller] credit card template root is missing.')
  }
  return firstElement.cloneNode(true) as HTMLElement
}

/** 查询商品卡片内必需元素。 */
function queryCardElement<T extends HTMLElement>(card: HTMLElement, selector: string): T {
  const element = card.querySelector<T>(selector)
  if (!element) {
    throw new Error(`[credit-purchase-controller] Missing card element: ${selector}`)
  }
  return element
}

/** 渲染商品卡片列表。 */
function renderCards(
  elements: CreditPurchaseElements,
  copy: CreditPurchaseCopy,
  state: CreditPurchaseState
): RenderedCreditCard[] {
  elements.list.textContent = ''

  if (state.configs.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'credit-purchase-empty'
    empty.textContent = state.status === 'loading_configs' ? copy.loadingConfigs : copy.noConfigs
    elements.list.append(empty)
    return []
  }

  const rendered: RenderedCreditCard[] = []
  const creditUnitLabel = formatCreditUnitLabel(copy.creditsAmount)
  for (const plan of state.configs) {
    const card = cloneCreditCard(elements)
    card.setAttribute('data-credit-purchase-card', '')
    card.setAttribute('data-credit-purchase-product-id', plan.product_id)

    queryCardElement<HTMLElement>(card, '[data-credit-purchase-card-eyebrow]').textContent =
      copy.packageEyebrow
    queryCardElement<HTMLElement>(card, '[data-credit-purchase-price]').textContent =
      formatCreditDisplayPrice(plan)
    queryCardElement<HTMLElement>(card, '[data-credit-purchase-credits]').textContent =
      replaceTemplate(copy.creditsAmount, { credits: plan.credits_amount })
    queryCardElement<HTMLElement>(card, '[data-credit-purchase-unit-price]').textContent =
      formatCreditDisplayUnitPrice(plan, creditUnitLabel)

    const buyButton = queryCardElement<HTMLButtonElement>(card, '[data-credit-purchase-buy]')
    buyButton.textContent = copy.buyNow
    buyButton.disabled =
      !canOpenPaymentSelection(state) || !getDefaultOrderPaymentChannel(plan.payment_channels)

    rendered.push({ card, buyButton })
    elements.list.append(card)
  }

  return rendered
}

/** 渲染弹窗状态到 DOM。 */
function render(
  elements: CreditPurchaseElements,
  copy: CreditPurchaseCopy,
  state: CreditPurchaseState
): void {
  setCreditPurchaseHidden(elements.root, !state.open)
  elements.root.dataset.creditPurchaseStatus = state.status
  setCreditPurchaseHidden(elements.shopDialog, false)
  elements.title.textContent = copy.title
  setMessage(elements.error, state.error ?? '')
  renderCards(elements, copy, state)
}

/** 根据 product_id 查找商品。 */
function findPlan(state: CreditPurchaseState, productId: string | null): CreditCheckoutPlan | null {
  if (!productId) {
    return null
  }
  return state.configs.find(plan => plan.product_id === productId) ?? null
}

/** 创建 Credits 购买弹窗 controller。 */
export function createCreditPurchaseController(root: HTMLElement): CreditPurchaseController {
  const elements = getCreditPurchaseElements(root)
  const copy = getCreditPurchaseCopy(root)
  const state = createCreditPurchaseState()

  // 引导文案与去向固定指向插件商店，不随账号注册时长变化。
  const updateInstallGuide = (): void => {
    elements.installGuideText.textContent = copy.installGuide
    elements.installLink.textContent = copy.installExtension
    elements.installLink.href = elements.installLink.dataset.installUrl!
  }

  const handleAuthFailure = (message: string): void => {
    clearStoredAccessToken()
    closeIntoIdle(state)
    render(elements, copy, state)
    dispatchCreditPurchaseEvent(elements.root, CREDIT_PURCHASE_AUTH_INVALID_EVENT, { message })
  }

  const refreshConfigs = async (context: RequestContext): Promise<void> => {
    state.status = 'loading_configs'
    state.error = null
    render(elements, copy, state)

    const configs = await listCreditCheckoutConfigs(context)
    state.configs = configs
    state.status = configs.length > 0 ? 'ready' : 'failed'
    state.error = configs.length > 0 ? null : copy.noConfigs
    render(elements, copy, state)
  }

  const openPaymentSelection = async (productId: string | null): Promise<void> => {
    const plan = findPlan(state, productId)
    const channel = getDefaultOrderPaymentChannel(plan?.payment_channels ?? [])
    if (!plan || !channel) {
      state.error = copy.noConfigs
      render(elements, copy, state)
      return
    }

    const context = await buildRequestContext()
    if (!context) {
      handleAuthFailure(copy.authExpired)
      return
    }

    recordCreditPurchaseMarkSilently(
      HOMEPAGE_MARK_TYPE.WEB_CREDIT_PURCHASE_BUY_CLICK,
      context,
      buildCreditPurchaseBuyMarkMessage(plan, channel)
    )

    // 支付期间保留用户快照，价格更新返回套餐时仍以同一注册事实重新计算。
    state.open = false
    resetCreditPurchaseTransactionState(state)
    render(elements, copy, state)
    await window.orderCheckoutController?.open({
      source: 'credits',
      product: {
        productClass: plan.product_class,
        productId: plan.product_id,
        autoRenew: false,
        period: 'none',
        title: replaceTemplate(copy.creditsAmount, { credits: plan.credits_amount }),
        priceText: formatCreditDisplayPrice(plan),
        successTitle: copy.successTitle,
        successDescription: copy.successDescription,
        successPrimaryText: replaceTemplate(copy.successCredits, {
          credits: plan.credits_amount
        }),
        creditsAmount: plan.credits_amount,
        paymentChannels: plan.payment_channels
      }
    })
  }

  const handleOrderCheckoutSuccess = async (payload: OrderCheckoutSuccessPayload): Promise<void> => {
    if (payload.source !== 'credits' || payload.creditsAmount === null) {
      return
    }

    const context = await buildRequestContext()
    if (!context) {
      handleAuthFailure(copy.authExpired)
      return
    }

    try {
      const user = await getCurrentUser(context)
      const latestBalance = Math.max(0, Math.floor(user.credits_balance))
      payload.updateSuccessSecondaryText(replaceTemplate(copy.successBalance, {
        balance: latestBalance
      }))
      const successPayload: CreditPurchaseSuccessPayload = {
        orderNo: payload.orderNo,
        purchasedCredits: payload.creditsAmount,
        latestBalance
      }
      dispatchCreditPurchaseEvent(elements.root, CREDIT_PURCHASE_SUCCESS_EVENT, successPayload)
    } catch (error) {
      if (error instanceof Error) {
        console.error(error)
      }
    }
  }

  const handleOrderCheckoutPriceUpdated = async (
    payload: OrderCheckoutPriceUpdatedPayload
  ): Promise<void> => {
    if (payload.source !== 'credits') {
      return
    }

    const context = await buildRequestContext()
    if (!context) {
      handleAuthFailure(copy.authExpired)
      return
    }

    state.open = true
    try {
      updateInstallGuide()
      await refreshConfigs(context)
      state.error = copy.priceUpdated
      render(elements, copy, state)
    } catch (error) {
      if (error instanceof Error && isOrderCheckoutAuthFailure(error)) {
        handleAuthFailure(copy.authExpired)
        return
      }
      if (error instanceof Error) {
        console.error(error)
        state.error = error.message || copy.loadFailed
      } else {
        state.error = copy.loadFailed
      }
      state.status = 'failed'
      render(elements, copy, state)
    }
  }

  const controller: CreditPurchaseController = {
    async open(options: CreditPurchaseOpenOptions): Promise<void> {
      updateInstallGuide()
      state.configs = []
      resetCreditPurchaseTransactionState(state)
      state.open = true
      state.openOptions = options
      state.status = 'loading_configs'
      render(elements, copy, state)

      const context = await buildRequestContext()
      if (!context) {
        handleAuthFailure(copy.authExpired)
        return
      }

      recordCreditPurchaseMarkSilently(
        HOMEPAGE_MARK_TYPE.WEB_CREDIT_PURCHASE_MODAL_OPEN,
        context,
        buildCreditPurchaseOpenMarkMessage(options)
      )

      try {
        await refreshConfigs(context)
      } catch (error) {
        if (error instanceof Error && isOrderCheckoutAuthFailure(error)) {
          handleAuthFailure(copy.authExpired)
          return
        }
        if (error instanceof Error) {
          console.error(error)
          state.error = error.message || copy.loadFailed
        } else {
          state.error = copy.loadFailed
        }
        state.status = 'failed'
        render(elements, copy, state)
      }
    },
    close(): void {
      closeIntoIdle(state)
      render(elements, copy, state)
      dispatchCreditPurchaseEvent(elements.root, CREDIT_PURCHASE_CLOSE_EVENT, {})
    },
    isOpen(): boolean {
      return state.open
    }
  }

  mountCreditPurchaseModalToBody(elements.root)

  for (const button of elements.closeButtons) {
    button.addEventListener('click', () => {
      controller.close()
    })
  }

  elements.list.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    const buyButton = target.closest<HTMLButtonElement>('[data-credit-purchase-buy]')
    if (!buyButton) {
      return
    }

    const card = target.closest<HTMLElement>('[data-credit-purchase-card]')
    if (!card) {
      return
    }
    void openPaymentSelection(card.getAttribute('data-credit-purchase-product-id'))
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.open) {
      controller.close()
    }
  })

  window.addEventListener(ORDER_CHECKOUT_SUCCESS_EVENT, event => {
    void handleOrderCheckoutSuccess((event as CustomEvent<OrderCheckoutSuccessPayload>).detail)
  })

  window.addEventListener(ORDER_CHECKOUT_AUTH_INVALID_EVENT, event => {
    const payload = (event as CustomEvent<OrderCheckoutAuthInvalidPayload>).detail
    dispatchCreditPurchaseEvent(elements.root, CREDIT_PURCHASE_AUTH_INVALID_EVENT, payload)
  })

  window.addEventListener(ORDER_CHECKOUT_PRICE_UPDATED_EVENT, event => {
    void handleOrderCheckoutPriceUpdated((event as CustomEvent<OrderCheckoutPriceUpdatedPayload>).detail)
  })

  render(elements, copy, state)
  root.dataset.creditPurchaseReady = 'true'
  root.dispatchEvent(new CustomEvent('credit-purchase-ready'))
  return controller
}

const root = document.querySelector<HTMLElement>('[data-credit-purchase-modal]')
if (root) {
  window.creditPurchaseController = createCreditPurchaseController(root)
}
