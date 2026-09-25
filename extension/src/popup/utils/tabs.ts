/**
 * Popup 标签页工具
 *
 * 功能:
 * - 获取当前活动标签页
 * - 判断标签页是否为站点支持的页面
 * - 确保 Popup 固定到一个站点标签页
 * - 把非站点页面上的用户带到站点页面
 */

import { logger } from '@/core/utils/logger'
import { SITE_REGISTRATION } from '@/platforms/registry'

/** 从 Manifest match pattern 取出精确 hostname；通配符 host 返回 null。 */
function readMatchPatternHostname(matchPattern: string): string | null {
  const host = /^[a-z*]+:\/\/([^/]+)\//.exec(matchPattern)?.[1]
  return host && !host.includes('*') ? host.toLowerCase() : null
}

/** 站点页面的精确 hostname 集合，由注册表的 match patterns 派生，避免两处维护。 */
const SITE_HOSTNAMES = new Set(
  SITE_REGISTRATION.matches
    .map(readMatchPatternHostname)
    .filter((hostname): hostname is string => hostname !== null)
)

/**
 * 判断标签页 URL 是否属于站点页面。
 *
 * @param url 标签页 URL
 * @returns 是否为站点页面
 */
export function isSitePageUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  try {
    return SITE_HOSTNAMES.has(new URL(url).hostname.toLowerCase())
  } catch (error) {
    logger.debug('[Tabs] 标签页 URL 解析失败:', url, error)
    return false
  }
}

/**
 * 获取当前活动标签页
 *
 * @returns 活动标签页，如果获取失败则返回 null
 */
async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    return tab || null
  } catch (error) {
    logger.error('[Tabs] Failed to get current tab:', error)
    return null
  }
}

/**
 * 确保 Popup 固定到一个站点标签页。
 *
 * 当前标签页就是站点页面时直接使用；否则复用任意已打开的站点标签页并切到前台。都不存在
 * 时返回 null，由各 Store 呈现未连接提示，不自动创建新标签页。
 */
export async function ensureSupportedTabOpen(): Promise<chrome.tabs.Tab | null> {
  try {
    const currentTab = await getCurrentTab()
    if (isSitePageUrl(currentTab?.url)) {
      return currentTab
    }

    const allTabs = await chrome.tabs.query({})
    const supportedTab = allTabs.find(tab => isSitePageUrl(tab.url))
    if (!supportedTab) {
      logger.info('[Tabs] 未找到已打开的站点标签页，保持当前标签页禁用态')
      return null
    }

    const activatedTab = await chrome.tabs.update(supportedTab.id, { active: true })
    logger.info('[Tabs] 切换到已存在的站点标签页:', supportedTab.id)
    return activatedTab ?? supportedTab
  } catch (error) {
    logger.error('[Tabs] 确保站点标签页打开失败:', error)
    return null
  }
}

/**
 * 把用户带到站点页面，供非站点页面上的 Popup 引导按钮调用。
 *
 * 先复用 `ensureSupportedTabOpen` 的查找与切换逻辑：Popup 打开后用户仍可能自己开了站点
 * 标签页，此时切过去比再开一个更符合预期。确实一个都没有时才新建站点入口页标签页。
 *
 * 不并入 `ensureSupportedTabOpen`：那个函数的调用方依赖「找不到就返回 null、绝不新建」，
 * 自动新建会让它在任何页面上都返回可用 tab，未连接态就再也无法呈现。
 *
 * @returns 最终落到的标签页；新建也失败时为 null
 */
export async function openSiteTab(): Promise<chrome.tabs.Tab | null> {
  const existingTab = await ensureSupportedTabOpen()
  if (existingTab) {
    return existingTab
  }

  try {
    const createdTab = await chrome.tabs.create({ url: SITE_REGISTRATION.homeUrl, active: true })
    logger.info('[Tabs] 新建站点标签页:', createdTab.id)
    return createdTab
  } catch (error) {
    logger.error('[Tabs] 新建站点标签页失败:', error)
    return null
  }
}
