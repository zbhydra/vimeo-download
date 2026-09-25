/**
 * 认证状态管理 Store
 *
 * 管理用户登录状态、用户信息和认证操作
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '../api'
import type { UserInfo } from '../types'
import { logger } from '../utils/logger'
import { useQuotaStore } from './quotaStore'
import { isAuthSessionFailure } from '../api/auth/sessionFailure'

export const useAuthStore = defineStore('auth', () => {
  // ============================================================================
  // 状态
  // ============================================================================

  /** 用户信息 */
  const user = ref<UserInfo | null>(null)
  /** 访问令牌 */
  const token = ref<string | null>(null)
  /** 是否正在加载 */
  const loading = ref<boolean>(false)
  /** 初始化中标志（防止并发调用） */
  let isInitializing = false

  // ============================================================================
  // Getters
  // ============================================================================

  /** 是否已认证 */
  const isAuthenticated = computed(() => {
    return !!(user.value && token.value)
  })

  /** 用户显示名称（优先使用 full_name，其次 email） */
  const displayName = computed(() => {
    if (!user.value) {
      return ''
    }
    return user.value.full_name || user.value.email || ''
  })

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * 初始化 Store
   * 从本地存储恢复认证状态
   */
  async function initialize(): Promise<void> {
    // 防止并发调用
    if (isInitializing) {
      logger.debug('[AuthStore] Already initializing, skipping')
      return
    }

    try {
      isInitializing = true
      logger.info('[AuthStore] Initializing')

      // 从本地存储恢复状态
      const storedUser = await authApi.getStoredUserInfo()
      const storedToken = await authApi.getAccessToken()

      if (storedUser && storedToken) {
        user.value = storedUser
        token.value = storedToken
        logger.info('[AuthStore] Restored authentication for user:', storedUser.user_id)
      } else if (storedUser || storedToken) {
        await authApi.clearLocalAuth()
      }

      if (isAuthenticated.value) {
        try {
          const currentUser = await authApi.getCurrentUser()
          user.value = currentUser
          logger.info('[AuthStore] Token validated, user updated')
        } catch (err) {
          logger.warn('[AuthStore] Token validation failed:', err)
          if (err instanceof Error && isAuthSessionFailure(err)) {
            await authApi.clearLocalAuth()
            clearAuth()
          }
        }
      }

      // 刷新配额状态（无论是否登录）。先完成 token 校验，避免旧 token 把插件游客额度请求打成 401。
      const quotaStore = useQuotaStore()
      try {
        await quotaStore.refreshQuota()
      } catch (err) {
        // 配额获取失败不影响初始化，静默处理
        logger.warn('[AuthStore] Failed to refresh quota:', err)
      }
    } catch (err) {
      logger.error('[AuthStore] Initialization failed:', err)
      clearAuth()
    } finally {
      isInitializing = false
    }
  }

  /**
   * 退出登录
   */
  async function logout(): Promise<void> {
    try {
      loading.value = true

      await authApi.logout()

      clearAuth()

      // 清除配额状态
      const quotaStore = useQuotaStore()
      quotaStore.clearQuota()

      logger.info('[AuthStore] Logout successful')
    } catch (err) {
      logger.error('[AuthStore] Logout failed:', err)
      // 即使 API 调用失败，也清除本地状态
      clearAuth()
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 清除认证状态
   */
  function clearAuth(): void {
    user.value = null
    token.value = null
  }

  /**
   * Store 销毁时的清理
   */
  function $dispose(): void {
    logger.info('[AuthStore] Disposing store')
    clearAuth()
  }

  // ============================================================================
  // 返回
  // ============================================================================

  return {
    // 状态
    user,
    token,
    loading,

    // Getters
    isAuthenticated,
    displayName,

    // Actions
    initialize,
    logout,
    clearAuth,
    $dispose
  }
})
