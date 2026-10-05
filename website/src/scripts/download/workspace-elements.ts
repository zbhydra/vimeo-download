/**
 * 下载工作区 DOM 元素查询与基础 UI helper。
 *
 * 所有 data attribute 查询集中在这里，其他模块接收 WorkspaceElements。
 */

import type { DownloadWorkspaceContent } from '../../i18n/schema'

/** 下载工作区 DOM 元素集合。 */
export interface WorkspaceElements {
  /** 匿名等待窗口与交互元素。 */
  anonymousModal: HTMLDialogElement
  anonymousCountdown: HTMLElement
  anonymousClose: HTMLButtonElement
  /** 根节点。 */
  root: HTMLElement
  /** 批量下载按钮。 */
  downloadAllButton: HTMLButtonElement
  /** 插件引导内嵌卡片。 */
  largeFileExtensionGuide: HTMLElement
  /** 解析错误区域。 */
  parseError: HTMLElement
  /** 解析输入框清空按钮。 */
  parseClearButton: HTMLButtonElement
  /** 解析输入与提交控制区。 */
  parseForm: HTMLElement
  /** 解析输入框。 */
  parseInput: HTMLInputElement
  /** 待恢复下载操作区域。 */
  pendingResumeActions: HTMLElement
  /** 继续恢复下载按钮。 */
  pendingResumeContinue: HTMLButtonElement
  /** 忽略恢复下载按钮。 */
  pendingResumeDismiss: HTMLButtonElement
  /** 待恢复下载说明。 */
  pendingResumeHint: HTMLElement
  /** 解析提交按钮。 */
  parseSubmit: HTMLButtonElement
  /** 结果操作区。 */
  resultsActions: HTMLElement
  /** 结果列表容器。 */
  resultsContainer: HTMLElement
}

/** 从 DOM script payload 读取工作区文案。 */
export function getCopy(root: HTMLElement): DownloadWorkspaceContent {
  const element = root.querySelector<HTMLScriptElement>('[data-download-copy]')
  if (!element?.textContent) {
    throw new Error('Missing download workspace copy payload.')
  }

  return JSON.parse(element.textContent) as DownloadWorkspaceContent
}

/** 查询工作区全部 DOM 元素。 */
export function getElements(root: HTMLElement): WorkspaceElements {
  const query = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector)
    if (!element) {
      throw new Error(`Missing download workspace element: ${selector}`)
    }

    return element
  }

  return {
    root,
    anonymousModal: query<HTMLDialogElement>('[data-download-anonymous-modal]'),
    anonymousCountdown: query<HTMLElement>('[data-download-anonymous-countdown]'),
    anonymousClose: query<HTMLButtonElement>('[data-download-anonymous-close]'),
    downloadAllButton: query<HTMLButtonElement>('[data-download-all-button]'),
    largeFileExtensionGuide: query<HTMLElement>('[data-download-large-file-extension-inline]'),
    parseError: query<HTMLElement>('[data-download-parse-error]'),
    parseClearButton: query<HTMLButtonElement>('[data-download-parse-clear]'),
    parseForm: query<HTMLElement>('[data-download-parse-form]'),
    parseInput: query<HTMLInputElement>('[data-download-parse-input]'),
    pendingResumeActions: query<HTMLElement>('[data-download-pending-resume-actions]'),
    pendingResumeContinue: query<HTMLButtonElement>('[data-download-pending-resume-continue]'),
    pendingResumeDismiss: query<HTMLButtonElement>('[data-download-pending-resume-dismiss]'),
    pendingResumeHint: query<HTMLElement>('[data-download-pending-resume-hint]'),
    parseSubmit: query<HTMLButtonElement>('[data-download-parse-submit]'),
    resultsActions: query<HTMLElement>('[data-download-results-actions]'),
    resultsContainer: query<HTMLElement>('[data-download-results]')
  }
}

/** 控制元素 hidden 状态。 */
export function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden
}

/** 锁定或恢复工作区所有按钮。 */
export function setWorkspaceButtonsLocked(elements: WorkspaceElements, locked: boolean): void {
  for (const button of elements.root.querySelectorAll<HTMLButtonElement>('button')) {
    if (button.closest('[data-download-anonymous-modal]')) continue
    if (locked) {
      if (!button.dataset.lockPrevDisabled) {
        button.dataset.lockPrevDisabled = button.disabled ? '1' : '0'
      }
      button.disabled = true
      continue
    }

    const previousDisabled = button.dataset.lockPrevDisabled
    if (previousDisabled) {
      button.disabled = previousDisabled === '1'
      delete button.dataset.lockPrevDisabled
    }
  }
}

/** 设置消息文本，空文本时隐藏元素。 */
export function setMessage(element: HTMLElement, message: string | null | undefined): void {
  const text = message ?? ''
  element.textContent = text
  setHidden(element, text.length === 0)
}

/** 设置解析错误文本。 */
export function setParseErrorMessage(
  elements: Pick<WorkspaceElements, 'parseError'>,
  message: string
): void {
  setMessage(elements.parseError, message)
}
