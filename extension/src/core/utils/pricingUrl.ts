/** 订阅页 URL 合同，供 content 页面入口在无法打开 popup 购买视图时回退官网使用。 */
import { WEBSITE } from '@/core/api/config'

/** Pricing 来源，用于官网埋点区分插件入口；popup 内入口已改走内嵌购买视图。 */
export type PricingSource = 'upgrade_modal'

/**
 * 构建官网 Pricing URL。
 */
export function buildPricingUrl(source: PricingSource): string {
  const url = new URL(WEBSITE.PRICING_PATH, WEBSITE.BASE_URL)
  url.searchParams.set('utm_source', 'extension')
  url.searchParams.set('source', source)
  return url.toString()
}

/** 构建插件内独立订阅页 URL。 */
export function buildExtensionPricingUrl(source: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const url = new URL(chrome.runtime.getURL('ext-pricing.html'))
    url.searchParams.set('utm_source', 'extension')
    url.searchParams.set('source', source)
    return url.toString()
  }

  return buildPricingUrl('upgrade_modal')
}
