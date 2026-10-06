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
        <h2 id="vdl-premium-title" class="premium-title">{{ t(I18N_KEYS.PREMIUM.TITLE) }}</h2>
        <button
          type="button"
          class="premium-close"
          :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
          @click="handleClose"
        >
          <Icon :name="IconName.X_MARK" :size="IconSize.SM" />
        </button>
      </header>

      <main class="premium-body">
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
          <ul class="premium-selling">
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

          <div class="premium-plans" role="radiogroup" :aria-label="t(I18N_KEYS.PREMIUM.TITLE)">
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

          <div v-if="selectedPlanChannels.length > 1" class="premium-channels">
            <span class="premium-channels-label">
              {{ t(I18N_KEYS.PREMIUM.PAYMENT_METHOD) }}
            </span>
            <div class="premium-channel-list" role="radiogroup">
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
                {{ channel.payment_method_name || channel.payment_method }}
              </button>
            </div>
          </div>

          <button
            type="button"
            class="premium-primary-button premium-buy"
            :disabled="phase === 'creating'"
            @click="handleBuy"
          >
            {{ t(phase === 'creating' ? I18N_KEYS.PREMIUM.CREATING : I18N_KEYS.PREMIUM.BUY) }}
          </button>
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

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import { logger } from '@/core/utils/logger'
import { isAuthSessionFailure } from '@/core/api/auth/sessionFailure'
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
import { openExternalPage } from '@/core/utils/navigation'
import { openLoginModal } from '@/core/composables/loginModal'
import { useNativeDialog } from '@/core/composables/nativeDialog'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import {
  closePremiumView,
  getPremiumSource,
  premiumViewVisible
} from '@/core/composables/premiumView'

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
type FailedReason = 'orderGone' | 'cancelled' | 'fulfillment' | 'timeout' | 'generic' | 'gateway'

const { t } = useI18n()
const dialog = useNativeDialog(premiumViewVisible)

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
/** 自动轮询开始时间，用于 10 分钟超时判断。 */
const pollStartedAt = ref<number | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

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
    default:
      return I18N_KEYS.PREMIUM.ERROR_GENERIC
  }
})

watch(premiumViewVisible, visible => {
  if (visible) {
    enterView()
  } else {
    stopPolling()
  }
})

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

onBeforeUnmount(stopPolling)

/** 打开视图：先恢复当前用户的订单定位，没有引用时加载套餐。 */
async function enterView(): Promise<void> {
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
    phase.value = 'gate'
    return
  }
  phase.value = 'loading'
  const userId = authStore.user?.user_id
  try {
    const reference = await background.getLatestOrderReference()
    if (!premiumViewVisible.value || authStore.user?.user_id !== userId) {
      return
    }
    if (!reference) {
      await loadPlans()
      return
    }
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
    // 默认选中年付（与官网主推一致），无年付时选第一个套餐。
    const defaultPlan = configs.find(plan => plan.period === 'year') ?? configs[0] ?? null
    selectedPlanId.value = defaultPlan?.product_id ?? null
    selectedChannelMethod.value = defaultPlan
      ? (getDefaultOrderPaymentChannel(defaultPlan.payment_channels)?.payment_method ?? null)
      : null
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

/** 切换套餐时重置为该套餐的默认支付渠道。 */
function selectPlan(productId: string): void {
  selectedPlanId.value = productId
  const plan = plans.value.find(item => item.product_id === productId)
  selectedChannelMethod.value =
    getDefaultOrderPaymentChannel(plan?.payment_channels ?? [])?.payment_method ?? null
  actionError.value = ''
}

/** 发起购买：创建订单 → 打开外部收银台 → 进入轮询。 */
async function handleBuy(): Promise<void> {
  const plan = selectedPlan.value
  const channel = selectedChannel.value
  if (!plan || !channel || phase.value === 'creating') {
    return
  }

  phase.value = 'creating'
  actionError.value = ''
  const userId = authStore.user?.user_id
  try {
    const result = await background.createCheckoutOrder(buildCreateOrderRequest(plan, channel))
    if (!premiumViewVisible.value || authStore.user?.user_id !== userId) {
      return
    }
    if (result.status === 'failed') {
      if (result.reason === 'auth') {
        phase.value = 'gate'
      } else if (result.reason === 'priceUpdated') {
        await loadPlans()
      } else {
        phase.value = 'ready'
        actionError.value = t(
          result.reason === 'gateway'
            ? I18N_KEYS.PREMIUM.ERROR_GATEWAY
            : result.reason === 'orderGone'
              ? I18N_KEYS.PREMIUM.ERROR_ORDER_GONE
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
      phase.value = 'ready'
      actionError.value = t(I18N_KEYS.PREMIUM.ERROR_GATEWAY)
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
      phase.value = 'gate'
      return
    }
    if (error instanceof Error && isRecoverableOrderStatusError(error)) {
      forgetOrderReference(queriedOrderNo)
      finishFailed('orderGone')
    }
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
  stopPolling()
  closePremiumView()
}

function handleLogin(): void {
  openLoginModal(getPremiumSource())
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

.premium-channels {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.premium-channels-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--premium-gray-500);
}

.premium-channel-list {
  display: flex;
  gap: 8px;
}

.premium-channel {
  flex: 1;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--premium-gray-300);
  border-radius: 8px;
  background: #ffffff;
  font-size: 12px;
  font-weight: 600;
  color: var(--premium-gray-800);
  cursor: pointer;
}

.premium-channel.is-selected {
  border-color: var(--premium-primary);
  color: var(--premium-primary);
  box-shadow: 0 0 0 1px var(--premium-primary);
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

.premium-page-overlay .premium-header {
  padding: 20px max(24px, calc((100vw - 960px) / 2));
}

.premium-page-overlay .premium-title {
  font-size: 24px;
}

.premium-page-overlay .premium-body {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 36px 24px 56px;
  gap: 24px;
  box-sizing: border-box;
}

.premium-page-overlay .premium-selling {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.premium-page-overlay .premium-selling-item {
  min-height: 44px;
  padding: 12px 14px;
  border: 1px solid var(--premium-gray-200);
  border-radius: 10px;
  background: var(--premium-gray-50);
  box-sizing: border-box;
}

.premium-page-overlay .premium-plans {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.premium-page-overlay .premium-plan {
  min-height: 124px;
  padding: 16px;
}

.premium-page-overlay .premium-plan-period {
  font-size: 15px;
}

.premium-page-overlay .premium-plan-price {
  font-size: 24px;
}

.premium-page-overlay .premium-plan-note,
.premium-page-overlay .premium-message {
  font-size: 13px;
}

.premium-page-overlay .premium-buy {
  min-height: 48px;
  font-size: 15px;
}

@media (max-width: 640px) {
  .premium-page-overlay .premium-header {
    padding: 16px;
  }

  .premium-page-overlay .premium-body {
    padding: 24px 16px 40px;
  }

  .premium-page-overlay .premium-selling {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .premium-spinner {
    transition: none;
    animation: none;
  }
}
</style>
