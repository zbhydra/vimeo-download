/**
 * Vimeo 页面按钮面板注入。
 *
 * 面板固定展示 Video / Audio / Subtitle / Image 四行，优先插在 action bar 前，找不到时插到 h1 后。
 */

import { I18N_KEYS } from '@/core/constants/i18n'
import { RESOURCE_TYPES } from '@/core/constants/resource'
import type { DownloadTaskSnapshot, MediaResource } from '@/core/types'
import { I18nService } from '@/locales'
import { getVimeoResourceChoice, getVimeoResourceLabel } from '@/sites/vimeo/media'
import { decodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

const PANEL_TEST_ID = 'vdl-vimeo-panel'
const OPTION_TEST_ID = 'vdl-vimeo-option'
const ROW_LABEL_TEST_ID = 'vdl-vimeo-row-label'
const TEST_ID_ATTR = 'data-testid'
const KIND_ATTR = 'data-vdl-kind'
const CHOICE_ATTR = 'data-vdl-choice'
const SOURCE_ID_ATTR = 'data-vdl-source-id'
const VIDEO_ID_ATTR = 'data-vdl-video-id'
const CONFIG_EXPIRES_ATTR = 'data-vdl-config-expires'
const LABEL_ATTR = 'data-vdl-label'
const BUSY_LABEL_ATTR = 'data-vdl-busy-label'
/** 面板行类型；每行对应一种资源语义。 */
type VimeoRowKind = 'video' | 'audio' | 'subtitle' | 'image'

const DOWNLOADING_CLASS = 'is-downloading'
const LOCKED_CLASS = 'is-download-locked'

/** 单个 Vimeo 视频的活动下载会话。 */
interface VimeoDownloadSession {
  /** 当前下载的资源 ID。 */
  sourceId: string
  /** 当前真实进度；null 表示总字节不可计算。 */
  progress: number | null
}

/** Vimeo 页面按钮点击处理函数。 */
export type VimeoDownloadClickHandler = (resourceId: string) => void

/** Vimeo 页面按钮面板。 */
export class VimeoButtonPanel {
  /** 点击回调。 */
  private clickHandler: VimeoDownloadClickHandler | null = null

  /** 按 videoId 隔离下载锁，允许 SPA 切换后的不同视频独立下载。 */
  private readonly activeDownloads = new Map<string, VimeoDownloadSession>()

  /** 设置点击回调。 */
  onClick(handler: VimeoDownloadClickHandler): void {
    this.clickHandler = handler
  }

  /** 渲染当前 videoId 的资源按钮。 */
  render(videoId: string, resources: MediaResource[], expiresAt?: number): void {
    this.removeOtherPanels(videoId)
    const panel = this.findOrCreatePanel(videoId)
    panel.textContent = ''
    panel.setAttribute(VIDEO_ID_ATTR, videoId)
    if (expiresAt !== undefined) {
      panel.setAttribute(CONFIG_EXPIRES_ATTR, String(expiresAt))
    } else {
      panel.removeAttribute(CONFIG_EXPIRES_ATTR)
    }

    panel.appendChild(
      this.createRow(
        'video',
        I18nService.t(I18N_KEYS.RESOURCE_ITEM.TYPE_VIDEO),
        resources.filter(isVideoResource)
      )
    )
    panel.appendChild(
      this.createRow(
        'audio',
        I18nService.t(I18N_KEYS.RESOURCE_ITEM.TYPE_AUDIO),
        resources.filter(isAudioResource)
      )
    )
    panel.appendChild(
      this.createRow(
        'subtitle',
        I18nService.t(I18N_KEYS.RESOURCE_ITEM.TYPE_SUBTITLE),
        resources.filter(isSubtitleResource)
      )
    )
    panel.appendChild(
      this.createRow(
        'image',
        I18nService.t(I18N_KEYS.RESOURCE_ITEM.TYPE_IMAGE),
        resources.filter(isImageResource)
      )
    )
    this.renderDownloadState(videoId)
  }

  /** 渲染加载失败时的禁用四行面板。 */
  renderEmpty(videoId: string): void {
    this.render(videoId, [])
  }

  /** 清空 Vimeo 面板。 */
  clear(): void {
    document.querySelectorAll(`[${TEST_ID_ATTR}="${PANEL_TEST_ID}"]`).forEach(node => {
      node.remove()
    })
  }

  /** 当前视频没有下载任务时进入忙碌态。 */
  beginDownload(videoId: string, sourceId: string): boolean {
    if (this.activeDownloads.has(videoId)) {
      return false
    }

    this.activeDownloads.set(videoId, { sourceId, progress: null })
    this.renderDownloadState(videoId)
    return true
  }

  /** 更新当前视频触发按钮的进度。 */
  updateProgress(videoId: string, sourceId: string, progress: number | null): void {
    const session = this.activeDownloads.get(videoId)
    if (!session || session.sourceId !== sourceId) {
      return
    }

    session.progress = progress === null ? null : clampProgress(progress)
    this.renderDownloadState(videoId)
  }

  /** 下载完成或失败后恢复当前视频的所有按钮。 */
  endDownload(videoId: string): void {
    this.activeDownloads.delete(videoId)
    this.renderDownloadState(videoId)
  }

  /** 按 background 唯一队列投影更新会话，页面切换只移除 DOM，不丢失终态清理。 */
  applyQueueSnapshot(tasks: readonly DownloadTaskSnapshot[]): void {
    for (const [videoId, session] of this.activeDownloads) {
      const task = tasks.find(
        entry => entry.resourceId === session.sourceId && entry.status !== 'failed'
      )
      if (task) {
        this.updateProgress(videoId, session.sourceId, task.progress)
      } else {
        this.endDownload(videoId)
      }
    }
  }

  /** 创建一行按钮。 */
  private createRow(kind: VimeoRowKind, label: string, resources: MediaResource[]): HTMLElement {
    const row = document.createElement('div')
    row.className = 'vdl-vimeo-row'
    row.setAttribute(TEST_ID_ATTR, `vdl-vimeo-row-${kind}`)
    row.setAttribute(KIND_ATTR, kind)

    const labelElement = document.createElement('span')
    labelElement.className = 'vdl-vimeo-row-label'
    labelElement.setAttribute(TEST_ID_ATTR, ROW_LABEL_TEST_ID)
    labelElement.textContent = label
    row.appendChild(labelElement)

    const orderedResources = orderRowResources(kind, resources)
    if (orderedResources.length === 0) {
      row.appendChild(this.createDisabledButton(kind, label))
      return row
    }

    for (const resource of orderedResources) {
      row.appendChild(this.createOptionButton(kind, resource))
    }

    return row
  }

  /** 创建可点击下载按钮。 */
  private createOptionButton(kind: VimeoRowKind, resource: MediaResource): HTMLButtonElement {
    const button = document.createElement('button')
    const labelElement = document.createElement('span')
    const label = getVimeoResourceLabel(resource, (key, params) => I18nService.t(key, params))
    const choice = getVimeoResourceChoice(resource)
    const title = `${I18nService.t(I18N_KEYS.RESOURCE_ITEM.DOWNLOAD)} ${label}`
    const busyLabel = I18nService.t(I18N_KEYS.RESOURCE_ITEM.DOWNLOADING)
    button.type = 'button'
    button.className = isBestChoice(choice) ? 'vdl-vimeo-option is-primary' : 'vdl-vimeo-option'
    button.title = title
    button.setAttribute('aria-label', title)
    button.setAttribute(TEST_ID_ATTR, OPTION_TEST_ID)
    button.setAttribute(KIND_ATTR, kind)
    button.setAttribute(CHOICE_ATTR, choice)
    button.setAttribute(SOURCE_ID_ATTR, resource.id)
    button.setAttribute(LABEL_ATTR, label)
    button.setAttribute(BUSY_LABEL_ATTR, busyLabel)
    labelElement.className = 'vdl-vimeo-option-label'
    labelElement.textContent = label
    button.appendChild(labelElement)
    button.addEventListener('click', event => {
      if (!event.isTrusted) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      this.clickHandler?.(resource.id)
    })
    return button
  }

  /** 根据活动会话同步文本、禁用态与辅助技术状态。 */
  private renderDownloadState(videoId: string): void {
    const panel = Array.from(
      document.querySelectorAll<HTMLElement>(`[${TEST_ID_ATTR}="${PANEL_TEST_ID}"]`)
    ).find(candidate => candidate.getAttribute(VIDEO_ID_ATTR) === videoId)
    if (!panel) {
      return
    }

    const session = this.activeDownloads.get(videoId)
    if (session) {
      panel.setAttribute('aria-busy', 'true')
    } else {
      panel.removeAttribute('aria-busy')
    }

    panel
      .querySelectorAll<HTMLButtonElement>(`button[${SOURCE_ID_ATTR}]:not([${SOURCE_ID_ATTR}=""])`)
      .forEach(button => {
        const sourceId = button.getAttribute(SOURCE_ID_ATTR) ?? ''
        const originalLabel = button.getAttribute(LABEL_ATTR) ?? ''
        const label = button.querySelector<HTMLElement>('.vdl-vimeo-option-label')
        const isCurrent = session?.sourceId === sourceId
        const isLocked = session !== undefined
        const downloadTitle = `${I18nService.t(I18N_KEYS.RESOURCE_ITEM.DOWNLOAD)} ${originalLabel}`

        button.disabled = isLocked
        button.classList.toggle(LOCKED_CLASS, isLocked)
        button.classList.toggle(DOWNLOADING_CLASS, isCurrent)
        button.removeAttribute('aria-busy')
        button.removeAttribute('aria-live')

        if (!isCurrent || !session) {
          if (label) {
            label.textContent = originalLabel
          }
          button.title = isLocked
            ? I18nService.t(I18N_KEYS.RESOURCE_ITEM.DOWNLOADING)
            : downloadTitle
          button.setAttribute('aria-label', button.title)
          return
        }

        const progressText =
          session.progress === null
            ? I18nService.t(I18N_KEYS.RESOURCE_ITEM.DOWNLOADING)
            : `${Math.floor(session.progress)}%`
        if (label) {
          label.textContent = progressText
        }
        button.title = progressText
        button.setAttribute('aria-label', progressText)
        button.setAttribute('aria-busy', 'true')
        button.setAttribute('aria-live', 'polite')
      })
  }

  /** 创建禁用占位按钮，保证四行始终可见；`label` 是该行已翻译的行名，用于读屏提示。 */
  private createDisabledButton(kind: VimeoRowKind, label: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'vdl-vimeo-option'
    button.textContent = '-'
    button.disabled = true
    button.setAttribute(
      'aria-label',
      I18nService.t(I18N_KEYS.RESOURCE_ITEM.NO_OPTION_AVAILABLE, { kind: label })
    )
    button.setAttribute(TEST_ID_ATTR, OPTION_TEST_ID)
    button.setAttribute(KIND_ATTR, kind)
    button.setAttribute(CHOICE_ATTR, 'unavailable')
    button.setAttribute(SOURCE_ID_ATTR, '')
    return button
  }

  /** 查找或创建面板。 */
  private findOrCreatePanel(videoId: string): HTMLElement {
    const existing = Array.from(
      document.querySelectorAll<HTMLElement>(`[${TEST_ID_ATTR}="${PANEL_TEST_ID}"]`)
    ).find(panel => panel.getAttribute(VIDEO_ID_ATTR) === videoId)
    if (existing) {
      return existing
    }

    const panel = document.createElement('section')
    panel.className = 'vdl-vimeo-panel'
    panel.setAttribute(TEST_ID_ATTR, PANEL_TEST_ID)
    this.insertPanel(panel)
    return panel
  }

  /** 插入面板到 Vimeo 标题区。 */
  private insertPanel(panel: HTMLElement): void {
    const wrapper =
      document.querySelector<HTMLElement>('main [data-testid="vd-wrapper"]') ??
      document.querySelector<HTMLElement>('main') ??
      document.body
    const title =
      wrapper.querySelector<HTMLElement>('h1') ?? document.querySelector<HTMLElement>('main h1')
    const actionBar = wrapper.querySelector<HTMLElement>('[data-testid="action-bar"]')

    if (actionBar?.parentElement) {
      actionBar.parentElement.insertBefore(panel, actionBar)
      return
    }

    if (title?.parentElement) {
      title.insertAdjacentElement('afterend', panel)
      return
    }

    wrapper.prepend(panel)
  }

  /** 移除其它 videoId 的面板，避免 SPA 切换后重复。 */
  private removeOtherPanels(videoId: string): void {
    document
      .querySelectorAll<HTMLElement>(`[${TEST_ID_ATTR}="${PANEL_TEST_ID}"]`)
      .forEach(panel => {
        if (panel.getAttribute(VIDEO_ID_ATTR) !== videoId) {
          panel.remove()
        }
      })
  }
}

/** 判断视频资源。 */
function isVideoResource(resource: MediaResource): boolean {
  return resource.type === RESOURCE_TYPES.VIDEO
}

/** 判断音频资源。 */
function isAudioResource(resource: MediaResource): boolean {
  return resource.type === RESOURCE_TYPES.AUDIO
}

/** 判断字幕资源。 */
function isSubtitleResource(resource: MediaResource): boolean {
  return resource.type === RESOURCE_TYPES.SUBTITLE
}

/** 判断图片资源。 */
function isImageResource(resource: MediaResource): boolean {
  return resource.type === RESOURCE_TYPES.IMAGE
}

/** 行内资源排序：Best 放最前，其余按 content 生成顺序。 */
function orderRowResources(kind: VimeoRowKind, resources: MediaResource[]): MediaResource[] {
  return [...resources].sort((left, right) => getRowRank(kind, right) - getRowRank(kind, left))
}

/** 行内主按钮排序分。 */
function getRowRank(kind: VimeoRowKind, resource: MediaResource): number {
  const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
  if (!descriptor) {
    return 0
  }
  if (kind === 'video' && descriptor.optionId === 'best') {
    return 100
  }
  if (kind === 'audio' && descriptor.optionId === 'best-audio') {
    return 100
  }
  if (kind === 'image') {
    return 100
  }
  return 1
}

/** 判断是否为主按钮。 */
function isBestChoice(choice: string): boolean {
  return choice === 'best' || choice === 'best-audio' || choice === 'best-thumbnail'
}

/** 把不可信 DOM 事件进度约束到可显示范围。 */
function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress))
}
