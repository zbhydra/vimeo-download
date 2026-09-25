/** Pricing 旧入口转向与来源识别；在登录及商品控制器启动前完成。 */

/** 保留主站既有插件来源识别规则。 */
export function readPricingEntryFlags() {
  const params = new URLSearchParams(window.location.search)
  const utmSource = params.get('utm_source')
  const source = params.get('source')
  return {
    isExtensionSource: utmSource === 'extension' || source === 'quota_counter',
    extensionEntryMarkMsg: utmSource === 'extension'
      ? JSON.stringify({ utm_source: utmSource, source })
      : null
  }
}

/** 模块只执行一次，保证中转页不消费 OAuth 或购买意图。 */
function redirectLegacyPricingEntry(): boolean {
  if (document.querySelector<HTMLElement>('[data-pricing-page]')?.dataset.pricingMode !== 'credits' ||
      !readPricingEntryFlags().isExtensionSource) {
    return false
  }
  const target = new URL(window.location.href)
  target.pathname = target.pathname.replace(/\/pricing\/?$/, '/ext-pricing/')
  window.location.replace(target.href)
  return true
}

export const pricingEntryRedirecting = redirectLegacyPricingEntry()
