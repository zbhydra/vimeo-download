/**
 * 下载工作区渲染模块。
 *
 * 只根据 state 和 elements 更新 DOM，不发起 API 请求。
 */

import type { DownloadWorkspaceContent } from '../../i18n/schema'
import { buildDownloadActionPlan } from './download-action-plan'
import { buildDownloadQueuePlan } from './download-queue-plan'
import type { DownloadProgressSnapshot, MediaPost } from './types'
import { setHidden, type WorkspaceElements } from './workspace-elements'
import type { WorkspaceRenderState } from './workspace-state'

/** 格式化字节数。 */
export function formatBytes(bytes: number): string {
  if (!bytes) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
  }

  return [minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function formatSourceType(type: string): string {
  return type.replace(/[_-]+/g, ' ').toUpperCase()
}

function buildResourceDetail(resource: MediaPost, copy: DownloadWorkspaceContent): string {
  // 站点只服务 Vimeo 单一平台，资源类型本身已足以描述，不再重复平台名。
  const parts = [formatSourceType(resource.type)]

  if (typeof resource.duration === 'number' && resource.duration > 0) {
    parts.push(formatDuration(resource.duration))
  }

  if (
    typeof resource.width === 'number' &&
    typeof resource.height === 'number' &&
    resource.width > 0 &&
    resource.height > 0
  ) {
    parts.push(`${resource.width}×${resource.height}`)
  }

  if (typeof resource.size === 'number' && resource.size > 0) {
    parts.push(formatBytes(resource.size))
  } else {
    parts.push(copy.parse.unknownSize ?? 'Unknown size')
  }

  return parts.join(' · ')
}

function normalizeProgressLabelBase(label: string): string {
  return label.replace(/[.。…]+$/u, '').trim()
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.floor(progress)))
}

function formatDownloadingLabel(baseLabel: string, progress?: number): string {
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    return baseLabel
  }

  return `${normalizeProgressLabelBase(baseLabel)} ${clampProgress(progress)}%`
}

function formatSpeed(speedBytesPerSecond?: number | null): string {
  if (typeof speedBytesPerSecond !== 'number' || !Number.isFinite(speedBytesPerSecond) || speedBytesPerSecond <= 0) {
    return ''
  }

  return `${formatBytes(speedBytesPerSecond)}/s`
}

/** 格式化单资源下载进度文案。 */
export function formatProgressLabel(baseLabel: string, snapshot?: DownloadProgressSnapshot): string {
  if (!snapshot) {
    return baseLabel
  }

  const label = formatDownloadingLabel(baseLabel, snapshot.progress)
  const speed = formatSpeed(snapshot.speedBytesPerSecond)
  if (!speed) {
    return label
  }

  return `${label} · ${speed}`
}

/** 格式化批量下载进度文案。 */
export function formatBatchDownloadingLabel(
  baseLabel: string,
  current: number,
  total: number,
  snapshot?: DownloadProgressSnapshot
): string {
  const prefix = `${normalizeProgressLabelBase(baseLabel)} ${current}/${total}`
  if (!snapshot || typeof snapshot.progress !== 'number' || Number.isNaN(snapshot.progress)) {
    return prefix
  }

  return `${prefix} · ${clampProgress(snapshot.progress)}%`
}

export function formatPendingResumeText(
  template: string,
  filename: string,
  progress: number | null
): string {
  const progressText = typeof progress === 'number' ? `${clampProgress(progress)}%` : 'unknown'
  return template.replace('{filename}', () => filename).replace('{progress}', progressText)
}

/** 更新待恢复下载提示。 */
export function updatePendingResumePrompt(
  elements: WorkspaceElements,
  state: WorkspaceRenderState
): void {
  const record = state.pendingDownloadTask
  if (!record) {
    setHidden(elements.pendingResumeActions, true)
    return
  }

  const isRestart = record.recoveryMode === 'restartable'
  const hintTemplate = isRestart
    ? state.copy.parse.pendingRestartText ?? 'Previous download record for "{filename}" can be restarted.'
    : state.copy.parse.resumeNotice ?? 'Detected an unfinished download for "{filename}". Continue?'
  const progress =
    record.totalBytes && record.totalBytes > 0
      ? (record.downloadedBytes / record.totalBytes) * 100
      : null
  elements.pendingResumeHint.textContent = formatPendingResumeText(
    hintTemplate,
    record.filename,
    progress
  )
  elements.pendingResumeContinue.textContent = isRestart
    ? state.copy.parse.pendingRestartButton ?? 'Restart download'
    : state.copy.parse.resumeAction ?? 'Continue'
  setHidden(elements.pendingResumeActions, false)
}

function buildDownloadButtonLabel(label: string): HTMLElement {
  const text = document.createElement('span')
  text.className = 'download-resource-button-label'
  text.textContent = label
  return text
}

/** 每次重新渲染结果都收起插件引导卡；它只在状态 3 等场景由下载流程重新展开。 */
function renderLargeFileExtensionGuide(elements: WorkspaceElements): void {
  setHidden(elements.largeFileExtensionGuide, true)
}

function updateDownloadAllVisibility(elements: WorkspaceElements, state: WorkspaceRenderState): void {
  const actionPlans = state.resources.map(resource =>
    buildDownloadActionPlan(resource, state.resources)
  )
  const queuePlan = buildDownloadQueuePlan(actionPlans)
  const visible = queuePlan.canStart
  setHidden(elements.resultsActions, !visible)

  if (!visible) {
    return
  }

  const baseLabel = state.copy.parse.downloadAll ?? 'Download all'
  elements.downloadAllButton.textContent = `${baseLabel} (${queuePlan.items.length})`
}

/** 渲染解析资源卡片。 */
export function renderResults(elements: WorkspaceElements, state: WorkspaceRenderState): void {
  elements.resultsContainer.innerHTML = ''

  if (state.resources.length === 0) {
    updateDownloadAllVisibility(elements, state)
    renderLargeFileExtensionGuide(elements)
    return
  }

  for (const resource of state.resources) {
    const card = document.createElement('article')
    card.className = 'download-result-card'
    card.setAttribute('data-download-result-card', '')

    if (resource.thumbnailUrl) {
      const thumbnail = document.createElement('img')
      thumbnail.className = 'download-result-thumbnail'
      thumbnail.src = resource.thumbnailUrl
      thumbnail.alt = ''
      thumbnail.loading = 'lazy'
      card.append(thumbnail)
    }

    const meta = document.createElement('div')
    meta.className = 'download-result-meta'

    const name = document.createElement('p')
    name.className = 'download-result-name'
    name.textContent = resource.filename

    const detail = document.createElement('p')
    detail.className = 'download-result-detail'
    detail.textContent = buildResourceDetail(resource, state.copy)

    meta.append(name, detail)

    const actions = document.createElement('div')
    actions.className = 'download-result-actions'

    if (resource.capabilities.download) {
      const action = document.createElement('button')
      action.type = 'button'
      action.className = 'btn-primary download-resource-button'
      action.dataset.link = resource.link
      action.dataset.sourceId = resource.sourceId
      action.dataset.filename = resource.filename
      action.dataset.platform = resource.platform
      action.dataset.downloadMode = resource.downloadMode
      action.dataset.resumeReady = '0'
      action.setAttribute('data-download-resource-button', '')
      action.append(buildDownloadButtonLabel(state.copy.parse.download))

      actions.append(action)
    }
    card.append(meta, actions)
    elements.resultsContainer.append(card)
  }

  updateDownloadAllVisibility(elements, state)
  renderLargeFileExtensionGuide(elements)
}
