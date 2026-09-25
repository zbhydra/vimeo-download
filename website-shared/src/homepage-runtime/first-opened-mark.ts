/**
 * Website 首次访问 mark-log 上报。
 *
 * 首次访问时间仍由 device 模块负责持久化；本模块独立记录 `web_first_opened`
 * 是否已提交过，避免和其它提前写入首次打开时间的启动流程耦合。
 */

import { getStoredAccessToken } from './auth'
import { postJsonKeepalive } from './api'
import {
  ensureDeviceId,
  ensureFirstOpenedAtState,
  FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON
} from './device'
import { HOMEPAGE_MARK_TYPE } from './mark'
import { reportHomepageMarkToSls } from './sls-mark'

/** 后端 mark-log 记录接口。 */
const MARK_RECORD_PATH = '/api/client/mark/record'
/** localStorage 中记录 `web_first_opened` 已发起提交的键名。 */
export const WEB_FIRST_OPENED_MARK_SUBMITTED_AT_STORAGE_KEY =
  'homepage_web_first_opened_submitted_at'

/** 当前页面生命周期内是否已经触发过首次访问上报。 */
let firstOpenedMarkSubmittedInPage = false

/** 构造首次访问事件的 mark_msg。 */
function buildFirstOpenedMarkMessage(localStorageAvailable: boolean): string {
  if (localStorageAvailable) {
    return ''
  }

  return JSON.stringify({
    reason: FIRST_OPENED_AT_STORAGE_UNAVAILABLE_REASON
  })
}

/**
 * 获取可用的 localStorage。
 *
 * 首次访问事件即使拿不到 localStorage 也要发出，失败原因放进 mark_msg。
 */
function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 判断当前浏览器是否已经提交过 `web_first_opened`。 */
function hasSubmittedFirstOpenedMark(): boolean {
  const storage = getLocalStorage()
  if (!storage) {
    return false
  }

  try {
    return storage.getItem(WEB_FIRST_OPENED_MARK_SUBMITTED_AT_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/** 记录当前浏览器已经发起提交 `web_first_opened`。 */
function storeSubmittedFirstOpenedMark(firstOpenedAt: number): boolean {
  const storage = getLocalStorage()
  if (!storage) {
    return false
  }

  try {
    storage.setItem(WEB_FIRST_OPENED_MARK_SUBMITTED_AT_STORAGE_KEY, String(firstOpenedAt))
    return true
  } catch {
    return false
  }
}

/** localStorage 不可用时仍允许匿名首次访问上报。 */
function readOptionalAccessToken(): string | null {
  try {
    return getStoredAccessToken()
  } catch {
    return null
  }
}

/**
 * 启动 website 首次访问上报。
 *
 * 已提交过首次访问事件时不重复上报；localStorage 不可用时仍在当前页面生命周期内只报一次。
 */
export function initializeWebsiteFirstOpenedMark(): void {
  if (firstOpenedMarkSubmittedInPage) {
    return
  }

  const firstOpenedState = ensureFirstOpenedAtState()
  if (hasSubmittedFirstOpenedMark()) {
    return
  }

  firstOpenedMarkSubmittedInPage = true

  void ensureDeviceId()
    .then(deviceId => {
      const context = {
        deviceId,
        token: readOptionalAccessToken()
      }
      const submittedMarkerPersisted = storeSubmittedFirstOpenedMark(firstOpenedState.firstOpenedAt)
      const markMsg = buildFirstOpenedMarkMessage(
        firstOpenedState.persisted && submittedMarkerPersisted
      )

      reportHomepageMarkToSls(HOMEPAGE_MARK_TYPE.WEB_FIRST_OPENED, context, markMsg)
      postJsonKeepalive(MARK_RECORD_PATH, context, {
        mark_type: HOMEPAGE_MARK_TYPE.WEB_FIRST_OPENED,
        mark_msg: markMsg,
        first_opened_at: firstOpenedState.firstOpenedAt
      })
    })
    .catch(error => {
      console.error('[FirstOpenedMark] 首次访问上报失败:', error)
    })
}
