<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="premium-overlay"
      :class="{ 'premium-page-overlay': props.page }"
      aria-labelledby="vdl-premium-title"
      :style="colorVars"
      @close="handleClose"
    >
      <header class="premium-header">
        <!-- 页面模式由标题承接 showModal 的初始焦点，避免账号按钮一打开就显示焦点框 -->
        <h2
          id="vdl-premium-title"
          class="premium-title"
          :autofocus="props.page"
          :tabindex="props.page ? -1 : undefined"
        >
          {{ t(I18N_KEYS.PREMIUM.TITLE) }}
        </h2>
        <button
          v-if="!props.page"
          type="button"
          class="premium-close"
          :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
          @click="handleClose"
        >
          <Icon :name="IconName.X_MARK" :size="IconSize.SM" />
        </button>
      </header>

      <main class="premium-body">
        <div v-if="props.page" class="premium-page-account">
          <template v-if="authStore.isAuthenticated && authStore.user">
            <button
              type="button"
              class="premium-account-button"
              :aria-expanded="accountMenuOpen"
              @click="accountMenuOpen = !accountMenuOpen"
            >
              <img
                v-if="authStore.user.avatar_url"
                class="premium-account-avatar"
                :src="authStore.user.avatar_url"
                alt=""
              />
              <span v-else class="premium-account-initial" aria-hidden="true">{{
                accountInitial
              }}</span>
              <span class="premium-account-email">{{ authStore.user.email }}</span>
              <span v-if="isActiveSubscription && accountStatus" class="premium-account-plan">
                {{ accountStatus.display_name }}
                <template v-if="accountStatus.expires_at">
                  · {{ formatExpiry(accountStatus.expires_at) }}</template
                >
              </span>
            </button>
            <div v-if="accountMenuOpen" class="premium-account-menu">
              <span>{{ authStore.user.email }}</span>
              <span v-if="accountStatus" class="premium-account-subscription">
                {{ accountStatus.display_name }}
                <template v-if="accountStatus.expires_at">
                  · {{ formatExpiry(accountStatus.expires_at) }}</template
                >
              </span>
              <button v-if="isAutoRenewing" type="button" @click="openSubscriptionManagement">
                {{ t(I18N_KEYS.SUBSCRIPTION.MANAGE) }}
              </button>
              <button type="button" @click="handleLogout">{{ t(I18N_KEYS.AUTH.LOGOUT) }}</button>
            </div>
          </template>
          <button v-else type="button" class="premium-account-login" @click="handleLogin">
            {{ t(I18N_KEYS.AUTH.LOGIN) }}
          </button>
        </div>

        <!-- 登录门控：未登录先登录，登录成功后回到本视图 -->
        <div v-if="phase === 'gate'" class="premium-center">
          <div class="premium-hero-icon" aria-hidden="true">
            <Icon :name="IconName.CROWN" :size="IconSize.XL" />
          </div>
          <p class="premium-message">{{ t(I18N_KEYS.PREMIUM.GATE_MESSAGE) }}</p>
          <button type="button" class="premium-primary-button" @click="handleLogin">
            {{ t(I18N_KEYS.AUTH.LOGIN) }}
          </button>
        </div>

        <!-- 套餐配置加载中 -->
        <div v-else-if="phase === 'loading'" class="premium-center" aria-busy="true">
          <Icon class="premium-spinner" :name="IconName.ARROW_PATH" :size="IconSize.LG" />
        </div>

        <!-- 套餐配置加载失败 / 无可用套餐 -->
        <div v-else-if="phase === 'loadFailed' || phase === 'empty'" class="premium-center">
          <p class="premium-message">
            {{
              t(phase === 'empty' ? I18N_KEYS.PREMIUM.ERROR_EMPTY : I18N_KEYS.PREMIUM.ERROR_LOAD)
            }}
          </p>
          <button type="button" class="premium-primary-button" @click="enterView">
            {{ t(I18N_KEYS.PREMIUM.RETRY) }}
          </button>
        </div>

        <!-- 套餐选择与发起支付 -->
        <template v-else-if="phase === 'ready' || phase === 'creating'">
          <ul v-if="!props.page" class="premium-selling">
            <li class="premium-selling-item">
              <Icon class="premium-selling-icon" :name="IconName.CHECK" :size="IconSize.SM" />
              <span>{{ t(I18N_KEYS.PREMIUM.SELLING_UNLIMITED) }}</span>
            </li>
            <li class="premium-selling-item">
              <Icon class="premium-selling-icon" :name="IconName.CHECK" :size="IconSize.SM" />
              <span>{{ t(I18N_KEYS.PREMIUM.SELLING_QUALITY) }}</span>
            </li>
            <li class="premium-selling-item">
              <Icon class="premium-selling-icon" :name="IconName.CHECK" :size="IconSize.SM" />
              <span>{{ t(I18N_KEYS.PREMIUM.SELLING_TRIMMING) }}</span>
            </li>
          </ul>

          <p v-if="props.page && isActiveSubscription" class="premium-page-notice" role="status">
            {{ t(I18N_KEYS.PREMIUM.ERROR_ACTIVE_SUBSCRIPTION) }}
          </p>

          <div v-if="props.page" class="premium-page-plans">
            <article
              v-for="(plan, index) in plans"
              :key="plan.product_id"
              class="premium-page-plan"
              :class="{ 'is-popular': index === 0 }"
            >
              <span v-if="index === 0" class="premium-page-popular">
                <Icon :name="IconName.STAR" :size="IconSize.XS" />
                {{ t(I18N_KEYS.PREMIUM.POPULAR) }}
              </span>
              <div class="premium-page-plan-head">
                <h3 class="premium-page-plan-name">{{ periodLabel(plan.period) }}</h3>
                <span v-if="savingsPercent(plan) > 0" class="premium-page-save">
                  {{ t(I18N_KEYS.PREMIUM.SAVE, { percent: savingsPercent(plan) }) }}
                </span>
              </div>
              <p class="premium-page-plan-quota">{{ quotaHint(plan) }}</p>
              <div class="premium-page-price-row">
                <span class="premium-page-price">
                  {{ formatPrice(plan.display_amount, plan.display_currency) }}
                </span>
                <span class="premium-page-price-suffix">{{ priceSuffix(plan.period) }}</span>
              </div>
              <button
                type="button"
                class="premium-page-buy"
                :disabled="phase === 'creating' || isActiveSubscription"
                @click="selectPlanAndBuy(plan.product_id)"
              >
                {{
                  t(
                    isActiveSubscription
                      ? I18N_KEYS.PREMIUM.SUBSCRIBED
                      : phase === 'creating' && plan.product_id === selectedPlanId
                        ? I18N_KEYS.PREMIUM.CREATING
                        : buyLabelKey
                  )
                }}
              </button>
              <p class="premium-page-secure">
                <Icon :name="IconName.LOCK_CLOSED" :size="IconSize.XS" />
                {{ t(I18N_KEYS.PREMIUM.SECURE_CHECKOUT) }}
              </p>
              <ul class="premium-page-benefits">
                <li>
                  <Icon :name="IconName.CHECK" :size="IconSize.MD" color="var(--premium-primary)" />
                  <span>{{ t(I18N_KEYS.PREMIUM.SELLING_UNLIMITED) }}</span>
                </li>
                <li>
                  <Icon :name="IconName.CHECK" :size="IconSize.MD" color="var(--premium-primary)" />
                  <span>{{ t(I18N_KEYS.PREMIUM.SELLING_QUALITY) }}</span>
                </li>
                <li>
                  <Icon :name="IconName.CHECK" :size="IconSize.MD" color="var(--premium-primary)" />
                  <span>{{ t(I18N_KEYS.PREMIUM.SELLING_TRIMMING) }}</span>
                </li>
              </ul>
              <p class="premium-page-billing">
                <Icon :name="IconName.CHECK" :size="IconSize.MD" color="var(--premium-success)" />
                {{
                  t(
                    plan.auto_renew
                      ? I18N_KEYS.PREMIUM.AUTO_RENEW
                      : I18N_KEYS.PREMIUM.BILLING_ONE_TIME
                  )
                }}
              </p>
            </article>
          </div>

          <div
            v-else
            class="premium-plans"
            role="radiogroup"
            :aria-label="t(I18N_KEYS.PREMIUM.TITLE)"
          >
            <button
              v-for="plan in plans"
              :key="plan.product_id"
              type="button"
              role="radio"
              :aria-checked="plan.product_id === selectedPlanId"
              class="premium-plan"
              :class="{ 'is-selected': plan.product_id === selectedPlanId }"
              @click="selectPlan(plan.product_id)"
            >
              <span class="premium-plan-period">{{ periodLabel(plan.period) }}</span>
              <span class="premium-plan-price">
                {{ formatPrice(plan.display_amount, plan.display_currency) }}
              </span>
              <span class="premium-plan-note">
                {{ t(plan.auto_renew ? I18N_KEYS.PREMIUM.AUTO_RENEW : I18N_KEYS.PREMIUM.ONE_TIME) }}
                ·
                {{ quotaHint(plan) }}
              </span>
            </button>
          </div>

          <button
            v-if="!props.page"
            type="button"
            class="premium-primary-button premium-buy"
            :disabled="phase === 'creating'"
            @click="handleBuy"
          >
            {{
              t(
                phase === 'creating'
                  ? I18N_KEYS.PREMIUM.CREATING
                  : isActiveSubscription
                    ? I18N_KEYS.PREMIUM.ERROR_ACTIVE_SUBSCRIPTION
                    : buyLabelKey
              )
            }}
          </button>
          <p v-if="!props.page && isActiveSubscription" class="premium-error" role="status">
            {{ t(I18N_KEYS.PREMIUM.ERROR_ACTIVE_SUBSCRIPTION) }}
          </p>
          <p v-if="actionError" class="premium-error" role="alert">{{ actionError }}</p>
        </template>

        <!-- 已发起支付：外部收银台打开，轮询订单状态 -->
        <div v-else-if="phase === 'pending'" class="premium-center" aria-busy="true">
          <Icon class="premium-spinner" :name="IconName.ARROW_PATH" :size="IconSize.LG" />
          <p class="premium-heading">{{ t(I18N_KEYS.PREMIUM.PENDING_TITLE) }}</p>
          <p class="premium-message">{{ t(I18N_KEYS.PREMIUM.PENDING_MESSAGE) }}</p>
          <button type="button" class="premium-secondary-button" @click="handleCancelPayment">
            {{ t(I18N_KEYS.PREMIUM.PENDING_CANCEL) }}
          </button>
        </div>

        <!-- 支付成功 -->
        <div v-else-if="phase === 'success'" class="premium-center">
          <div class="premium-hero-icon is-success" aria-hidden="true">
            <Icon :name="IconName.CHECK" :size="IconSize.XL" />
          </div>
          <p class="premium-heading">{{ t(I18N_KEYS.PREMIUM.SUCCESS_TITLE) }}</p>
          <p class="premium-message">{{ t(I18N_KEYS.PREMIUM.SUCCESS_MESSAGE) }}</p>
          <button type="button" class="premium-primary-button" @click="handleClose">
            {{ t(I18N_KEYS.PREMIUM.SUCCESS_DONE) }}
          </button>
        </div>

        <!-- 支付未完成 / 履约失败 -->
        <div v-else class="premium-center">
          <p class="premium-heading">{{ t(I18N_KEYS.PREMIUM.FAILED_TITLE) }}</p>
          <p class="premium-message">{{ t(failedReasonKey) }}</p>
          <p v-if="supportMail" class="premium-support">
            {{ t(I18N_KEYS.PREMIUM.SUPPORT, { email: supportMail }) }}
          </p>
          <button type="button" class="premium-primary-button" @click="handleRetry">
            {{ t(I18N_KEYS.PREMIUM.RETRY) }}
          </button>
        </div>
      </main>
    </dialog>
    <dialog
      ref="confirmationDialog"
      class="premium-confirm-dialog"
      aria-labelledby="premium-confirm-title"
      :style="colorVars"
      @close="handleConfirmationClose"
    >
      <header class="premium-confirm-header">
        <div>
          <p class="premium-confirm-kicker">{{ t(I18N_KEYS.PREMIUM.CONFIRM_TITLE) }}</p>
          <h3 id="premium-confirm-title">{{ t(I18N_KEYS.PREMIUM.CONFIRM_PAYMENT_TITLE) }}</h3>
        </div>
        <button
          type="button"
          class="premium-close"
          :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
          @click="confirmationVisible = false"
        >
          <Icon :name="IconName.X_MARK" :size="IconSize.SM" />
        </button>
      </header>

      <div class="premium-confirm-body">
        <section v-if="selectedPlan" class="premium-confirm-summary">
          <p class="premium-confirm-summary-label">
            {{ t(I18N_KEYS.PREMIUM.CONFIRM_SELECTED_PLAN) }}
          </p>
          <p class="premium-confirm-summary-values">
            <span>{{ periodLabel(selectedPlan.period) }}</span>
            <span>{{
              formatPrice(selectedPlan.display_amount, selectedPlan.display_currency)
            }}</span>
          </p>
          <p class="premium-confirm-summary-usage">
            {{ priceSuffix(selectedPlan.period) }} ·
            {{
              t(
                selectedPlan.auto_renew
                  ? I18N_KEYS.PREMIUM.AUTO_RENEW
                  : I18N_KEYS.PREMIUM.BILLING_ONE_TIME
              )
            }}
            · {{ quotaHint(selectedPlan) }}
          </p>
        </section>

        <div
          class="premium-channel-list"
          role="radiogroup"
          :aria-label="t(I18N_KEYS.PREMIUM.CONFIRM_PAYMENT_TITLE)"
        >
          <button
            v-for="channel in selectedPlanChannels"
            :key="channel.payment_method"
            type="button"
            role="radio"
            :aria-checked="channel.payment_method === selectedChannelMethod"
            class="premium-channel"
            :class="{ 'is-selected': channel.payment_method === selectedChannelMethod }"
            @click="selectedChannelMethod = channel.payment_method"
          >
            <span class="premium-channel-icon" aria-hidden="true">
              <img v-if="channel.payment_method === 'paypal'" :src="PAYPAL_ICON_URL" alt="" />
              <Icon
                v-else-if="channel.payment_method === 'clink'"
                :name="IconName.CREDIT_CARD"
                :size="IconSize.MD"
              />
            </span>
            <span>{{ channel.payment_method_name || channel.payment_method }}</span>
          </button>
        </div>
      </div>

      <footer class="premium-confirm-footer">
        <label class="premium-confirm-agreement">
          <input v-model="agreementAccepted" type="checkbox" checked />
          <span>
            {{ t(I18N_KEYS.PREMIUM.CONFIRM_AGREEMENT) }}
            <button type="button" class="premium-confirm-link" @click="openTerms">
              {{ t(I18N_KEYS.AUTH.MODAL_TERMS_LINK) }}
            </button>
            <span aria-hidden="true"> · </span>
            <button type="button" class="premium-confirm-link" @click="openPrivacy">
              {{ t(I18N_KEYS.AUTH.MODAL_PRIVACY_LINK) }}
            </button>
          </span>
        </label>
        <div class="premium-confirm-actions">
          <button
            type="button"
            class="premium-secondary-button"
            @click="confirmationVisible = false"
          >
            {{ t(I18N_KEYS.PREMIUM.CONFIRM_CANCEL) }}
          </button>
          <button
            type="button"
            class="premium-primary-button"
            :disabled="!agreementAccepted || !selectedChannel"
            @click="confirmPurchase"
          >
            {{ t(I18N_KEYS.PREMIUM.CONFIRM_CONTINUE) }}
          </button>
        </div>
      </footer>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Popup 内嵌购买视图。
 *
 * 状态机：gate（未登录）→ loading → ready ⇄ creating → pending → success / failed；
 * 套餐配置与下单合同复用官网 pricing 同一套后端协议（checkout-configs → order/create
 * → 外部收银台 → 轮询 order/status），不发明新协议。轮询只在 popup 存活期间进行：
 * background 创建订单并保存当前用户的订单引用，重开视图立即向服务端查询该订单。
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import { logger } from '@/core/utils/logger'
import { isAuthSessionFailure } from '@/core/api/auth/sessionFailure'
import { authApi } from '@/core/api/auth/api'
import { subscriptionApi } from '@/core/api/subscription'
import {
  buildCreateOrderRequest,
  classifyOrderStatus,
  getDefaultOrderPaymentChannel,
  getOrderStatus,
  hasOrderPollingTimedOut,
  isRecoverableOrderStatusError,
  ORDER_POLL_INTERVAL_MS,
  readPaymentUrl
} from '@/core/api/order'
import type { SubscriptionCheckoutPlan, SubscriptionPaymentChannel } from '@/core/api/subscription'
import { useAuthStore } from '@/core/stores/authStore'
import { useQuotaStore } from '@/core/stores/quotaStore'
import { storageManager } from '@/core/storage'
import { STORAGE_KEYS, WEBSITE } from '@/core/api/config'
import type { SubscriptionStatus } from '@/core/api/subscription'
import { MARK_TYPE } from '@/core/api/mark/types'
import { openExternalPage } from '@/core/utils/navigation'
import { openLoginModal } from '@/core/composables/loginModal'
import { useNativeDialog } from '@/core/composables/nativeDialog'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import {
  closePremiumView,
  getPremiumAttributionSource,
  getPremiumSource,
  premiumViewVisible
} from '@/core/composables/premiumView'

/** 扩展自带的 PayPal 品牌图标（public/payment-icons），与官网结算弹窗同源素材。 */
const PAYPAL_ICON_URL = '/payment-icons/paypal-monogram.png'

interface Props {
  /** 页面入口使用更宽的独立订阅页布局；popup 继续使用紧凑弹层。 */
  page?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  page: false
})

/** 购买视图状态机阶段。 */
type PremiumPhase =
  | 'gate'
  | 'loading'
  | 'loadFailed'
  | 'empty'
  | 'ready'
  | 'creating'
  | 'pending'
  | 'success'
  | 'failed'

/** 支付失败原因，对应各自的用户文案。 */
type FailedReason =
  | 'orderGone'
  | 'cancelled'
  | 'fulfillment'
  | 'timeout'
  | 'generic'
  | 'gateway'
  | 'invalidPaymentData'
  | 'activeSubscription'

/** 匿名购买在登录成功后恢复的精确商品渠道。 */
interface PendingPurchase {
  productId: string
  productPriceId: number
  paymentMethod: string
}

const { t } = useI18n()
const dialog = useNativeDialog(premiumViewVisible)
const confirmationVisible = ref(false)
const confirmationDialog = useNativeDialog(confirmationVisible)

const authStore = useAuthStore()
const quotaStore = useQuotaStore()
const background = new BackgroundChannel()

/**
 * 组件根节点是 Teleport，Vue 的 style v-bind()（useCssVars）会把变量挂到 Teleport
 * 锚点而非真实 DOM，teleport 出去的子树拿不到变量（LoginModal 同构同坑）。因此颜色
 * 不用 v-bind，改为把 COMMON_COLORS 显式声明成覆盖层根节点上的 CSS 变量向下级联。
 */
const colorVars = {
  '--premium-primary': COMMON_COLORS.PRIMARY,
  '--premium-primary-dark': COMMON_COLORS.PRIMARY_DARK,
  '--premium-gray-50': COMMON_COLORS.GRAY_50,
  '--premium-gray-200': COMMON_COLORS.GRAY_200,
  '--premium-gray-300': COMMON_COLORS.GRAY_300,
  '--premium-gray-500': COMMON_COLORS.GRAY_500,
  '--premium-gray-600': COMMON_COLORS.GRAY_600,
  '--premium-gray-800': COMMON_COLORS.GRAY_800,
  '--premium-gray-900': COMMON_COLORS.GRAY_900,
  '--premium-error': COMMON_COLORS.ERROR,
  '--premium-success': COMMON_COLORS.SUCCESS,
  '--premium-success-bg': COMMON_COLORS.SUCCESS_BG,
  '--premium-warning': COMMON_COLORS.WARNING,
  '--premium-warning-bg': COMMON_COLORS.WARNING_BG
}

const phase = ref<PremiumPhase>('loading')
const plans = ref<SubscriptionCheckoutPlan[]>([])
const selectedPlanId = ref<string | null>(null)
const selectedChannelMethod = ref<string | null>(null)
const actionError = ref('')
const failedReason = ref<FailedReason>('generic')
const orderNo = ref<string | null>(null)
const supportMail = ref('')
const pendingPurchase = ref<PendingPurchase | null>(null)
const accountStatus = ref<SubscriptionStatus | null>(null)
const accountMenuOpen = ref(false)
const agreementAccepted = ref(true)
let viewMarkSent = false
/** 自动轮询开始时间，用于 10 分钟超时判断。 */
const pollStartedAt = ref<number | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null
const pendingPurchaseReady = restorePendingPurchase()

const selectedPlan = computed(
  () => plans.value.find(plan => plan.product_id === selectedPlanId.value) ?? null
)

const selectedPlanChannels = computed<SubscriptionPaymentChannel[]>(
  () => selectedPlan.value?.payment_channels ?? []
)

const selectedChannel = computed(
  () =>
    selectedPlanChannels.value.find(
      channel => channel.payment_method === selectedChannelMethod.value
    ) ?? null
)

const isActiveSubscription = computed(() => {
  const status = accountStatus.value
  if (!status || status.period === 'free' || status.period === 'unavailable') return false
  return status.expires_at === null || normalizeTimestampMs(status.expires_at) > Date.now()
})

const isAutoRenewing = computed(
  () => isActiveSubscription.value && accountStatus.value?.auto_renew === true
)

const accountInitial = computed(() =>
  (authStore.user?.full_name || authStore.user?.email || '?').trim().charAt(0).toUpperCase()
)

const buyLabelKey = computed(() =>
  authStore.isAuthenticated
    ? I18N_KEYS.PREMIUM.BUY
    : getPremiumSource() === 'upgrade_modal'
      ? I18N_KEYS.PREMIUM.SIGN_IN_TO_UPGRADE
      : I18N_KEYS.PREMIUM.SIGN_IN_TO_BUY
)

/** 失败原因到用户文案的映射。 */
const failedReasonKey = computed(() => {
  switch (failedReason.value) {
    case 'orderGone':
      return I18N_KEYS.PREMIUM.ERROR_ORDER_GONE
    case 'cancelled':
      return I18N_KEYS.PREMIUM.ERROR_CANCELLED
    case 'fulfillment':
      return I18N_KEYS.PREMIUM.ERROR_FULFILLMENT
    case 'timeout':
      return I18N_KEYS.PREMIUM.ERROR_TIMEOUT
    case 'gateway':
      return I18N_KEYS.PREMIUM.ERROR_GATEWAY
    case 'invalidPaymentData':
      return I18N_KEYS.PREMIUM.ERROR_INVALID_PAYMENT_DATA
    case 'activeSubscription':
      return I18N_KEYS.PREMIUM.ERROR_ACTIVE_SUBSCRIPTION
    default:
      return I18N_KEYS.PREMIUM.ERROR_GENERIC
  }
})

watch(premiumViewVisible, visible => {
  if (visible) {
    if (props.page && !viewMarkSent) {
      viewMarkSent = true
      void recordPricingMark(MARK_TYPE.PRICING_VIEW)
    }
    enterView()
  } else {
    stopPolling()
  }
})

function handleLoginCancelled(): void {
  clearPendingPurchase()
}

// 用户变化后重新读取该用户的订单引用，避免沿用上一位用户的交易投影。
watch(
  () => authStore.user?.user_id,
  () => {
    if (!premiumViewVisible.value) {
      return
    }
    void enterView()
  }
)

onMounted(() => {
  window.addEventListener('vdl-login-cancelled', handleLoginCancelled)
})

onBeforeUnmount(() => {
  stopPolling()
  window.removeEventListener('vdl-login-cancelled', handleLoginCancelled)
})

/** 打开视图：先恢复当前用户的订单定位，没有引用时加载套餐。 */
async function enterView(): Promise<void> {
  await pendingPurchaseReady
  stopPolling()
  plans.value = []
  selectedPlanId.value = null
  selectedChannelMethod.value = null
  actionError.value = ''
  failedReason.value = 'generic'
  orderNo.value = null
  supportMail.value = ''
  pollStartedAt.value = null

  if (!authStore.isAuthenticated) {
    accountStatus.value = null
    await loadPlans()
    return
  }
  phase.value = 'loading'
  const userId = authStore.user?.user_id
  try {
    await loadAccountStatus()
    if (pendingPurchase.value) {
      await loadPlans()
      await continuePendingPurchase()
      return
    }
    const reference = await background.getLatestOrderReference()
    if (!premiumViewVisible.value || authStore.user?.user_id !== userId) {
      return
    }
    if (!reference) {
      await loadPlans()
      return
    }
    clearPendingPurchase()
    orderNo.value = reference.orderNo
    phase.value = 'pending'
    pollStartedAt.value = Date.now()
    await pollOnce()
    if (phase.value === 'pending' && premiumViewVisible.value) {
      startPolling()
    }
  } catch (error) {
    logger.error('[PremiumView] 读取订单引用失败:', error)
    phase.value = 'loadFailed'
  }
}

/** 拉取可购买套餐配置；价格变化（后端 21005）时也走这里刷新。 */
async function loadPlans(): Promise<void> {
  phase.value = 'loading'
  actionError.value = ''
  try {
    const configs = await subscriptionApi.listCheckoutConfigs()
    plans.value = configs
    const pending = pendingPurchase.value
    const pendingPlan = pending
      ? (configs.find(plan => plan.product_id === pending.productId) ?? null)
      : null
    const pendingChannel = pendingPlan?.payment_channels.find(
      channel =>
        channel.product_price_id === pending?.productPriceId &&
        channel.payment_method === pending.paymentMethod
    )
    // 默认选中年付（与官网主推一致），无年付时选第一个套餐。
    const defaultPlan = configs.find(plan => plan.period === 'year') ?? configs[0] ?? null
    const selectedPlan = pendingChannel && pendingPlan ? pendingPlan : defaultPlan
    selectedPlanId.value = selectedPlan?.product_id ?? null
    selectedChannelMethod.value =
      pendingChannel?.payment_method ??
      (selectedPlan
        ? (getDefaultOrderPaymentChannel(selectedPlan.payment_channels)?.payment_method ?? null)
        : null)
    phase.value = configs.length > 0 ? 'ready' : 'empty'
  } catch (error) {
    logger.error('[PremiumView] 拉取订阅套餐配置失败:', error)
    if (error instanceof Error && isAuthSessionFailure(error)) {
      phase.value = 'gate'
      return
    }
    phase.value = 'loadFailed'
  }
}

/** 切换套餐时沿用已选支付方式；新套餐不支持该方式时回到默认渠道。 */
function selectPlan(productId: string): void {
  selectedPlanId.value = productId
  const channels = plans.value.find(item => item.product_id === productId)?.payment_channels ?? []
  selectedChannelMethod.value = channels.some(
    channel => channel.payment_method === selectedChannelMethod.value
  )
    ? selectedChannelMethod.value
    : (getDefaultOrderPaymentChannel(channels)?.payment_method ?? null)
  actionError.value = ''
}

/** 发起购买：创建订单 → 打开外部收银台 → 进入轮询。 */
async function handleBuy(): Promise<void> {
  const plan = selectedPlan.value
  const channel = selectedChannel.value
  if (!plan || !channel || phase.value === 'creating') {
    return
  }

  if (isActiveSubscription.value) {
    actionError.value = t(I18N_KEYS.PREMIUM.ERROR_ACTIVE_SUBSCRIPTION)
    return
  }

  confirmationVisible.value = true
}

async function selectPlanAndBuy(productId: string): Promise<void> {
  selectPlan(productId)
  await handleBuy()
}

/** 用户确认条款后才进入登录门控或创建订单。 */
async function confirmPurchase(): Promise<void> {
  if (!agreementAccepted.value) return
  confirmationVisible.value = false
  const plan = selectedPlan.value
  const channel = selectedChannel.value
  if (plan && channel) {
    await createPurchase(plan, channel)
  }
}

/** 原生 dialog 的 Escape/close 事件同步 Vue 状态，避免下次打开被旧 ref 卡住。 */
function handleConfirmationClose(): void {
  confirmationVisible.value = false
}

/** 登录门控通过后创建订单。 */
async function createPurchase(
  plan: SubscriptionCheckoutPlan,
  channel: SubscriptionPaymentChannel
): Promise<void> {
  if (!authStore.isAuthenticated) {
    pendingPurchase.value = {
      productId: plan.product_id,
      productPriceId: channel.product_price_id,
      paymentMethod: channel.payment_method
    }
    await persistPendingPurchase(pendingPurchase.value)
    openLoginModal(getPremiumSource())
    return
  }

  phase.value = 'creating'
  actionError.value = ''
  clearPendingPurchase()
  const userId = authStore.user?.user_id
  try {
    const result = await background.createCheckoutOrder(buildCreateOrderRequest(plan, channel))
    if (!premiumViewVisible.value || authStore.user?.user_id !== userId) {
      return
    }
    if (result.status === 'failed') {
      if (result.reason === 'auth') {
        await clearAuthSession()
        phase.value = 'gate'
        openLoginModal(getPremiumSource())
      } else if (result.reason === 'priceUpdated') {
        await loadPlans()
      } else {
        phase.value = 'ready'
        actionError.value = t(
          result.reason === 'gateway'
            ? I18N_KEYS.PREMIUM.ERROR_GATEWAY
            : result.reason === 'orderGone'
              ? I18N_KEYS.PREMIUM.ERROR_ORDER_GONE
              : result.reason === 'activeSubscription'
                ? I18N_KEYS.PREMIUM.ERROR_ACTIVE_SUBSCRIPTION
                : I18N_KEYS.PREMIUM.ERROR_GENERIC
        )
      }
      return
    }
    const response = result.order
    const paymentUrl = readPaymentUrl(response.payment_data, channel.payment_method)
    if (!paymentUrl) {
      // 渠道返回了不可信或无法识别的支付数据，按网关故障引导重试。
      logger.error(
        `[PremiumView] 支付数据中缺少可信收银台 URL: order_no=${response.order_no}, payment_method=${channel.payment_method}`
      )
      finishFailed('invalidPaymentData')
      return
    }

    orderNo.value = response.order_no
    supportMail.value = response.support_mail.trim()
    phase.value = 'pending'
    pollStartedAt.value = Date.now()
    startPolling()
    await openExternalPage(paymentUrl, `payment:${channel.payment_method}`)
  } catch (error) {
    logger.error('[PremiumView] 创建订单失败:', error)
    phase.value = 'ready'
    actionError.value = t(I18N_KEYS.PREMIUM.ERROR_GENERIC)
  }
}

/** 登录成功后恢复匿名用户刚选择的商品；价格渠道失效时保留套餐页，不误买默认项。 */
async function continuePendingPurchase(): Promise<void> {
  const pending = pendingPurchase.value
  if (!pending || phase.value !== 'ready' || !authStore.isAuthenticated) {
    return
  }

  const plan = selectedPlan.value
  const channel = selectedChannel.value
  if (
    !plan ||
    !channel ||
    plan.product_id !== pending.productId ||
    channel.product_price_id !== pending.productPriceId ||
    channel.payment_method !== pending.paymentMethod
  ) {
    pendingPurchase.value = null
    return
  }

  await handleBuy()
}

/** 轮询订单状态直到终态或超时；单次网络错误保留现场等下一轮。 */
async function pollOnce(): Promise<void> {
  if (!orderNo.value || phase.value !== 'pending' || !premiumViewVisible.value) {
    return
  }

  const queriedOrderNo = orderNo.value
  const userId = authStore.user?.user_id
  try {
    const status = await getOrderStatus(queriedOrderNo)
    if (
      phase.value !== 'pending' ||
      orderNo.value !== queriedOrderNo ||
      authStore.user?.user_id !== userId ||
      !premiumViewVisible.value
    ) {
      return
    }

    const outcome = classifyOrderStatus(status)
    if (outcome === 'paid') {
      forgetOrderReference(queriedOrderNo)
      finishSuccess()
      return
    }
    if (outcome === 'expired' || outcome === 'cancelled' || outcome === 'failed') {
      forgetOrderReference(queriedOrderNo)
      finishFailed(
        outcome === 'expired' ? 'orderGone' : outcome === 'cancelled' ? 'cancelled' : 'fulfillment'
      )
      return
    }
    if (hasOrderPollingTimedOut(pollStartedAt.value)) {
      finishFailed('timeout')
    }
  } catch (error) {
    if (
      phase.value !== 'pending' ||
      orderNo.value !== queriedOrderNo ||
      authStore.user?.user_id !== userId ||
      !premiumViewVisible.value
    ) {
      return
    }
    logger.error('[PremiumView] 查询订单状态失败:', error)
    if (error instanceof Error && isAuthSessionFailure(error)) {
      stopPolling()
      await clearAuthSession()
      phase.value = 'gate'
      openLoginModal(getPremiumSource())
      return
    }
    if (error instanceof Error && isRecoverableOrderStatusError(error)) {
      forgetOrderReference(queriedOrderNo)
      finishFailed('orderGone')
      return
    }
    finishFailed('generic')
  }
}

/** 清理失败只影响下次是否再查询，不改变服务端已经确认的结果。 */
function forgetOrderReference(completedOrderNo: string): void {
  background.clearOrderReference({ orderNo: completedOrderNo }).catch(error => {
    logger.error(`[PremiumView] 清理已终态订单引用失败: orderNo=${completedOrderNo}`, error)
  })
}

function startPolling(): void {
  stopPolling()
  pollTimer = setInterval(() => {
    void pollOnce()
  }, ORDER_POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (pollTimer === null) {
    return
  }
  clearInterval(pollTimer)
  pollTimer = null
}

/** 支付完成：展示成功态并刷新订阅状态缓存，让头部 CTA 立即转为 Unlimited。 */
function finishSuccess(): void {
  stopPolling()
  phase.value = 'success'
  quotaStore.refreshQuota().catch(error => {
    logger.error('[PremiumView] 支付成功后刷新订阅状态失败:', error)
  })
  void loadAccountStatus()
  void recordPricingMark(MARK_TYPE.CHECKOUT_SUCCESS)
}

function finishFailed(reason: FailedReason): void {
  stopPolling()
  failedReason.value = reason
  phase.value = 'failed'
}

/** 用户放弃等待：停止轮询并回到套餐选择；订单留待服务端过期。 */
function handleCancelPayment(): void {
  stopPolling()
  void loadPlans()
}

/** 从失败态重试：回到套餐选择重新发起。 */
function handleRetry(): void {
  void loadPlans()
}

function handleClose(): void {
  if (props.page) {
    if (phase.value === 'success') {
      void loadPlans()
    }
    return
  }
  stopPolling()
  closePremiumView()
}

function handleLogin(): void {
  openLoginModal(getPremiumSource())
}

async function handleLogout(): Promise<void> {
  accountMenuOpen.value = false
  try {
    await authStore.logout()
    accountStatus.value = null
  } catch (error) {
    logger.error('[PremiumView] 退出登录失败:', error)
  }
}

async function loadAccountStatus(): Promise<void> {
  if (!authStore.isAuthenticated) {
    accountStatus.value = null
    return
  }
  try {
    accountStatus.value = await subscriptionApi.getStatus()
  } catch (error) {
    logger.error('[PremiumView] 读取订阅状态失败:', error)
    accountStatus.value = null
  }
}

async function clearAuthSession(): Promise<void> {
  authStore.clearAuth()
  try {
    await authApi.clearLocalAuth()
  } catch (error) {
    logger.error('[PremiumView] 清理失效登录态失败:', error)
  }
}

async function openSubscriptionManagement(): Promise<void> {
  try {
    const result = await subscriptionApi.createManagement()
    if (!result.url) {
      actionError.value = t(I18N_KEYS.PREMIUM.ERROR_GENERIC)
      return
    }
    await openExternalPage(result.url, 'subscription-management')
  } catch (error) {
    logger.error('[PremiumView] 打开订阅管理失败:', error)
    actionError.value = t(I18N_KEYS.PREMIUM.ERROR_GENERIC)
  }
}

async function restorePendingPurchase(): Promise<void> {
  const stored = await storageManager.get<PendingPurchase>(STORAGE_KEYS.PENDING_PREMIUM_PURCHASE)
  if (
    stored &&
    typeof stored.productId === 'string' &&
    Number.isInteger(stored.productPriceId) &&
    typeof stored.paymentMethod === 'string'
  ) {
    pendingPurchase.value = stored
  }
}

async function persistPendingPurchase(purchase: PendingPurchase): Promise<void> {
  try {
    await storageManager.set(STORAGE_KEYS.PENDING_PREMIUM_PURCHASE, purchase)
  } catch (error) {
    logger.error('[PremiumView] 保存待购商品失败:', error)
  }
}

function clearPendingPurchase(): void {
  pendingPurchase.value = null
  storageManager.remove(STORAGE_KEYS.PENDING_PREMIUM_PURCHASE).catch(error => {
    logger.error('[PremiumView] 清理待购商品失败:', error)
  })
}

async function recordPricingMark(
  markType: (typeof MARK_TYPE)[keyof typeof MARK_TYPE]
): Promise<void> {
  try {
    await background.recordMark({
      mark_type: markType,
      mark_msg: JSON.stringify({ source: getPremiumAttributionSource() })
    })
  } catch (error) {
    logger.error('[PremiumView] 定价页打点失败:', error)
  }
}

function openTerms(): void {
  void openExternalPage(new URL(WEBSITE.TERMS_PATH, WEBSITE.BASE_URL).toString(), 'terms')
}

function openPrivacy(): void {
  void openExternalPage(new URL(WEBSITE.PRIVACY_PATH, WEBSITE.BASE_URL).toString(), 'privacy')
}

function normalizeTimestampMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value
}

function formatExpiry(value: number): string {
  return new Intl.DateTimeFormat(document.documentElement.lang || 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(normalizeTimestampMs(value)))
}

/** 周期展示文案。 */
function periodLabel(period: SubscriptionCheckoutPlan['period']): string {
  switch (period) {
    case 'month':
      return t(I18N_KEYS.PREMIUM.PERIOD_MONTH)
    case 'quarter':
      return t(I18N_KEYS.PREMIUM.PERIOD_QUARTER)
    case 'year':
      return t(I18N_KEYS.PREMIUM.PERIOD_YEAR)
    case 'lifetime':
      return t(I18N_KEYS.PREMIUM.PERIOD_LIFETIME)
  }
}

/** 独立订阅页价格后缀。 */
function priceSuffix(period: SubscriptionCheckoutPlan['period']): string {
  switch (period) {
    case 'month':
      return t(I18N_KEYS.PREMIUM.PRICE_SUFFIX_MONTH)
    case 'quarter':
      return t(I18N_KEYS.PREMIUM.PRICE_SUFFIX_QUARTER)
    case 'year':
      return t(I18N_KEYS.PREMIUM.PRICE_SUFFIX_YEAR)
    case 'lifetime':
      return t(I18N_KEYS.PREMIUM.PRICE_SUFFIX_LIFETIME)
  }
}

/** 季付 / 年付相对同币种月付的节省百分比；无可比月付或不省钱时返回 0。 */
function savingsPercent(plan: SubscriptionCheckoutPlan): number {
  const months = plan.period === 'quarter' ? 3 : plan.period === 'year' ? 12 : 0
  const monthly = plans.value.find(
    item => item.period === 'month' && item.display_currency === plan.display_currency
  )
  if (!months || !monthly) {
    return 0
  }
  return Math.max(
    0,
    Math.round((1 - plan.display_amount / (monthly.display_amount * months)) * 100)
  )
}

/** 套餐额度提示；-1 表示无限。 */
function quotaHint(plan: SubscriptionCheckoutPlan): string {
  if (plan.daily_limit < 0) {
    return t(I18N_KEYS.PREMIUM.QUOTA_UNLIMITED)
  }
  return t(I18N_KEYS.PREMIUM.QUOTA_PER_DAY, { limit: plan.daily_limit })
}

/** 后端金额为 6 位精度整数；格式化规则与官网 pricing 保持一致。 */
function formatPrice(amount: number, currency: string): string {
  const value = amount / 1_000_000
  if (currency === 'USD') {
    return `$${value.toFixed(2)}`
  }
  return `${currency} ${value.toFixed(6).replace(/\.?0+$/, '')}`
}
</script>

<style scoped>
.premium-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  flex-direction: column;
  background: #ffffff;
  box-sizing: border-box;
}

.premium-overlay[open] {
  display: flex;
}

.premium-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--premium-gray-200);
  background: var(--premium-gray-50);
}

.premium-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--premium-gray-900);
}

.premium-page-account {
  position: relative;
  display: flex;
  justify-content: center;
  width: 100%;
}

.premium-account-button,
.premium-account-login {
  min-height: 30px;
  padding: 4px 9px;
  border: 1px solid var(--premium-gray-300);
  border-radius: 6px;
  background: #ffffff;
  color: var(--premium-gray-800);
  cursor: pointer;
}

.premium-account-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: min(320px, 42vw);
}

.premium-account-avatar,
.premium-account-initial {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
}

.premium-account-avatar {
  object-fit: cover;
}

.premium-account-initial {
  display: grid;
  place-items: center;
  background: var(--premium-primary);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.premium-account-email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.premium-account-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 2;
  display: flex;
  min-width: 190px;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--premium-gray-200);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.14);
  font-size: 12px;
}

.premium-account-menu button {
  padding: 6px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--premium-primary);
  text-align: left;
  cursor: pointer;
}

.premium-account-menu button:hover {
  background: var(--premium-gray-50);
}

.premium-account-subscription {
  color: var(--premium-gray-500);
}

.premium-confirm-dialog {
  width: min(520px, calc(100vw - 32px));
  padding: 0;
  border: 0;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28);
  color: var(--premium-gray-900);
}

.premium-confirm-dialog::backdrop {
  background: rgba(15, 23, 42, 0.42);
}

.premium-confirm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--premium-gray-200);
}

.premium-confirm-kicker {
  margin: 0 0 2px;
  color: var(--premium-gray-500);
  font-size: 12px;
}

.premium-confirm-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.premium-confirm-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px;
}

.premium-confirm-summary {
  padding: 14px 16px;
  border: 1px solid var(--premium-gray-200);
  border-radius: 12px;
  background: var(--premium-gray-50);
}

.premium-confirm-summary-label {
  margin: 0;
  color: var(--premium-gray-500);
  font-size: 12px;
}

.premium-confirm-summary-values {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 700;
}

.premium-confirm-summary-values span + span {
  color: var(--premium-primary);
}

.premium-confirm-summary-usage {
  margin: 6px 0 0;
  color: var(--premium-gray-600);
  font-size: 12px;
  line-height: 1.5;
}

.premium-channel-list {
  display: grid;
  gap: 8px;
}

.premium-channel {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border: 1px solid var(--premium-gray-300);
  border-radius: 10px;
  background: #ffffff;
  color: var(--premium-gray-900);
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.premium-channel:hover {
  border-color: var(--premium-primary);
}

.premium-channel.is-selected {
  border-color: var(--premium-primary);
  background: #eff6ff;
  box-shadow: 0 0 0 1px var(--premium-primary);
}

.premium-channel-icon {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--premium-gray-50);
  color: var(--premium-gray-600);
}

.premium-channel-icon img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  padding: 5px;
  box-sizing: border-box;
  object-fit: contain;
}

.premium-confirm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--premium-gray-200);
}

.premium-confirm-agreement {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--premium-gray-600);
  font-size: 12px;
  line-height: 1.5;
}

.premium-confirm-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--premium-primary);
  font-size: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.premium-confirm-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

/* popup 宽度下条款与按钮上下排列 */
@media (max-width: 480px) {
  .premium-confirm-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .premium-confirm-actions {
    justify-content: flex-end;
  }
}

.premium-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--premium-gray-500);
  cursor: pointer;
}

.premium-close:hover {
  background: var(--premium-gray-200);
  color: var(--premium-gray-800);
}

.premium-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.premium-center {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.premium-hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--premium-warning-bg);
  color: var(--premium-warning);
}

.premium-hero-icon.is-success {
  background: var(--premium-success-bg);
  color: var(--premium-success);
}

.premium-heading {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--premium-gray-900);
}

.premium-message {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--premium-gray-500);
}

.premium-support {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--premium-gray-500);
  overflow-wrap: anywhere;
}

.premium-spinner {
  color: var(--premium-primary);
  animation: premium-spin 1s linear infinite;
}

@keyframes premium-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.premium-selling {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.premium-selling-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--premium-gray-800);
}

.premium-selling-icon {
  flex-shrink: 0;
  color: var(--premium-success);
}

.premium-plans {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.premium-plan {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--premium-gray-300);
  border-radius: 10px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.premium-plan:hover {
  border-color: var(--premium-primary);
}

.premium-plan.is-selected {
  border-color: var(--premium-primary);
  background: var(--premium-gray-50);
  box-shadow: 0 0 0 1px var(--premium-primary);
}

.premium-plan-period {
  font-size: 13px;
  font-weight: 600;
  color: var(--premium-gray-900);
}

.premium-plan-price {
  font-size: 18px;
  font-weight: 700;
  color: var(--premium-primary);
}

.premium-plan-note {
  font-size: 11px;
  color: var(--premium-gray-500);
}

.premium-buy {
  margin-top: 2px;
}

.premium-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--premium-error);
}

.premium-primary-button,
.premium-secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.premium-primary-button {
  background: var(--premium-primary);
  color: #ffffff;
}

.premium-primary-button:hover:not(:disabled) {
  background: var(--premium-primary-dark);
}

.premium-primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.premium-secondary-button {
  border: 1px solid var(--premium-gray-300);
  background: #ffffff;
  color: var(--premium-gray-600);
}

.premium-secondary-button:hover {
  border-color: var(--premium-primary);
  color: var(--premium-primary);
}

/* ---------- 独立订阅页（page 模式） ---------- */

.premium-page-overlay {
  overflow-y: auto;
  background:
    radial-gradient(1200px 520px at 50% -160px, rgba(37, 99, 235, 0.12), transparent 70%),
    var(--premium-gray-50);
}

.premium-page-overlay .premium-header {
  justify-content: center;
  padding: 28px 24px 0;
  border-bottom: 0;
  background: transparent;
}

.premium-page-overlay .premium-title {
  outline: none;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.03em;
  text-align: center;
}

.premium-page-overlay .premium-body {
  width: min(1040px, 100%);
  flex: none;
  margin: 0 auto;
  padding: 16px 24px 40px;
  gap: 16px;
  overflow: visible;
  box-sizing: border-box;
}

.premium-page-overlay .premium-message {
  font-size: 14px;
}

.premium-page-account .premium-account-button,
.premium-page-account .premium-account-login {
  min-height: 40px;
  padding: 5px 16px 5px 5px;
  border-color: var(--premium-gray-200);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.05);
  font-size: 14px;
}

.premium-page-account .premium-account-login {
  padding: 5px 22px;
  font-weight: 600;
}

.premium-page-account .premium-account-button {
  gap: 10px;
  max-width: min(600px, 100%);
}

.premium-page-account .premium-account-avatar,
.premium-page-account .premium-account-initial {
  width: 28px;
  height: 28px;
  font-size: 13px;
}

.premium-page-account .premium-account-email {
  color: var(--premium-gray-800);
  font-size: 14px;
  font-weight: 500;
}

.premium-account-plan {
  overflow: hidden;
  padding-left: 10px;
  border-left: 1px solid var(--premium-gray-200);
  color: var(--premium-gray-500);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.premium-page-account .premium-account-menu {
  top: calc(100% + 8px);
  right: auto;
  left: 50%;
  transform: translateX(-50%);
}

.premium-page-notice {
  margin: 0 auto;
  padding: 6px 14px;
  border-radius: 9999px;
  background: var(--premium-warning-bg);
  color: var(--premium-gray-800);
  font-size: 13px;
  text-align: center;
}

.premium-page-plans {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  align-items: stretch;
  padding-top: 12px;
}

.premium-page-plan {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 26px 24px 20px;
  border: 1px solid var(--premium-gray-200);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.05);
}

.premium-page-plan.is-popular {
  border: 2px solid var(--premium-primary);
  box-shadow: 0 12px 32px rgba(37, 99, 235, 0.14);
}

.premium-page-popular {
  position: absolute;
  top: -13px;
  left: 24px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 26px;
  padding: 0 12px;
  border-radius: 9999px;
  background: linear-gradient(90deg, var(--premium-primary), #6366f1);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.28);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.premium-page-plan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.premium-page-plan-name {
  margin: 0;
  color: var(--premium-gray-900);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.premium-page-plan-quota {
  margin: 2px 0 0;
  color: var(--premium-gray-500);
  font-size: 13px;
}

.premium-page-price-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  margin-top: 16px;
}

.premium-page-price {
  color: var(--premium-gray-900);
  font-size: 40px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.premium-page-price-suffix {
  color: var(--premium-gray-500);
  font-size: 14px;
  font-weight: 500;
}

.premium-page-save {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 9999px;
  background: var(--premium-success-bg);
  color: #15803d;
  font-size: 12px;
  font-weight: 700;
}

.premium-page-buy {
  width: 100%;
  min-height: 42px;
  margin-top: 18px;
  padding: 0 16px;
  border: 1px solid var(--premium-gray-300);
  border-radius: 10px;
  background: #ffffff;
  color: var(--premium-gray-900);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.premium-page-buy:hover:not(:disabled) {
  border-color: var(--premium-primary);
  color: var(--premium-primary);
}

.premium-page-plan.is-popular .premium-page-buy {
  border-color: var(--premium-primary);
  background: var(--premium-primary);
  color: #ffffff;
}

.premium-page-plan.is-popular .premium-page-buy:hover:not(:disabled) {
  background: var(--premium-primary-dark);
  color: #ffffff;
}

.premium-page-buy:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.premium-page-secure {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 8px 0 0;
  color: var(--premium-gray-500);
  font-size: 12px;
}

.premium-page-benefits {
  display: grid;
  gap: 10px;
  margin: 16px 0;
  padding: 16px 0 0;
  border-top: 1px solid var(--premium-gray-200);
  list-style: none;
}

.premium-page-benefits li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--premium-gray-800);
  font-size: 14px;
  line-height: 1.45;
}

.premium-page-benefits :deep(.icon) {
  flex-shrink: 0;
}

.premium-page-billing {
  display: flex;
  align-items: center;
  gap: 8px;
  /* auto 把计费说明压到卡片底部，三张卡底部对齐 */
  margin: auto 0 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--premium-gray-50);
  color: var(--premium-gray-600);
  font-size: 13px;
  font-weight: 500;
}

.premium-page-billing :deep(.icon) {
  flex-shrink: 0;
}

.premium-page-overlay .premium-error {
  width: min(560px, 100%);
  margin: 0 auto;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 640px) {
  .premium-page-overlay .premium-header {
    padding: 20px 16px 0;
  }

  .premium-page-overlay .premium-title {
    font-size: 24px;
  }

  .premium-page-overlay .premium-body {
    padding: 12px 16px 32px;
    gap: 14px;
  }

  .premium-page-plans {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .premium-account-plan {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .premium-spinner {
    transition: none;
    animation: none;
  }
}
</style>
