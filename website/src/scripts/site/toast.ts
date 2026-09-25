/**
 * Website 全局 toast。
 *
 * 负责跨页面展示短暂反馈：查找 Layout 中的 host，写入文案，3.6 秒后自动隐藏。
 */

/** toast 视觉类型，后续页面复用时只需要传 type。 */
export type SiteToastType = 'error' | 'success' | 'info'

/** 全局 toast 展示选项。 */
export interface SiteToastOptions {
  /** toast 视觉类型。 */
  type?: SiteToastType
  /** 自动隐藏延迟，毫秒。 */
  durationMs?: number
}

const SITE_TOAST_SELECTOR = '[data-site-toast]'
const SITE_TOAST_DEFAULT_DURATION_MS = 3600

let siteToastTimer: number | null = null

function getOrCreateSiteToast(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(SITE_TOAST_SELECTOR)
  if (existing) {
    return existing
  }

  const element = document.createElement('div')
  element.className = 'site-toast'
  element.setAttribute('role', 'alert')
  element.setAttribute('aria-live', 'assertive')
  element.dataset.siteToast = ''
  element.hidden = true
  document.body.append(element)
  return element
}

/** 展示 Website 全局 toast，重复调用会覆盖上一次内容和自动隐藏计时。 */
export function showSiteToast(message: string, options: SiteToastOptions = {}): void {
  const toast = getOrCreateSiteToast()
  toast.textContent = message
  toast.dataset.toastType = options.type ?? 'error'
  toast.hidden = false

  if (siteToastTimer !== null) {
    window.clearTimeout(siteToastTimer)
  }

  siteToastTimer = window.setTimeout(() => {
    toast.hidden = true
    toast.textContent = ''
    siteToastTimer = null
  }, options.durationMs ?? SITE_TOAST_DEFAULT_DURATION_MS)
}
