/**
 * 下载工作区入口编排。
 *
 * 负责初始化 DOM、state、snapshot 和事件绑定，具体渲染、下载与
 * 错误映射分别交给 workspace-* 模块。
 */

import { bindAnonymousDownloadWorkspace } from './anonymous-download'
import type { RequestContext } from '../runtime/api'
import { ensureDeviceId, getLegacyDeviceIds } from '../runtime/device'
import { extractFailureReason, reportGA4Event, safeLinkHost } from '../runtime/ga4'
import {
  buildHomepageParseFailedMarkMessage,
  buildHomepageMarkMessage,
  HOMEPAGE_MARK_TYPE,
  recordHomepageMark
} from '../runtime/mark'
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
  getCopy,
  getElements,
  setHidden,
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
import { renderResults, updatePendingResumePrompt } from './workspace-render'
import type { WorkspaceState } from './workspace-state'

function buildRequestContext(state: WorkspaceState): RequestContext {
  return { deviceId: state.deviceId }
}

function getWorkspaceOwner(state: WorkspaceState): DownloadWorkspaceOwner {
  return buildDownloadWorkspaceOwner(state.deviceId)
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
    resources: []
  }
  bindAnonymousDownloadWorkspace(elements, state)
  installActiveDownloadBeforeUnloadPrompt(state)
  const hadSnapshotBeforeLoad =
    window.localStorage.getItem(DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY) !== null
  const legacyDeviceIds = getLegacyDeviceIds()
  let workspaceSnapshot = loadDownloadWorkspaceSnapshot(
    Date.now(),
    state.deviceId,
    legacyDeviceIds
  )

  const downloadCallbacks: WorkspaceDownloadCallbacks = {
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

  renderResults(elements, state)
  await clearLegacyDownloadTaskState()
  await restorePendingDownloadTask(elements, state)
  syncParseClearButton(elements)

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
