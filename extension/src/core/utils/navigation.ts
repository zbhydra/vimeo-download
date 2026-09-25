/**
 * 导航工具函数
 * 提供统一的官网页面导航接口
 */

import { logger } from './logger'
import { WEBSITE } from '@/core/api/config'
import { buildPricingUrl, type PricingSource } from './pricingUrl'
export { buildPricingUrl, type PricingSource } from './pricingUrl'

/**
 * 构建官网首页 URL，埋点参数与 Pricing 保持同一套约定。
 *
 * @param source 插件内入口标识，用于官网侧区分流量来源
 */
export function buildHomeUrl(source: string): string {
  const url = new URL(WEBSITE.BASE_URL)
  url.searchParams.set('utm_source', 'extension')
  url.searchParams.set('source', source)
  return url.toString()
}

/**
 * 在新标签页打开外部链接，避免扩展 Popup 自身发生导航。
 *
 * @param url 需要打开的完整外部链接
 * @param destination 用于日志定位的目标页面名称
 * @returns 是否成功创建新标签页或浏览器窗口
 */
export async function openExternalPage(url: string, destination: string): Promise<boolean> {
  try {
    logger.info('[Navigation] 正在打开外部页面', { url, destination })

    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      await chrome.tabs.create({ url })
      return true
    }

    window.open(url, '_blank', 'noopener,noreferrer')
    return true
  } catch (error) {
    logger.error(`[Navigation] 打开外部页面失败: destination=${destination}, url=${url}`, error)
    return false
  }
}

/**
 * 打开官网 Pricing 页。
 */
export async function openPricingPage(source: PricingSource): Promise<boolean> {
  const url = buildPricingUrl(source)
  return openExternalPage(url, `pricing:${source}`)
}
