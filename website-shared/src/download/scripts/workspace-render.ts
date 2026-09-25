/**
 * 下载工作区渲染模块。
 *
 * 只根据 state 和 elements 更新 DOM，不发起 API 请求。
 */

import type { DownloadWorkspaceContent } from '../schema'
import { buildDownloadActionPlan } from './download-action-plan'
import { buildDownloadQueuePlan } from './download-queue-plan'
import type { DownloadProgressSnapshot, MediaPost } from './types'
import { setHidden, type WorkspaceElements } from './workspace-elements'
import type { WorkspaceRenderState } from './workspace-state'

const WEBSITE_TIME_ZONE = 'America/New_York'

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

function replaceTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = values[key]
    return value === undefined ? match : String(value)
  })
}

/** 按后端 Credits 下载扣费规则预估单资源消耗。 */
function calculateDownloadCredits(sizeBytes: number | null): number {
  if (sizeBytes === null) {
    return 2
  }

  const mib = 1024 * 1024
  if (sizeBytes < 50 * mib) {
    return 1
  }
  if (sizeBytes < 300 * mib) {
    return 2
  }
  if (sizeBytes < 800 * mib) {
    return 3
  }
  if (sizeBytes < 1300 * mib) {
    return 4
  }
  if (sizeBytes < 1800 * mib) {
    return 5
  }
  if (sizeBytes < 2300 * mib) {
    return 6
  }
  if (sizeBytes < 2800 * mib) {
    return 7
  }
  if (sizeBytes < 3300 * mib) {
    return 8
  }
  if (sizeBytes < 3800 * mib) {
    return 9
  }
  if (sizeBytes < 4300 * mib) {
    return 10
  }
  return 11 + Math.floor((sizeBytes - 4300 * mib) / (500 * mib))
}

function buildCreditsBadge(resource: MediaPost, copy: DownloadWorkspaceContent): HTMLElement {
  const badge = document.createElement('span')
  badge.className = 'download-resource-credits-badge'
  badge.setAttribute('aria-label', `${calculateDownloadCredits(resource.size)} ${copy.auth.creditsLabel}`)

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')

  // modern 主题用硬币：实心圆盘、奶油色内环和中心点；其他主题保留星形。
  if (document.documentElement.dataset.uiTheme === 'modern') {
    const coinParts: Array<Record<string, string>> = [
      { cx: '12', cy: '12', r: '9.5' },
      { cx: '12', cy: '12', r: '5.5', fill: 'none', stroke: '#fef3c7' },
      { cx: '12', cy: '12', r: '1.8', fill: '#fef3c7', stroke: 'none' }
    ]
    for (const attrs of coinParts) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      for (const [name, value] of Object.entries(attrs)) {
        el.setAttribute(name, value)
      }
      icon.append(el)
    }
  } else {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M12 3.8 14.5 9l5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.8Z')
    icon.append(path)
  }

  const text = document.createElement('span')
  text.textContent = String(calculateDownloadCredits(resource.size))

  badge.append(icon, text)
  return badge
}

function buildDownloadButtonLabel(label: string): HTMLElement {
  const text = document.createElement('span')
  text.className = 'download-resource-button-label'
  text.textContent = label
  return text
}

function renderLargeFileExtensionGuide(elements: WorkspaceElements): void {
  if (elements.largeFileExtensionGuide.dataset.downloadLargeFileExtensionDefault === 'true') {
    setHidden(elements.largeFileExtensionGuide, false)
    return
  }

  setHidden(elements.largeFileExtensionGuide, true)
}

function getAccountInitial(email: string): string {
  const first = email.trim().charAt(0)
  return first ? first.toUpperCase() : 'U'
}

function formatCreditsLabel(balance: number): string {
  return `${balance} Credits`
}

function renderAccountAvatar(elements: WorkspaceElements, user: NonNullable<WorkspaceRenderState['user']>): void {
  const avatarUrl = user.avatar_url?.trim()
  if (avatarUrl) {
    elements.accountAvatar.src = avatarUrl
    elements.accountAvatar.hidden = false
    elements.accountInitial.textContent = ''
    setHidden(elements.accountInitial, true)
    return
  }

  elements.accountAvatar.removeAttribute('src')
  elements.accountAvatar.hidden = true
  elements.accountInitial.textContent = getAccountInitial(user.email)
  setHidden(elements.accountInitial, false)
}

function renderAccountEntry(elements: WorkspaceElements, state: WorkspaceRenderState): void {
  const user = state.user
  if (!user) {
    setHidden(elements.accountEntry, true)
    setHidden(elements.accountMenu, true)
    elements.accountButton.setAttribute('aria-expanded', 'false')
    elements.accountAvatar.removeAttribute('src')
    elements.accountAvatar.hidden = true
    elements.accountInitial.textContent = ''
    elements.accountEmail.textContent = ''
    elements.accountEmail.removeAttribute('title')
    setHidden(elements.accountInitial, false)
    elements.creditsLabel.textContent = state.copy.checkin.creditsLoading
    return
  }

  const creditsBalance = state.checkin?.credits_balance ?? user.credits_balance
  renderAccountAvatar(elements, user)
  elements.accountEmail.textContent = user.email
  elements.accountEmail.title = user.email
  elements.creditsLabel.textContent =
    Number.isFinite(creditsBalance)
      ? formatCreditsLabel(Math.max(0, Math.floor(creditsBalance)))
      : state.copy.checkin.creditsLoading
  elements.creditsPill.disabled = false
  elements.creditsPill.setAttribute('aria-disabled', elements.creditsPill.disabled ? 'true' : 'false')
  setHidden(elements.accountEntry, false)
}

/** 渲染登录态相关 UI。 */
export function renderAuthenticatedUi(
  elements: WorkspaceElements,
  state: WorkspaceRenderState
): void {
  renderAccountEntry(elements, state)
}

/** 格式化美国东部时间，外层说明文案由各语言字典负责。 */
export function formatCheckinNextAt(timestampMs: number, template: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: WEBSITE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(timestampMs))
  return replaceTemplate(template, { time })
}

/** 格式化签到倒计时。 */
export function formatCheckinCountdown(timestampMs: number, nowMs = Date.now()): string {
  const remainingMs = Math.max(0, timestampMs - nowMs)
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }

  return `${seconds}s`
}

/** 渲染签到弹窗内容。 */
export function renderCheckinModal(
  elements: WorkspaceElements,
  state: WorkspaceRenderState,
  nowMs = Date.now()
): void {
  const checkin = state.checkin
  if (!checkin) {
    setHidden(elements.checkinModal, true)
    setHidden(elements.checkinError, true)
    return
  }

  const copy = state.copy.checkin
  const claimable =
    !checkin.campaign_ended && !checkin.today_claimed && checkin.today_reward_credits > 0
  elements.checkinTitle.textContent = copy.title
  elements.checkinTodayReward.textContent = replaceTemplate(copy.todayRewardText, {
    credits: checkin.today_reward_credits
  })
  elements.checkinResult.textContent = replaceTemplate(copy.claimedRewardText, {
    credits: checkin.today_reward_credits
  })
  setHidden(elements.checkinResult, !checkin.today_claimed)

  const hasNextClaim = checkin.today_claimed && typeof checkin.next_claim_at_ts === 'number'
  if (hasNextClaim && checkin.next_claim_at_ts !== null) {
    const countdown = formatCheckinCountdown(checkin.next_claim_at_ts, nowMs)
    const nextAt = formatCheckinNextAt(checkin.next_claim_at_ts, copy.nextAt)
    elements.checkinCountdown.textContent = replaceTemplate(copy.nextCountdown, { time: countdown })
    elements.checkinNextAt.textContent = nextAt
  }
  setHidden(elements.checkinNext, !hasNextClaim)

  elements.checkinClaimButton.textContent = replaceTemplate(copy.claimButton, {
    credits: checkin.today_reward_credits
  })
  setHidden(elements.checkinClaimButton, !claimable)
  setHidden(elements.checkinDismissButton, !claimable)
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
      action.className = 'download-resource-button'
      action.dataset.link = resource.link
      action.dataset.sourceId = resource.sourceId
      action.dataset.filename = resource.filename
      action.dataset.platform = resource.platform
      action.dataset.downloadMode = resource.downloadMode
      action.dataset.resumeReady = '0'
      action.setAttribute('data-download-resource-button', '')
      if (state.user) action.append(buildCreditsBadge(resource, state.copy))
      action.append(buildDownloadButtonLabel(state.copy.parse.download))

      actions.append(action)
    }
    card.append(meta, actions)
    elements.resultsContainer.append(card)
  }

  updateDownloadAllVisibility(elements, state)
  renderLargeFileExtensionGuide(elements)
}
