/**
 * Pricing 页面控制器。
 *
 * 负责恢复登录态、渲染用户信息、加载 Credits/订阅商品，并把所有支付流程
 * 交给公共 OrderCheckoutModal，避免 Pricing 页维护第二套支付弹窗和订单轮询。
 */

import {
  clearStoredAccessToken,
  getCurrentUser,
  getStoredAccessToken,
  logoutCurrentUser,
  type HomepageUserInfo
} from '../../homepage-runtime/auth'
import { ensureDeviceId } from '../../homepage-runtime/device'
import type { JsonObject, JsonValue, RequestContext } from '../../homepage-runtime/api'
import {
  formatCreditDisplayUnitPrice,
  formatCreditUnitLabel,
  listCreditCheckoutConfigs,
  type CreditCheckoutPlan
} from '../credit-purchase/credit-checkout'
import {
  ORDER_CHECKOUT_AUTH_INVALID_EVENT,
  ORDER_CHECKOUT_PRICE_UPDATED_EVENT,
  ORDER_CHECKOUT_SUCCESS_EVENT,
  type OrderCheckoutAuthInvalidPayload,
  type OrderCheckoutPaymentOption,
  type OrderCheckoutPriceUpdatedPayload,
  type OrderCheckoutSuccessPayload
} from '../order-checkout/order-checkout-types'
import {
  getDefaultOrderPaymentChannel,
  isOrderCheckoutAuthFailure
} from '../order-checkout/order-checkout-api'
import {
  createSubscriptionManagement,
  formatPricingDisplayPrice,
  formatSubscriptionPeriod,
  listSubscriptionCheckoutConfigs,
  type SubscriptionCheckoutPlan
} from './pricing-checkout'
import {
  PRICING_AUTH_CLOSE_EVENT,
  PRICING_AUTH_SUCCESS_EVENT,
  type PricingAuthSuccessPayload
} from './pricing-auth-controller'
import {
  PRICING_REVIEW_REWARD_CLAIMED_EVENT,
  type PricingReviewRewardClaimedPayload
} from './pricing-subscription-confirm-controller'
import { reportGA4Event } from '../../homepage-runtime/ga4'
import { HOMEPAGE_MARK_TYPE, recordHomepageMark } from '../../homepage-runtime/mark'
import { pricingEntryRedirecting, readPricingEntryFlags } from './pricing-entry'

/** 同 tab Google OAuth 回跳后恢复订阅购买的会话键。 */
const PENDING_SUBSCRIPTION_PURCHASE_KEY = 'pricing_pending_subscription_purchase'

/** 商品列表加载骨架卡数量：与订阅目录三档、积分常见档位对齐。 */
const PRICING_SKELETON_CARD_COUNT = 3

/** Pricing 页面文案。 */
interface PricingCopy {
  /** 主推商品的徽章文案；未配置时不标记主推 Credits 卡。 */
  popularLabel?: string
  /** 账户区文案。 */
  account: {
    title: string
    loading: string
    signedOutTitle: string
    signedOutDescription: string
    signInCta: string
    signedInLabel: string
    creditsLabel: string
    subscriptionLabel: string
    expiresLabel: string
    statusLabel: string
    dailyUsageLabel: string
    resetLabel: string
    autoRenewLabel: string
    active: string
    expired: string
    noExpiry: string
    freePlan: string
    unlimited: string
    loadFailed: string
  }
  /** 订阅管理入口与取消指引文案。 */
  subscriptionManagement: {
    loadFailed: string
  }
  /** Unlimited 商品文案。 */
  subscription: {
    title: string
    monthlyLabel: string
    yearlyLabel: string
    lifetimeLabel: string
    /** 季卡价格下方的省钱标注；未配置时季卡不渲染该行。 */
    quarterlySavingsLabel?: string
    dailyLimitLabel: string
    autoRenewOn: string
    autoRenewOff: string
    usageNotice: string
    loading: string
    loadFailed: string
    noPlan: string
    noChannels: string
    buyNow: string
    loginToBuy: string
    alreadyActive: string
    creatingOrder: string
    pendingPaymentTitle: string
    pendingPayment: string
    successTitle: string
    successDescription: string
    failedTitle: string
    close: string
    cancelPayment: string
    supportMailPrefix: string
    createFailed: string
    invalidPaymentData: string
    priceUpdated: string
    gatewayFailed: string
    orderNotFound: string
    orderExpired: string
    paymentCanceled: string
    fulfillmentFailed: string
    pollFailed: string
    pollTimeout: string
    authExpired: string
    installConfirmTitle: string
    installConfirmMessage: string
    installConfirmLinkLabel: string
    installConfirmCancel: string
    installConfirmContinue: string
  }
  /** Credits 文案。 */
  credits: {
    loading: string
    loadFailed: string
    noConfigs: string
    packageEyebrow: string
    creditsAmount: string
    buyNow: string
    loginToBuy: string
    noChannels: string
    webOnlyNotice: string
  }
  /** 插件额度入口进入时的专属文案。 */
  extensionSource: {
    primaryCta: string
    signedOutCta: string
    /** 符合资格账号在插件来源页看到的好评赠送标题。 */
    reviewRewardTitle?: string
    /** 好评赠送入口的操作说明。 */
    reviewRewardDescription?: string
  }
}

/** 订阅卡单卡 DOM 集合（由模板按商品逐张克隆）。 */
interface PricingSubscriptionElements {
  /** 订阅价格。 */
  price: HTMLElement
  /** 订阅周期。 */
  period: HTMLElement
  /** 季卡省钱标注；非季卡隐藏。 */
  savings: HTMLElement
  /** 订阅错误。 */
  error: HTMLElement
  /** 订阅购买按钮。 */
  buy: HTMLButtonElement
  /** 商品配置对应的续费方式行。 */
  billingRow: HTMLElement
  /** 商品配置对应的续费方式文案。 */
  billing: HTMLElement
}

/** 页面 DOM 集合。 */
interface PricingElements {
  /** 页面根节点。 */
  root: HTMLElement
  /** 账号加载状态。 */
  accountLoading: HTMLElement
  /** 未登录账号区。 */
  accountSignedOut: HTMLElement
  /** 已登录账号区。 */
  accountSignedIn: HTMLElement
  /** 账号错误。 */
  accountError: HTMLElement
  /** 登录按钮。 */
  loginButtons: HTMLButtonElement[]
  /** 账号头像按钮。 */
  accountButton: HTMLButtonElement
  /** 账号菜单。 */
  accountMenu: HTMLElement
  /** 账号邮箱。 */
  accountEmail: HTMLElement
  /** 退出登录按钮。 */
  accountLogout: HTMLButtonElement
  /** 用户头像。 */
  userAvatar: HTMLImageElement
  /** 用户首字母。 */
  userInitial: HTMLElement
  /** Credits 余额文案。 */
  userCreditsLabel: HTMLElement
  /** 订阅名。 */
  userSubscription: HTMLElement
  /** 订阅到期时间。 */
  userExpires: HTMLElement
  /** 订阅管理入口（跳转渠道管理页）。 */
  subscriptionManageButton: HTMLButtonElement
  /** 插件来源页的好评赠送入口；未配置活动文案时不存在。 */
  reviewRewardBanner: HTMLButtonElement | null
  /** 订阅卡列表；站点隐藏订阅时为 null。 */
  subscriptionList: HTMLElement | null
  /** 订阅卡模板。 */
  subscriptionTemplate: HTMLTemplateElement | null
  /** 加载骨架卡模板；与商品列表同模式，模式不符的页面不存在。 */
  skeletonTemplate: HTMLTemplateElement | null
  /** Credits 列表。 */
  creditList: HTMLElement | null
  /** Credits 卡片模板。 */
  creditTemplate: HTMLTemplateElement | null
}

/** 页面状态。 */
interface PricingState {
  /** device_id。 */
  deviceId: string
  /** access token。 */
  token: string | null
  /** auth/me 用户。 */
  user: HomepageUserInfo | null
  /** 可购买订阅商品列表。 */
  subscriptionPlans: SubscriptionCheckoutPlan[]
  /** 登录成功后一次性恢复的订阅购买意图。 */
  pendingSubscriptionPurchase: PendingSubscriptionPurchase | null
  /** 后端是否开放好评赠送活动。 */
  reviewRewardEnabled: boolean
  /** 好评赠送资格状态位：0 可领，1 不可领（已领过，或资格推导失败按不可领降级）。 */
  reviewRewardClaimedCount: number
  /** 当前登录态的好评领取资格是否已从订阅配置加载。 */
  reviewRewardEligibilityLoaded: boolean
  /** 最近一次订阅配置请求版本；旧响应不得覆盖新登录态。 */
  subscriptionLoadVersion: number
  /** 是否从插件额度相关入口进入 Pricing。 */
  isExtensionSource: boolean
  extensionEntryMarkMsg: string | null
}

/** 匿名点击时选中的稳定价格选项身份。 */
interface PendingSubscriptionPurchase {
  productId: string
  productPriceId: number
  paymentMethod: string
}

/** 初始化 Pricing 页面。 */
async function initPricingPage(root: HTMLElement): Promise<void> {
  const copy = getPricingCopy(root)
  const elements = getPricingElements(root)
  const entryFlags = readPricingEntryFlags()

  const state: PricingState = {
    deviceId: await ensureDeviceId(),
    token: getStoredAccessToken(),
    user: null,
    subscriptionPlans: [],
    pendingSubscriptionPurchase: elements.subscriptionList ? readPendingSubscriptionPurchase() : null,
    reviewRewardEnabled: false,
    reviewRewardClaimedCount: 0,
    reviewRewardEligibilityLoaded: false,
    subscriptionLoadVersion: 0,
    isExtensionSource: entryFlags.isExtensionSource,
    extensionEntryMarkMsg: entryFlags.extensionEntryMarkMsg
  }

  bindEvents(elements, copy, state)
  reportPricingEntryView(state)
  await Promise.all([
    restoreUser(elements, copy, state),
    loadCredits(elements, copy, state),
    loadSubscription(elements, copy, state)
  ])
}

/** 绑定页面事件。 */
function bindEvents(elements: PricingElements, copy: PricingCopy, state: PricingState): void {
  for (const button of elements.loginButtons) {
    button.addEventListener('click', () => {
      window.pricingAuthController?.open()
    })
  }

  document.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }
    if (!elements.accountButton.contains(target) && !elements.accountMenu.contains(target)) {
      setAccountMenuOpen(elements, false)
    }
  })

  elements.accountButton.addEventListener('click', event => {
    event.stopPropagation()
    setAccountMenuOpen(elements, elements.accountMenu.hidden)
  })

  elements.accountLogout.addEventListener('click', () => {
    void logoutPricingUser(elements, copy, state)
  })

  elements.subscriptionManageButton.addEventListener('click', () => {
    if (!canManageSubscription(state)) {
      return
    }
    void openSubscriptionManagement(elements, copy, state)
  })

  elements.reviewRewardBanner?.addEventListener('click', () => {
    void openReviewReward(elements, copy, state).catch(error => {
      console.error(error)
      setMessage(
        elements.accountError,
        error instanceof Error ? error.message : copy.subscription.createFailed
      )
    })
  })

  window.addEventListener(PRICING_AUTH_SUCCESS_EVENT, event => {
    const payload = (event as CustomEvent<PricingAuthSuccessPayload>).detail
    void handlePricingAuthSuccess(elements, copy, state, payload)
  })

  window.addEventListener(PRICING_AUTH_CLOSE_EVENT, () => {
    if (elements.subscriptionList) clearPendingSubscriptionPurchase(state)
  })

  window.addEventListener(PRICING_REVIEW_REWARD_CLAIMED_EVENT, event => {
    void handleReviewRewardClaimed(
      elements,
      copy,
      state,
      (event as CustomEvent<PricingReviewRewardClaimedPayload>).detail
    )
  })

  window.addEventListener(ORDER_CHECKOUT_SUCCESS_EVENT, event => {
    void handleOrderCheckoutSuccess(elements, copy, state, (event as CustomEvent<OrderCheckoutSuccessPayload>).detail)
  })

  window.addEventListener(ORDER_CHECKOUT_AUTH_INVALID_EVENT, event => {
    const payload = (event as CustomEvent<OrderCheckoutAuthInvalidPayload>).detail
    clearStoredAccessToken()
    state.token = null
    state.user = null
    state.reviewRewardEligibilityLoaded = false
    state.subscriptionLoadVersion += 1
    renderAccount(elements, copy, state)
    renderSubscription(elements, copy, state)
    window.pricingAuthController?.open()
    setMessage(elements.accountError, payload.message || copy.subscription.authExpired)
  })

  window.addEventListener(ORDER_CHECKOUT_PRICE_UPDATED_EVENT, event => {
    void handleOrderCheckoutPriceUpdated(
      elements,
      copy,
      state,
      (event as CustomEvent<OrderCheckoutPriceUpdatedPayload>).detail
    )
  })
}

/** 请求服务端按当前订阅渠道创建管理入口；渠道无托管管理页时提示失败。 */
async function openSubscriptionManagement(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState
): Promise<void> {
  elements.subscriptionManageButton.disabled = true
  setHidden(elements.accountError, true)
  try {
    const result = await createSubscriptionManagement(buildRequestContext(state))
    if (!result.url) {
      setMessage(elements.accountError, copy.subscriptionManagement.loadFailed)
      return
    }
    window.location.assign(result.url)
  } catch (error) {
    console.error(error)
    setMessage(elements.accountError, copy.subscriptionManagement.loadFailed)
  } finally {
    elements.subscriptionManageButton.disabled = false
  }
}

/** 恢复 auth/me。 */
async function restoreUser(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState
): Promise<void> {
  setHidden(elements.accountLoading, false)
  setHidden(elements.accountError, true)

  if (!state.token) {
    setHidden(elements.accountLoading, true)
    renderAccount(elements, copy, state)
    return
  }

  try {
    state.user = await getCurrentUser(buildRequestContext(state))
  } catch (error) {
    console.error(error)
    if (error instanceof Error && isOrderCheckoutAuthFailure(error)) {
      clearStoredAccessToken()
      state.token = null
      state.user = null
      state.subscriptionLoadVersion += 1
      await loadSubscription(elements, copy, state)
    } else {
      setMessage(elements.accountError, error instanceof Error ? error.message : copy.account.loadFailed)
    }
  } finally {
    setHidden(elements.accountLoading, true)
    renderAccount(elements, copy, state)
    if (state.subscriptionPlans.length > 0) {
      renderSubscription(elements, copy, state)
    }
  }
}

/** 加载 Credits 商品列表。 */
async function loadCredits(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState
): Promise<void> {
  if (!elements.creditList) {
    return
  }

  elements.creditList.textContent = ''
  appendLoadingSkeletons(elements.creditList, elements.skeletonTemplate, copy.credits.loading)

  try {
    const plans = await listCreditCheckoutConfigs(buildRequestContext(state))
    renderCredits(elements, copy, state, plans)
  } catch (error) {
    console.error(error)
    elements.creditList.textContent = ''
    appendError(elements.creditList, error instanceof Error ? error.message : copy.credits.loadFailed)
  }
}

/** 加载可购买订阅商品；站点隐藏订阅卡时直接跳过。 */
export async function loadSubscription(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState
): Promise<void> {
  if (!elements.subscriptionList || !elements.subscriptionTemplate) {
    return
  }

  const requestVersion = ++state.subscriptionLoadVersion

  state.reviewRewardEnabled = false
  state.reviewRewardEligibilityLoaded = false
  renderReviewRewardBanner(elements, state)
  elements.subscriptionList.textContent = ''
  appendLoadingSkeletons(elements.subscriptionList, elements.skeletonTemplate, copy.subscription.loading)

  try {
    const subscriptionData = await listSubscriptionCheckoutConfigs(buildRequestContext(state))
    if (requestVersion !== state.subscriptionLoadVersion) {
      return
    }
    state.subscriptionPlans = subscriptionData.plans
    state.reviewRewardEnabled = subscriptionData.reviewRewardEnabled
    state.reviewRewardClaimedCount = subscriptionData.reviewRewardClaimedCount
    state.reviewRewardEligibilityLoaded = true
    renderSubscription(elements, copy, state)
  } catch (error) {
    console.error(error)
    if (requestVersion !== state.subscriptionLoadVersion) {
      return
    }
    state.subscriptionPlans = []
    state.reviewRewardEligibilityLoaded = false
    elements.subscriptionList.textContent = ''
    appendError(elements.subscriptionList, copy.subscription.loadFailed)
  }
}

/** 渲染账号区。 */
function renderAccount(elements: PricingElements, copy: PricingCopy, state: PricingState): void {
  const user = state.user
  renderReviewRewardBanner(elements, state)
  const subscriptionManageAvailable = canManageSubscription(state)
  setHidden(elements.accountSignedOut, Boolean(user))
  setHidden(elements.accountSignedIn, !user)
  setHidden(elements.subscriptionManageButton, !subscriptionManageAvailable)

  if (!user) {
    setAccountMenuOpen(elements, false)
    elements.accountEmail.textContent = ''
    elements.accountEmail.removeAttribute('title')
    elements.accountButton.setAttribute('aria-expanded', 'false')
    return
  }

  renderUserAvatar(elements, user)
  elements.accountEmail.textContent = user.email
  elements.accountEmail.title = user.email
  elements.userCreditsLabel.textContent = replaceTemplate(copy.credits.creditsAmount, {
    credits: Math.max(0, Math.floor(user.credits_balance))
  })

  const subscription = user.subscription ?? null
  elements.userSubscription.textContent =
    formatSubscriptionDisplayName(subscription?.period ?? null, subscription?.display_name ?? null, copy)
  // 终生权益按 200 年履约，到期栏必须展示本地化终生文案，绝不渲染遥远到期日。
  elements.userExpires.textContent =
    subscription?.period === 'lifetime'
      ? copy.subscription.lifetimeLabel
      : formatTimestamp(subscription?.expires_at ?? null, copy.account.noExpiry)
}

/** Pricing 页退出登录后同步刷新账号、订阅和 Credits 按钮态。 */
async function logoutPricingUser(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState
): Promise<void> {
  try {
    if (state.token) {
      await logoutCurrentUser(buildRequestContext(state))
    }
  } catch (error) {
    console.error(error)
  } finally {
    clearStoredAccessToken()
    state.token = null
    state.user = null
    state.reviewRewardClaimedCount = 0
    state.reviewRewardEligibilityLoaded = false
    state.subscriptionLoadVersion += 1
    setAccountMenuOpen(elements, false)
    renderAccount(elements, copy, state)
    renderSubscription(elements, copy, state)
    renderCreditsButtons(elements, copy)
  }
}

/** 控制账号菜单展开，保持和首页账号按钮一致的交互。 */
function setAccountMenuOpen(elements: PricingElements, open: boolean): void {
  setHidden(elements.accountMenu, !open)
  elements.accountButton.setAttribute('aria-expanded', open ? 'true' : 'false')
}

/** 渲染订阅卡列表；站点隐藏订阅卡时为空操作。 */
function renderSubscription(elements: PricingElements, copy: PricingCopy, state: PricingState): void {
  renderReviewRewardBanner(elements, state)
  const list = elements.subscriptionList
  const template = elements.subscriptionTemplate
  if (!list || !template) {
    return
  }

  list.textContent = ''
  if (state.subscriptionPlans.length === 0) {
    appendStatus(list, copy.subscription.noPlan)
    return
  }

  for (const plan of state.subscriptionPlans) {
    list.append(renderSubscriptionCard(elements, copy, state, plan))
  }
}

/** 按商品配置克隆并填充一张订阅卡。 */
function renderSubscriptionCard(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState,
  plan: SubscriptionCheckoutPlan
): HTMLElement {
  const template = elements.subscriptionTemplate
  if (!template) {
    throw new Error('[pricing-page-controller] Subscription card template is missing.')
  }
  const card = cloneTemplate(template)
  const subscription = querySubscriptionElements(card)
  card.dataset.pricingSubscriptionProductId = plan.product_id

  const channel = getDefaultOrderPaymentChannel(plan.payment_channels)
  subscription.price.textContent = formatPricingDisplayPrice(plan)
  subscription.period.textContent = formatSubscriptionPeriod(
    plan.period,
    copy.subscription.monthlyLabel,
    copy.subscription.yearlyLabel,
    copy.subscription.lifetimeLabel,
    document.documentElement.lang || 'en-US'
  )
  subscription.billing.textContent = plan.auto_renew
    ? copy.subscription.autoRenewOn
    : copy.subscription.autoRenewOff
  setHidden(subscription.billingRow, false)

  const savingsLabel = plan.period === 'quarter' ? copy.subscription.quarterlySavingsLabel : undefined
  setHidden(subscription.savings, !savingsLabel)
  if (savingsLabel) {
    subscription.savings.textContent = savingsLabel
  }

  const hasChannel = Boolean(channel)
  const activeSubscription = hasActiveSubscription(state)
  subscription.buy.textContent = getSubscriptionButtonLabel(copy, state)
  subscription.buy.setAttribute('data-ga-source', state.isExtensionSource ? 'extension' : 'pricing')
  subscription.buy.disabled = !hasChannel && !activeSubscription
  subscription.buy.setAttribute('aria-disabled', activeSubscription ? 'true' : 'false')
  subscription.buy.classList.toggle('is-soft-disabled', activeSubscription)

  subscription.buy.addEventListener('click', () => {
    if (hasActiveSubscription(state)) {
      setMessage(subscription.error, copy.subscription.alreadyActive)
      return
    }
    void openSubscriptionCheckout(elements, copy, state, plan, subscription).catch(error => {
      console.error(error)
      setMessage(subscription.error, error instanceof Error ? error.message : copy.subscription.createFailed)
    })
  })
  return card
}

/** 活动开启时，只有已确认未领取的登录账号才在插件来源页展示入口。 */
function renderReviewRewardBanner(elements: PricingElements, state: PricingState): void {
  const banner = elements.reviewRewardBanner
  if (!banner) {
    return
  }
  setHidden(
    banner,
    !state.isExtensionSource ||
      !state.reviewRewardEnabled ||
      !state.token ||
      !state.user ||
      !state.reviewRewardEligibilityLoaded ||
      state.reviewRewardClaimedCount !== 0
  )
}

/** 渲染 Credits 商品卡片。 */
function renderCredits(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState,
  plans: CreditCheckoutPlan[]
): void {
  if (!elements.creditList || !elements.creditTemplate) return
  elements.creditList.textContent = ''
  if (plans.length === 0) {
    appendStatus(elements.creditList, copy.credits.noConfigs)
    return
  }

  const creditUnitLabel = formatCreditUnitLabel(copy.credits.creditsAmount)
  // 配置了徽章文案时，把中间档标记为主推卡（蓝描边 + 徽章）；插件入口不渲染 Credits，天然不受影响。
  const featuredIndex = copy.popularLabel ? Math.floor(plans.length / 2) : -1
  for (const [index, plan] of plans.entries()) {
    const card = cloneTemplate(elements.creditTemplate)
    const channel = getDefaultOrderPaymentChannel(plan.payment_channels)
    query<HTMLElement>(card, '[data-pricing-credit-eyebrow]').textContent = copy.credits.packageEyebrow
    query<HTMLElement>(card, '[data-pricing-credit-amount]').textContent =
      replaceTemplate(copy.credits.creditsAmount, { credits: plan.credits_amount })
    query<HTMLElement>(card, '[data-pricing-credit-price]').textContent =
      formatPricingDisplayPrice(plan)
    query<HTMLElement>(card, '[data-pricing-credit-unit-price]').textContent =
      formatCreditDisplayUnitPrice(plan, creditUnitLabel)

    if (index === featuredIndex && copy.popularLabel) {
      card.classList.add('is-featured')
      const badge = document.createElement('p')
      badge.className = 'pricing-card-badge'
      badge.textContent = copy.popularLabel
      card.prepend(badge)
    }

    const note = query<HTMLElement>(card, '[data-pricing-credit-note]')
    note.textContent = channel ? copy.credits.webOnlyNotice : copy.credits.noChannels
    setHidden(note, false)

    const button = query<HTMLButtonElement>(card, '[data-pricing-credit-buy]')
    button.textContent = copy.credits.buyNow
    button.disabled = !channel
    button.addEventListener('click', () => {
      if (!state.token || !state.user) {
        window.pricingAuthController?.open()
        return
      }
      void window.orderCheckoutController?.open({
        source: 'pricing_credits',
        product: {
          productClass: plan.product_class,
          productId: plan.product_id,
          autoRenew: false,
          period: 'none',
          title: replaceTemplate(copy.credits.creditsAmount, { credits: plan.credits_amount }),
          priceText: formatPricingDisplayPrice(plan),
          usageNotice: copy.credits.webOnlyNotice,
          successPrimaryText: replaceTemplate(copy.credits.creditsAmount, {
            credits: `+${plan.credits_amount}`
          }),
          creditsAmount: plan.credits_amount,
          paymentChannels: plan.payment_channels
        }
      })
    })
    elements.creditList.append(card)
  }
}

/** 登录态变化后刷新 Credits 卡片按钮文案。 */
function renderCreditsButtons(
  elements: PricingElements,
  copy: PricingCopy
): void {
  if (!elements.creditList) return
  const buttons = Array.from(elements.creditList.querySelectorAll<HTMLButtonElement>('[data-pricing-credit-buy]'))
  for (const button of buttons) {
    button.textContent = copy.credits.buyNow
  }
}

/** 打开指定订阅商品的公共支付方式选择弹窗。 */
async function openSubscriptionCheckout(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState,
  plan: SubscriptionCheckoutPlan,
  subscription: PricingSubscriptionElements,
  intendedPurchase: PendingSubscriptionPurchase | null = null
): Promise<void> {
  if (hasActiveSubscription(state)) {
    setMessage(subscription.error, copy.subscription.alreadyActive)
    return
  }

  const channel = intendedPurchase
    ? plan.product_id === intendedPurchase.productId
      ? plan.payment_channels.find(
          option =>
            option.product_price_id === intendedPurchase.productPriceId &&
            option.payment_method === intendedPurchase.paymentMethod
        ) ?? null
      : null
    : getDefaultOrderPaymentChannel(plan.payment_channels)
  if (!channel) {
    setMessage(subscription.error, copy.subscription.noChannels)
    return
  }

  if (!state.token || !state.user) {
    savePendingSubscriptionPurchase(state, {
      productId: plan.product_id,
      productPriceId: channel.product_price_id,
      paymentMethod: channel.payment_method
    })
    window.pricingAuthController?.open()
    return
  }

  setMessage(subscription.error, '')
  const confirmController = window.pricingSubscriptionConfirmController
  if (!confirmController) {
    throw new Error(
      '[pricing-page-controller] Missing window.pricingSubscriptionConfirmController for subscription confirmation.'
    )
  }
  const confirmationResult = await confirmController.open({
    reviewRewardEnabled: state.reviewRewardEnabled,
    reviewRewardClaimedCount: state.reviewRewardClaimedCount,
    requestContext: buildRequestContext(state),
    returnFocus: subscription.buy
  })
  if (confirmationResult === 'auth_invalid') {
    handleReviewRewardAuthInvalid(elements, copy, state)
    return
  }
  if (confirmationResult !== 'continue') {
    return
  }

  await window.orderCheckoutController?.open({
    source: 'pricing_subscription',
    initialPaymentMethod: channel.payment_method,
    product: {
      productClass: plan.product_class,
      productId: plan.product_id,
      autoRenew: plan.auto_renew,
      period: plan.period,
      title: copy.subscription.title,
      priceText: formatPricingDisplayPrice(channel),
      usageNotice: copy.subscription.usageNotice,
      successTitle: copy.subscription.successTitle,
      successDescription: copy.subscription.successDescription,
      successPrimaryText: copy.subscription.title,
      successSecondaryText: copy.subscription.successDescription,
      paymentChannels: plan.payment_channels.map<OrderCheckoutPaymentOption>(option => ({
        ...option,
        priceText: formatPricingDisplayPrice(option),
        detailText: [
          formatSubscriptionPeriod(
            plan.period,
            copy.subscription.monthlyLabel,
            copy.subscription.yearlyLabel,
            copy.subscription.lifetimeLabel,
            document.documentElement.lang || 'en-US'
          ),
          plan.auto_renew ? copy.subscription.autoRenewOn : copy.subscription.autoRenewOff,
          copy.subscription.usageNotice
        ].join(' · ')
      }))
    }
  })
}

/** 从插件来源提示行直接进入好评检测，不经过付费确认。 */
async function openReviewReward(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState
): Promise<void> {
  const banner = elements.reviewRewardBanner
  if (!banner || banner.hidden) {
    return
  }
  const confirmController = window.pricingSubscriptionConfirmController
  if (!confirmController) {
    throw new Error(
      '[pricing-page-controller] Missing window.pricingSubscriptionConfirmController for review reward entry.'
    )
  }
  const result = await confirmController.openReviewReward({
    reviewRewardEnabled: state.reviewRewardEnabled,
    reviewRewardClaimedCount: state.reviewRewardClaimedCount,
    requestContext: buildRequestContext(state),
    returnFocus: banner
  })
  if (result === 'auth_invalid') {
    handleReviewRewardAuthInvalid(elements, copy, state)
  }
}

/** 好评领取发现登录失效时，统一清空资格并回到 Pricing 登录流程。 */
function handleReviewRewardAuthInvalid(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState
): void {
  clearStoredAccessToken()
  state.token = null
  state.user = null
  state.reviewRewardClaimedCount = 0
  state.reviewRewardEligibilityLoaded = false
  state.subscriptionLoadVersion += 1
  renderAccount(elements, copy, state)
  renderSubscription(elements, copy, state)
  window.pricingAuthController?.open()
}

/** 登录成功后用账号 token 重新加载配置，避免沿用匿名资格状态。 */
async function handlePricingAuthSuccess(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState,
  payload: PricingAuthSuccessPayload
): Promise<void> {
  const pendingPurchase = elements.subscriptionList ? consumePendingSubscriptionPurchase(state) : null
  state.token = payload.token
  state.user = payload.user
  state.reviewRewardEligibilityLoaded = false
  renderAccount(elements, copy, state)
  renderCreditsButtons(elements, copy)
  await loadSubscription(elements, copy, state)
  if (pendingPurchase) {
    const plan =
      state.subscriptionPlans.find(item => item.product_id === pendingPurchase.productId) ?? null
    const card = plan ? findSubscriptionCard(elements, plan.product_id) : null
    if (plan && card) {
      await openSubscriptionCheckout(elements, copy, state, plan, card, pendingPurchase)
    }
  }
}

/** 按商品标识查找已渲染订阅卡的 DOM 集合。 */
function findSubscriptionCard(
  elements: PricingElements,
  productId: string
): PricingSubscriptionElements | null {
  const card = elements.subscriptionList?.querySelector<HTMLElement>(
    `[data-pricing-subscription-product-id="${CSS.escape(productId)}"]`
  )
  return card ? querySubscriptionElements(card) : null
}

/** 查询单张订阅卡内的元素集合。 */
function querySubscriptionElements(card: HTMLElement): PricingSubscriptionElements {
  return {
    price: query(card, '[data-pricing-subscription-price]'),
    period: query(card, '[data-pricing-subscription-period]'),
    savings: query(card, '[data-pricing-subscription-savings]'),
    error: query(card, '[data-pricing-subscription-error]'),
    buy: query<HTMLButtonElement>(card, '[data-pricing-subscription-buy]'),
    billingRow: query(card, '[data-pricing-subscription-billing-row]'),
    billing: query(card, '[data-pricing-subscription-billing]')
  }
}

/** 保存内存与同 tab OAuth 回跳共用的一次性购买意图。 */
function savePendingSubscriptionPurchase(
  state: PricingState,
  purchase: PendingSubscriptionPurchase
): void {
  state.pendingSubscriptionPurchase = purchase
  window.sessionStorage.setItem(PENDING_SUBSCRIPTION_PURCHASE_KEY, JSON.stringify(purchase))
}

/** 登录成功时先清除会话值，再返回本次唯一待恢复意图。 */
function consumePendingSubscriptionPurchase(
  state: PricingState
): PendingSubscriptionPurchase | null {
  const purchase = state.pendingSubscriptionPurchase ?? readPendingSubscriptionPurchase()
  clearPendingSubscriptionPurchase(state)
  return purchase
}

/** 用户放弃登录时同时清除内存与同 tab 会话中的购买意图。 */
function clearPendingSubscriptionPurchase(state: PricingState): void {
  state.pendingSubscriptionPurchase = null
  window.sessionStorage.removeItem(PENDING_SUBSCRIPTION_PURCHASE_KEY)
}

/** 从 OAuth 前页面留下的会话值读取并严格校验价格选项身份。 */
function readPendingSubscriptionPurchase(): PendingSubscriptionPurchase | null {
  const raw = window.sessionStorage.getItem(PENDING_SUBSCRIPTION_PURCHASE_KEY)
  if (!raw) {
    return null
  }

  let value: JsonValue
  try {
    value = JSON.parse(raw) as JsonValue
  } catch (error) {
    console.error(error)
    window.sessionStorage.removeItem(PENDING_SUBSCRIPTION_PURCHASE_KEY)
    return null
  }
  if (
    !isJsonObject(value) ||
    typeof value.productId !== 'string' ||
    value.productId.length === 0 ||
    typeof value.productPriceId !== 'number' ||
    !Number.isInteger(value.productPriceId) ||
    value.productPriceId <= 0 ||
    typeof value.paymentMethod !== 'string' ||
    value.paymentMethod.length === 0
  ) {
    window.sessionStorage.removeItem(PENDING_SUBSCRIPTION_PURCHASE_KEY)
    return null
  }
  return {
    productId: value.productId,
    productPriceId: value.productPriceId,
    paymentMethod: value.paymentMethod
  }
}

/** 判断 JSON 值是否为可按字段读取的对象。 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 领取结束后同步好评赠送资格状态位并刷新账号订阅到期时间。 */
async function handleReviewRewardClaimed(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState,
  payload: PricingReviewRewardClaimedPayload
): Promise<void> {
  state.reviewRewardClaimedCount = payload.review_reward_claimed_count
  renderReviewRewardBanner(elements, state)
  try {
    state.user = await getCurrentUser(buildRequestContext(state))
    renderAccount(elements, copy, state)
    renderSubscription(elements, copy, state)
  } catch (error) {
    console.error(error)
    setMessage(elements.accountError, error instanceof Error ? error.message : copy.account.loadFailed)
  }
}

/** 公共 checkout 成功后按商品来源刷新 Pricing 页面状态。 */
async function handleOrderCheckoutSuccess(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState,
  payload: OrderCheckoutSuccessPayload
): Promise<void> {
  if (payload.source !== 'pricing_subscription' && payload.source !== 'pricing_credits') {
    return
  }

  try {
    state.user = await getCurrentUser(buildRequestContext(state))
    renderAccount(elements, copy, state)
    renderSubscription(elements, copy, state)
    if (payload.source === 'pricing_credits' && payload.creditsAmount !== null) {
      payload.updateSuccessSecondaryText(replaceTemplate(copy.credits.creditsAmount, {
        credits: Math.max(0, Math.floor(state.user.credits_balance))
      }))
    }
    if (state.isExtensionSource && payload.source === 'pricing_subscription') {
      reportGA4Event('checkout_success_from_extension_source', {
        source: 'extension',
        product: payload.productId
      })
    }
  } catch (error) {
    console.error(error)
    setMessage(elements.accountError, error instanceof Error ? error.message : copy.account.loadFailed)
  }
}

/** 公共 checkout 发现价格更新后刷新对应商品配置。 */
async function handleOrderCheckoutPriceUpdated(
  elements: PricingElements,
  copy: PricingCopy,
  state: PricingState,
  payload: OrderCheckoutPriceUpdatedPayload
): Promise<void> {
  if (payload.source === 'pricing_subscription' && elements.subscriptionList) {
    await loadSubscription(elements, copy, state)
    appendError(elements.subscriptionList, copy.subscription.priceUpdated)
    return
  }
  if (payload.source === 'pricing_credits' && elements.creditList) {
    await loadCredits(elements, copy, state)
    appendError(elements.creditList, copy.subscription.priceUpdated)
  }
}

/** 构建请求上下文。 */
function buildRequestContext(state: PricingState): RequestContext {
  return {
    deviceId: state.deviceId,
    token: state.token
  }
}

/** 插件入口首屏曝光埋点。 */
function reportPricingEntryView(state: PricingState): void {
  if (!state.isExtensionSource) {
    return
  }
  reportGA4Event('pricing_extension_source_view', {
    source: 'extension'
  })
  reportGA4Event('upgrade_card_view', {
    source: 'extension',
    product: 'unlimited'
  })

  if (state.extensionEntryMarkMsg === null) {
    return
  }

  void recordHomepageMark(
    HOMEPAGE_MARK_TYPE.WEB_PRICING_OPEN_FROM_EXTENSION,
    buildRequestContext(state),
    state.extensionEntryMarkMsg
  ).catch(error => {
    console.error(
      '[pricing-page-controller] Failed to record extension Pricing entry mark-log.',
      error
    )
  })
}

/** 订阅按钮文案区分普通浏览和插件额度入口。 */
function getSubscriptionButtonLabel(copy: PricingCopy, state: PricingState): string {
  if (state.isExtensionSource) {
    return state.token && state.user
      ? copy.extensionSource.primaryCta
      : copy.extensionSource.signedOutCta
  }
  return state.token && state.user ? copy.subscription.buyNow : copy.subscription.loginToBuy
}

/** 当前账户已有未过期订阅时，订阅商品只能展示不可重复购买提示。 */
function hasActiveSubscription(state: PricingState): boolean {
  const expiresAt = state.user?.subscription?.expires_at ?? null
  return expiresAt !== null && normalizeTimestampMs(expiresAt) > Date.now()
}

/** 只有仍在自动续费的有效订阅需要展示渠道管理入口。 */
function canManageSubscription(state: PricingState): boolean {
  return hasActiveSubscription(state) && state.user?.subscription?.auto_renew === true
}

/** 渲染和首页下载区一致的账号头像：有图片用图片，否则回退邮箱首字母。 */
function renderUserAvatar(elements: PricingElements, user: HomepageUserInfo): void {
  const avatarUrl = user.avatar_url?.trim()
  if (avatarUrl) {
    elements.userAvatar.src = avatarUrl
    elements.userAvatar.hidden = false
    elements.userInitial.textContent = ''
    setHidden(elements.userInitial, true)
    return
  }

  elements.userAvatar.removeAttribute('src')
  elements.userAvatar.hidden = true
  elements.userInitial.textContent = getAccountInitial(user.email)
  setHidden(elements.userInitial, false)
}

/** 账号首字母兜底。 */
function getAccountInitial(value: string): string {
  const first = value.trim().charAt(0)
  return first ? first.toUpperCase() : 'U'
}

/** 后端订阅名是配置值，前端按当前 locale 映射用户可见的基础套餐名。 */
function formatSubscriptionDisplayName(
  period: string | null,
  displayName: string | null,
  copy: PricingCopy
): string {
  if (period === 'free') {
    return copy.account.freePlan
  }
  // 终生是新周期字面量，直接按周期映射，不依赖 display_name 字符串匹配。
  if (period === 'lifetime') {
    return copy.subscription.title
  }
  if (isUnlimitedDisplayName(displayName)) {
    return copy.subscription.title
  }
  return displayName?.trim() || copy.account.freePlan
}

/** 后端或旧缓存可能返回历史套餐名，统一映射成当前语言包商品名。 */
function isUnlimitedDisplayName(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase()
  return (
    normalized === 'unlimited' ||
    normalized === 'extension unlimited' ||
    normalized === '无限订阅' ||
    normalized === '无限下载' ||
    normalized === '無限訂閱' ||
    normalized === '無限下載'
  )
}

/** 格式化时间戳。 */
function formatTimestamp(value: number | null, emptyLabel: string): string {
  if (!value) {
    return emptyLabel
  }
  return new Intl.DateTimeFormat(document.documentElement.lang || 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(normalizeTimestampMs(value)))
}

/** 后端历史上可能返回秒或毫秒，页面只负责统一展示。 */
function normalizeTimestampMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value
}

/** 替换文案占位符。 */
function replaceTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

/** 添加普通状态文本。 */
function appendStatus(parent: HTMLElement, message: string): void {
  const element = document.createElement('p')
  element.className = 'pricing-inline-status'
  element.textContent = message
  parent.append(element)
}

/** 商品列表加载态：骨架卡占位，加载文案只保留给读屏；模板缺失时退回可见状态文本。 */
function appendLoadingSkeletons(
  parent: HTMLElement,
  template: HTMLTemplateElement | null,
  loadingMessage: string
): void {
  if (!template) {
    appendStatus(parent, loadingMessage)
    return
  }
  const status = document.createElement('p')
  status.className = 'pricing-inline-status sr-only'
  status.setAttribute('role', 'status')
  status.textContent = loadingMessage
  parent.append(status)
  for (let index = 0; index < PRICING_SKELETON_CARD_COUNT; index += 1) {
    parent.append(cloneTemplate(template))
  }
}

/** 添加错误文本。 */
function appendError(parent: HTMLElement, message: string): void {
  const element = document.createElement('p')
  element.className = 'pricing-inline-error'
  element.textContent = message
  parent.append(element)
}

/** 设置文本并同步 hidden。 */
function setMessage(element: HTMLElement, message: string): void {
  element.textContent = message
  setHidden(element, message.length === 0)
}

/** 控制 hidden。 */
function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden
}

/** 从 JSON script 读取文案。 */
function getPricingCopy(root: HTMLElement): PricingCopy {
  const element = root.querySelector<HTMLScriptElement>('[data-pricing-copy]')
  if (!element?.textContent) {
    throw new Error('[pricing-page-controller] Missing pricing copy payload.')
  }
  return JSON.parse(element.textContent) as PricingCopy
}

/** 查询页面 DOM。 */
function getPricingElements(root: HTMLElement): PricingElements {
  return {
    root,
    accountLoading: query<HTMLElement>(root, '[data-pricing-account-loading]'),
    accountSignedOut: query<HTMLElement>(root, '[data-pricing-account-signed-out]'),
    accountSignedIn: query<HTMLElement>(root, '[data-pricing-account-signed-in]'),
    accountError: query<HTMLElement>(root, '[data-pricing-account-error]'),
    loginButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-pricing-login]')),
    accountButton: query<HTMLButtonElement>(root, '[data-pricing-account-button]'),
    accountMenu: query<HTMLElement>(root, '[data-pricing-account-menu]'),
    accountEmail: query<HTMLElement>(root, '[data-pricing-account-email]'),
    accountLogout: query<HTMLButtonElement>(root, '[data-pricing-account-logout]'),
    userAvatar: query<HTMLImageElement>(root, '[data-pricing-user-avatar]'),
    userInitial: query<HTMLElement>(root, '[data-pricing-user-initial]'),
    userCreditsLabel: query<HTMLElement>(root, '[data-pricing-user-credits-label]'),
    userSubscription: query<HTMLElement>(root, '[data-pricing-user-subscription]'),
    userExpires: query<HTMLElement>(root, '[data-pricing-user-expires]'),
    subscriptionManageButton: query<HTMLButtonElement>(root, '[data-pricing-subscription-manage-button]'),
    reviewRewardBanner: root.querySelector<HTMLButtonElement>('[data-pricing-review-reward-banner]'),
    subscriptionList: root.querySelector<HTMLElement>('[data-pricing-subscription-list]'),
    subscriptionTemplate: root.querySelector<HTMLTemplateElement>('[data-pricing-subscription-card-template]'),
    skeletonTemplate: root.querySelector<HTMLTemplateElement>('[data-pricing-skeleton-template]'),
    creditList: root.querySelector<HTMLElement>('[data-pricing-credit-list]'),
    creditTemplate: root.querySelector<HTMLTemplateElement>('[data-pricing-credit-card-template]')
  }
}

/** 查询必需元素。 */
function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) {
    throw new Error(`[pricing-page-controller] Missing element: ${selector}`)
  }
  return element
}

/** 克隆模板根节点。 */
function cloneTemplate(template: HTMLTemplateElement): HTMLElement {
  const firstElement = template.content.firstElementChild
  if (!(firstElement instanceof HTMLElement)) {
    throw new Error('[pricing-page-controller] Card template root is missing.')
  }
  return firstElement.cloneNode(true) as HTMLElement
}

const root = document.querySelector<HTMLElement>('[data-pricing-page]')
if (root && !pricingEntryRedirecting) {
  void initPricingPage(root).catch(error => {
    console.error(error)
  })
}
