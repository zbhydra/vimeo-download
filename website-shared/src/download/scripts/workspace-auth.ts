/**
 * 下载工作区鉴权恢复。
 *
 * 负责登录弹窗、验证码登录、token 清理和当前用户恢复。
 */

import {
  cancelGoogleRedirectPrompt,
  clearStoredAccessToken,
  DEFAULT_PUBLIC_GOOGLE_CLIENT_ID,
  getCurrentUser,
  logGoogleAuthStage,
  loginWithEmailCode,
  requestGoogleRedirectPrompt,
  sendEmailCode,
  type GoogleRedirectPromptOptions
} from '../../homepage-runtime/auth'
import { isHomepageAuthFailure, type RequestContext } from '../../homepage-runtime/api'
import type { SendCodeCooldownController } from '../../homepage-runtime/sendCodeCooldown'
import { setHidden, setMessage, type WorkspaceElements } from './workspace-elements'
import type { AuthRestoreResult, AuthStatePatch, WorkspaceState } from './workspace-state'

function buildRequestContext(state: WorkspaceState): RequestContext {
  return {
    deviceId: state.deviceId,
    token: state.token
  }
}

/** 登录拿到 token 后立即用 auth/me 作为用户与 Credits 真源。 */
export async function refreshAuthenticatedUser(
  state: WorkspaceState,
  token: string
): Promise<AuthStatePatch> {
  const user = await getCurrentUser({
    deviceId: state.deviceId,
    token
  })
  return {
    token,
    user
  }
}

function getGoogleClientId(): string {
  return import.meta.env.PUBLIC_GOOGLE_CLIENT_ID?.trim() || DEFAULT_PUBLIC_GOOGLE_CLIENT_ID
}

/** 应用鉴权状态补丁到工作区状态。 */
export function applyAuthStatePatch(state: WorkspaceState, patch: AuthStatePatch): void {
  if ('token' in patch) {
    state.token = patch.token ?? null
  }
  if ('user' in patch) {
    state.user = patch.user ?? null
  }
}

/** 打开登录弹窗。 */
export function openAuthModal(elements: WorkspaceElements): void {
  setHidden(elements.authModal, false)
}

/** 重置为 Google 优先的登录首屏。 */
export function resetAuthModalToGoogleFirst(elements: WorkspaceElements): void {
  setHidden(elements.authForm, true)
  setHidden(elements.emailEntry, false)
  setHidden(elements.emailCodeArea, true)
  setHidden(elements.loginSubmit, true)
  setHidden(elements.emailContinueButton, false)
}

/** 打开邮箱验证码子界面。 */
export function openEmailAuthForm(elements: WorkspaceElements): void {
  setHidden(elements.authForm, false)
  setHidden(elements.emailEntry, true)
  elements.loginEmail.focus()
}

/** 关闭登录弹窗。 */
export function closeAuthModal(elements: WorkspaceElements): void {
  cancelGoogleRedirectPrompt('Workspace auth modal closed.')
  setHidden(elements.authModal, true)
}

/** 构建清理登录态补丁。 */
export function clearAuthenticatedStatePatch(): AuthStatePatch {
  return {
    token: null,
    user: null
  }
}

/** 处理登录失效。 */
export function handleAuthInvalid(
  elements: WorkspaceElements,
  message: string
): AuthStatePatch {
  clearStoredAccessToken()
  resetAuthModalToGoogleFirst(elements)
  openAuthModal(elements)
  setMessage(elements.authError, message)
  return clearAuthenticatedStatePatch()
}

/** 从本地 token 恢复用户。 */
export async function restoreAuthenticatedState(state: WorkspaceState): Promise<AuthRestoreResult> {
  if (!state.token) {
    return { tokenFailed: false, patch: {} }
  }

  try {
    const user = await getCurrentUser(buildRequestContext(state))
    return {
      tokenFailed: false,
      patch: {
        user
      }
    }
  } catch (error) {
    console.error(error)
    if (error instanceof Error && isHomepageAuthFailure(error)) {
      clearStoredAccessToken()
      return {
        tokenFailed: true,
        patch: clearAuthenticatedStatePatch()
      }
    }
    return { tokenFailed: false, patch: {} }
  }
}

/** 发送邮箱验证码。 */
export async function handleSendCode(
  elements: WorkspaceElements,
  state: WorkspaceState,
  sendCodeCooldown: SendCodeCooldownController
): Promise<void> {
  cancelGoogleRedirectPrompt('Email code login selected in workspace.')
  const email = elements.loginEmail.value.trim()
  if (!email) {
    setMessage(elements.authError, state.copy.errors.enterEmailFirst)
    return
  }

  setMessage(elements.authError, '')
  elements.sendCodeButton.disabled = true
  elements.emailContinueButton.disabled = true
  elements.sendCodeStatus.textContent = state.copy.auth.sendingCode

  try {
    await sendEmailCode(email, buildRequestContext(state))
    elements.sendCodeStatus.textContent = state.copy.auth.sendCodeSuccess
    setHidden(elements.authForm, false)
    setHidden(elements.emailEntry, true)
    setHidden(elements.emailCodeArea, false)
    setHidden(elements.loginSubmit, false)
    setHidden(elements.emailContinueButton, true)
    sendCodeCooldown.start()
  } catch (error) {
    console.error(error)
    setMessage(
      elements.authError,
      error instanceof Error ? error.message : state.copy.errors.sendCodeFailed
    )
    elements.sendCodeStatus.textContent = ''
    sendCodeCooldown.reset()
  } finally {
    if (!sendCodeCooldown.isActive()) {
      elements.sendCodeButton.disabled = false
    }
    elements.emailContinueButton.disabled = false
  }
}

/** Google 登录。 */
export async function handleGoogleLogin(
  elements: WorkspaceElements,
  state: WorkspaceState,
  options: GoogleRedirectPromptOptions = {}
): Promise<AuthStatePatch | null> {
  const source = options.source ?? 'workspace_manual'
  const silentFailure = options.silentFailure === true
  const clientId = getGoogleClientId()
  logGoogleAuthStage('info', 'workspace_google_login_start', {
    source,
    silentFailure,
    hasClientId: Boolean(clientId)
  })
  if (!clientId) {
    logGoogleAuthStage('error', 'workspace_google_client_id_missing', { source, silentFailure })
    if (!options.silentFailure) {
      setMessage(elements.authError, state.copy.errors.googleClientMissing)
    }
    return null
  }

  if (!options.silentFailure) {
    setMessage(elements.authError, '')
  }
  try {
    await requestGoogleRedirectPrompt(clientId, buildRequestContext(state), options)
    logGoogleAuthStage('info', 'workspace_google_redirect_prompt_requested', {
      source,
      silentFailure
    })
    return null
  } catch (error) {
    logGoogleAuthStage(options.silentFailure ? 'warn' : 'error', 'workspace_google_login_error', {
      source,
      silentFailure,
      message: error instanceof Error ? error.message : String(error)
    })
    if (!options.silentFailure) {
      console.error(error)
      setMessage(
        elements.authError,
        error instanceof Error ? error.message : state.copy.errors.googleSignInFailed
      )
    }
    return null
  } finally {
    logGoogleAuthStage('info', 'workspace_google_login_finish', {
      source,
      silentFailure
    })
  }
}

/** 邮箱验证码登录。 */
export async function handleLogin(
  elements: WorkspaceElements,
  state: WorkspaceState
): Promise<AuthStatePatch | null> {
  cancelGoogleRedirectPrompt('Email code form submitted in workspace.')
  const email = elements.loginEmail.value.trim()
  const code = elements.loginCode.value.trim()

  if (!email || !code) {
    setMessage(elements.authError, state.copy.errors.enterEmailAndCode)
    return null
  }

  setMessage(elements.authError, '')
  elements.loginSubmit.disabled = true

  try {
    const response = await loginWithEmailCode(email, code, buildRequestContext(state))
    const patch = await refreshAuthenticatedUser(state, response.access_token)
    elements.sendCodeStatus.textContent = ''
    closeAuthModal(elements)

    return patch
  } catch (error) {
    console.error(error)
    setMessage(
      elements.authError,
      error instanceof Error ? error.message : state.copy.errors.signInFailed
    )
    return null
  } finally {
    elements.loginSubmit.disabled = false
  }
}
