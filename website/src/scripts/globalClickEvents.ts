/**
 * 全局 data-ga-event 委派：任何带 `data-ga-event` 的元素被点击时，
 * 自动向 GA4 上报对应事件。其他 data-ga-* 属性会作为 event params 一并带上。
 *
 * 新 CTA 只需在元素上加 `data-ga-event="xxx"`，不需要额外 JS。
 */

type GA4EventParamValue = string | number | boolean | undefined

// 本文件仅通过动态 import 引用重型埋点模块；显式导出确保全局类型扩展仍处于模块作用域。
export {}

type GtagFn = (command: 'event', name: string, params?: Record<string, GA4EventParamValue>) => void

declare global {
  interface Window {
    gtag?: GtagFn
  }
}

const GA_EVENT_ATTR = 'data-ga-event'
const GA_PARAM_PREFIX = 'data-ga-'
const CHROME_WEB_STORE_HOST = 'chromewebstore.google.com'
const MARK_RECORD_PATH = '/api/client/mark/record'

function collectParams(element: HTMLElement): Record<string, GA4EventParamValue> {
  const params: Record<string, GA4EventParamValue> = {}
  for (const attr of Array.from(element.attributes)) {
    if (!attr.name.startsWith(GA_PARAM_PREFIX) || attr.name === GA_EVENT_ATTR) {
      continue
    }
    // data-ga-foo-bar -> foo_bar
    const key = attr.name.slice(GA_PARAM_PREFIX.length).replace(/-/g, '_')
    if (key.length === 0) {
      continue
    }
    params[key] = attr.value
  }

  if (element instanceof HTMLAnchorElement && element.href && params.href === undefined) {
    params.href = element.href
  }

  return params
}

function findChromeWebStoreAnchor(element: HTMLElement): HTMLAnchorElement | null {
  const anchor = element.closest<HTMLAnchorElement>('a[href]')
  if (!anchor) {
    return null
  }

  try {
    return new URL(anchor.href).hostname === CHROME_WEB_STORE_HOST ? anchor : null
  } catch {
    return null
  }
}

async function dispatchInstallClickMark(target: HTMLElement): Promise<void> {
  const anchor = findChromeWebStoreAnchor(target)
  if (!anchor) {
    return
  }

  const [markModule, authModule, deviceModule, apiModule, slsModule] = await Promise.all([
    import('./homepage/mark'),
    import('./homepage/auth'),
    import('./homepage/device'),
    import('./homepage/api'),
    import('./homepage/sls-mark')
  ])
  const deviceId = await deviceModule.ensureDeviceId()
  const context = {
    deviceId,
    token: authModule.getStoredAccessToken()
  }
  const source = target.getAttribute('data-ga-source') ?? ''
  const markMsg = markModule.buildHomepageMarkMessage(anchor.href, [
    {
      sourceId: source || 'chrome_web_store',
      filename: document.title,
      type: target.getAttribute(GA_EVENT_ATTR) ?? 'chrome_web_store_click',
      size: 0,
      link: anchor.href,
      // 安装按钮 mark 不关联实际媒体资源，用站点唯一平台满足 MediaPost 类型约束。
      platform: 'vimeo',
      capabilities: {
        download: false,
        play: false
      }
    }
  ])

  slsModule.reportHomepageMarkToSls(
    markModule.HOMEPAGE_MARK_TYPE.WEB_EXTENSION_INSTALL_CLICK,
    context,
    markMsg
  )
  apiModule.postJsonKeepalive(
    MARK_RECORD_PATH,
    context,
    {
      mark_type: markModule.HOMEPAGE_MARK_TYPE.WEB_EXTENSION_INSTALL_CLICK,
      mark_msg: markMsg,
      first_opened_at: deviceModule.ensureFirstOpenedAt()
    }
  )
}

function dispatchGAEvent(target: HTMLElement): void {
  const eventName = target.getAttribute(GA_EVENT_ATTR)
  if (!eventName) {
    return
  }

  const gtag = window.gtag
  if (typeof gtag !== 'function') {
    return
  }

  try {
    gtag('event', eventName, collectParams(target))
  } catch {
    // 防止埋点异常影响主流程。
  }
}

document.addEventListener(
  'click',
  event => {
    const origin = event.target
    if (!(origin instanceof Element)) {
      return
    }
    const target = origin.closest<HTMLElement>(`[${GA_EVENT_ATTR}]`)
    if (!target) {
      return
    }
    void dispatchInstallClickMark(target).catch(error => {
      console.error(
        new Error('[global-click-events] Failed to report a Chrome Web Store click.', {
          cause: error
        })
      )
    })
    dispatchGAEvent(target)
  },
  { capture: true }
)
