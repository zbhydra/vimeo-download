import { HomepageApiError, postJson, type RequestContext } from './api'
import { ensureFirstOpenedAt } from './device'
import { sanitizeMarkText, sanitizeMarkUrl } from './mark-sanitizer'
import { reportHomepageMarkToSls } from './sls-mark'

type DownloadMode = 'direct' | 'client_mux'

/** 存储预检未通过的原因。 */
export type StoragePreflightReason =
  | 'insufficient_storage'
  | 'opfs_unavailable_for_large_file'

/** 存储预检埋点保留的最小浏览器诊断信息。 */
export interface StoragePreflightBrowserInfo {
  /** 浏览器 UA，用于识别浏览器版本和 WebView。 */
  userAgent?: string
  /** Chromium 暴露的近似设备内存 GiB。 */
  deviceMemory?: number
}

/** 存储预检埋点字段。 */
export interface StoragePreflightMarkOptions {
  /** 当前下载方法。 */
  downloadMode: DownloadMode
  /** 预检未通过的原因。 */
  reason: StoragePreflightReason
  /** 下载文件大小。 */
  fileSizeBytes: number | null
  /** 浏览器估算的可用 origin storage。 */
  availableBytes?: number
  /** 本次下载要求的 origin storage。 */
  requiredBytes: number | null
  /** 最小浏览器诊断信息。 */
  browserInfo?: StoragePreflightBrowserInfo
  /** OPFS 探测失败的底层错误名。 */
  causeName?: string
  /** OPFS 探测失败的底层错误消息。 */
  causeMessage?: string
}

interface MediaPost {
  sourceId: string
  filename: string
  type: string
  size: number | null
  link?: string
  platform?: string
  downloadMode?: DownloadMode
  capabilities?: {
    download?: boolean
    play?: boolean
    downloadQueue?: boolean
  }
  messageId?: number | string
  preferredNodeId?: number
}

export const HOMEPAGE_MARK_TYPE = {
  WEB_FIRST_OPENED: 'web_first_opened',
  WEB_PRICING_OPEN_FROM_EXTENSION: 'web_pricing_open_from_extension',
  WEB_EXTENSION_STORE_REVIEW_CLICK: 'web_extension_store_review_click',
  WEB_PARSE_CLICK: 'web_parse_click',
  WEB_PARSE_SUCCESS: 'web_parse_success',
  WEB_PARSE_FAILED: 'web_parse_failed',
  WEB_DOWNLOAD_START: 'web_download_start',
  WEB_DOWNLOAD_SUCCESS: 'web_download_success',
  WEB_DOWNLOAD_FAILED: 'web_download_failed',
  WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED: 'web_download_storage_preflight_blocked',
  WEB_EXTENSION_INSTALL_CLICK: 'web_extension_install_click',
  WEB_CREDIT_PURCHASE_MODAL_OPEN: 'web_credit_purchase_modal_open',
  WEB_CREDIT_PURCHASE_BUY_CLICK: 'web_credit_purchase_buy_click'
} as const

type HomepageMarkType = (typeof HOMEPAGE_MARK_TYPE)[keyof typeof HOMEPAGE_MARK_TYPE]

interface HomepageMarkResponse {
  recorded: boolean
}

const MAX_MARK_MSG_LENGTH = 1000
const MAX_MARK_URL_LENGTH = 240
const MAX_MARK_FILENAME_LENGTH = 80
const MAX_MARK_RESOURCE_COUNT = 3

interface HomepageMarkResourceSummary {
  source_id: string
  filename: string
  type: string
  size: number
  message_id?: string
  preferred_node_id?: number
}

type HomepageMarkErrorPhase = 'parse' | 'download'

interface HomepageMarkErrorSummary {
  phase: HomepageMarkErrorPhase
  name: string
  message: string
  /** 结构化错误原因，便于后台聚合。 */
  reason?: string
  /** 底层错误类型。 */
  cause_name?: string
  /** 底层错误消息。 */
  cause_message?: string
  status?: number
  code?: number | string
}

interface StoragePreflightBrowserSummary {
  user_agent?: string
  device_memory?: number
}

interface StoragePreflightCauseSummary {
  name: string
  message?: string
}

interface StoragePreflightMarkPayload {
  url: string
  reason: StoragePreflightReason
  download_mode: DownloadMode
  file_size_bytes: number | null
  available_bytes?: number
  required_bytes: number | null
  browser?: StoragePreflightBrowserSummary
  cause?: StoragePreflightCauseSummary
}

interface HomepageMarkCheckpointSummary {
  source_id?: string
  filename?: string
  downloaded_bytes?: number
  total_bytes?: number
  persistent?: boolean
}

interface HomepageMarkDownloadStatsSummary {
  bytes_done?: number
  bytes_total?: number
  average_bps?: number
  reason: string
}

interface DownloadTaskForMark {
  sourceId?: string
  filename?: string
  downloadedBytes?: number
  totalBytes?: number | null
  speedBytesPerSecond?: number | null
  averageBytesPerSecond?: number | null
  averageBps?: number | null
  persistent?: boolean
}

type MarkError = Error | string | null

interface MarkErrorRecord extends Error {
  /** 后端 HTTP 状态或前端模拟状态。 */
  status?: number
  /** 后端业务错误码。 */
  code?: number | string
  /** 下载进度快照。 */
  task?: DownloadTaskForMark
  /** 结构化错误原因。 */
  reason?: string
  /** 底层错误类型。 */
  causeName?: string
  /** 底层错误消息。 */
  causeMessage?: string
}

interface HomepageMarkDetails {
  error?: HomepageMarkErrorSummary
  checkpoint?: HomepageMarkCheckpointSummary
  download_stats?: HomepageMarkDownloadStatsSummary
  reason?: string
  platform?: string
  link_host?: string
  parse_duration_ms?: number
  auto_resume?: boolean
  retry_count?: number
}

/** 解析失败埋点字段。 */
export interface HomepageParseFailureMarkOptions {
  /** 失败原因，用于快速聚合。 */
  reason: string
  /** 前端或后端识别的平台。 */
  platform?: string
  /** URL host，避免在 mark_msg 中保存完整失败输入。 */
  linkHost?: string
  /** 解析请求耗时，毫秒。 */
  parseDurationMs?: number
  /** 捕获到的错误对象。 */
  error?: MarkError
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength)
}

function normalizeFiniteNumber(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.floor(value)
}

function normalizeErrorCode(value: number | string | null | undefined): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.length > 0) {
    return truncateText(sanitizeMarkText(value), 64)
  }

  return undefined
}

function normalizeNonEmptyText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function summarizeResource(resource: MediaPost): HomepageMarkResourceSummary {
  const summary: HomepageMarkResourceSummary = {
    source_id: truncateText(sanitizeMarkText(resource.sourceId), 64),
    filename: truncateText(sanitizeMarkText(resource.filename), MAX_MARK_FILENAME_LENGTH),
    type: truncateText(resource.type, 32),
    size: resource.size ?? 0
  }

  if (resource.messageId !== undefined && resource.messageId !== null) {
    summary.message_id = truncateText(String(resource.messageId), 32)
  }
  if (
    typeof resource.preferredNodeId === 'number' &&
    Number.isInteger(resource.preferredNodeId) &&
    resource.preferredNodeId > 0
  ) {
    summary.preferred_node_id = resource.preferredNodeId
  }

  return summary
}

function summarizeDownloadStats(
  task: DownloadTaskForMark | null,
  downloadedBytes: number | undefined,
  totalBytes: number | undefined,
  reason: string
): HomepageMarkDownloadStatsSummary {
  const summary: HomepageMarkDownloadStatsSummary = {
    reason: truncateText(reason, 220)
  }
  const averageBps = [
    task?.speedBytesPerSecond,
    task?.averageBytesPerSecond,
    task?.averageBps
  ]
    .map(normalizeFiniteNumber)
    .find(value => value !== undefined)

  if (downloadedBytes !== undefined) {
    summary.bytes_done = downloadedBytes
  }
  if (totalBytes !== undefined) {
    summary.bytes_total = totalBytes
  }
  if (averageBps !== undefined) {
    summary.average_bps = averageBps
  }

  return summary
}

function summarizeDownloadSuccess(
  task: DownloadTaskForMark | null,
  retryCount = 0
): HomepageMarkDetails | undefined {
  const downloadedBytes = normalizeFiniteNumber(task?.downloadedBytes)
  const totalBytes = normalizeFiniteNumber(task?.totalBytes)
  const downloadStats = summarizeDownloadStats(
    task,
    downloadedBytes,
    totalBytes,
    'completed'
  )

  const hasDownloadStats =
    downloadStats.bytes_done !== undefined ||
    downloadStats.bytes_total !== undefined ||
    downloadStats.average_bps !== undefined
  if (!hasDownloadStats && retryCount <= 0) {
    return undefined
  }

  const details: HomepageMarkDetails = {}
  if (hasDownloadStats) {
    details.download_stats = downloadStats
  }
  if (retryCount > 0) {
    details.auto_resume = true
    details.retry_count = retryCount
  }

  return details
}

function summarizeDownloadFailure(error: MarkError, retryCount = 0): HomepageMarkDetails {
  const normalizedRetryCount = Math.max(normalizeFiniteNumber(retryCount) ?? 0, 0)
  const errorRecord = error instanceof Error ? (error as MarkErrorRecord) : null
  const errorName =
    error instanceof Error
      ? error.name || 'Error'
      : typeof error === 'string'
        ? 'StringError'
        : 'UnknownError'
  const errorMessage = sanitizeMarkText(
    error instanceof HomepageApiError && error.failureReason
      ? error.failureReason
      : error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown download failure'
  )

  const errorSummary: HomepageMarkErrorSummary = {
    phase: 'download',
    name: truncateText(errorName, 64),
    message: truncateText(errorMessage, 220)
  }
  const status = normalizeFiniteNumber(errorRecord?.status)
  const code = normalizeErrorCode(errorRecord?.code)
  const reason = normalizeNonEmptyText(errorRecord?.reason)
  const causeName = normalizeNonEmptyText(errorRecord?.causeName)
  const causeMessage = normalizeNonEmptyText(errorRecord?.causeMessage)

  if (status !== undefined) {
    errorSummary.status = status
  }
  if (code !== undefined) {
    errorSummary.code = code
  }
  if (reason !== undefined) {
    errorSummary.reason = reason
  }
  if (causeName !== undefined) {
    errorSummary.cause_name = causeName
  }
  if (causeMessage !== undefined) {
    errorSummary.cause_message = causeMessage
  }

  const task = errorRecord?.task ?? null
  const checkpoint: HomepageMarkCheckpointSummary = {}
  if (typeof task?.sourceId === 'string') {
    checkpoint.source_id = truncateText(sanitizeMarkText(task.sourceId), 64)
  }
  if (typeof task?.filename === 'string') {
    checkpoint.filename = truncateText(sanitizeMarkText(task.filename), MAX_MARK_FILENAME_LENGTH)
  }

  const downloadedBytes = normalizeFiniteNumber(task?.downloadedBytes)
  const totalBytes = normalizeFiniteNumber(task?.totalBytes)
  if (downloadedBytes !== undefined) {
    checkpoint.downloaded_bytes = downloadedBytes
  }
  if (totalBytes !== undefined) {
    checkpoint.total_bytes = totalBytes
  }
  if (typeof task?.persistent === 'boolean') {
    checkpoint.persistent = task.persistent
  }

  const downloadStats = summarizeDownloadStats(
    task,
    downloadedBytes,
    totalBytes,
    errorSummary.message
  )
  const details: HomepageMarkDetails =
    Object.keys(checkpoint).length > 0
      ? { error: errorSummary, checkpoint, download_stats: downloadStats }
      : { error: errorSummary, download_stats: downloadStats }

  if (normalizedRetryCount > 0) {
    details.auto_resume = true
  }
  details.retry_count = normalizedRetryCount

  return details
}

function summarizeError(
  phase: HomepageMarkErrorPhase,
  error: MarkError,
  fallbackMessage: string
): HomepageMarkErrorSummary {
  const errorRecord =
    error instanceof Error ? (error as Error & { status?: number; code?: number | string }) : null
  const errorName =
    error instanceof Error
      ? error.name || 'Error'
      : typeof error === 'string'
        ? 'StringError'
        : 'UnknownError'
  const errorMessage = sanitizeMarkText(
    error instanceof HomepageApiError && error.failureReason
      ? error.failureReason
      : error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : fallbackMessage
  )

  const summary: HomepageMarkErrorSummary = {
    phase,
    name: truncateText(errorName, 64),
    message: truncateText(errorMessage, 220)
  }
  const status = normalizeFiniteNumber(errorRecord?.status)
  const code = normalizeErrorCode(errorRecord?.code)

  if (status !== undefined) {
    summary.status = status
  }
  if (code !== undefined) {
    summary.code = code
  }

  return summary
}

function summarizeParseFailure(options: HomepageParseFailureMarkOptions): HomepageMarkDetails {
  const details: HomepageMarkDetails = {
    reason: options.reason,
    error: summarizeError('parse', options.error ?? null, options.reason)
  }

  if (options.platform) {
    details.platform = truncateText(options.platform, 32)
  }
  if (options.linkHost) {
    details.link_host = truncateText(options.linkHost, 120)
  }
  const parseDurationMs = normalizeFiniteNumber(options.parseDurationMs)
  if (parseDurationMs !== undefined) {
    details.parse_duration_ms = parseDurationMs
  }

  return details
}

function sanitizeDetails(details?: HomepageMarkDetails): HomepageMarkDetails | undefined {
  if (!details) {
    return undefined
  }

  const sanitized: HomepageMarkDetails = {}
  if (details.error) {
    sanitized.error = {
      ...details.error,
      name: truncateText(sanitizeMarkText(details.error.name), 64),
      message: truncateText(sanitizeMarkText(details.error.message), 220)
    }
    if (details.error.reason !== undefined) {
      sanitized.error.reason = truncateText(sanitizeMarkText(details.error.reason), 96)
    }
    if (details.error.cause_name !== undefined) {
      sanitized.error.cause_name = truncateText(sanitizeMarkText(details.error.cause_name), 64)
    }
    if (details.error.cause_message !== undefined) {
      sanitized.error.cause_message = truncateText(
        sanitizeMarkText(details.error.cause_message),
        220
      )
    }
  }
  if (details.checkpoint) {
    const checkpoint: HomepageMarkCheckpointSummary = {}
    if (details.checkpoint.source_id !== undefined) {
      checkpoint.source_id = truncateText(sanitizeMarkText(details.checkpoint.source_id), 64)
    }
    if (details.checkpoint.filename !== undefined) {
      checkpoint.filename = truncateText(
        sanitizeMarkText(details.checkpoint.filename),
        MAX_MARK_FILENAME_LENGTH
      )
    }
    if (details.checkpoint.downloaded_bytes !== undefined) {
      checkpoint.downloaded_bytes = details.checkpoint.downloaded_bytes
    }
    if (details.checkpoint.total_bytes !== undefined) {
      checkpoint.total_bytes = details.checkpoint.total_bytes
    }
    if (details.checkpoint.persistent !== undefined) {
      checkpoint.persistent = details.checkpoint.persistent
    }
    sanitized.checkpoint = checkpoint
  }
  if (details.download_stats) {
    const downloadStats: HomepageMarkDownloadStatsSummary = {
      reason: truncateText(sanitizeMarkText(details.download_stats.reason), 220)
    }
    if (details.download_stats.bytes_done !== undefined) {
      downloadStats.bytes_done = details.download_stats.bytes_done
    }
    if (details.download_stats.bytes_total !== undefined) {
      downloadStats.bytes_total = details.download_stats.bytes_total
    }
    if (details.download_stats.average_bps !== undefined) {
      downloadStats.average_bps = details.download_stats.average_bps
    }
    sanitized.download_stats = downloadStats
  }
  if (details.reason !== undefined) {
    sanitized.reason = truncateText(sanitizeMarkText(details.reason), 96)
  }
  if (details.platform !== undefined) {
    sanitized.platform = truncateText(details.platform, 32)
  }
  if (details.link_host !== undefined) {
    sanitized.link_host = truncateText(details.link_host, 120)
  }
  if (details.parse_duration_ms !== undefined) {
    sanitized.parse_duration_ms = details.parse_duration_ms
  }
  if (details.auto_resume !== undefined) {
    sanitized.auto_resume = details.auto_resume
  }
  if (details.retry_count !== undefined) {
    sanitized.retry_count = details.retry_count
  }

  return sanitized
}

function compactDetails(details?: HomepageMarkDetails): HomepageMarkDetails | undefined {
  if (!details) {
    return undefined
  }

  const compacted: HomepageMarkDetails = {}
  if (details.error) {
    compacted.error = {
      ...details.error,
      message: truncateText(details.error.message, 120)
    }
    if (details.error.cause_message !== undefined) {
      compacted.error.cause_message = truncateText(details.error.cause_message, 120)
    }
  }
  if (details.checkpoint) {
    compacted.checkpoint = {
      downloaded_bytes: details.checkpoint.downloaded_bytes,
      total_bytes: details.checkpoint.total_bytes,
      persistent: details.checkpoint.persistent
    }
  }
  if (details.download_stats) {
    compacted.download_stats = {
      bytes_done: details.download_stats.bytes_done,
      bytes_total: details.download_stats.bytes_total,
      average_bps: details.download_stats.average_bps,
      reason: truncateText(details.download_stats.reason, 120)
    }
  }
  if (details.reason !== undefined) {
    compacted.reason = truncateText(details.reason, 80)
  }
  if (details.platform !== undefined) {
    compacted.platform = truncateText(details.platform, 32)
  }
  if (details.link_host !== undefined) {
    compacted.link_host = truncateText(details.link_host, 120)
  }
  if (details.parse_duration_ms !== undefined) {
    compacted.parse_duration_ms = details.parse_duration_ms
  }
  if (details.auto_resume !== undefined) {
    compacted.auto_resume = details.auto_resume
  }
  if (details.retry_count !== undefined) {
    compacted.retry_count = details.retry_count
  }

  return compacted
}

export function buildHomepageMarkMessage(
  url: string,
  resources?: MediaPost | MediaPost[],
  details?: HomepageMarkDetails
): string {
  const normalizedUrl = truncateText(sanitizeMarkUrl(url), MAX_MARK_URL_LENGTH)
  const safeDetails = sanitizeDetails(details)
  const resourceList = Array.isArray(resources) ? resources : resources ? [resources] : []

  if (resourceList.length === 0 && !safeDetails) {
    return JSON.stringify({ url: normalizedUrl })
  }

  const summarizedResources = resourceList
    .slice(0, MAX_MARK_RESOURCE_COUNT)
    .map(summarizeResource)

  const fullPayload = {
    url: normalizedUrl,
    resource_count: resourceList.length,
    resources: summarizedResources,
    ...safeDetails
  }
  const fullPayloadText = JSON.stringify(fullPayload)
  if (fullPayloadText.length <= MAX_MARK_MSG_LENGTH) {
    return fullPayloadText
  }

  const reducedPayload = {
    url: normalizedUrl,
    resource_count: resourceList.length,
    resources: summarizedResources.map(resource => ({
      source_id: resource.source_id,
      type: resource.type,
      preferred_node_id: resource.preferred_node_id
    })),
    ...compactDetails(safeDetails)
  }
  const reducedPayloadText = JSON.stringify(reducedPayload)
  if (reducedPayloadText.length <= MAX_MARK_MSG_LENGTH) {
    return reducedPayloadText
  }

  const minimalPayloadText = JSON.stringify({
    url: normalizedUrl,
    resource_count: resourceList.length
  })
  if (minimalPayloadText.length <= MAX_MARK_MSG_LENGTH) {
    return minimalPayloadText
  }

  return JSON.stringify({ resource_count: resourceList.length })
}

export function buildHomepageDownloadFailedMarkMessage(
  url: string,
  resources: MediaPost | MediaPost[],
  error: MarkError,
  retryCount = 0
): string {
  return buildHomepageMarkMessage(url, resources, summarizeDownloadFailure(error, retryCount))
}

export function buildHomepageDownloadSuccessMarkMessage(
  url: string,
  resources: MediaPost | MediaPost[],
  task: DownloadTaskForMark | null,
  retryCount = 0
): string {
  return buildHomepageMarkMessage(url, resources, summarizeDownloadSuccess(task, retryCount))
}

export function buildHomepageParseFailedMarkMessage(
  url: string,
  options: HomepageParseFailureMarkOptions
): string {
  return buildHomepageMarkMessage(url, undefined, summarizeParseFailure(options))
}

/** 构造容量预检埋点，按字段整体降级，禁止切出无效 JSON。 */
export function buildHomepageStoragePreflightMarkMessage(
  url: string,
  options: StoragePreflightMarkOptions
): string {
  const payload: StoragePreflightMarkPayload = {
    url: truncateText(sanitizeMarkUrl(url), MAX_MARK_URL_LENGTH),
    reason: options.reason,
    download_mode: options.downloadMode,
    file_size_bytes: options.fileSizeBytes === null
      ? null : Math.max(normalizeFiniteNumber(options.fileSizeBytes) ?? 0, 0),
    required_bytes: options.requiredBytes === null
      ? null : Math.max(normalizeFiniteNumber(options.requiredBytes) ?? 0, 0)
  }

  const availableBytes = normalizeFiniteNumber(options.availableBytes)
  if (availableBytes !== undefined) {
    payload.available_bytes = Math.max(availableBytes, 0)
  }

  const browser: StoragePreflightBrowserSummary = {}
  if (options.browserInfo?.userAgent) {
    browser.user_agent = truncateText(sanitizeMarkText(options.browserInfo.userAgent), 160)
  }
  const deviceMemory = options.browserInfo?.deviceMemory
  if (typeof deviceMemory === 'number' && Number.isFinite(deviceMemory)) {
    browser.device_memory = Math.max(deviceMemory, 0)
  }
  if (Object.keys(browser).length > 0) {
    payload.browser = browser
  }

  const causeName = normalizeNonEmptyText(options.causeName)
  if (options.reason === 'opfs_unavailable_for_large_file' && causeName) {
    payload.cause = {
      name: truncateText(sanitizeMarkText(causeName), 64)
    }
    const causeMessage = normalizeNonEmptyText(options.causeMessage)
    if (causeMessage) {
      payload.cause.message = truncateText(sanitizeMarkText(causeMessage), 160)
    }
  }

  const fullPayloadText = JSON.stringify(payload)
  if (fullPayloadText.length <= MAX_MARK_MSG_LENGTH) {
    return fullPayloadText
  }

  const compactPayload: StoragePreflightMarkPayload = {
    url: truncateText(payload.url, 120),
    reason: payload.reason,
    download_mode: payload.download_mode,
    file_size_bytes: payload.file_size_bytes,
    available_bytes: payload.available_bytes,
    required_bytes: payload.required_bytes,
    browser: payload.browser
      ? {
          user_agent:
            payload.browser.user_agent === undefined
              ? undefined
              : truncateText(payload.browser.user_agent, 80),
          device_memory: payload.browser.device_memory
        }
      : undefined,
    cause: payload.cause ? { name: payload.cause.name } : undefined
  }
  const compactPayloadText = JSON.stringify(compactPayload)
  if (compactPayloadText.length <= MAX_MARK_MSG_LENGTH) {
    return compactPayloadText
  }

  return JSON.stringify({
    reason: 'storage_preflight_payload_too_large',
    file_size_bytes: payload.file_size_bytes,
    available_bytes: payload.available_bytes,
    required_bytes: payload.required_bytes
  })
}

export async function recordHomepageMark(
  markType: HomepageMarkType,
  context: RequestContext,
  markMsg = ''
): Promise<void> {
  reportHomepageMarkToSls(markType, context, markMsg)

  await postJson<HomepageMarkResponse>('/api/client/mark/record', context, {
    mark_type: markType,
    mark_msg: markMsg,
    first_opened_at: ensureFirstOpenedAt()
  })
}
