/** 匿名授权协调：后端三态 → 持久化等待 → 复用下载凭证。 */
import { createAnonymousDownloadAuthorization, type MediaDownloadAuthorization } from './media-api'
import type { DownloadMethodContext } from './download-methods'
import type { MediaPost } from './types'
import type { WorkspaceElements } from './workspace-elements'
import type { WorkspaceState } from './workspace-state'

/** 关闭等待为用户中止，下载入口不得记录为失败。 */
export class DownloadDeferred extends Error {}

/** 后端要求该资源改用插件下载（状态 3）；同为用户中止，由入口展示插件引导。 */
export class DownloadExtensionRequired extends DownloadDeferred {}

let workspace: { elements: WorkspaceElements; state: WorkspaceState } | null = null

/** 绑定页面唯一工作区，等待窗口读取同一份文案与元素。 */
export function bindAnonymousDownloadWorkspace(elements: WorkspaceElements, state: WorkspaceState): void {
  workspace = { elements, state }
}

async function waitForDownload(deadline: number): Promise<void> {
  if (deadline <= Date.now()) return
  if (!workspace) throw new Error('[anonymous-download] 等待无法打开：工作区尚未绑定')
  const { elements, state } = workspace
  const modal = elements.anonymousModal
  const previousFocus = document.activeElement
  await new Promise<void>((resolve, reject) => {
    const finish = (cancelled: boolean): void => {
      clearInterval(timer)
      modal.removeEventListener('cancel', cancel)
      elements.anonymousClose.removeEventListener('click', cancel)
      modal.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
      if (cancelled) reject(new DownloadDeferred())
      else resolve()
    }
    const cancel = (event: Event): void => { event.preventDefault(); finish(true) }
    const tick = (): void => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      elements.anonymousCountdown.textContent = state.copy.anonymousQueue.remaining.replace('{seconds}', String(seconds))
      if (seconds === 0) { finish(false); return }
      if (!modal.open) modal.showModal()
    }
    const timer = window.setInterval(tick, 250)
    modal.addEventListener('cancel', cancel)
    elements.anonymousClose.addEventListener('click', cancel)
    tick()
  })
}

/** 新授权走匿名接口；状态 3 以 DownloadExtensionRequired 中止。 */
export async function authorizeWorkspaceDownload(
  resource: MediaPost, context: DownloadMethodContext
): Promise<MediaDownloadAuthorization> {
  const key = `download:anonymous-wait:${encodeURIComponent(context.deviceId)}:${encodeURIComponent(resource.sourceId)}`
  const result = await createAnonymousDownloadAuthorization(resource, context)
  if (result.status === 3) throw new DownloadExtensionRequired()
  const stored = Number(localStorage.getItem(key))
  let deadline = Number.isFinite(stored) ? stored : 0
  if (result.status === 2) {
    deadline = Math.max(deadline, Date.now() + result.waitSeconds * 1000)
    localStorage.setItem(key, String(deadline))
  }
  await waitForDownload(deadline)
  return result.authorization
}
