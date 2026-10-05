/**
 * 下载工作区下载编排。
 *
 * 工作区只负责鉴权、动作计划、队列、保存动作、埋点和 UI 状态；
 * 具体下载算法由 download-methods.ts 注册的 runner 执行。
 */

import { extractFailureReason, reportGA4Event, safeLinkHost } from '../runtime/ga4'
import {
  buildHomepageDownloadFailedMarkMessage,
  buildHomepageDownloadSuccessMarkMessage,
  buildHomepageMarkMessage,
  buildHomepageStoragePreflightMarkMessage,
  HOMEPAGE_MARK_TYPE,
  recordHomepageMark,
  type StoragePreflightBrowserInfo
} from '../runtime/mark'
import { DownloadDeferred, DownloadExtensionRequired } from './anonymous-download'
import { ClientMuxDownloadError } from './client-mux'
import { AutoRangeResumeExhaustedError } from './download-range-stream'
import { buildDownloadActionPlan, type DownloadActionPlan } from './download-action-plan'
import type { DownloadCompletion } from './download-completion'
import { downloadPlannedResource, resumeDownloadResource } from './download-dispatcher'
import { buildDownloadQueuePlan } from './download-queue-plan'
import {
  getDownloadMethod,
  UnsupportedDownloadModeError,
  type DownloadMethodContext
} from './download-methods'
import {
  clearDownloadResumeRecord,
  loadDownloadResumeRecord,
  resourceFromResumeRecord,
  type DownloadResumeRecord
} from './download-resume-store'
import {
  checkDownloadStoragePreflight,
  formatStorageBytes,
  type DownloadStoragePreflightResult
} from './download-storage-preflight'
import {
  DirectDownloadHttpError,
  DirectUrlExpiredError
} from './response-download'
import { isWebDownloadMediaAllowed } from './media-download-allowlist'
import { buildDownloadWorkspaceOwner } from './snapshot'
import type { DownloadProgressSnapshot, MediaPost } from './types'
import {
  setHidden,
  setParseErrorMessage,
  setWorkspaceButtonsLocked,
  type WorkspaceElements
} from './workspace-elements'
import {
  isUnsafeFileTypeError,
  mapErrorToCopy
} from './workspace-errors'
import {
  formatBatchDownloadingLabel,
  formatProgressLabel,
  updatePendingResumePrompt
} from './workspace-render'
import type { WorkspaceDownloadState } from './workspace-state'

/** 全站确认弹窗所需的最小契约，下载脚本不直接依赖具体站点实现。 */
interface SiteConfirmOptions {
  /** 弹窗标题。 */
  title: string
  /** 弹窗正文。 */
  message: string
  /** 确认按钮文案。 */
  confirmLabel: string
  /** 取消按钮文案。 */
  cancelLabel: string
}

interface SiteConfirmWindow extends Window {
  /** 全站通用确认框；未挂载时走旧的直接滚动兜底。 */
  siteConfirmAction?: (options: SiteConfirmOptions) => Promise<boolean>
}

interface NavigatorWithMemoryInfo extends Navigator {
  /** Chromium 暴露的近似设备内存 GiB。 */
  deviceMemory?: number
}

/** 插件引导滚动到导航下方时保留的额外视觉间距。 */
const EXTENSION_GUIDE_SCROLL_MARGIN_PX = 16

/** 只计算贴近视口顶部的固定或粘性导航，避免普通页面 header 影响滚动位置。 */
const TOP_NAVIGATION_SELECTORS = '.header, .fa-topbar, body > header'

/** 下载模块回调，由入口层绑定渲染。 */
export interface WorkspaceDownloadCallbacks {
  /** 重新渲染结果卡片。 */
  onRenderResults(): void
}

function buildRequestContext(state: WorkspaceDownloadState): DownloadMethodContext {
  return {
    deviceId: state.deviceId,
    ownerSub: buildDownloadWorkspaceOwner(state.deviceId).sub
  }
}

function recordHomepageMarkSilently(
  markType: (typeof HOMEPAGE_MARK_TYPE)[keyof typeof HOMEPAGE_MARK_TYPE],
  state: WorkspaceDownloadState,
  markMsg = ''
): void {
  void recordHomepageMark(markType, buildRequestContext(state), markMsg).catch(() => {})
}

function executeDownloadCompletion(completion: DownloadCompletion): void {
  const anchor = document.createElement('a')
  anchor.href = completion.objectUrl
  anchor.download = completion.filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  const container = document.body || document.documentElement
  container.append(anchor)
  anchor.click()

  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(completion.objectUrl)
    void Promise.resolve(completion.cleanup?.()).catch(error => {
      console.error(error)
    })
  }, completion.revokeAfterMs)
}

function clearPendingTaskState(elements: WorkspaceElements, state: WorkspaceDownloadState): void {
  state.pendingDownloadTask = null
  updatePendingResumePrompt(elements, state)
}

async function clearPendingResumeRecord(
  record: DownloadResumeRecord,
  elements: WorkspaceElements,
  state: WorkspaceDownloadState
): Promise<void> {
  const method = getDownloadMethod(record.mode)
  if (method.clearResume) {
    await method.clearResume(record)
  } else {
    await clearDownloadResumeRecord(record)
  }
  clearPendingTaskState(elements, state)
}

function handleDownloadError(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState,
  error: Error | string | null
): Promise<void> {
  const message = mapErrorToCopy(state.copy, error, state.copy.errors.downloadFailed)
  setParseErrorMessage(elements, message)
  if (isUnsafeFileTypeError(error)) {
    return confirmUnsafeFileTypeExtensionGuide(elements, state, message)
  }
  return Promise.resolve()
}

/** 状态 3：提示该资源需用插件下载并展示插件引导卡，不记为失败。 */
function showExtensionRequired(elements: WorkspaceElements, state: WorkspaceDownloadState): void {
  setParseErrorMessage(elements, state.copy.errors.useExtensionForResource)
  revealExtensionGuide(elements)
}

function getTopNavigationOffset(): number {
  if (typeof document.querySelectorAll !== 'function') {
    return 0
  }

  let occupiedHeight = 0
  const navigationElements = document.querySelectorAll<HTMLElement>(TOP_NAVIGATION_SELECTORS)
  for (const element of navigationElements) {
    const style = window.getComputedStyle(element)
    if (
      (style.position !== 'fixed' && style.position !== 'sticky') ||
      style.display === 'none' ||
      style.visibility === 'hidden'
    ) {
      continue
    }

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top > 48) {
      continue
    }

    occupiedHeight = Math.max(occupiedHeight, rect.bottom)
  }

  return occupiedHeight > 0 ? occupiedHeight + EXTENSION_GUIDE_SCROLL_MARGIN_PX : 0
}

function scrollElementBelowTopNavigation(element: HTMLElement): void {
  const elementTop = element.getBoundingClientRect().top + window.scrollY
  const scrollTop = Math.max(0, elementTop - getTopNavigationOffset())
  window.scrollTo({ top: scrollTop, behavior: 'smooth' })
}

function revealExtensionGuide(elements: WorkspaceElements): void {
  setHidden(elements.largeFileExtensionGuide, false)
  scrollElementBelowTopNavigation(elements.largeFileExtensionGuide)
}

function unsafeFileTypeUseExtensionMessage(state: WorkspaceDownloadState): string {
  return state.copy.errors.unsafeFileTypeUseExtension ?? state.copy.errors.downloadFailed
}

async function confirmUnsafeFileTypeExtensionGuide(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState,
  message = unsafeFileTypeUseExtensionMessage(state)
): Promise<void> {
  setParseErrorMessage(elements, message)

  const confirmAction = (window as SiteConfirmWindow).siteConfirmAction
  const confirmed = confirmAction
    ? await confirmAction({
        title: state.copy.errors.unsafeFileTypeConfirmTitle ?? 'Use the browser extension',
        message,
        confirmLabel:
          state.copy.errors.unsafeFileTypeConfirmViewExtension ?? 'View extension download',
        cancelLabel: state.copy.errors.unsafeFileTypeConfirmCancel ?? 'Cancel'
      })
    : window.confirm(message)
  if (confirmed) {
    revealExtensionGuide(elements)
  }
}

function replaceDownloadTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

function browserStoragePreflightMessage(
  state: WorkspaceDownloadState,
  result: Extract<DownloadStoragePreflightResult, { ok: false }>
): string {
  const fallback =
    'This browser does not have enough reliable local storage for this file ({file_size}). Available storage is about {available_space}. Install Vimeo Video Downloader and download with the browser extension instead.'
  const template = state.copy.errors.browserStorageInsufficientUseExtension ?? fallback
  return replaceDownloadTemplate(template, {
    file_size: formatStorageBytes(result.fileSizeBytes),
    available_space: formatStorageBytes(result.availableBytes),
    required_space: formatStorageBytes(result.requiredBytes)
  })
}

function optionalStorageBytes(value: number | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function collectBrowserStoragePreflightInfo(): StoragePreflightBrowserInfo {
  if (typeof navigator === 'undefined') {
    return {}
  }

  const browserNavigator = navigator as NavigatorWithMemoryInfo
  return {
    userAgent: browserNavigator.userAgent,
    deviceMemory: browserNavigator.deviceMemory
  }
}

function recordBrowserStoragePreflightBlocked(
  state: WorkspaceDownloadState,
  resource: MediaPost,
  result: Extract<DownloadStoragePreflightResult, { ok: false }>
): void {
  recordHomepageMarkSilently(
    HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED,
    state,
    buildHomepageStoragePreflightMarkMessage(
      resource.link,
      {
        downloadMode: resource.downloadMode,
        reason: result.reason,
        fileSizeBytes: result.fileSizeBytes,
        availableBytes: optionalStorageBytes(result.availableBytes),
        requiredBytes: result.requiredBytes,
        browserInfo: collectBrowserStoragePreflightInfo(),
        causeName: result.errorName,
        causeMessage: result.errorMessage
      }
    )
  )
  reportGA4Event(HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED, {
    platform: resource.platform,
    download_mode: resource.downloadMode,
    link_host: safeLinkHost(resource.link),
    reason: result.reason,
    file_size: optionalStorageBytes(result.fileSizeBytes),
    available_space: optionalStorageBytes(result.availableBytes),
    required_space: optionalStorageBytes(result.requiredBytes),
    quota: optionalStorageBytes(result.quotaBytes),
    usage: optionalStorageBytes(result.usageBytes),
    opfs_writable: result.opfsWritable ?? undefined
  })
}

async function confirmBrowserStorageExtensionGuide(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState,
  result: Extract<DownloadStoragePreflightResult, { ok: false }>
): Promise<void> {
  const message = browserStoragePreflightMessage(state, result)
  setParseErrorMessage(elements, message)

  const confirmAction = (window as SiteConfirmWindow).siteConfirmAction
  const confirmed = confirmAction
    ? await confirmAction({
        title: state.copy.errors.browserStorageInsufficientConfirmTitle ??
          'Not enough browser storage',
        message,
        confirmLabel:
          state.copy.errors.browserStorageInsufficientConfirmViewExtension ??
          state.copy.errors.unsafeFileTypeConfirmViewExtension ??
          'View extension download',
        cancelLabel:
          state.copy.errors.browserStorageInsufficientConfirmCancel ??
          state.copy.errors.unsafeFileTypeConfirmCancel ??
          'Cancel'
      })
    : window.confirm(message)
  if (confirmed) {
    revealExtensionGuide(elements)
  }
}

async function resolveDownloadStoragePlan(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState,
  plan: DownloadActionPlan
): Promise<DownloadActionPlan | null> {
  const resource = plan.resource
  if (!plan.method.requiresStoragePreflight) {
    return plan
  }

  const result = await checkDownloadStoragePreflight(resource)
  if (result.ok) {
    return plan
  }

  console.warn(
    `[workspace-download] browser storage preflight blocked download, sourceId=${resource.sourceId}, reason=${result.reason}, fileSize=${result.fileSizeBytes}, available=${result.availableBytes ?? 'unknown'}, required=${result.requiredBytes}, opfsWritable=${result.opfsWritable ?? 'unknown'}`
  )
  recordBrowserStoragePreflightBlocked(state, resource, result)
  await confirmBrowserStorageExtensionGuide(elements, state, result)
  return null
}

function downloadFailureReason(error: Error | string | null): string {
  if (error instanceof UnsupportedDownloadModeError) {
    return 'unsupported_download_mode'
  }
  if (error instanceof ClientMuxDownloadError) {
    return error.reason
  }
  if (error instanceof DirectUrlExpiredError || error instanceof DirectDownloadHttpError) {
    return 'fetch_failed'
  }
  return extractFailureReason(error)
}

function retryCountForFailedMark(
  error: Error | string | null,
  fallbackRetryCount: number
): number {
  if (error instanceof AutoRangeResumeExhaustedError) {
    return Math.max(fallbackRetryCount, error.retryCount)
  }

  return fallbackRetryCount
}

function clientMuxLoadingLabel(
  state: WorkspaceDownloadState,
  snapshot: DownloadProgressSnapshot
): string {
  if ('stage' in snapshot && snapshot.stage === 'mux') {
    return formatProgressLabel(
      state.copy.parse.preparingMp4 ?? 'Preparing MP4...',
      snapshot
    )
  }

  return formatProgressLabel(state.copy.parse.downloading, snapshot)
}

function buildResourcePlan(resource: MediaPost, state: WorkspaceDownloadState): DownloadActionPlan {
  return buildDownloadActionPlan(resource, state.resources)
}

function getDownloadButtonLabel(button: HTMLButtonElement): HTMLElement {
  const label = button.querySelector<HTMLElement>('.download-resource-button-label')
  if (!label) {
    throw new Error('[workspace-download] getDownloadButtonLabel: missing download button label element.')
  }
  return label
}

function resourceWithUsedNodeId(resource: MediaPost, usedNodeId?: number): MediaPost {
  if (usedNodeId === undefined) {
    return resource
  }
  return { ...resource, preferredNodeId: usedNodeId }
}

interface RuntimeDownloadTaskMark {
  /** 资源 ID。 */
  sourceId: string
  /** 保存文件名。 */
  filename: string
  /** 当前已下载字节数。 */
  downloadedBytes?: number
  /** 总字节数，null 表示未知。 */
  totalBytes?: number | null
  /** 下载速率，字节/秒。 */
  speedBytesPerSecond?: number | null
}

interface RuntimeDownloadMarkError extends Error {
  /** 失败时附带的下载进度快照。 */
  task?: RuntimeDownloadTaskMark
}

interface RuntimeDownloadResult {
  /** 下载完成后的保存动作。 */
  completion: DownloadCompletion
  /** 方法内部自动重试次数。 */
  retryCount: number
  /** 本次下载实际命中的 download-v2 节点 ID。 */
  usedNodeId?: number
}

interface RuntimeDownloadMarkContext {
  /** 当前下载资源。 */
  resource: MediaPost
  /** start mark 是否已经上报。 */
  startRecorded: boolean
  /** 实际命中的 download-v2 节点 ID。 */
  usedNodeId?: number
  /** 最近一次进度快照。 */
  lastProgress?: DownloadProgressSnapshot
  /** 最近一次带有效速率的进度快照。 */
  lastSpeedProgress?: DownloadProgressSnapshot
}

interface DownloadFailedMarkOptions {
  /** 当前下载状态。 */
  state: WorkspaceDownloadState
  /** 失败资源或批量任务 URL。 */
  url: string
  /** 失败打点关联的资源。 */
  resources: MediaPost | MediaPost[]
  /** 原始失败对象。 */
  error: Error | string | null
  /** 下载方法已返回或累计的自动恢复次数。 */
  fallbackRetryCount: number
  /** 单资源运行时上下文；有上下文时统一补进度快照和实际节点。 */
  markContext?: RuntimeDownloadMarkContext
}

function createRuntimeDownloadMarkContext(resource: MediaPost): RuntimeDownloadMarkContext {
  return {
    resource,
    startRecorded: false
  }
}

function recordDownloadStartOnce(
  context: RuntimeDownloadMarkContext,
  state: WorkspaceDownloadState
): void {
  if (context.startRecorded) {
    return
  }
  context.startRecorded = true
  recordHomepageMarkSilently(
    HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_START,
    state,
    buildHomepageMarkMessage(
      context.resource.link,
      resourceWithUsedNodeId(context.resource, context.usedNodeId)
    )
  )
}

function updateRuntimeDownloadProgress(
  context: RuntimeDownloadMarkContext,
  snapshot: DownloadProgressSnapshot
): void {
  context.lastProgress = snapshot
  if (
    typeof snapshot.speedBytesPerSecond === 'number' &&
    Number.isFinite(snapshot.speedBytesPerSecond) &&
    snapshot.speedBytesPerSecond > 0
  ) {
    context.lastSpeedProgress = snapshot
  }
}

function updateRuntimeDownloadNode(
  context: RuntimeDownloadMarkContext,
  state: WorkspaceDownloadState,
  nodeId: number
): void {
  context.usedNodeId = nodeId
  recordDownloadStartOnce(context, state)
}

function buildRuntimeDownloadMarkError(
  error: Error | string | null,
  context: RuntimeDownloadMarkContext
): Error | string | null {
  const snapshot = context.lastSpeedProgress ?? context.lastProgress
  const autoRangeError = error instanceof AutoRangeResumeExhaustedError ? error : null
  const markError: RuntimeDownloadMarkError =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : 'Unknown download failure')
  markError.task = {
    sourceId: context.resource.sourceId,
    filename: context.resource.filename,
    downloadedBytes: snapshot?.downloadedBytes ?? autoRangeError?.downloadedBytes ?? 0,
    totalBytes: snapshot?.totalBytes ?? autoRangeError?.totalBytes ?? context.resource.size,
    speedBytesPerSecond: snapshot?.speedBytesPerSecond ?? 0
  }
  return markError
}

function recordDownloadFailedMark(options: DownloadFailedMarkOptions): number {
  const failedRetryCount = retryCountForFailedMark(
    options.error,
    options.fallbackRetryCount
  )
  const markError = options.markContext
    ? buildRuntimeDownloadMarkError(options.error, options.markContext)
    : options.error
  const markResources =
    options.markContext && !Array.isArray(options.resources)
      ? resourceWithUsedNodeId(options.resources, options.markContext.usedNodeId)
      : options.resources

  recordHomepageMarkSilently(
    HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_FAILED,
    options.state,
    buildHomepageDownloadFailedMarkMessage(
      options.url,
      markResources,
      markError,
      failedRetryCount
    )
  )
  return failedRetryCount
}

function getCompletionBytesWritten(completion: DownloadCompletion | undefined): number | undefined {
  return typeof completion?.bytesWritten === 'number' ? completion.bytesWritten : undefined
}

function buildRuntimeDownloadSuccessMarkTask(
  context: RuntimeDownloadMarkContext,
  completion?: DownloadCompletion
): RuntimeDownloadTaskMark {
  const progressSnapshot = context.lastProgress
  const speedSnapshot = context.lastSpeedProgress
  return {
    sourceId: context.resource.sourceId,
    filename: context.resource.filename,
    downloadedBytes:
      progressSnapshot?.downloadedBytes ??
      getCompletionBytesWritten(completion) ??
      context.resource.size ??
      undefined,
    totalBytes: progressSnapshot?.totalBytes ?? context.resource.size,
    speedBytesPerSecond: speedSnapshot?.speedBytesPerSecond ?? progressSnapshot?.speedBytesPerSecond
  }
}

async function runSingleResourcePlan(
  plan: DownloadActionPlan,
  state: WorkspaceDownloadState,
  markContext: RuntimeDownloadMarkContext,
  onProgress: (progress: DownloadProgressSnapshot) => void
): Promise<RuntimeDownloadResult> {
  await clearDownloadResumeRecord(state.pendingDownloadTask ?? undefined)
  state.pendingDownloadTask = null

  const result = await downloadPlannedResource(
    plan,
    buildRequestContext(state),
    {
      onUsedNode: nodeId => updateRuntimeDownloadNode(markContext, state, nodeId),
      onProgress
    }
  )
  executeDownloadCompletion(result.completion)
  return {
    completion: result.completion,
    retryCount: result.retryCount,
    usedNodeId: result.usedNodeId
  }
}

/** 加载并校验待恢复下载记录。 */
export async function restorePendingDownloadTask(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState
): Promise<void> {
  const record = await loadDownloadResumeRecord()
  if (!record) {
    clearPendingTaskState(elements, state)
    return
  }

  const method = getDownloadMethod(record.mode)
  try {
    if (!method.canResume?.(record, buildRequestContext(state))) {
      await clearPendingResumeRecord(record, elements, state)
      return
    }
  } catch (error) {
    console.error(error)
    await clearPendingResumeRecord(record, elements, state)
    return
  }

  state.pendingDownloadTask = record
  updatePendingResumePrompt(elements, state)
}

/** 处理单资源下载按钮。 */
export async function handleDownloadClick(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState,
  button: HTMLButtonElement,
  callbacks: WorkspaceDownloadCallbacks
): Promise<void> {
  if (state.activeDownload) {
    return
  }

  const link = button.dataset.link
  const sourceId = button.dataset.sourceId
  if (!link || !sourceId) {
    return
  }

  const resource = state.resources.find(
    item => item.sourceId === sourceId && item.link === link
  )
  if (!resource) {
    setParseErrorMessage(
      elements,
      `[workspace-download] handleDownloadClick: resource snapshot missing, sourceId=${sourceId}`
    )
    return
  }
  const plan = buildResourcePlan(resource, state)
  if (!plan.canDownload) {
    setParseErrorMessage(
      elements,
      plan.downloadDisabledReason || state.copy.errors.downloadFailed
    )
    return
  }
  if (!isWebDownloadMediaAllowed(resource)) {
    await confirmUnsafeFileTypeExtensionGuide(elements, state)
    return
  }

  const defaultLabel = state.copy.parse.download
  let deferred = false
  let finalLabel = defaultLabel
  const buttonLabel = getDownloadButtonLabel(button)
  let downloadRetryCount = 0
  const markContext = createRuntimeDownloadMarkContext(resource)
  let executablePlan = plan

  state.activeDownload = true
  setWorkspaceButtonsLocked(elements, true)
  buttonLabel.textContent = state.copy.parse.checkingStorage ?? 'Checking storage...'
  setParseErrorMessage(elements, '')
  clearPendingTaskState(elements, state)

  try {
    const resolvedPlan = await resolveDownloadStoragePlan(elements, state, plan)
    if (!resolvedPlan) {
      return
    }
    executablePlan = resolvedPlan

    reportGA4Event('web_download_start', {
      platform: resource.platform,
      download_mode: resource.downloadMode,
      save_strategy: executablePlan.method.saveStrategies.join(','),
      session_policy: executablePlan.method.sessionPolicy,
      link_host: safeLinkHost(link),
      resource_type: resource.type.split('/')[0]
    })

    buttonLabel.textContent = state.copy.parse.downloading
    const downloadResult = await runSingleResourcePlan(executablePlan, state, markContext, snapshot => {
      updateRuntimeDownloadProgress(markContext, snapshot)
      buttonLabel.textContent =
        resource.downloadMode === 'client_mux'
          ? clientMuxLoadingLabel(state, snapshot)
          : formatProgressLabel(state.copy.parse.downloading, snapshot)
    })
    downloadRetryCount = downloadResult.retryCount
    recordDownloadStartOnce(markContext, state)

    const successEventParameters = {
      platform: resource.platform,
      download_mode: resource.downloadMode,
      save_strategy: downloadResult.completion.kind,
      session_policy: executablePlan.method.sessionPolicy,
      link_host: safeLinkHost(link),
      resource_type: resource.type.split('/')[0],
      file_size: resource.size ?? 0
    }
    recordHomepageMarkSilently(
      HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_SUCCESS,
      state,
      buildHomepageDownloadSuccessMarkMessage(
        link,
        resourceWithUsedNodeId(resource, markContext.usedNodeId ?? downloadResult.usedNodeId),
        buildRuntimeDownloadSuccessMarkTask(markContext, downloadResult.completion),
        downloadRetryCount
      )
    )
    reportGA4Event('web_download_success', successEventParameters)
    callbacks.onRenderResults()
  } catch (error) {
    if (error instanceof DownloadExtensionRequired) { showExtensionRequired(elements, state); return }
    if (error instanceof DownloadDeferred) { deferred = true; return }
    const parsedError = error instanceof Error || typeof error === 'string' ? error : null
    recordDownloadFailedMark({
      state,
      url: link,
      resources: resource,
      error: parsedError,
      fallbackRetryCount: downloadRetryCount,
      markContext
    })
    await handleDownloadError(elements, state, parsedError)
    if (parsedError instanceof AutoRangeResumeExhaustedError) {
      await restorePendingDownloadTask(elements, state)
    }
    reportGA4Event('web_download_failed', {
      platform: resource.platform,
      download_mode: resource.downloadMode,
      save_strategy: executablePlan.method.saveStrategies.join(','),
      session_policy: executablePlan.method.sessionPolicy,
      link_host: safeLinkHost(link),
      reason: downloadFailureReason(parsedError),
      resource_type: resource.type.split('/')[0]
    })
  } finally {
    setWorkspaceButtonsLocked(elements, false)
    state.activeDownload = false
    buttonLabel.textContent = finalLabel
    if (deferred) button.focus()
  }
}

/** 处理 Download all。 */
export async function handleDownloadAllClick(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState,
  callbacks: WorkspaceDownloadCallbacks
): Promise<void> {
  if (state.activeDownload) {
    return
  }

  const allPlans = state.resources.map(resource => buildDownloadActionPlan(resource, state.resources))
  const allowedPlans = allPlans.filter(plan => isWebDownloadMediaAllowed(plan.resource))
  const skippedUnsafeResourceCount = allPlans.length - allowedPlans.length
  const queuePlan = buildDownloadQueuePlan(allowedPlans)
  if (!queuePlan.canStart) {
    if (skippedUnsafeResourceCount > 0) {
      await confirmUnsafeFileTypeExtensionGuide(elements, state)
    }
    return
  }

  const originalLabel =
    elements.downloadAllButton.textContent || state.copy.parse.downloadAll || 'Download all'
  const downloadingAllLabel = state.copy.parse.downloadingAll ?? 'Downloading all...'
  const batchLink = queuePlan.items[0]?.resource.link || ''
  const successfulResources: MediaPost[] = []
  let downloadRetryCount = 0
  let successCount = 0
  let failedCount = 0
  let unsafeFileTypeSeen = false
  let extensionRequired = false
  let storageStopped = false
  let deferred = false

  state.activeDownload = true
  setWorkspaceButtonsLocked(elements, true)
  elements.downloadAllButton.textContent =
    state.copy.parse.checkingStorage ?? 'Checking storage...'
  setParseErrorMessage(elements, '')
  clearPendingTaskState(elements, state)

  try {
    let startReported = false
    for (const [index, plan] of queuePlan.items.entries()) {
      const resource = plan.resource
      const current = index + 1
      const markContext = createRuntimeDownloadMarkContext(resource)
      const executablePlan = await resolveDownloadStoragePlan(elements, state, plan)
      if (!executablePlan) {
        storageStopped = true
        break
      }
      if (!startReported) {
        reportGA4Event('web_download_start', {
          platform: resource.platform,
          download_mode: resource.downloadMode,
          save_strategy: executablePlan.method.saveStrategies.join(','),
          session_policy: executablePlan.method.sessionPolicy,
          link_host: safeLinkHost(batchLink),
          resource_type: queuePlan.items[0]?.resource.type.split('/')[0] ?? 'file'
        })
        startReported = true
      }
      elements.downloadAllButton.textContent = formatBatchDownloadingLabel(
        downloadingAllLabel,
        current,
        queuePlan.items.length
      )

      try {
        const downloadResult = await runSingleResourcePlan(executablePlan, state, markContext, snapshot => {
          updateRuntimeDownloadProgress(markContext, snapshot)
          elements.downloadAllButton.textContent = formatBatchDownloadingLabel(
            downloadingAllLabel,
            current,
            queuePlan.items.length,
            snapshot
          )
        })
        downloadRetryCount += downloadResult.retryCount
        recordDownloadStartOnce(markContext, state)
        successfulResources.push(
          resourceWithUsedNodeId(resource, markContext.usedNodeId ?? downloadResult.usedNodeId)
        )
        successCount += 1
      } catch (error) {
        if (error instanceof DownloadDeferred) {
          // 已完成的文件保留，停止本轮；状态 3 另行提示插件下载。
          if (error instanceof DownloadExtensionRequired) extensionRequired = true
          else deferred = true
          if (successCount > 0) callbacks.onRenderResults()
          break
        }
        const parsedError = error instanceof Error || typeof error === 'string' ? error : null
        const failedRetryCount = recordDownloadFailedMark({
          state,
          url: resource.link,
          resources: resource,
          error: parsedError,
          fallbackRetryCount: 0,
          markContext
        })
        downloadRetryCount += failedRetryCount
        failedCount += 1

        if (isUnsafeFileTypeError(parsedError)) {
          unsafeFileTypeSeen = true
        }
      }
    }

    if (extensionRequired) {
      showExtensionRequired(elements, state)
      return
    }
    if (deferred) {
      return
    }
    if (storageStopped) {
      if (successCount > 0) {
        callbacks.onRenderResults()
      }
      return
    }

    if (
      unsafeFileTypeSeen ||
      (skippedUnsafeResourceCount > 0 && successCount === queuePlan.items.length)
    ) {
      await confirmUnsafeFileTypeExtensionGuide(elements, state)
    } else if (successCount === queuePlan.items.length && skippedUnsafeResourceCount === 0) {
      const successEventParameters = {
        platform: queuePlan.items[0].resource.platform,
        download_mode: queuePlan.items[0].resource.downloadMode,
        save_strategy: 'object_url',
        session_policy: queuePlan.items[0]?.method.sessionPolicy ?? 'none',
        link_host: safeLinkHost(batchLink),
        resource_type: queuePlan.items[0]?.resource.type.split('/')[0] ?? 'file',
        file_size: queuePlan.items.reduce((sum, plan) => sum + (plan.resource.size ?? 0), 0)
      }
      recordHomepageMarkSilently(
        HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_SUCCESS,
        state,
        buildHomepageMarkMessage(batchLink, successfulResources)
      )
      reportGA4Event('web_download_success', successEventParameters)
      setParseErrorMessage(elements, state.copy.downloadAll.allSuccess ?? 'All files downloaded.')
    } else if (successCount > 0) {
      setParseErrorMessage(elements, state.copy.downloadAll.partialFailed ?? 'Some files failed.')
    } else if (failedCount > 0) {
      setParseErrorMessage(elements, state.copy.downloadAll.allFailed ?? state.copy.errors.downloadFailed)
    }
    if (successCount > 0) {
      callbacks.onRenderResults()
    }
  } catch (error) {
    const parsedError = error instanceof Error || typeof error === 'string' ? error : null
    recordDownloadFailedMark({
      state,
      url: batchLink,
      resources: [],
      error: parsedError,
      fallbackRetryCount: downloadRetryCount
    })
    await handleDownloadError(elements, state, parsedError)
  } finally {
    setWorkspaceButtonsLocked(elements, false)
    state.activeDownload = false
    elements.downloadAllButton.textContent = originalLabel
    if (deferred) elements.downloadAllButton.focus()
  }
}

/** 点击 Continue / Restart 恢复当前待办下载。 */
export async function handlePendingResumeContinue(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState,
  callbacks: WorkspaceDownloadCallbacks
): Promise<void> {
  if (state.activeDownload || !state.pendingDownloadTask) {
    return
  }

  let deferred = false
  const record = state.pendingDownloadTask
  const method = getDownloadMethod(record.mode)
  const resource = resourceFromResumeRecord(record)
  const markContext = createRuntimeDownloadMarkContext(resource)
  if (record.preferredNodeId !== undefined) {
    markContext.usedNodeId = record.preferredNodeId
  }

  state.activeDownload = true
  setWorkspaceButtonsLocked(elements, true)
  elements.pendingResumeContinue.disabled = true
  elements.pendingResumeContinue.textContent = state.copy.parse.resuming ?? state.copy.parse.downloading
  setParseErrorMessage(elements, '')

  try {
    const result = await resumeDownloadResource(resource, record, buildRequestContext(state), {
      onProgress: snapshot => {
        updateRuntimeDownloadProgress(markContext, snapshot)
        elements.pendingResumeContinue.textContent = formatProgressLabel(
          state.copy.parse.downloading,
          snapshot
        )
      }
    })
    executeDownloadCompletion(result.completion)
    recordHomepageMarkSilently(
      HOMEPAGE_MARK_TYPE.WEB_DOWNLOAD_SUCCESS,
      state,
      buildHomepageDownloadSuccessMarkMessage(
        record.link,
        resourceWithUsedNodeId(resource, markContext.usedNodeId ?? result.usedNodeId),
        buildRuntimeDownloadSuccessMarkTask(markContext, result.completion),
        result.retryCount
      )
    )
    await method.clearResume?.(record)
    clearPendingTaskState(elements, state)
    callbacks.onRenderResults()
  } catch (error) {
    if (error instanceof DownloadExtensionRequired) { showExtensionRequired(elements, state); return }
    if (error instanceof DownloadDeferred) { deferred = true; return }
    const parsedError = error instanceof Error || typeof error === 'string' ? error : null
    if (parsedError instanceof Error && !(parsedError instanceof AutoRangeResumeExhaustedError)) {
      console.error(parsedError)
    }
    recordDownloadFailedMark({
      state,
      url: record.link,
      resources: resource,
      error: parsedError,
      fallbackRetryCount: 0,
      markContext
    })
    if (parsedError instanceof AutoRangeResumeExhaustedError) {
      await restorePendingDownloadTask(elements, state)
    } else {
      await clearPendingResumeRecord(record, elements, state)
    }
    await handleDownloadError(elements, state, parsedError)
  } finally {
    setWorkspaceButtonsLocked(elements, false)
    elements.pendingResumeContinue.disabled = false
    state.activeDownload = false
    updatePendingResumePrompt(elements, state)
    if (deferred) elements.pendingResumeContinue.focus()
  }
}

/** 忽略待恢复下载状态。 */
export async function handlePendingResumeDismiss(
  elements: WorkspaceElements,
  state: WorkspaceDownloadState
): Promise<void> {
  if (!state.pendingDownloadTask) {
    clearPendingTaskState(elements, state)
    return
  }

  await clearPendingResumeRecord(state.pendingDownloadTask, elements, state)
}
