/**
 * Injected provider 就绪信号。
 *
 * marker/event 只通知 document_idle content 可以开始调用固定 EventRpc，不承担认证或消息传输。
 */

/** injected provider 已就绪的 DOM 事件名。 */
export const INJECTED_READY_EVENT = 'vdl-injected-ready'

/** injected provider 已就绪的 documentElement marker。 */
export const INJECTED_READY_MARK = 'data-vdl-injected-ready'

/** injected provider 注册成功后发布一次就绪信号。 */
export function markInjectedReady(): void {
  document.documentElement.setAttribute(INJECTED_READY_MARK, '')
  document.dispatchEvent(new CustomEvent(INJECTED_READY_EVENT))
}

/** 等待当前页面的 injected provider 就绪。 */
export function waitForInjectedReady(siteName: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.documentElement.hasAttribute(INJECTED_READY_MARK)) {
      resolve()
      return
    }

    const timeout = window.setTimeout(() => {
      document.removeEventListener(INJECTED_READY_EVENT, handleReady)
      reject(
        new Error(
          `[InjectedReady:${siteName}] provider 就绪超时: event=${INJECTED_READY_EVENT}, timeout=${timeoutMs}ms`
        )
      )
    }, timeoutMs)

    const handleReady = (): void => {
      clearTimeout(timeout)
      document.removeEventListener(INJECTED_READY_EVENT, handleReady)
      resolve()
    }

    document.addEventListener(INJECTED_READY_EVENT, handleReady)
  })
}
