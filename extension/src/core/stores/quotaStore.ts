/**
 * 配额状态管理 Store
 *
 * 管理用户下载配额信息（基于订阅状态）
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { subscriptionApi } from '../api'
import type { SubscriptionStatus } from '../api'
import { logger } from '../utils/logger'

export const useQuotaStore = defineStore('quota', () => {
  // ============================================================================
  // 状态
  // ============================================================================

  /** 订阅状态（包含配额信息） */
  const subscriptionStatus = ref<SubscriptionStatus | null>(null)
  /** 是否正在加载 */
  const loading = ref<boolean>(false)
  /** 错误信息 */
  const error = ref<string | null>(null)
  /** 每次消费通知都重新读取服务端，避免正在初查时丢掉刷新。 */
  let refreshChain: Promise<void> = Promise.resolve()

  // ============================================================================
  // Getters
  // ============================================================================

  /** 剩余次数（-1 表示无限制） */
  const remaining = computed(() => subscriptionStatus.value?.remaining ?? 0)

  /** 每日限额（-1 表示无限制） */
  const dailyLimit = computed(() => subscriptionStatus.value?.daily_limit ?? 0)

  /** 订阅权益按到期时间判断，首日不限次不代表已订阅。 */
  const hasActiveSubscription = computed(
    () => (subscriptionStatus.value?.expires_at ?? 0) > Date.now()
  )

  /** 不限次时隐藏计数器，包括首日免费。 */
  const showCounter = computed(() => {
    return subscriptionStatus.value !== null && dailyLimit.value !== -1
  })

  /** 是否显示订阅入口按钮 */
  const showSubscriptionAction = computed(() => {
    return subscriptionStatus.value !== null
  })

  /** 剩余次数是否为 0 */
  const isExhausted = computed(() => {
    return dailyLimit.value !== -1 && remaining.value === 0
  })

  /** 订阅周期（用于兼容旧代码） */
  const quotaStatus = computed(() => {
    if (!subscriptionStatus.value) return null
    return {
      period: subscriptionStatus.value.period,
      daily_limit: subscriptionStatus.value.daily_limit,
      used: subscriptionStatus.value.used,
      remaining: subscriptionStatus.value.remaining,
      reset_date: subscriptionStatus.value.reset_date
    }
  })

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * 刷新配额状态（通过订阅状态 API）
   */
  function refreshQuota(): Promise<void> {
    const result = refreshChain.then(loadQuota)
    refreshChain = result.catch(() => undefined)
    return result
  }

  async function loadQuota(): Promise<void> {
    try {
      loading.value = true
      error.value = null

      const status = await subscriptionApi.getStatus()
      subscriptionStatus.value = status

      logger.info('[QuotaStore] Subscription status refreshed:', {
        period: status.period,
        daily_limit: status.daily_limit,
        used: status.used,
        remaining: status.remaining
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch subscription status'
      error.value = message
      logger.error('[QuotaStore] Failed to refresh subscription:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 清除配额状态
   */
  function clearQuota(): void {
    subscriptionStatus.value = null
    error.value = null
  }

  /**
   * Store 销毁时的清理
   */
  function $dispose(): void {
    logger.info('[QuotaStore] Disposing store')
    clearQuota()
  }

  // ============================================================================
  // 返回
  // ============================================================================

  return {
    // 状态
    quotaStatus,
    loading,
    error,

    // Getters
    remaining,
    dailyLimit,
    hasActiveSubscription,
    showCounter,
    showSubscriptionAction,
    isExhausted,

    // Actions
    refreshQuota,
    clearQuota,
    $dispose
  }
})
