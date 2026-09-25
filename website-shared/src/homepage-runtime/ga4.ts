/**
 * GA4 上报辅助函数。
 *
 * 全局 gtag 由 `Layout.astro` 注入，运行环境（例如 SSR、本地 dev、禁用脚本的浏览器）
 * 可能不存在，因此所有调用点都必须经过本辅助函数做 safe guard。
 */

import { safeUserLinkHost } from '../download/scripts/url'

type GA4EventParamValue = string | number | boolean | undefined

type GtagFn = (command: 'event', name: string, params?: Record<string, GA4EventParamValue>) => void

interface ErrorWithOptionalCode extends Error {
  /** 后端或浏览器错误码。 */
  code?: string | number
}

declare global {
  interface Window {
    gtag?: GtagFn
  }
}

export function reportGA4Event(
  name: string,
  params?: Record<string, GA4EventParamValue>
): void {
  if (typeof window === 'undefined') {
    return
  }

  const gtag = window.gtag
  if (typeof gtag !== 'function') {
    return
  }

  try {
    gtag('event', name, params)
  } catch {
    // 防止埋点异常影响主流程。
  }
}

/** 从用户提交的链接中安全提取 host，失败返回 'invalid'。 */
export function safeLinkHost(link: string): string {
  return safeUserLinkHost(link)
}

/** 从异常中提取简短原因字符串。 */
export function extractFailureReason(error: Error | string | null | undefined): string {
  if (error instanceof Error) {
    const code = (error as ErrorWithOptionalCode).code
    if (code !== undefined && code !== null && code !== '') {
      return String(code)
    }
    return error.name || 'error'
  }
  if (typeof error === 'string' && error.length > 0) {
    return error
  }
  return 'unknown'
}
