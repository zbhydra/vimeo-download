/** Pricing 页面来源识别；用于打点与好评赠送入口。 */

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
