/**
 * 下载工作区渐进加载入口。
 *
 * 匿名且无恢复任务的访问只渲染可交互 HTML；首次聚焦、指针操作或提交时再加载完整状态机。
 * 存在 snapshot 的恢复流程仍立即启动，避免未完成任务延迟出现。
 */

import { DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY } from '../runtime/runtime-storage-keys'

/** 下载工作区完成全部事件绑定后写入的 DOM 标志。 */
const WORKSPACE_READY_VALUE = 'true'

/** 当前运行时加载任务；失败后清空，下一次交互可以重试。 */
let runtimePromise: Promise<void> | null = null

/** 加载工作区状态机。 */
function loadWorkspaceRuntime(): Promise<void> {
  if (runtimePromise) {
    return runtimePromise
  }

  runtimePromise = import('./workspace')
    .then(() => undefined)
    .catch(error => {
      runtimePromise = null
      throw new Error('[download-workspace-loader] Failed to load the interactive workspace runtime.', {
        cause: error
      })
    })

  return runtimePromise
}

/** 等待状态机完成异步初始化并绑定全部按钮。 */
function waitForWorkspaceReady(root: HTMLElement): Promise<void> {
  if (root.dataset.downloadWorkspaceReady === WORKSPACE_READY_VALUE) {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    root.addEventListener('download-workspace-ready', () => resolve(), { once: true })
  })
}

/** 输出完整上下文，同时保留页面供用户再次操作重试。 */
function reportRuntimeLoadError(error: Error): void {
  console.error(error)
}

/** 为匿名首屏安装轻量交互代理。 */
function installWorkspaceLoader(root: HTMLElement): void {
  const startLoading = (): void => {
    void loadWorkspaceRuntime().catch(reportRuntimeLoadError)
  }

  root.addEventListener('pointerdown', startLoading, { once: true, passive: true })
  root.addEventListener('focusin', startLoading, { once: true })

  root.addEventListener(
    'click',
    event => {
      if (root.dataset.downloadWorkspaceReady === WORKSPACE_READY_VALUE) {
        return
      }

      const origin = event.target
      if (!(origin instanceof Element)) {
        return
      }
      const button = origin.closest<HTMLButtonElement>('button')
      if (!button || !root.contains(button)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      void loadWorkspaceRuntime()
        .then(() => waitForWorkspaceReady(root))
        .then(() => button.click())
        .catch(reportRuntimeLoadError)
    },
    { capture: true }
  )

  root.addEventListener(
    'keydown',
    event => {
      if (
        root.dataset.downloadWorkspaceReady === WORKSPACE_READY_VALUE ||
        event.key !== 'Enter' ||
        !(event.target instanceof HTMLInputElement) ||
        !event.target.matches('[data-download-parse-input]')
      ) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      const submitButton = root.querySelector<HTMLButtonElement>('[data-download-parse-submit]')
      if (!submitButton) {
        reportRuntimeLoadError(
          new Error('[download-workspace-loader] Missing parse submit button while replaying Enter.')
        )
        return
      }

      void loadWorkspaceRuntime()
        .then(() => waitForWorkspaceReady(root))
        .then(() => submitButton.click())
        .catch(reportRuntimeLoadError)
    },
    { capture: true }
  )
}

/** 判断任务恢复是否要求页面打开后立即加载。 */
function hasRestorableWorkspaceState(): boolean {
  try {
    return Boolean(window.localStorage.getItem(DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY))
  } catch (error) {
    console.error(
      new Error('[download-workspace-loader] Failed to inspect local workspace state.', { cause: error })
    )
    return false
  }
}

const workspaceRoot = document.querySelector<HTMLElement>('[data-download-workspace]')
if (workspaceRoot) {
  installWorkspaceLoader(workspaceRoot)
  if (hasRestorableWorkspaceState()) {
    void loadWorkspaceRuntime().catch(reportRuntimeLoadError)
  }
}
