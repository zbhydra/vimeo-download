/**
 * 下载工作区入口编排。
 *
 * 负责初始化 DOM、state、snapshot 和事件绑定，具体鉴权、渲染、
 * 下载与错误映射分别交给 workspace-* 模块。
 */

import { bindAnonymousDownloadWorkspace } from './anonymous-download'
import {
  clearStoredAccessToken,
  clearGoogleRedirectResult,
  DEFAULT_PUBLIC_GOOGLE_CLIENT_ID,
  exchangeGoogleLoginCode,
  getStoredAccessToken,
  isEmailVerificationRequiredResponse,
  logGoogleAuthStage,
  logoutCurrentUser,
  readGoogleRedirectResult,
  renderGoogleRedirectButton,
  type GoogleLoginResponse,
  type GoogleRedirectPromptOptions
} from '../../homepage-runtime/auth'
import type { RequestContext } from '../../homepage-runtime/api'
import {
  CREDIT_PURCHASE_AUTH_INVALID_EVENT,
  CREDIT_PURCHASE_SUCCESS_EVENT,
  type CreditPurchaseSuccessPayload
} from '../../components/credit-purchase/credit-purchase-types'
import {
  claimDailyCheckin,
  enterCheckinCampaign,
  isHomepageCheckinEntryStale,
  type HomepageCheckinClaimResult,
  type HomepageCheckinEntryStatus
} from '../../homepage-runtime/checkin'
import { ensureDeviceId, getLegacyDeviceIds } from '../../homepage-runtime/device'
import { extractFailureReason, reportGA4Event, safeLinkHost } from '../../homepage-runtime/ga4'
import {
  buildHomepageParseFailedMarkMessage,
  buildHomepageMarkMessage,
  HOMEPAGE_MARK_TYPE,
  recordHomepageMark
} from '../../homepage-runtime/mark'
import { createSendCodeCooldown } from '../../homepage-runtime/sendCodeCooldown'
import { clearLegacyDownloadTaskState } from './download-legacy-state-cleanup'
import { parseMediaLink } from './media-api'
import { detectPlatform } from './platform'
import {
  DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY,
  buildDownloadWorkspaceOwner,
  clearDownloadWorkspaceSnapshot,
  isDownloadWorkspaceOwnerAllowed,
  loadDownloadWorkspaceSnapshot,
  saveDownloadParseSnapshot,
  type DownloadWorkspaceOwner,
  type DownloadWorkspaceSnapshot
} from './snapshot'
import type { MediaPost } from './types'
import { extractFirstValidUserLink } from './url'
import {
  applyAuthStatePatch,
  closeAuthModal,
  handleAuthInvalid,
  handleGoogleLogin,
  handleLogin,
  handleSendCode,
  openEmailAuthForm,
  openAuthModal,
  refreshAuthenticatedUser,
  resetAuthModalToGoogleFirst,
  restoreAuthenticatedState
} from './workspace-auth'
import {
  getCopy,
  getElements,
  mountAuthModalToBody,
  setHidden,
  setMessage,
  setParseErrorMessage,
  type WorkspaceElements
} from './workspace-elements'
import {
  handleDownloadAllClick,
  handleDownloadClick,
  handlePendingResumeContinue,
  handlePendingResumeDismiss,
  restorePendingDownloadTask,
  type WorkspaceDownloadCallbacks
} from './workspace-download'
import { mapErrorToCopy } from './workspace-errors'
import {
  renderAuthenticatedUi,
  renderCheckinModal,
  renderResults,
  updatePendingResumePrompt
} from './workspace-render'
import type { WorkspaceState } from './workspace-state'

const CHECKIN_AUTO_DISMISSED_STORAGE_PREFIX = 'download_checkin_auto_dismissed'

function buildRequestContext(state: WorkspaceState): RequestContext {
  return {
    deviceId: state.deviceId,
    token: state.token
  }
}

function getGoogleClientId(): string {
  return import.meta.env.PUBLIC_GOOGLE_CLIENT_ID?.trim() || DEFAULT_PUBLIC_GOOGLE_CLIENT_ID
}

function getUserId(state: WorkspaceState): number | null {
  const userId = state.user?.user_id ?? state.user?.id
  return typeof userId === 'number' && Number.isInteger(userId) && userId > 0 ? userId : null
}

function getRequiredUserId(state: WorkspaceState): number {
  const userId = getUserId(state)
  if (userId === null) {
    throw new Error('[download-workspace] checkin requires a logged-in user id.')
  }

  return userId
}

function getWorkspaceOwner(state: WorkspaceState): DownloadWorkspaceOwner {
  return buildDownloadWorkspaceOwner(state.deviceId, getUserId(state))
}

function buildCheckinAutoDismissedStorageKey(state: WorkspaceState, today: string): string {
  return `${CHECKIN_AUTO_DISMISSED_STORAGE_PREFIX}:${getRequiredUserId(state)}:${today}`
}

function hasDismissedCheckinAutoPopup(state: WorkspaceState, checkin: HomepageCheckinEntryStatus): boolean {
  try {
    return window.localStorage.getItem(buildCheckinAutoDismissedStorageKey(state, checkin.today)) === '1'
  } catch (error) {
    console.error(error)
    return false
  }
}

function markCheckinAutoPopupDismissed(state: WorkspaceState): void {
  const checkin = state.checkin
  if (!checkin) {
    return
  }

  try {
    window.localStorage.setItem(buildCheckinAutoDismissedStorageKey(state, checkin.today), '1')
  } catch (error) {
    console.error(error)
  }
}

function shouldAutoOpenCheckin(state: WorkspaceState, checkin: HomepageCheckinEntryStatus): boolean {
  return (
    Boolean(state.user) &&
    !checkin.campaign_ended &&
    !checkin.today_claimed &&
    !hasDismissedCheckinAutoPopup(state, checkin)
  )
}

function buildCheckinEventParams(
  checkin: HomepageCheckinEntryStatus,
  source: 'auto' | 'manual'
): Record<string, string | number> {
  return {
    checkin_day_index: checkin.day_index,
    checkin_reward_today: checkin.today_reward_credits,
    checkin_popup_source: source
  }
}

function buildLocalParseClickMarkMessage(link: string, localPlatform: string): string {
  return JSON.stringify({
    url: link.slice(0, 240),
    local_platform: localPlatform
  })
}

function resourceTypes(resources: MediaPost[]): string {
  return Array.from(new Set(resources.map(resource => resource.type.split('/')[0]))).join(',')
}

function recordHomepageMarkSilently(
  markType: (typeof HOMEPAGE_MARK_TYPE)[keyof typeof HOMEPAGE_MARK_TYPE],
  state: WorkspaceState,
  markMsg = ''
): void {
  void recordHomepageMark(markType, buildRequestContext(state), markMsg).catch(() => {})
}

function recordParseFailureMark(
  state: WorkspaceState,
  link: string,
  reason: string,
  platform: string,
  linkHost: string,
  parseDurationMs: number,
  error: Error | string | null = null
): void {
  recordHomepageMarkSilently(
    HOMEPAGE_MARK_TYPE.WEB_PARSE_FAILED,
    state,
    buildHomepageParseFailedMarkMessage(link, {
      reason,
      platform,
      linkHost,
      parseDurationMs,
      error
    })
  )
}

function elapsedMs(startMs: number): number {
  return Math.max(0, Math.floor(performance.now() - startMs))
}

function getInvalidLinkError(state: WorkspaceState): string {
  return state.copy.errors.invalidLink || 'This is not a valid URL.'
}

/** 注册下载中的关闭/刷新确认提示。 */
function installActiveDownloadBeforeUnloadPrompt(state: WorkspaceState): void {
  window.addEventListener('beforeunload', event => {
    if (!state.activeDownload) {
      return
    }

    // beforeunload 的自定义文案会被现代浏览器忽略，这里只触发浏览器原生确认框。
    event.preventDefault()
    Reflect.set(event, 'returnValue', '')
  })
}

async function handleInvalidUserLink(
  elements: WorkspaceElements,
  state: WorkspaceState,
  onNewParse: () => void
): Promise<void> {
  await clearSubmittedWorkspaceData(elements, state, onNewParse)
  setParseErrorMessage(elements, getInvalidLinkError(state))
}

function applyAuthPatchAndRender(
  elements: WorkspaceElements,
  state: WorkspaceState,
  patch: Parameters<typeof applyAuthStatePatch>[1]
): void {
  applyAuthStatePatch(state, patch)
  if (
    ('token' in patch && patch.token === null) ||
    ('user' in patch && patch.user === null)
  ) {
    state.checkin = null
  }
  renderAuthenticatedUi(elements, state)
  renderResults(elements, state)
}

function setAccountMenuOpen(elements: WorkspaceElements, open: boolean): void {
  setHidden(elements.accountMenu, !open)
  elements.accountButton.setAttribute('aria-expanded', open ? 'true' : 'false')
}

function isCheckinModalOpen(elements: WorkspaceElements): boolean {
  return !elements.checkinModal.hidden
}

/** 取当前可展示的 Credits 余额。 */
function getCurrentCreditsBalance(state: WorkspaceState): number {
  const balance = state.checkin?.credits_balance ?? state.user?.credits_balance ?? 0
  return Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0
}

/** 只有今天确实可领时，积分入口才优先打开签到弹窗。 */
function isCheckinClaimable(checkin: HomepageCheckinEntryStatus | null): boolean {
  return (
    checkin !== null &&
    !checkin.campaign_ended &&
    !checkin.today_claimed &&
    checkin.today_reward_credits > 0
  )
}

function openCheckinModal(
  elements: WorkspaceElements,
  state: WorkspaceState,
  source: 'auto' | 'manual'
): void {
  if (
    !state.checkin ||
    state.checkin.campaign_ended ||
    (!state.checkin.today_claimed && state.checkin.today_reward_credits <= 0)
  ) {
    return
  }

  renderCheckinModal(elements, state)
  setHidden(elements.checkinError, true)
  setHidden(elements.checkinModal, false)
  reportGA4Event(
    source === 'auto' ? 'checkin_popup_auto_show' : 'checkin_popup_manual_open',
    buildCheckinEventParams(state.checkin, source)
  )
}

function closeCheckinModal(
  elements: WorkspaceElements,
  state: WorkspaceState,
  source: 'auto' | 'manual',
  markAutoDismissed: boolean
): void {
  if (markAutoDismissed) {
    markCheckinAutoPopupDismissed(state)
  }
  if (state.checkin) {
    reportGA4Event('checkin_popup_close', buildCheckinEventParams(state.checkin, source))
  }
  setHidden(elements.checkinModal, true)
  setHidden(elements.checkinError, true)
}

function buildCheckinStatusFromClaim(
  previous: HomepageCheckinEntryStatus,
  claim: HomepageCheckinClaimResult
): HomepageCheckinEntryStatus {
  return {
    ...previous,
    campaign_ended: claim.campaign_ended,
    today_claimed: claim.today_claimed,
    today_reward_credits: claim.reward_credits,
    credits_balance: claim.credits_balance,
    next_claim_at: claim.next_claim_at,
    next_claim_at_ts: claim.next_claim_at_ts,
    total_claim_days: previous.total_claim_days + (previous.today_claimed ? 0 : 1)
  }
}

async function refreshCheckinAndRender(
  elements: WorkspaceElements,
  state: WorkspaceState,
  options: { autoOpen: boolean; openAuto?: () => void }
): Promise<HomepageCheckinEntryStatus | null> {
  if (!state.token || !state.user) {
    state.checkin = null
    renderAuthenticatedUi(elements, state)
    return null
  }

  try {
    const checkin = await enterCheckinCampaign(buildRequestContext(state))
    state.checkin = checkin
    renderAuthenticatedUi(elements, state)
    if (isCheckinModalOpen(elements)) {
      if (checkin.campaign_ended) {
        setHidden(elements.checkinModal, true)
        setHidden(elements.checkinError, true)
      } else {
        renderCheckinModal(elements, state)
      }
    }
    if (options.autoOpen && shouldAutoOpenCheckin(state, checkin)) {
      if (options.openAuto) {
        options.openAuto()
      } else {
        openCheckinModal(elements, state, 'auto')
      }
    }
    return checkin
  } catch (error) {
    console.error(error)
    state.checkin = null
    renderAuthenticatedUi(elements, state)
    return null
  }
}

async function handleCreditsPillClick(
  elements: WorkspaceElements,
  state: WorkspaceState,
  openManual: () => void
): Promise<void> {
  if (!state.token || !state.user) {
    return
  }

  // 手动入口总是以后端 entry 为准，避免长开 tab 跨日或活动结束后沿用旧状态。
  const checkin = await refreshCheckinAndRender(elements, state, { autoOpen: false })
  if (isCheckinClaimable(checkin)) {
    openManual()
    return
  }

  if (getCurrentCreditsBalance(state) <= 0) {
    void window.creditPurchaseController?.open({
      source: 'workspace_credits_pill',
      reason: 'credits_insufficient'
    })
    return
  }

  if (checkin?.today_claimed && !checkin.campaign_ended) {
    openManual()
  }
}

async function handleCheckinClaim(
  elements: WorkspaceElements,
  state: WorkspaceState
): Promise<void> {
  const checkin = state.checkin
  if (!state.token || !state.user || !isCheckinClaimable(checkin) || !checkin) {
    return
  }

  elements.checkinClaimButton.disabled = true
  elements.checkinClaimButton.textContent = state.copy.checkin.claimingButton
  setHidden(elements.checkinError, true)

  try {
    const claim = await claimDailyCheckin(buildRequestContext(state))
    state.checkin = buildCheckinStatusFromClaim(checkin, claim)
    renderAuthenticatedUi(elements, state)
    renderCheckinModal(elements, state)
    reportGA4Event('checkin_claim_success', {
      checkin_day_index: claim.day_index,
      checkin_reward_claimed: claim.reward_credits,
      credits_balance: claim.credits_balance
    })
  } catch (error) {
    console.error(error)
    elements.checkinError.textContent =
      error instanceof Error ? error.message : state.copy.checkin.claimFailed
    setHidden(elements.checkinError, false)
  } finally {
    elements.checkinClaimButton.disabled = false
    renderCheckinModal(elements, state)
  }
}

async function handleWorkspaceLogout(
  elements: WorkspaceElements,
  state: WorkspaceState
): Promise<void> {
  try {
    if (state.token) {
      await logoutCurrentUser(buildRequestContext(state))
    }
  } catch (error) {
    console.error(error)
  } finally {
    clearStoredAccessToken()
    state.token = null
    state.user = null
    state.checkin = null
    closeAuthModal(elements)
    closeCheckinModal(elements, state, 'manual', false)
    setAccountMenuOpen(elements, false)
    renderAuthenticatedUi(elements, state)
    renderResults(elements, state)
  }
}

async function refreshAuthenticatedUserAndRender(
  elements: WorkspaceElements,
  state: WorkspaceState,
  token: string
): Promise<void> {
  const patch = await refreshAuthenticatedUser(state, token)
  applyAuthPatchAndRender(elements, state, patch)
}

function handleAuthInvalidAndRender(
  elements: WorkspaceElements,
  state: WorkspaceState,
  message: string
): void {
  const patch = handleAuthInvalid(elements, message)
  applyAuthPatchAndRender(elements, state, patch)
}

function syncParseClearButton(elements: WorkspaceElements): void {
  setHidden(elements.parseClearButton, elements.parseInput.value.length === 0)
}

function handleParseInputChanged(elements: WorkspaceElements): void {
  syncParseClearButton(elements)
  setParseErrorMessage(elements, '')
}

function clearParseInput(elements: WorkspaceElements): void {
  elements.parseInput.value = ''
  handleParseInputChanged(elements)
  elements.parseInput.focus()
}

async function clearSubmittedWorkspaceData(
  elements: WorkspaceElements,
  state: WorkspaceState,
  onNewParse: () => void
): Promise<void> {
  onNewParse()
  state.resources = []
  state.pendingDownloadTask = null
  updatePendingResumePrompt(elements, state)
  renderResults(elements, state)
}

async function handleParse(
  elements: WorkspaceElements,
  state: WorkspaceState,
  onNewParse: () => void
): Promise<void> {
  if (state.activeDownload) {
    return
  }

  const rawInput = elements.parseInput.value.trim()
  if (!rawInput) {
    setParseErrorMessage(elements, state.copy.errors.enterLink)
    return
  }

  const link = extractFirstValidUserLink(rawInput)
  if (!link) {
    await handleInvalidUserLink(elements, state, onNewParse)
    return
  }

  const localPlatform = detectPlatform(link) ?? 'unsupported'
  const markMessage = buildLocalParseClickMarkMessage(link, localPlatform)

  setParseErrorMessage(elements, '')
  elements.parseSubmit.disabled = true
  elements.parseSubmit.textContent = state.copy.parse.submitting
  if (elements.parseSkeleton) {
    setHidden(elements.parseSkeleton, false)
  }
  await clearSubmittedWorkspaceData(elements, state, onNewParse)

  recordHomepageMarkSilently(HOMEPAGE_MARK_TYPE.WEB_PARSE_CLICK, state, markMessage)
  reportGA4Event('web_parse_click', { link_host: safeLinkHost(link), local_platform: localPlatform })

  const parseStartedAtMs = performance.now()
  try {
    const parseResult = await parseMediaLink(link, buildRequestContext(state))
    state.resources = parseResult.resources
    renderResults(elements, state)

    if (state.resources.length === 0) {
      const reason = 'no_results'
      const linkHost = safeLinkHost(parseResult.canonicalLink || link)
      const parseDurationMs = elapsedMs(parseStartedAtMs)
      setParseErrorMessage(elements, state.copy.parse.noResults)
      recordParseFailureMark(
        state,
        link,
        reason,
        parseResult.platform,
        linkHost,
        parseDurationMs,
        reason
      )
      reportGA4Event('web_parse_failed', {
        reason,
        platform: parseResult.platform,
        link_host: linkHost,
        parse_duration_ms: parseDurationMs
      })
      return
    }

    recordHomepageMarkSilently(
      HOMEPAGE_MARK_TYPE.WEB_PARSE_SUCCESS,
      state,
      buildHomepageMarkMessage(state.resources[0]?.link || link, state.resources)
    )
    saveDownloadParseSnapshot(
      {
        originalLink: parseResult.originalLink,
        canonicalLink: parseResult.canonicalLink,
        resources: state.resources
      },
      getWorkspaceOwner(state)
    )
    reportGA4Event('web_parse_success', {
      resource_count: state.resources.length,
      platform: parseResult.platform,
      link_host: safeLinkHost(parseResult.canonicalLink || link),
      resource_types: resourceTypes(state.resources)
    })
    setParseErrorMessage(elements, '')
  } catch (error) {
    const parsedError = error instanceof Error || typeof error === 'string' ? error : null
    const reason = extractFailureReason(parsedError)
    const parseDurationMs = elapsedMs(parseStartedAtMs)
    state.resources = []
    renderResults(elements, state)
    setParseErrorMessage(
      elements,
      mapErrorToCopy(state.copy, parsedError, state.copy.errors.parseFailed)
    )
    recordParseFailureMark(
      state,
      link,
      reason,
      localPlatform,
      safeLinkHost(link),
      parseDurationMs,
      parsedError
    )
    reportGA4Event('web_parse_failed', {
      reason,
      platform: localPlatform,
      link_host: safeLinkHost(link),
      parse_duration_ms: parseDurationMs
    })
  } finally {
    if (elements.parseSkeleton) {
      setHidden(elements.parseSkeleton, true)
    }
    elements.parseSubmit.disabled = false
    elements.parseSubmit.textContent = state.copy.parse.submit
  }
}

async function initDownloadWorkspace(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-download-workspace]')
  if (!root) {
    return
  }

  const elements = getElements(root)
  mountAuthModalToBody(elements)
  let pendingParseSubmit = false
  let submitParse: (() => void) | null = null
  const requestParseSubmit = (): void => {
    if (submitParse) {
      submitParse()
      return
    }

    pendingParseSubmit = true
  }
  elements.parseSubmit.addEventListener('click', requestParseSubmit)
  elements.parseInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    requestParseSubmit()
  })

  const state: WorkspaceState = {
    activeDownload: false,
    copy: getCopy(root),
    deviceId: await ensureDeviceId(),
    pendingDownloadTask: null,
    resources: [],
    checkin: null,
    token: getStoredAccessToken(),
    user: null
  }
  bindAnonymousDownloadWorkspace(elements, state)
  installActiveDownloadBeforeUnloadPrompt(state)
  const sendCodeCooldown = createSendCodeCooldown(
    elements.sendCodeButton,
    state.copy.auth.sendAgain,
    60
  )
  const hadSnapshotBeforeLoad =
    window.localStorage.getItem(DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY) !== null
  const legacyDeviceIds = getLegacyDeviceIds()
  let workspaceSnapshot = loadDownloadWorkspaceSnapshot(
    Date.now(),
    state.deviceId,
    legacyDeviceIds
  )
  let autoGooglePromptAttempted = false
  let googleRedirectButtonRendered = false
  let checkinPopupSource: 'auto' | 'manual' = 'manual'
  let checkinStaleRefreshPromise: Promise<HomepageCheckinEntryStatus | null> | null = null

  const openTrackedCheckinModal = (source: 'auto' | 'manual'): void => {
    checkinPopupSource = source
    openCheckinModal(elements, state, source)
  }

  const closeTrackedCheckinModal = (markAutoDismissed: boolean): void => {
    const source = checkinPopupSource
    const shouldMarkAutoDismissed =
      source === 'auto' && markAutoDismissed && state.checkin?.today_claimed !== true
    closeCheckinModal(elements, state, source, shouldMarkAutoDismissed)
    checkinPopupSource = 'manual'
  }

  const handleGoogleCredentialLogin = async (
    response: GoogleLoginResponse,
    credentialSource: string
  ): Promise<void> => {
    logGoogleAuthStage('info', 'workspace_google_one_tap_backend_response', {
      credentialSource,
      requiresEmailVerification: isEmailVerificationRequiredResponse(response)
    })

    if (isEmailVerificationRequiredResponse(response)) {
      openAuthModal(elements)
      ensureGoogleRedirectButtonRendered()
      openEmailAuthForm(elements)
      elements.loginEmail.value = response.email
      elements.loginCode.value = ''
      elements.sendCodeStatus.textContent = state.copy.auth.sendCodeSuccess
      setHidden(elements.emailCodeArea, false)
      setHidden(elements.loginSubmit, false)
      setHidden(elements.emailContinueButton, true)
      sendCodeCooldown.start()
      return
    }

    elements.sendCodeStatus.textContent = ''
    closeAuthModal(elements)

    await refreshAuthenticatedUserAndRender(elements, state, response.access_token)
    await refreshCheckinAndRender(elements, state, {
      autoOpen: true,
      openAuto: () => openTrackedCheckinModal('auto')
    })
    await retryPendingWorkspaceSnapshot()
  }

  const runGoogleLogin = async (options: GoogleRedirectPromptOptions = {}): Promise<void> => {
    await handleGoogleLogin(elements, state, {
      ...options,
      onCredentialLogin: handleGoogleCredentialLogin
    })
  }

  const ensureGoogleRedirectButtonRendered = (): void => {
    if (googleRedirectButtonRendered) {
      return
    }

    const clientId = getGoogleClientId()
    if (!clientId) {
      logGoogleAuthStage('error', 'workspace_redirect_button_client_id_missing')
      setMessage(elements.authError, state.copy.errors.googleClientMissing)
      return
    }

    try {
      renderGoogleRedirectButton(elements.googleLoginButton, clientId, {
        source: 'workspace_google_button'
      })
      googleRedirectButtonRendered = true
    } catch (error) {
      logGoogleAuthStage('error', 'workspace_redirect_button_render_error', {
        message: error instanceof Error ? error.message : String(error)
      })
      console.error(error)
      setMessage(
        elements.authError,
        error instanceof Error ? error.message : state.copy.errors.googleSignInFailed
      )
    }
  }

  const maybeAutoPromptGoogleLogin = (): void => {
    if (autoGooglePromptAttempted || state.user || state.token) {
      logGoogleAuthStage('info', 'workspace_auto_prompt_skip', {
        attempted: autoGooglePromptAttempted,
        hasUser: Boolean(state.user),
        hasToken: Boolean(state.token)
      })
      return
    }
    autoGooglePromptAttempted = true
    logGoogleAuthStage('info', 'workspace_auto_prompt_start')
    void runGoogleLogin({
      silentFailure: true,
      source: 'workspace_auto_prompt'
    })
  }

  const downloadCallbacks: WorkspaceDownloadCallbacks = {
    onAuthInvalid: message => {
      handleAuthInvalidAndRender(elements, state, message)
      ensureGoogleRedirectButtonRendered()
      maybeAutoPromptGoogleLogin()
    },
    onCreditsInsufficient: source => {
      if (!state.token || !state.user) {
        // 弹窗 H2 已展示 modalTitle，错误槽留空保持隐藏，避免底部出现重复标题行
        handleAuthInvalidAndRender(elements, state, '')
        ensureGoogleRedirectButtonRendered()
        maybeAutoPromptGoogleLogin()
        return
      }

      void window.creditPurchaseController?.open({
        source,
        reason: 'credits_insufficient'
      })
    },
    onCreditsBalanceChanged: balance => {
      if (!state.user) {
        return
      }
      state.user = {
        ...state.user,
        credits_balance: balance
      }
      state.checkin = null
      renderAuthenticatedUi(elements, state)
    },
    onRenderResults: () => {
      renderResults(elements, state)
    }
  }

  const clearFailedWorkspaceSnapshot = (reason: string): void => {
    clearDownloadWorkspaceSnapshot()
    workspaceSnapshot = null
    reportGA4Event('web_workspace_restore_failed', { error_reason: reason })
  }

  const applyWorkspaceSnapshot = (snapshot: DownloadWorkspaceSnapshot): void => {
    elements.parseInput.value = snapshot.parse.originalLink
    syncParseClearButton(elements)
    state.resources = snapshot.parse.resources
    renderResults(elements, state)
    updatePendingResumePrompt(elements, state)
    reportGA4Event('web_workspace_restore', {
      resource_count: snapshot.parse.resources.length
    })
  }

  const retryPendingWorkspaceSnapshot = async (): Promise<void> => {
    renderResults(elements, state)
  }

  const handleGoogleRedirectResult = async (): Promise<void> => {
    const result = readGoogleRedirectResult()
    if (!result) {
      return
    }

    clearGoogleRedirectResult()
    logGoogleAuthStage(result.error ? 'warn' : 'info', 'workspace_redirect_result_received', {
      hasCode: Boolean(result.code),
      hasEmailVerification: Boolean(result.emailVerificationEmail),
      hasError: Boolean(result.error),
      error: result.error ?? null
    })

    if (result.emailVerificationEmail) {
      openAuthModal(elements)
      ensureGoogleRedirectButtonRendered()
      openEmailAuthForm(elements)
      elements.loginEmail.value = result.emailVerificationEmail
      elements.loginCode.value = ''
      elements.sendCodeStatus.textContent = state.copy.auth.sendCodeSuccess
      setHidden(elements.emailCodeArea, false)
      setHidden(elements.loginSubmit, false)
      setHidden(elements.emailContinueButton, true)
      sendCodeCooldown.start()
      return
    }

    if (result.error || !result.code) {
      resetAuthModalToGoogleFirst(elements)
      openAuthModal(elements)
      ensureGoogleRedirectButtonRendered()
      setMessage(elements.authError, state.copy.errors.googleSignInFailed)
      return
    }

    try {
      const response = await exchangeGoogleLoginCode(result.code, buildRequestContext(state))
      elements.sendCodeStatus.textContent = ''
      closeAuthModal(elements)

      await refreshAuthenticatedUserAndRender(elements, state, response.access_token)
      await refreshCheckinAndRender(elements, state, {
        autoOpen: true,
        openAuto: () => openTrackedCheckinModal('auto')
      })
      await retryPendingWorkspaceSnapshot()
    } catch (error) {
      console.error(error)
      resetAuthModalToGoogleFirst(elements)
      openAuthModal(elements)
      ensureGoogleRedirectButtonRendered()
      setMessage(
        elements.authError,
        error instanceof Error ? error.message : state.copy.errors.googleSignInFailed
      )
    }
  }

  root.addEventListener('download-request-login', () => {
    resetAuthModalToGoogleFirst(elements)
    openAuthModal(elements)
    ensureGoogleRedirectButtonRendered()
    elements.authCloseButtons[0]?.focus()
  })

  renderResults(elements, state)
  await clearLegacyDownloadTaskState()
  await restorePendingDownloadTask(elements, state)
  syncParseClearButton(elements)
  renderAuthenticatedUi(elements, state)

  const authRestore = await restoreAuthenticatedState(state)
  applyAuthPatchAndRender(elements, state, authRestore.patch)
  await handleGoogleRedirectResult()
  await refreshCheckinAndRender(elements, state, {
    autoOpen: true,
    openAuto: () => openTrackedCheckinModal('auto')
  })

  for (const button of elements.authCloseButtons) {
    button.addEventListener('click', () => {
      closeAuthModal(elements)
    })
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !elements.authModal.hidden) {
      closeAuthModal(elements)
    }
    if (event.key === 'Escape' && !elements.checkinModal.hidden) {
      closeTrackedCheckinModal(true)
    }
  })

  document.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }
    if (
      !elements.accountButton.contains(target) &&
      !elements.accountMenu.contains(target)
    ) {
      setAccountMenuOpen(elements, false)
    }
  })

  elements.accountButton.addEventListener('click', event => {
    event.stopPropagation()
    setAccountMenuOpen(elements, elements.accountMenu.hidden)
  })

  elements.accountLogoutButton.addEventListener('click', () => {
    void handleWorkspaceLogout(elements, state)
  })

  elements.creditsPill.addEventListener('click', () => {
    void handleCreditsPillClick(elements, state, () => openTrackedCheckinModal('manual'))
  })

  for (const button of elements.checkinCloseButtons) {
    button.addEventListener('click', () => {
      closeTrackedCheckinModal(true)
    })
  }

  elements.checkinDismissButton.addEventListener('click', () => {
    closeTrackedCheckinModal(true)
  })

  elements.checkinClaimButton.addEventListener('click', () => {
    void handleCheckinClaim(elements, state)
  })

  window.addEventListener(CREDIT_PURCHASE_SUCCESS_EVENT, event => {
    const payload = (event as CustomEvent<CreditPurchaseSuccessPayload>).detail
    if (!payload || !state.user) {
      return
    }
    state.user = {
      ...state.user,
      credits_balance: payload.latestBalance
    }
    state.checkin = null
    renderAuthenticatedUi(elements, state)
    renderResults(elements, state)
  })

  window.addEventListener(CREDIT_PURCHASE_AUTH_INVALID_EVENT, event => {
    const detail = (event as CustomEvent<{ message?: string }>).detail
    handleAuthInvalidAndRender(elements, state, detail?.message ?? state.copy.creditPurchase.authExpired)
    ensureGoogleRedirectButtonRendered()
    maybeAutoPromptGoogleLogin()
  })

  window.setInterval(() => {
    if (state.checkin?.today_claimed !== true || !isCheckinModalOpen(elements)) {
      return
    }

    if (isHomepageCheckinEntryStale(state.checkin)) {
      if (!checkinStaleRefreshPromise) {
        checkinStaleRefreshPromise = refreshCheckinAndRender(elements, state, { autoOpen: false })
          .finally(() => {
            checkinStaleRefreshPromise = null
          })
      }
      return
    }

    if (state.checkin.today_claimed) {
      renderCheckinModal(elements, state)
    }
  }, 1000)

  elements.emailEntryButton.addEventListener('click', () => {
    openEmailAuthForm(elements)
  })

  elements.emailContinueButton.addEventListener('click', () => {
    void handleSendCode(elements, state, sendCodeCooldown)
  })

  elements.sendCodeButton.addEventListener('click', () => {
    void handleSendCode(elements, state, sendCodeCooldown)
  })

  elements.authForm.addEventListener('submit', event => {
    event.preventDefault()
    void handleLogin(elements, state).then(async patch => {
      if (!patch) {
        return
      }
      applyAuthPatchAndRender(elements, state, patch)
      await refreshCheckinAndRender(elements, state, {
        autoOpen: true,
        openAuto: () => openTrackedCheckinModal('auto')
      })
      await retryPendingWorkspaceSnapshot()
    })
  })

  submitParse = () => {
    void handleParse(elements, state, () => {
      clearDownloadWorkspaceSnapshot()
    })
  }

  if (pendingParseSubmit) {
    pendingParseSubmit = false
    submitParse()
  }

  elements.parseInput.addEventListener('input', () => {
    handleParseInputChanged(elements)
  })

  elements.parseClearButton.addEventListener('click', () => {
    clearParseInput(elements)
  })

  elements.pendingResumeContinue.addEventListener('click', () => {
    void handlePendingResumeContinue(elements, state, downloadCallbacks).then(() => {
      renderResults(elements, state)
    })
  })

  elements.pendingResumeDismiss.addEventListener('click', () => {
    void handlePendingResumeDismiss(elements, state).then(() => {
      renderResults(elements, state)
    })
  })

  elements.downloadAllButton.addEventListener('click', () => {
    void handleDownloadAllClick(elements, state, downloadCallbacks)
  })

  if (hadSnapshotBeforeLoad && !workspaceSnapshot) {
    reportGA4Event('web_workspace_restore_failed', { error_reason: 'invalid_snapshot' })
  }

  if (workspaceSnapshot) {
    const owner = getWorkspaceOwner(state)
    if (isDownloadWorkspaceOwnerAllowed(workspaceSnapshot, owner)) {
      applyWorkspaceSnapshot(workspaceSnapshot)
    } else {
      clearFailedWorkspaceSnapshot('owner_mismatch')
    }
  }

  root.addEventListener('click', event => {
    const origin = event.target
    if (!(origin instanceof Element)) {
      return
    }

    const button = origin.closest<HTMLButtonElement>('[data-download-resource-button]')
    if (!button) {
      return
    }

    void handleDownloadClick(elements, state, button, downloadCallbacks)
  })

  root.dataset.downloadWorkspaceReady = 'true'
  root.dispatchEvent(new CustomEvent('download-workspace-ready'))
}

void initDownloadWorkspace()
