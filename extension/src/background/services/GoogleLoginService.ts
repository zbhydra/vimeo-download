/**
 * Google 授权登录服务（background）。
 *
 * 授权窗口只能由 background 发起：`launchWebAuthFlow({interactive:true})` 打开的窗口会抢焦点，
 * popup 随之被 Chrome 关闭。因此整条链路——打开授权窗口、解析回跳、兑换一次性 code、
 * 写入登录态、终态打点——都在这里完成，不依赖 popup 存活；用户重开 popup 时由
 * `authStore.initialize()` 从 storage 恢复登录态。
 *
 * RPC 返回值只是 popup 仍存活时的附加信息（顺手刷新界面 / 展开验证码步骤），不承担完成语义。
 */

import { API } from '@/core/api/config'
import { authApi } from '@/core/api/auth/api'
import {
  getExtensionRegistrationContext,
  setRegistrationContextParams
} from '@/core/api/auth/registrationContext'
import { MARK_TYPE, type LoginSource, type MarkType } from '@/core/api/mark/types'
import type {
  BackgroundStartGoogleLoginRequest,
  BackgroundStartGoogleLoginResponse
} from '@/background/types'
import { logger } from '@/core/utils/logger'
import { recordBackgroundMark } from './ExtensionMarkReporter'

/** 插件回调路径；`chrome.identity.getRedirectURL` 会拼成 chromiumapp.org 下的固定地址。 */
const GOOGLE_LOGIN_REDIRECT_PATH = 'google-login'
/** 后端回跳在回调地址上附加的一次性 code 参数。 */
const GOOGLE_LOGIN_CODE_PARAM = 'google_login_code'
/** 后端回跳在回调地址上附加的待验证邮箱参数（Google 邮箱非权威时）。 */
const GOOGLE_EMAIL_VERIFICATION_PARAM = 'google_email_verification'
/** 后端回跳在回调地址上附加的失败原因参数。 */
const GOOGLE_LOGIN_ERROR_PARAM = 'google_login_error'
/** Google 授权页返回的「拒绝授权」；与 Chrome 关窗同属用户取消。 */
const GOOGLE_ACCESS_DENIED_ERROR = 'access_denied'
/** 后端回跳里缺少任何结果参数时的失败原因。 */
const GOOGLE_MISSING_CODE_REASON = 'missing_code'
/** Chrome identity 用这条固定文案表示用户关闭了授权窗口。 */
const USER_CANCELLED_ERROR_MESSAGE = 'The user did not approve access.'
/** 打点阶段标识；与 popup 侧 login_click 共用同一份 source 归因。 */
const GOOGLE_LOGIN_MARK_STAGE = 'google'

/** 后端回跳结果；只描述授权窗口带回来的东西，不代表登录已完成。 */
export type GoogleCallbackResult =
  | { status: 'code'; code: string }
  | { status: 'email_verification'; email: string }
  | { status: 'cancelled'; reason: string }
  | { status: 'failed'; reason: string }

/** Google 授权登录服务。 */
export class GoogleLoginService {
  /** 打开 Google 授权窗口，完成兑换与登录态写入，返回 popup 存活时的附加信息。 */
  async start(
    request: BackgroundStartGoogleLoginRequest
  ): Promise<BackgroundStartGoogleLoginResponse> {
    const redirectUrl = chrome.identity.getRedirectURL(GOOGLE_LOGIN_REDIRECT_PATH)
    const authorizeUrl = await buildGoogleAuthorizeUrl(redirectUrl)

    let finalUrl: string | undefined
    try {
      finalUrl = await chrome.identity.launchWebAuthFlow({
        url: authorizeUrl,
        interactive: true
      })
    } catch (error) {
      if (error instanceof Error && isUserCancelledError(error)) {
        // 用户关窗与「后端 authorize 被拒（限流 / invalid_return_to）后落到网站兜底域」在这里
        // 完全同形，只能靠这条日志留下现场。
        await recordGoogleLoginMark(MARK_TYPE.LOGIN_CANCELLED, request.source, 'user_closed_window')
        logger.error(
          `[GoogleLoginService] Google 授权未完成（用户关窗，或后端 authorize 被拒后落到网站兜底域）: ` +
            `source=${request.source}, redirectUrl=${redirectUrl}`
        )
        return { status: 'cancelled', reason: 'user_closed_window' }
      }

      const reason = error instanceof Error ? describeError(error) : 'unknown'
      await recordGoogleLoginMark(MARK_TYPE.LOGIN_FAILED, request.source, reason)
      logger.error('[GoogleLoginService] Google 授权窗口打开失败:', error)
      return { status: 'failed', reason }
    }

    if (!finalUrl) {
      await recordGoogleLoginMark(MARK_TYPE.LOGIN_FAILED, request.source, 'missing_callback_url')
      logger.error(
        `[GoogleLoginService] Google 授权未返回回调地址: source=${request.source}, redirectUrl=${redirectUrl}`
      )
      return { status: 'failed', reason: 'missing_callback_url' }
    }

    const callbackResult = parseGoogleCallbackResult(finalUrl)
    if (callbackResult.status === 'cancelled') {
      await recordGoogleLoginMark(MARK_TYPE.LOGIN_CANCELLED, request.source, callbackResult.reason)
      logger.error(
        `[GoogleLoginService] Google 授权页拒绝授权: source=${request.source}, reason=${callbackResult.reason}`
      )
      return callbackResult
    }

    if (callbackResult.status === 'email_verification') {
      // 后端已把验证码发到它确认出的邮箱；popup 还活着就继续验证码步骤，
      // 已被销毁则用户重开 popup 走邮箱登录即可（不新增跨上下文交接状态）。
      await recordGoogleLoginMark(
        MARK_TYPE.LOGIN_FAILED,
        request.source,
        'email_verification_required'
      )
      logger.error(
        `[GoogleLoginService] Google 邮箱非权威，需要邮箱验证码确认（后端已发送）: source=${request.source}`
      )
      return callbackResult
    }

    if (callbackResult.status === 'failed') {
      await recordGoogleLoginMark(MARK_TYPE.LOGIN_FAILED, request.source, callbackResult.reason)
      logger.error(
        `[GoogleLoginService] Google 授权未完成: source=${request.source}, reason=${callbackResult.reason}`
      )
      return callbackResult
    }

    try {
      await authApi.exchangeGoogleLoginCode(callbackResult.code)
    } catch (error) {
      const reason = error instanceof Error ? describeError(error) : 'exchange_failed'
      await recordGoogleLoginMark(MARK_TYPE.LOGIN_FAILED, request.source, reason)
      logger.error('[GoogleLoginService] Google 一次性 code 兑换失败:', error)
      return { status: 'failed', reason }
    }

    await recordGoogleLoginMark(MARK_TYPE.LOGIN_SUCCESS, request.source)
    logger.info('[GoogleLoginService] Google 登录完成，登录态已写入 storage')
    return { status: 'completed' }
  }
}

/** 拼出后端 authorize URL，回跳目标由 browser identity 生成。 */
export async function buildGoogleAuthorizeUrl(redirectUrl: string): Promise<string> {
  const callbackUrl = new URL(redirectUrl)
  const registrationContext = await getExtensionRegistrationContext()
  setRegistrationContextParams(callbackUrl, registrationContext)

  const authorizeUrl = new URL(API.ENDPOINTS.AUTH_GOOGLE_OAUTH_AUTHORIZE, API.BASE_URL)
  authorizeUrl.searchParams.set('return_to', callbackUrl.toString())
  return authorizeUrl.toString()
}

/** 从授权窗口的最终地址解析后端回跳结果。 */
export function parseGoogleCallbackResult(finalUrl: string): GoogleCallbackResult {
  let callbackUrl: URL
  try {
    callbackUrl = new URL(finalUrl)
  } catch (error) {
    logger.error(`[GoogleLoginService] Google 授权回跳地址非法: url=${finalUrl}`, error)
    return { status: 'failed', reason: 'invalid_callback_url' }
  }

  const code = callbackUrl.searchParams.get(GOOGLE_LOGIN_CODE_PARAM)?.trim()
  if (code) {
    return { status: 'code', code }
  }

  const email = callbackUrl.searchParams.get(GOOGLE_EMAIL_VERIFICATION_PARAM)?.trim()
  if (email) {
    return { status: 'email_verification', email }
  }

  const reason = callbackUrl.searchParams.get(GOOGLE_LOGIN_ERROR_PARAM)?.trim()
  if (reason === GOOGLE_ACCESS_DENIED_ERROR) {
    return { status: 'cancelled', reason }
  }

  return { status: 'failed', reason: reason || GOOGLE_MISSING_CODE_REASON }
}

/** 判断 Chrome identity 抛出的错误是否为用户主动取消。 */
export function isUserCancelledError(error: Error): boolean {
  return error.message === USER_CANCELLED_ERROR_MESSAGE
}

/** 记录 Google 登录终态打点；与 popup 侧 login_click 用同一份 source 归因。 */
async function recordGoogleLoginMark(
  markType: MarkType,
  source: LoginSource,
  reason?: string
): Promise<void> {
  await recordBackgroundMark(
    markType,
    reason === undefined
      ? JSON.stringify({ source })
      : JSON.stringify({ source, stage: GOOGLE_LOGIN_MARK_STAGE, reason })
  )
}

/** 提取可上报的错误描述，避免日志里出现空对象。 */
function describeError(error: Error): string {
  const message = error.message.trim()
  return message.length > 0 ? message : error.name
}

/** Background 共享的 Google 授权登录服务单例。 */
export const googleLoginService = new GoogleLoginService()
