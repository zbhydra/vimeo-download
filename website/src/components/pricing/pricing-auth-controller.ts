/**
 * Pricing 登录弹窗控制器。
 *
 * 接管 PricingAuthModal 的 DOM，复用 scripts/runtime/auth 登录能力，只保留页面需要的
 * open/close、Google redirect、邮箱验证码和登录成功事件。
 */

import {
  cancelGoogleRedirectPrompt,
  clearGoogleRedirectResult,
  DEFAULT_PUBLIC_GOOGLE_CLIENT_ID,
  exchangeGoogleLoginCode,
  getCurrentUser,
  isEmailVerificationRequiredResponse,
  logGoogleAuthStage,
  loginWithEmailCode,
  readGoogleRedirectResult,
  renderGoogleRedirectButton,
  requestGoogleRedirectPrompt,
  sendEmailCode,
  type GoogleLoginResponse,
  type GoogleRedirectPromptOptions,
  type HomepageUserInfo
} from '../../scripts/runtime/auth'
import { ensureDeviceId } from '../../scripts/runtime/device'
import type { RequestContext } from '../../scripts/runtime/api'
import { createSendCodeCooldown } from '../../scripts/runtime/sendCodeCooldown'

/** Pricing 登录成功事件。 */
export const PRICING_AUTH_SUCCESS_EVENT = 'pricing-auth:success'
/** 用户主动关闭 Pricing 登录弹窗事件。 */
export const PRICING_AUTH_CLOSE_EVENT = 'pricing-auth:close'

/** Pricing 登录弹窗 controller 对外接口。 */
export interface PricingAuthController {
  /** 打开登录弹窗。 */
  open(): void
  /** 关闭登录弹窗。 */
  close(): void
}

/** 登录成功事件 payload。 */
export interface PricingAuthSuccessPayload {
  /** 最新 access token。 */
  token: string
  /** auth/me 刷新的用户资料。 */
  user: HomepageUserInfo
}

/** 登录弹窗 DOM 集合。 */
interface PricingAuthElements {
  /** 组件根节点。 */
  root: HTMLElement
  /** 弹窗根节点。 */
  modal: HTMLElement
  /** 关闭按钮。 */
  closeButtons: HTMLButtonElement[]
  /** 错误文本。 */
  authError: HTMLElement
  /** 邮箱验证码表单。 */
  authForm: HTMLFormElement
  /** 邮箱验证码区域。 */
  emailCodeArea: HTMLElement
  /** 邮箱继续按钮。 */
  emailContinueButton: HTMLButtonElement
  /** Google 登录容器。 */
  googleLoginButton: HTMLElement
  /** 邮箱入口容器。 */
  emailEntry: HTMLElement
  /** 邮箱入口按钮。 */
  emailEntryButton: HTMLButtonElement
  /** 邮箱输入框。 */
  loginEmail: HTMLInputElement
  /** 验证码输入框。 */
  loginCode: HTMLInputElement
  /** 发送验证码按钮。 */
  sendCodeButton: HTMLButtonElement
  /** 验证码状态。 */
  sendCodeStatus: HTMLElement
  /** 登录提交按钮。 */
  loginSubmit: HTMLButtonElement
}

/** Pricing 登录弹窗文案。 */
interface PricingAuthPayload {
  /** 发送验证码中。 */
  sendingCode: string
  /** 验证码发送成功。 */
  sendCodeSuccess: string
  /** Google 按钮文案。 */
  continueWithGoogle: string
  /** Google 跳转中文案。 */
  googleLoading: string
  /** 必填邮箱错误。 */
  enterEmailFirst: string
  /** 邮箱和验证码必填错误。 */
  enterEmailAndCode: string
  /** 发送验证码失败。 */
  sendCodeFailed: string
  /** Google 登录失败。 */
  googleSignInFailed: string
  /** Google Client ID 缺失。 */
  googleClientMissing: string
  /** 邮箱登录失败。 */
  signInFailed: string
}

let deviceIdPromise: Promise<string> | null = null

/** 创建 Pricing 登录弹窗 controller。 */
export function createPricingAuthController(root: HTMLElement): PricingAuthController {
  const elements = getPricingAuthElements(root)
  const copy = getPricingAuthCopy(root)
  const sendCodeCooldown = createSendCodeCooldown(
    elements.sendCodeButton,
    elements.sendCodeButton.textContent?.trim() || 'Send again'
  )
  let googleRedirectButtonRendered = false
  let token: string | null = null

  const buildRequestContext = async (): Promise<RequestContext> => ({
    deviceId: await getPricingDeviceId(),
    token
  })

  const openEmailForm = (): void => {
    setHidden(elements.authForm, false)
    setHidden(elements.emailEntry, true)
    elements.loginEmail.focus()
  }

  const openCodeArea = (): void => {
    setHidden(elements.authForm, false)
    setHidden(elements.emailEntry, true)
    setHidden(elements.emailCodeArea, false)
    setHidden(elements.loginSubmit, false)
    setHidden(elements.emailContinueButton, true)
  }

  const resetToGoogleFirst = (): void => {
    setMessage(elements.authError, '')
    setHidden(elements.authForm, true)
    setHidden(elements.emailEntry, false)
    setHidden(elements.emailCodeArea, true)
    setHidden(elements.loginSubmit, true)
    setHidden(elements.emailContinueButton, false)
    elements.sendCodeStatus.textContent = ''
  }

  const hide = (): void => {
    cancelGoogleRedirectPrompt('Pricing auth modal closed.')
    setHidden(elements.modal, true)
  }

  const close = (): void => {
    hide()
    window.dispatchEvent(new CustomEvent(PRICING_AUTH_CLOSE_EVENT))
  }

  const finishLogin = async (accessToken: string): Promise<void> => {
    token = accessToken
    const user = await getCurrentUser(await buildRequestContext())
    hide()
    window.dispatchEvent(new CustomEvent<PricingAuthSuccessPayload>(PRICING_AUTH_SUCCESS_EVENT, {
      detail: { token: accessToken, user }
    }))
  }

  const handleGoogleCredentialLogin = async (
    response: GoogleLoginResponse,
    credentialSource: string
  ): Promise<void> => {
    logGoogleAuthStage('info', 'pricing_google_one_tap_backend_response', {
      credentialSource,
      requiresEmailVerification: isEmailVerificationRequiredResponse(response)
    })

    if (isEmailVerificationRequiredResponse(response)) {
      controller.open()
      openEmailForm()
      elements.loginEmail.value = response.email
      elements.loginCode.value = ''
      elements.sendCodeStatus.textContent = copy.sendCodeSuccess
      openCodeArea()
      sendCodeCooldown.start()
      return
    }

    await finishLogin(response.access_token)
  }

  const ensureGoogleRedirectButtonRendered = (): void => {
    if (googleRedirectButtonRendered) {
      return
    }
    const clientId = getGoogleClientId()
    if (!clientId) {
      logGoogleAuthStage('error', 'pricing_redirect_button_client_id_missing')
      setMessage(elements.authError, copy.googleClientMissing)
      return
    }

    try {
      renderGoogleRedirectButton(elements.googleLoginButton, clientId, {
        source: 'pricing_google_button',
        label: copy.continueWithGoogle,
        loadingLabel: copy.googleLoading
      })
      googleRedirectButtonRendered = true
    } catch (error) {
      console.error(error)
      setMessage(elements.authError, error instanceof Error ? error.message : copy.googleSignInFailed)
    }
  }

  const runGoogleLogin = async (options: GoogleRedirectPromptOptions = {}): Promise<void> => {
    const clientId = getGoogleClientId()
    if (!clientId) {
      setMessage(elements.authError, copy.googleClientMissing)
      return
    }

    try {
      await requestGoogleRedirectPrompt(clientId, await buildRequestContext(), {
        ...options,
        onCredentialLogin: handleGoogleCredentialLogin
      })
    } catch (error) {
      if (!options.silentFailure) {
        console.error(error)
        setMessage(elements.authError, error instanceof Error ? error.message : copy.googleSignInFailed)
      }
    }
  }

  const handleGoogleRedirectResult = async (): Promise<void> => {
    const result = readGoogleRedirectResult()
    if (!result) {
      return
    }

    clearGoogleRedirectResult()
    if (result.emailVerificationEmail) {
      controller.open()
      openEmailForm()
      elements.loginEmail.value = result.emailVerificationEmail
      elements.loginCode.value = ''
      elements.sendCodeStatus.textContent = copy.sendCodeSuccess
      openCodeArea()
      sendCodeCooldown.start()
      return
    }

    if (result.error || !result.code) {
      controller.open()
      setMessage(elements.authError, copy.googleSignInFailed)
      return
    }

    try {
      const response = await exchangeGoogleLoginCode(result.code, await buildRequestContext())
      await finishLogin(response.access_token)
    } catch (error) {
      console.error(error)
      controller.open()
      setMessage(elements.authError, error instanceof Error ? error.message : copy.googleSignInFailed)
    }
  }

  const controller: PricingAuthController = {
    open(): void {
      resetToGoogleFirst()
      setHidden(elements.modal, false)
      ensureGoogleRedirectButtonRendered()
      void runGoogleLogin({ silentFailure: true, source: 'pricing_auto_prompt' })
    },
    close
  }

  elements.closeButtons.forEach(button => {
    button.addEventListener('click', () => controller.close())
  })
  elements.emailEntryButton.addEventListener('click', () => {
    cancelGoogleRedirectPrompt('Email code login selected in pricing.')
    openEmailForm()
  })
  elements.emailContinueButton.addEventListener('click', () => {
    void sendCode()
  })
  elements.sendCodeButton.addEventListener('click', () => {
    void sendCode()
  })
  elements.authForm.addEventListener('submit', event => {
    event.preventDefault()
    void loginWithCode()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !elements.modal.hidden) {
      controller.close()
    }
  })

  ensureGoogleRedirectButtonRendered()
  void handleGoogleRedirectResult()

  return controller

  async function sendCode(): Promise<void> {
    const email = elements.loginEmail.value.trim()
    if (!email) {
      setMessage(elements.authError, copy.enterEmailFirst)
      return
    }

    setMessage(elements.authError, '')
    elements.sendCodeButton.disabled = true
    elements.emailContinueButton.disabled = true
    elements.sendCodeStatus.textContent = copy.sendingCode

    try {
      await sendEmailCode(email, await buildRequestContext())
      elements.sendCodeStatus.textContent = copy.sendCodeSuccess
      openCodeArea()
      sendCodeCooldown.start()
    } catch (error) {
      console.error(error)
      setMessage(elements.authError, error instanceof Error ? error.message : copy.sendCodeFailed)
      elements.sendCodeStatus.textContent = ''
      sendCodeCooldown.reset()
    } finally {
      if (!sendCodeCooldown.isActive()) {
        elements.sendCodeButton.disabled = false
      }
      elements.emailContinueButton.disabled = false
    }
  }

  async function loginWithCode(): Promise<void> {
    const email = elements.loginEmail.value.trim()
    const code = elements.loginCode.value.trim()
    if (!email || !code) {
      setMessage(elements.authError, copy.enterEmailAndCode)
      return
    }

    setMessage(elements.authError, '')
    elements.loginSubmit.disabled = true
    try {
      const response = await loginWithEmailCode(email, code, await buildRequestContext())
      await finishLogin(response.access_token)
    } catch (error) {
      console.error(error)
      setMessage(elements.authError, error instanceof Error ? error.message : copy.signInFailed)
    } finally {
      elements.loginSubmit.disabled = false
    }
  }
}

function getPricingAuthElements(root: HTMLElement): PricingAuthElements {
  const query = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector)
    if (!element) {
      throw new Error(`[pricing-auth-controller] Missing element: ${selector}`)
    }
    return element
  }

  return {
    root,
    modal: query<HTMLElement>('[data-pricing-auth-modal]'),
    closeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-pricing-auth-close]')),
    authError: query<HTMLElement>('[data-pricing-auth-error]'),
    authForm: query<HTMLFormElement>('[data-pricing-auth-form]'),
    emailCodeArea: query<HTMLElement>('[data-pricing-auth-email-code-area]'),
    emailContinueButton: query<HTMLButtonElement>('[data-pricing-auth-continue-email]'),
    googleLoginButton: query<HTMLElement>('[data-pricing-auth-google-login]'),
    emailEntry: query<HTMLElement>('[data-pricing-auth-email-entry]'),
    emailEntryButton: query<HTMLButtonElement>('[data-pricing-auth-email-entry-button]'),
    loginEmail: query<HTMLInputElement>('[data-pricing-auth-login-email]'),
    loginCode: query<HTMLInputElement>('[data-pricing-auth-login-code]'),
    sendCodeButton: query<HTMLButtonElement>('[data-pricing-auth-send-code]'),
    sendCodeStatus: query<HTMLElement>('[data-pricing-auth-send-code-status]'),
    loginSubmit: query<HTMLButtonElement>('[data-pricing-auth-login-submit]')
  }
}

function getPricingAuthCopy(root: HTMLElement): PricingAuthPayload {
  const element = root.querySelector<HTMLScriptElement>('[data-pricing-auth-copy]')
  if (!element?.textContent) {
    throw new Error('[pricing-auth-controller] Missing pricing auth copy payload.')
  }
  return JSON.parse(element.textContent) as PricingAuthPayload
}

function getGoogleClientId(): string {
  return import.meta.env.PUBLIC_GOOGLE_CLIENT_ID?.trim() || DEFAULT_PUBLIC_GOOGLE_CLIENT_ID
}

function getPricingDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = ensureDeviceId()
  }
  return deviceIdPromise
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden
}

function setMessage(element: HTMLElement, message: string): void {
  element.textContent = message
  element.hidden = message.length === 0
}

declare global {
  interface Window {
    /** Pricing 页面登录弹窗 controller。 */
    pricingAuthController?: PricingAuthController
  }
}

const root = document.querySelector<HTMLElement>('[data-pricing-auth-root]')
if (root) {
  window.pricingAuthController = createPricingAuthController(root)
}
