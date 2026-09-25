/** 匿名授权协调：同步身份 → 后端三态 → 持久化等待 → 复用下载凭证。 */
import { HomepageApiError } from '../../homepage-runtime/api'
import { getStoredAccessToken } from '../../homepage-runtime/auth'
import { createAnonymousDownloadAuthorization, createMediaDownloadPreV2Authorization,
  type MediaDownloadPreV2Authorization } from './media-api'
import type { DownloadMethodContext } from './download-methods'
import type { MediaPost } from './types'
import type { WorkspaceElements } from './workspace-elements'
import type { WorkspaceState } from './workspace-state'

/** 关闭等待或需要登录为用户中止，下载入口不得记录为失败。 */
export class DownloadDeferred extends Error {}

let workspace: { elements: WorkspaceElements; state: WorkspaceState } | null = null

/** 绑定页面唯一工作区，授权与重新授权读取同一份已验证身份。 */
export function bindAnonymousDownloadWorkspace(elements: WorkspaceElements, state: WorkspaceState): void {
  workspace = { elements, state }
}

function syncIdentity(context: DownloadMethodContext): void {
  if (!workspace) return
  const { state } = workspace
  if (getStoredAccessToken() !== state.token || (state.token && !state.user)) {
    throw new HomepageApiError('[anonymous-download] 当前登录身份与工作区不一致', 401)
  }
  context.token = state.token
  const userId = state.user?.user_id ?? state.user?.id
  context.ownerSub = state.token && userId ? `user:${userId}` : `device:${state.deviceId}`
}

function openLogin(): void {
  workspace?.elements.root.dispatchEvent(new CustomEvent('download-request-login'))
}

async function waitForDownload(deadline: number, context: DownloadMethodContext): Promise<void> {
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
      elements.anonymousLogin.removeEventListener('click', login)
      modal.close()
      if (elements.authModal.hidden && previousFocus instanceof HTMLElement) previousFocus.focus()
      if (cancelled) reject(new DownloadDeferred())
      else resolve()
    }
    const cancel = (event: Event): void => { event.preventDefault(); finish(true) }
    const login = (): void => { modal.close(); openLogin() }
    const tick = (): void => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      elements.anonymousCountdown.textContent = state.copy.anonymousQueue.remaining.replace('{seconds}', String(seconds))
      if (state.token && state.user || seconds === 0) { finish(false); return }
      // 登录窗口独占焦点；取消登录后继续展示原截止时间。
      if (elements.authModal.hidden && !modal.open) modal.showModal()
      else if (!elements.authModal.hidden && modal.open) modal.close()
    }
    const timer = window.setInterval(tick, 250)
    modal.addEventListener('cancel', cancel)
    elements.anonymousClose.addEventListener('click', cancel)
    elements.anonymousLogin.addEventListener('click', login)
    tick()
  })
  syncIdentity(context)
}

/** 新授权与刷新统一执行匿名策略；账号 token 失效不会回退匿名额度。 */
export async function authorizeWorkspaceDownload(
  resource: MediaPost, context: DownloadMethodContext
): Promise<MediaDownloadPreV2Authorization> {
  const key = `download:anonymous-wait:${encodeURIComponent(context.deviceId)}:${encodeURIComponent(resource.sourceId)}`
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    syncIdentity(context)
    if (context.token) return createMediaDownloadPreV2Authorization(resource, context)
    const result = await createAnonymousDownloadAuthorization(resource, context)
    if (result.status === 3) { openLogin(); throw new DownloadDeferred() }
    const stored = Number(localStorage.getItem(key))
    let deadline = Number.isFinite(stored) ? stored : 0
    if (result.status === 2) {
      deadline = Math.max(deadline, Date.now() + result.waitSeconds * 1000)
      // 写入失败必须中止，避免刷新后绕过等待。
      localStorage.setItem(key, String(deadline))
    }
    await waitForDownload(deadline, context)
    syncIdentity(context)
    if (context.token) return createMediaDownloadPreV2Authorization(resource, context)
    if (result.authorization.expiresAt * 1000 > Date.now()) return result.authorization
  }
  throw new Error(`[anonymous-download] 等待后重新授权仍过期，sourceId=${resource.sourceId}`)
}
