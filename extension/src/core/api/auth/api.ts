/**
 * 认证 API 函数
 *
 * 函数式 API，提供类型安全的调用方式
 */

import { httpClient } from '../index'
import { API, STORAGE_KEYS } from '../config'
import { storageManager } from '../../storage'
import type { UserInfo } from '../../types'
import { logger } from '../../utils/logger'
import { ApiError } from '../client/types'
import { getExtensionRegistrationContext } from './registrationContext'

/** 后端登录响应；插件与网站共用同一套签发逻辑。 */
export interface LoginResponse {
  /** 访问令牌。 */
  access_token: string
  /** 刷新令牌。 */
  refresh_token: string
  /** 令牌类型。 */
  token_type: string
  /** 访问令牌过期时间（秒）。 */
  expires_in: number
  /** 当前用户信息。 */
  user: UserInfo
}

/** 确认登录响应字段完整，避免异常响应写入半截登录态。 */
function requireCompleteLoginResponse(result: LoginResponse): LoginResponse {
  if (
    !result.access_token ||
    !result.refresh_token ||
    !result.user ||
    typeof result.user.user_id !== 'number'
  ) {
    throw new ApiError('Login response is incomplete', 500, 'INVALID_LOGIN_RESPONSE')
  }

  return result
}

/** 把登录响应里的令牌与用户摘要写入认证三键。 */
async function persistLoginResponse(result: LoginResponse): Promise<void> {
  const complete = requireCompleteLoginResponse(result)
  await storageManager.setMany({
    [STORAGE_KEYS.ACCESS_TOKEN]: complete.access_token,
    [STORAGE_KEYS.REFRESH_TOKEN]: complete.refresh_token,
    [STORAGE_KEYS.USER_INFO]: {
      user_id: complete.user.user_id,
      email: complete.user.email,
      full_name: complete.user.full_name,
      avatar_url: complete.user.avatar_url,
      created_at: complete.user.created_at
    }
  })
}

/**
 * 认证 API 函数集合
 */
export const authApi = {
  /**
   * 发送邮箱登录验证码。
   */
  sendEmailCode: async (email: string): Promise<void> => {
    await httpClient.post<void>(
      API.ENDPOINTS.AUTH_SEND_EMAIL_CODE,
      { email },
      {
        requireAuth: false,
        skipRetry: true,
        skipErrorToast: true,
        skipRequestLog: true
      }
    )
  },

  /**
   * 使用邮箱验证码登录或注册，成功后写入认证三键。
   *
   * 验证码是一次性凭据：skipRetry 明确禁用 retryInterceptor 的 5xx 重试，避免重放；
   * 任何失败都不清除旧登录态。
   */
  loginWithEmailCode: async (email: string, code: string): Promise<LoginResponse> => {
    const result = await httpClient.post<LoginResponse>(
      API.ENDPOINTS.AUTH_EMAIL_VERIFY_LOGIN,
      { email, code, ...(await getExtensionRegistrationContext()) },
      {
        requireAuth: false,
        skipRetry: true,
        skipErrorToast: true,
        skipRequestLog: true
      }
    )

    await persistLoginResponse(result)
    return result
  },

  /**
   * 用 Google 授权拿到的一次性 code 换取登录态。
   *
   * 只由 background 的 Google 授权流程调用：code 到手就得立刻兑换，popup 可能在授权
   * 窗口获焦时已被 Chrome 销毁；注册归因在授权回跳时已由后端记录。
   */
  exchangeGoogleLoginCode: async (code: string): Promise<LoginResponse> => {
    const result = await httpClient.post<LoginResponse>(
      API.ENDPOINTS.AUTH_GOOGLE_EXCHANGE,
      { code },
      {
        requireAuth: false,
        skipRetry: true,
        skipErrorToast: true,
        skipRequestLog: true
      }
    )

    await persistLoginResponse(result)
    return result
  },

  /**
   * 获取当前用户信息
   */
  getCurrentUser: async (): Promise<UserInfo> => {
    const token = await storageManager.get<string>(STORAGE_KEYS.ACCESS_TOKEN)
    if (!token) {
      throw new ApiError('No access token available', 401, 'NO_TOKEN')
    }

    const result = await httpClient.get<UserInfo>(API.ENDPOINTS.AUTH_ME)

    // 更新 storage
    await storageManager.set(STORAGE_KEYS.USER_INFO, result)

    return result
  },

  /**
   * 退出登录
   */
  logout: async (): Promise<void> => {
    const token = await storageManager.get<string>(STORAGE_KEYS.ACCESS_TOKEN)

    if (token) {
      try {
        await httpClient.post<void>(API.ENDPOINTS.AUTH_LOGOUT)
      } catch (err) {
        logger.warn('[AuthApi] Logout request failed:', err)
      }
    }

    // 清除存储
    await storageManager.remove(STORAGE_KEYS.ACCESS_TOKEN)
    await storageManager.remove(STORAGE_KEYS.REFRESH_TOKEN)
    await storageManager.remove(STORAGE_KEYS.USER_INFO)
  },

  /**
   * 获取存储的访问令牌
   */
  getAccessToken: (): Promise<string | null> => {
    return storageManager.get<string>(STORAGE_KEYS.ACCESS_TOKEN)
  },

  /**
   * 获取存储的用户信息
   */
  getStoredUserInfo: (): Promise<UserInfo | null> => {
    return storageManager.get<UserInfo>(STORAGE_KEYS.USER_INFO)
  },

  /**
   * 检查是否已认证
   */
  isAuthenticated: async (): Promise<boolean> => {
    const token = await authApi.getAccessToken()
    const user = await authApi.getStoredUserInfo()
    return !!(token && user)
  },

  /**
   * 清除本地认证信息
   */
  clearLocalAuth: async (): Promise<void> => {
    await storageManager.remove(STORAGE_KEYS.ACCESS_TOKEN)
    await storageManager.remove(STORAGE_KEYS.REFRESH_TOKEN)
    await storageManager.remove(STORAGE_KEYS.USER_INFO)
  }
}
