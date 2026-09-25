/**
 * 插件端阿里云 SLS WebTracking mark-log 上报。
 *
 * 这条链路替代旧的后端 mark_logs 写入：只写匿名 SLS GET 日志，失败不阻断插件下载流程。
 */

import { ALI_SLS_MARK, STORAGE_KEYS } from '../config'
import { storageManager } from '../../storage'
import type { UserInfo } from '../../types'
import { sanitizeMarkText } from './mark-sanitizer'

/** SLS 字段允许的值类型。 */
type SlsFieldValue = string | number | boolean | null

/** SLS WebTracking 日志字段。 */
export type SlsMarkFields = Record<string, SlsFieldValue>

export interface ExtensionMarkRecordOptions {
  /** 调用来源 URL 或 origin，用于填充 page_path。 */
  pageUrl?: string
}

/** SLS WebTracking 配置。 */
export interface SlsMarkConfig {
  /** 是否启用 SLS 上报。 */
  enabled: boolean
  /** SLS WebTracking endpoint，不含末尾斜杠。 */
  endpoint: string
  /** SLS Logstore 名称。 */
  logstore: string
  /** SLS topic。 */
  topic: string
  /** SLS source。 */
  source: string
}

const MAX_MARK_MSG_LENGTH = 1000
const MAX_USER_AGENT_LENGTH = 512
const MAX_TEXT_FIELD_LENGTH = 256
const SLS_API_VERSION = '0.6.0'

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function getRuntimePagePath(pageUrl: string | undefined): string {
  const source = pageUrl || (typeof location !== 'undefined' ? location.href : '')
  if (!source) {
    return ''
  }

  try {
    return truncateText(new URL(source).pathname, MAX_TEXT_FIELD_LENGTH)
  } catch {
    return truncateText(source, MAX_TEXT_FIELD_LENGTH)
  }
}

function getCurrentUserAgent(): string {
  if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') {
    return ''
  }

  return truncateText(navigator.userAgent, MAX_USER_AGENT_LENGTH)
}

function getCurrentLanguage(): string {
  if (typeof navigator === 'undefined' || typeof navigator.language !== 'string') {
    return ''
  }

  return truncateText(navigator.language, MAX_TEXT_FIELD_LENGTH)
}

function getCurrentViewport(): string {
  if (typeof window === 'undefined') {
    return '0x0'
  }

  return `${window.innerWidth}x${window.innerHeight}`
}

function buildSlsMarkMessage(markMsg: string): string {
  return truncateText(sanitizeMarkText(markMsg), MAX_MARK_MSG_LENGTH)
}

async function getDeviceId(): Promise<string> {
  return (await storageManager.get<string>(STORAGE_KEYS.DEVICE_ID)) ?? ''
}

/** 读取插件端 SLS 配置。 */
export function getSlsMarkConfig(): SlsMarkConfig {
  return ALI_SLS_MARK
}

/** 构造插件端 SLS mark-log 字段。 */
export async function buildSlsMarkFields(
  markType: string,
  markMsg: string,
  options: ExtensionMarkRecordOptions = {}
): Promise<SlsMarkFields> {
  const [accessToken, user] = await Promise.all([
    storageManager.get<string>(STORAGE_KEYS.ACCESS_TOKEN),
    storageManager.get<UserInfo>(STORAGE_KEYS.USER_INFO)
  ])
  return {
    event: 'mark-log',
    site: 'extension',
    client_product: 'extension',
    extension_version: chrome.runtime.getManifest().version,
    mark_type: truncateText(markType, MAX_TEXT_FIELD_LENGTH),
    mark_msg: buildSlsMarkMessage(markMsg),
    device_id: truncateText(await getDeviceId(), MAX_TEXT_FIELD_LENGTH),
    user_id: accessToken ? (user?.user_id ?? 0) : 0,
    page_path: getRuntimePagePath(options.pageUrl),
    mark_time: String(Date.now()),
    first_opened_at: (await storageManager.get<number>(STORAGE_KEYS.FIRST_OPENED_AT)) ?? 0,
    user_agent: getCurrentUserAgent(),
    language: getCurrentLanguage(),
    viewport: getCurrentViewport()
  }
}

/** 构造 SLS WebTracking GET URL。 */
export function buildSlsMarkUrl(config: SlsMarkConfig, fields: SlsMarkFields): string {
  const url = new URL(`/logstores/${config.logstore}/track`, config.endpoint)

  url.searchParams.set('APIVersion', SLS_API_VERSION)
  url.searchParams.set('__topic__', config.topic)
  url.searchParams.set('__source__', config.source)

  for (const [key, value] of Object.entries(fields)) {
    url.searchParams.set(key, String(value))
  }

  return url.toString()
}

/** 执行插件端 SLS WebTracking 请求，返回本次是否实际发送。 */
export async function sendExtensionMarkToSls(
  markType: string,
  markMsg: string,
  options: ExtensionMarkRecordOptions = {}
): Promise<boolean> {
  const config = getSlsMarkConfig()
  if (!config.enabled) {
    return false
  }

  const response = await fetch(
    buildSlsMarkUrl(config, await buildSlsMarkFields(markType, markMsg, options)),
    {
      method: 'GET',
      credentials: 'omit',
      keepalive: true
    }
  )

  if (!response.ok) {
    throw new Error(
      `[ExtensionSlsMark] WebTracking failed: status=${response.status}, statusText=${response.statusText}, mark_type=${markType}`
    )
  }

  return true
}
