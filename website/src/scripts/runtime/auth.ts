/**
 * 用户认证模块
 *
 * 处理用户登录、登出、token 管理等认证相关功能。
 * 使用 Google 或邮箱验证码方式登录，token 存储在 localStorage 中。
 */

import { getApiBaseUrl, getJson, postJson, type RequestContext } from './api'
import { ensureDeviceId, ensureFirstOpenedAt } from './device'
export { ACCESS_TOKEN_STORAGE_KEY } from './runtime-storage-keys'
import { ACCESS_TOKEN_STORAGE_KEY } from './runtime-storage-keys'

export interface HomepageUserInfo {
  /** 后端用户 ID。 */
  user_id?: number
  /** 登录邮箱。 */
  email: string
  /** 用户展示名；为空时前端回退邮箱。 */
  full_name?: string | null
  /** 用户头像 URL；为空时前端回退到邮箱首字母。 */
  avatar_url?: string | null
  /** 后端账号创建时间，毫秒时间戳。 */
  created_at: number
  /** 当前订阅权益摘要；未登录或后端缺省时为空。 */
  subscription?: HomepageUserSubscription | null
}

/** 官网订阅状态接口保留 period 兼容字段，仅表达当前有效计费口径；lifetime 为一次性终生权益。 */
export type HomepageSubscriptionPeriod =
  | 'free'
  | 'month'
  | 'quarter'
  | 'year'
  | 'lifetime'
  | 'unavailable'

/** auth/me 返回的订阅权益摘要。 */
export interface HomepageUserSubscription {
  /** 订阅状态；unavailable 表示订阅配置异常，仅影响权益展示。 */
  status?: 'active' | 'unavailable'
  /** 订阅周期；unavailable 表示配置不可用等异常态。 */
  period: HomepageSubscriptionPeriod
  /** 展示名称，例如 Free 或 Unlimited。 */
  display_name: string
  /** 到期时间，后端可能返回秒或毫秒时间戳；为空表示无到期时间。 */
  expires_at: number | null
  /** 每日下载额度；小于 0 时前端展示为无限。 */
  daily_limit: number
  /** 今日已使用次数。 */
  used: number
  /** 今日剩余次数；小于 0 时前端展示为无限。 */
  remaining: number
  /** 下次重置日期。 */
  reset_date: string
  /** 是否自动续费。 */
  auto_renew: boolean
}

/**
 * 登录响应
 */
export interface LoginResponse {
  /** 访问令牌，用于后续请求认证 */
  access_token: string
  /** 当前用户摘要 */
  user?: HomepageUserInfo
}

interface GoogleIdentityInitializeConfig {
  /** Google OAuth Client ID。 */
  client_id: string
  /** One Tap 返回 credential 后的回调。 */
  callback(response: GoogleCredentialResponse): void
  /** 不自动选择账号，避免用户点击后无感登录。 */
  auto_select?: boolean
  /** 允许用户点击外部关闭弹窗。 */
  cancel_on_tap_outside?: boolean
}

interface GooglePromptMomentNotification {
  isNotDisplayed?(): boolean
  isSkippedMoment?(): boolean
  isDismissedMoment?(): boolean
  getNotDisplayedReason?(): string
  getSkippedReason?(): string
  getDismissedReason?(): string
}

type GooglePromptMomentListener = (notification: GooglePromptMomentNotification) => void

interface GoogleCredentialResponse {
  /** Google Identity Services 返回的 ID token。 */
  credential?: string
  /** Google 返回的选择方式，例如 user_1tap。 */
  select_by?: string
}

type GoogleCredentialLoginHandler = (
  response: GoogleLoginResponse,
  credentialSource: string
) => void | Promise<void>

interface GoogleIdentity {
  initialize(config: GoogleIdentityInitializeConfig): void
  prompt(listener?: GooglePromptMomentListener): void
  cancel(): void
}

interface GoogleAccounts {
  id: GoogleIdentity
}

export interface GoogleRedirectPromptOptions {
  /** 静默尝试失败时不展示用户错误文案。 */
  silentFailure?: boolean
  /** 调用来源，用于浏览器控制台排查登录阶段。 */
  source?: string
  /** One Tap credential 登录完成后的业务回调。 */
  onCredentialLogin?: GoogleCredentialLoginHandler
}

export interface GoogleButtonRenderOptions {
  /** 调用来源，用于浏览器控制台排查按钮渲染阶段。 */
  source?: string
  /** 按钮文案，默认读取容器 aria-label。 */
  label?: string
  /** 点击后进入 OAuth 前展示的 loading 文案。 */
  loadingLabel?: string
}

export type GoogleAuthDebugLevel = 'info' | 'warn' | 'error'
export type GoogleAuthDebugValue = string | number | boolean | null
export type GoogleAuthDebugDetails = Record<string, GoogleAuthDebugValue>

export interface GoogleRedirectResult {
  /** 后端短效一次性登录 code。 */
  code?: string
  /** 非权威 Google 邮箱已发送验证码，需要前端展开邮箱验证码。 */
  emailVerificationEmail?: string
  /** Google redirect 登录失败原因。 */
  error?: string
}

export interface EmailVerificationRequiredResponse {
  /** Google 邮箱需要再完成邮箱验证码确认。 */
  requires_email_verification: true
  /** 服务端从 Google token 验证出的邮箱。 */
  email: string
}

export type GoogleLoginResponse = LoginResponse | EmailVerificationRequiredResponse

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccounts
    }
  }
}

const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const GOOGLE_OAUTH_AUTHORIZE_PATH = '/api/client/auth/google/oauth/authorize'
const GOOGLE_REDIRECT_CODE_PARAM = 'google_login_code'
const GOOGLE_REDIRECT_ERROR_PARAM = 'google_login_error'
const GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM = 'google_email_verification'
const GOOGLE_AUTH_LOG_PREFIX = '[GoogleAuth]'
const GOOGLE_BUTTON_DEFAULT_LABEL = 'Continue with Google'
const GOOGLE_BUTTON_LOADING_LABEL = 'Connecting...'
/**
 * 网站默认 Google OAuth Client ID；公开 ID，不包含 secret，可被环境变量覆盖。
 * 占位值待替换：必须在 Google Cloud Console 建本项目自己的 OAuth client，
 * 并保证与后端 `auth.google_client_id` 完全一致（前端取 id_token、后端校验 aud，两侧不同则登录必失败）。
 */
export const DEFAULT_PUBLIC_GOOGLE_CLIENT_ID =
  'CHANGE_ME.apps.googleusercontent.com'
const GOOGLE_BUTTON_ICON_SVG =
  '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="12 10 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M31.6 20.2273C31.6 19.5182 31.5364 18.8364 31.4182 18.1818H22V22.05H27.3818C27.15 23.3 26.4455 24.3591 25.3864 25.0682V27.5773H28.6182C30.5091 25.8364 31.6 23.2727 31.6 20.2273V20.2273Z" fill="#4285F4"/>' +
  '<path d="M22 30C24.7 30 26.9636 29.1045 28.6181 27.5773L25.3863 25.0682C24.4909 25.6682 23.3454 26.0227 22 26.0227C19.3954 26.0227 17.1909 24.2636 16.4045 21.9H13.0636V24.4909C14.7091 27.7591 18.0909 30 22 30Z" fill="#34A853"/>' +
  '<path d="M16.4045 21.9C16.2045 21.3 16.0909 20.6591 16.0909 20C16.0909 19.3409 16.2045 18.7 16.4045 18.1V15.5091H13.0636C12.3864 16.8591 12 18.3864 12 20C12 21.6136 12.3864 23.1409 13.0636 24.4909L16.4045 21.9V21.9Z" fill="#FBBC04"/>' +
  '<path d="M22 13.9773C23.4681 13.9773 24.7863 14.4818 25.8227 15.4727L28.6909 12.6045C26.9591 10.9909 24.6954 10 22 10C18.0909 10 14.7091 12.2409 13.0636 15.5091L16.4045 18.1C17.1909 15.7364 19.3954 13.9773 22 13.9773Z" fill="#E94235"/>' +
  '</svg>'
let googleIdentityScriptPromise: Promise<void> | null = null
let googleInitializedClientId: string | null = null
let nextGoogleRedirectPromptId = 1
let googleCredentialLoginHandler: GoogleCredentialLoginHandler | null = null
let googleCredentialRequestContext: RequestContext | null = null

/**
 * 从 localStorage 获取已存储的访问令牌
 *
 * @returns 访问令牌，如果不存在则返回 null
 */
export function getStoredAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
}

/**
 * 存储访问令牌到 localStorage
 *
 * @param token - 要存储的访问令牌
 */
export function setStoredAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
}

/**
 * 清除 localStorage 中的访问令牌
 *
 * 用于登出或 token 失效时清理
 */
export function clearStoredAccessToken(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
}

/**
 * 发送邮箱验证码
 *
 * 向指定邮箱发送登录验证码，验证码有效期通常为几分钟。
 *
 * @param email - 目标邮箱地址
 * @param context - 请求上下文
 */
export async function sendEmailCode(email: string, context: RequestContext): Promise<void> {
  await postJson('/api/client/auth/send-email-code', context, { email })
}

/** 注册归因沿用当前设备与首次打开时间。 */
export function getRegistrationContext(deviceId: string) {
  return {
    registration_entry: null,
    register_device_id: deviceId,
    first_opened_at: ensureFirstOpenedAt()
  }
}

/**
 * 使用邮箱验证码登录
 *
 * 验证通过后会自动存储返回的访问令牌。
 *
 * @param email - 邮箱地址
 * @param code - 验证码
 * @param context - 请求上下文
 * @returns 登录响应，包含访问令牌和可能的用户信息
 */
export async function loginWithEmailCode(
  email: string,
  code: string,
  context: RequestContext
): Promise<LoginResponse> {
  const response = await postJson<LoginResponse>('/api/client/auth/email-verify-login', context, {
    email,
    code,
    ...getRegistrationContext(context.deviceId)
  })

  // 登录成功后自动存储 token
  setStoredAccessToken(response.access_token)
  return response
}

/** 判断 Google 登录响应是否需要邮箱验证码兜底。 */
export function isEmailVerificationRequiredResponse(
  response: GoogleLoginResponse
): response is EmailVerificationRequiredResponse {
  return 'requires_email_verification' in response && response.requires_email_verification === true
}

/** 使用 One Tap 返回的 Google credential 登录。 */
export async function loginWithGoogleCredential(
  credential: string,
  context: RequestContext
): Promise<GoogleLoginResponse> {
  logGoogleAuthStage('info', 'one_tap_backend_login_start', {
    credentialLength: credential.length,
    hasToken: Boolean(context.token),
    deviceId: context.deviceId
  })

  let response: GoogleLoginResponse
  try {
    response = await postJson<GoogleLoginResponse>('/api/client/auth/google-login', context, {
      credential,
      ...getRegistrationContext(context.deviceId)
    })
  } catch (error) {
    logGoogleAuthStage('error', 'one_tap_backend_login_error', {
      message: error instanceof Error ? error.message : String(error)
    })
    throw error
  }

  if (!isEmailVerificationRequiredResponse(response)) {
    setStoredAccessToken(response.access_token)
  }
  logGoogleAuthStage('info', 'one_tap_backend_login_success', {
    requiresEmailVerification: isEmailVerificationRequiredResponse(response),
    hasUser: !isEmailVerificationRequiredResponse(response) && Boolean(response.user),
    userId: !isEmailVerificationRequiredResponse(response)
      ? response.user?.user_id ?? null
      : null
  })
  return response
}

/** 使用 Google redirect 一次性 code 换取项目登录 token。 */
export async function exchangeGoogleLoginCode(
  code: string,
  context: RequestContext
): Promise<LoginResponse> {
  logGoogleAuthStage('info', 'redirect_exchange_request_start', {
    codeLength: code.length,
    hasToken: Boolean(context.token),
    deviceId: context.deviceId
  })

  let response: LoginResponse
  try {
    response = await postJson<LoginResponse>('/api/client/auth/google/exchange', context, {
      code
    })
  } catch (error) {
    logGoogleAuthStage('error', 'redirect_exchange_request_error', {
      message: error instanceof Error ? error.message : String(error)
    })
    throw error
  }

  setStoredAccessToken(response.access_token)
  logGoogleAuthStage('info', 'redirect_exchange_success', {
    hasUser: Boolean(response.user),
    userId: response.user?.user_id ?? null
  })
  return response
}

/** 渲染自定义手动 Google 登录按钮，点击后跳转后端 OAuth authorize。 */
export function renderGoogleRedirectButton(
  container: HTMLElement,
  clientId: string,
  options: GoogleButtonRenderOptions = {}
): void {
  const source = options.source ?? 'google_button'
  const label = options.label ?? container.getAttribute('aria-label') ?? GOOGLE_BUTTON_DEFAULT_LABEL
  const loadingLabel = options.loadingLabel ?? GOOGLE_BUTTON_LOADING_LABEL
  logGoogleAuthStage('info', 'oauth_button_render_start', {
    source,
    hasClientId: Boolean(clientId),
    clientId: redactGoogleClientId(clientId)
  })

  container.textContent = ''
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'btn-secondary google-oauth-button'
  button.dataset.googleOauthButton = 'true'
  button.setAttribute('aria-label', label)
  button.append(createGoogleButtonIcon(), createGoogleButtonText(label))

  button.addEventListener('click', async () => {
    logGoogleAuthStage('info', 'oauth_button_click', { source })
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
    const labelElement = button.querySelector<HTMLElement>('[data-google-oauth-button-label]')
    if (labelElement) {
      labelElement.textContent = loadingLabel
    }
    try {
      window.location.assign(getGoogleOAuthAuthorizeUrl(await ensureDeviceId()))
    } catch (error) {
      console.error('[GoogleAuth] 准备登录跳转失败:', error)
      button.disabled = false
      button.removeAttribute('aria-busy')
      if (labelElement) labelElement.textContent = label
    }
  })

  container.append(button)
  logGoogleAuthStage('info', 'oauth_button_render_success', { source })
}

/** 读取 Google redirect 回跳参数。 */
export function readGoogleRedirectResult(): GoogleRedirectResult | null {
  const params = new URL(window.location.href).searchParams
  const code = params.get(GOOGLE_REDIRECT_CODE_PARAM)?.trim()
  const emailVerificationEmail = params.get(GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM)?.trim()
  const error = params.get(GOOGLE_REDIRECT_ERROR_PARAM)?.trim()

  if (!code && !emailVerificationEmail && !error) {
    return null
  }

  return {
    code: code || undefined,
    emailVerificationEmail: emailVerificationEmail || undefined,
    error: error || undefined
  }
}

/** 清理 Google redirect 回跳参数，避免刷新页面重复换票。 */
export function clearGoogleRedirectResult(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(GOOGLE_REDIRECT_CODE_PARAM)
  url.searchParams.delete(GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM)
  url.searchParams.delete(GOOGLE_REDIRECT_ERROR_PARAM)
  window.history.replaceState(window.history.state, '', url)
}

/**
 * 懒加载 Google Identity Services 并触发 One Tap。
 */
export async function requestGoogleRedirectPrompt(
  clientId: string,
  context: RequestContext,
  options: GoogleRedirectPromptOptions = {}
): Promise<void> {
  const requestId = nextGoogleRedirectPromptId
  nextGoogleRedirectPromptId += 1
  const source = options.source ?? 'manual'
  const silentFailure = options.silentFailure === true

  logGoogleAuthStage('info', 'redirect_prompt_request_start', {
    requestId,
    source,
    silentFailure,
    clientId: redactGoogleClientId(clientId),
    origin: getCurrentOriginForDebug()
  })

  try {
    logGoogleAuthStage('info', 'gis_script_ensure_start', { requestId, source })
    await loadGoogleIdentityScript()
    logGoogleAuthStage('info', 'gis_script_ensure_ready', { requestId, source })
  } catch (error) {
    logGoogleAuthStage('error', 'gis_script_ensure_error', {
      requestId,
      source,
      message: error instanceof Error ? error.message : String(error)
    })
    throw error
  }

  const googleIdentity = window.google?.accounts?.id
  if (!googleIdentity) {
    logGoogleAuthStage('error', 'gis_object_missing', { requestId, source })
    throw new Error('Google Identity Services is not available.')
  }

  try {
    ensureGoogleIdentityInitialized(googleIdentity, clientId, requestId, source)
  } catch (error) {
    logGoogleAuthStage('error', 'gis_initialize_error', {
      requestId,
      source,
      message: error instanceof Error ? error.message : String(error)
    })
    throw error instanceof Error ? error : new Error('Google Identity Services setup failed.')
  }

  googleCredentialLoginHandler = async (
    response: GoogleLoginResponse,
    credentialSource: string
  ): Promise<void> => {
    logGoogleAuthStage('info', 'one_tap_login_response_received', {
      requestId,
      source,
      credentialSource,
      requiresEmailVerification: isEmailVerificationRequiredResponse(response)
    })
    await options.onCredentialLogin?.(response, credentialSource)
  }
  googleCredentialRequestContext = context

  try {
    logGoogleAuthStage('info', 'gis_one_tap_prompt_start', { requestId, source, silentFailure })
    googleIdentity.prompt(notification => {
      logGooglePromptMoment(notification, requestId, source, silentFailure)
    })
    logGoogleAuthStage('info', 'gis_one_tap_prompt_called', {
      requestId,
      source,
      silentFailure
    })
  } catch (error) {
    logGoogleAuthStage('error', 'gis_one_tap_prompt_error', {
      requestId,
      source,
      silentFailure,
      message: error instanceof Error ? error.message : String(error)
    })
    throw error instanceof Error ? error : new Error('Google sign-in prompt failed.')
  }
}

export function cancelGoogleRedirectPrompt(reason: string): void {
  googleCredentialLoginHandler = null
  googleCredentialRequestContext = null
  window.google?.accounts?.id?.cancel()
  logGoogleAuthStage('warn', 'redirect_prompt_cancelled', { reason })
}

function ensureGoogleIdentityInitialized(
  googleIdentity: GoogleIdentity,
  clientId: string,
  requestId: number,
  source: string
): void {
  if (googleInitializedClientId === clientId) {
    logGoogleAuthStage('info', 'gis_initialize_reuse', {
      requestId,
      source,
      clientId: redactGoogleClientId(clientId)
    })
    return
  }
  if (googleInitializedClientId) {
    logGoogleAuthStage('error', 'gis_initialize_client_mismatch', {
      requestId,
      source,
      activeClientId: redactGoogleClientId(googleInitializedClientId),
      nextClientId: redactGoogleClientId(clientId)
    })
    throw new Error('Google Identity Services is already initialized with another client ID.')
  }

  logGoogleAuthStage('info', 'gis_initialize_start', {
    requestId,
    source,
    clientId: redactGoogleClientId(clientId)
  })
  const initializeConfig: GoogleIdentityInitializeConfig = {
    client_id: clientId,
    callback: response => {
      void handleGoogleCredentialResponse(response)
    },
    auto_select: false,
    cancel_on_tap_outside: true
  }
  googleIdentity.initialize(initializeConfig)
  googleInitializedClientId = clientId
  logGoogleAuthStage('info', 'gis_initialize_success', {
    requestId,
    source,
    clientId: redactGoogleClientId(clientId)
  })
}

async function handleGoogleCredentialResponse(response: GoogleCredentialResponse): Promise<void> {
  const credentialSource = response.select_by ?? 'unknown'
  logGoogleAuthStage('info', 'one_tap_credential_callback', {
    hasCredential: Boolean(response.credential),
    credentialSource
  })

  const credential = response.credential?.trim()
  if (!credential) {
    logGoogleAuthStage('error', 'one_tap_credential_missing', { credentialSource })
    return
  }

  const handler = googleCredentialLoginHandler
  if (!handler) {
    logGoogleAuthStage('warn', 'one_tap_credential_handler_missing', { credentialSource })
    return
  }

  try {
    const context = getActiveGoogleCredentialContext()
    const loginResponse = await loginWithGoogleCredential(credential, context)
    await handler(loginResponse, credentialSource)
  } catch (error) {
    logGoogleAuthStage('error', 'one_tap_credential_handler_error', {
      credentialSource,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

function getActiveGoogleCredentialContext(): RequestContext {
  if (!googleCredentialRequestContext) {
    throw new Error('Google One Tap request context is unavailable.')
  }
  return googleCredentialRequestContext
}

function logGooglePromptMoment(
  notification: GooglePromptMomentNotification,
  requestId: number,
  source: string,
  silentFailure: boolean
): void {
  const notDisplayed = notification.isNotDisplayed?.() === true
  const skipped = notification.isSkippedMoment?.() === true
  const dismissed = notification.isDismissedMoment?.() === true
  let reason = ''

  if (notDisplayed) {
    reason = notification.getNotDisplayedReason?.() ?? ''
  } else if (skipped) {
    reason = notification.getSkippedReason?.() ?? ''
  } else if (dismissed) {
    reason = notification.getDismissedReason?.() ?? ''
  }

  logGoogleAuthStage(notDisplayed || skipped ? 'warn' : 'info', 'gis_redirect_prompt_moment', {
    requestId,
    source,
    silentFailure,
    notDisplayed,
    skipped,
    dismissed,
    reason
  })
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    logGoogleAuthStage('info', 'gis_script_already_available')
    return Promise.resolve()
  }

  if (googleIdentityScriptPromise) {
    logGoogleAuthStage('info', 'gis_script_promise_reuse')
    return googleIdentityScriptPromise
  }

  logGoogleAuthStage('info', 'gis_script_load_create')
  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const rejectAndAllowRetry = (script: HTMLScriptElement): void => {
      if (googleIdentityScriptPromise) {
        googleIdentityScriptPromise = null
      }
      script.remove()
      logGoogleAuthStage('error', 'gis_script_load_error')
      reject(new Error('Failed to load Google Identity Services.'))
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`
    )
    if (existingScript) {
      logGoogleAuthStage('info', 'gis_script_existing_tag_wait')
      existingScript.addEventListener('load', () => {
        logGoogleAuthStage('info', 'gis_script_existing_tag_loaded')
        resolve()
      }, { once: true })
      existingScript.addEventListener(
        'error',
        () => rejectAndAllowRetry(existingScript),
        { once: true }
      )
      return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => {
      logGoogleAuthStage('info', 'gis_script_load_success')
      resolve()
    }, { once: true })
    script.addEventListener(
      'error',
      () => rejectAndAllowRetry(script),
      { once: true }
    )
    document.head.append(script)
  })

  return googleIdentityScriptPromise
}

export function logGoogleAuthStage(
  level: GoogleAuthDebugLevel,
  stage: string,
  details: GoogleAuthDebugDetails = {}
): void {
  const payload = Object.keys(details).length > 0 ? details : undefined
  if (level === 'error') {
    if (payload) {
      console.error(GOOGLE_AUTH_LOG_PREFIX, stage, payload)
      return
    }
    console.error(GOOGLE_AUTH_LOG_PREFIX, stage)
    return
  }
  if (level === 'warn') {
    if (payload) {
      console.warn(GOOGLE_AUTH_LOG_PREFIX, stage, payload)
      return
    }
    console.warn(GOOGLE_AUTH_LOG_PREFIX, stage)
    return
  }
  if (payload) {
    console.info(GOOGLE_AUTH_LOG_PREFIX, stage, payload)
    return
  }
  console.info(GOOGLE_AUTH_LOG_PREFIX, stage)
}

function redactGoogleClientId(clientId: string): string {
  const visibleLength = 12
  if (clientId.length <= visibleLength) {
    return clientId
  }
  return `${clientId.slice(0, visibleLength)}...`
}

function getGoogleOAuthAuthorizeUrl(deviceId: string): string {
  const authorizeUrl = new URL(GOOGLE_OAUTH_AUTHORIZE_PATH, getApiBaseUrl())
  authorizeUrl.searchParams.set('return_to', getGoogleRedirectState(deviceId))
  return authorizeUrl.toString()
}

function getGoogleRedirectState(deviceId: string): string {
  const url = new URL(window.location.href)
  const registration = getRegistrationContext(deviceId)
  // 网站每次发起 OAuth 都使用自己的当前设备。
  url.searchParams.delete('register_device_id')
  url.searchParams.delete('first_opened_at')
  if (registration.register_device_id && registration.first_opened_at) {
    url.searchParams.set('register_device_id', registration.register_device_id)
    url.searchParams.set('first_opened_at', String(registration.first_opened_at))
  }
  url.searchParams.delete(GOOGLE_REDIRECT_CODE_PARAM)
  url.searchParams.delete(GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM)
  url.searchParams.delete(GOOGLE_REDIRECT_ERROR_PARAM)
  url.hash = ''
  return url.toString()
}

function getCurrentOriginForDebug(): string {
  return window.location?.origin || 'unknown-origin'
}

function createGoogleButtonIcon(): HTMLSpanElement {
  const icon = document.createElement('span')
  icon.className = 'google-oauth-button-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = GOOGLE_BUTTON_ICON_SVG
  return icon
}

function createGoogleButtonText(label: string): HTMLSpanElement {
  const text = document.createElement('span')
  text.dataset.googleOauthButtonLabel = 'true'
  text.textContent = label
  return text
}

/**
 * 登出当前用户。
 *
 * 仅通知后端撤销当前 access token，localStorage 清理由调用方决定。
 */
export async function logoutCurrentUser(context: RequestContext): Promise<void> {
  await postJson<Record<string, never>>('/api/client/auth/logout', context)
}

/**
 * 获取当前登录用户。
 */
export async function getCurrentUser(context: RequestContext): Promise<HomepageUserInfo> {
  return getJson<HomepageUserInfo>('/api/client/auth/me', context)
}
