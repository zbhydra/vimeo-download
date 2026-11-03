/** 插件内独立订阅页的 URL 合同。 */

/** 构建插件内独立订阅页 URL。 */
export function buildExtensionPricingUrl(source: string): string {
  const url = new URL(chrome.runtime.getURL('ext-pricing.html'))
  url.searchParams.set('utm_source', 'extension')
  url.searchParams.set('source', source)
  return url.toString()
}
