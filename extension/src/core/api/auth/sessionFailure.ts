/**
 * 认证失效判定。
 *
 * 只有后端明确表示 token 或账号登录态不可用时，前端才清理本地认证信息。
 */

import { ApiError } from '../client/types'

const AUTH_FAILURE_CODES = new Set([10001, 10002, 10003, 10004, 10009, 10010, 10013, 10014])

/** 判断 HTTP 状态是否表示认证会话失效。 */
export function isAuthFailureStatus(status?: number): boolean {
  return status === 401 || status === 403
}

/** 判断后端业务码是否表示认证会话失效。 */
export function isAuthFailureCode(code?: string | number): boolean {
  const numericCode = typeof code === 'string' ? Number(code) : code
  return (
    typeof numericCode === 'number' &&
    Number.isFinite(numericCode) &&
    AUTH_FAILURE_CODES.has(numericCode)
  )
}

/** 判断错误是否需要清理本地登录态。 */
export function isAuthSessionFailure(error: Error): boolean {
  if (!(error instanceof ApiError)) {
    return false
  }
  if (error.preserveAuthState) {
    return false
  }
  return isAuthFailureStatus(error.status) || isAuthFailureCode(error.backendCode)
}
