/** 订阅页 URL 合同，供页面导航与 background 登录后跳转共用。 */
import { WEBSITE } from '@/core/api/config'

/** Pricing 来源，用于官网埋点区分插件入口。 */
export type PricingSource =
  | 'quota_counter'
  | 'quota_upgrade_button'
  | 'quota_unlimited_button'
  | 'upgrade_modal'

/**
 * 构建官网 Pricing URL。
 */
export function buildPricingUrl(source: PricingSource): string {
  const url = new URL(WEBSITE.PRICING_PATH, WEBSITE.BASE_URL)
  url.searchParams.set('utm_source', 'extension')
  url.searchParams.set('source', source)
  return url.toString()
}
