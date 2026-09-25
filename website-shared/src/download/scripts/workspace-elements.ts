/**
 * 下载工作区 DOM 元素查询与基础 UI helper。
 *
 * 所有 data attribute 查询集中在这里，其他模块接收 WorkspaceElements。
 */

import type { DownloadWorkspaceContent } from '../schema'

/** 下载工作区 DOM 元素集合。 */
export interface WorkspaceElements {
  /** 匿名等待窗口与交互元素。 */
  anonymousModal: HTMLDialogElement
  anonymousCountdown: HTMLElement
  anonymousLogin: HTMLButtonElement
  anonymousClose: HTMLButtonElement
  /** 根节点。 */
  root: HTMLElement
  /** 登录弹窗关闭按钮列表。 */
  authCloseButtons: HTMLButtonElement[]
  /** 登录错误文案。 */
  authError: HTMLElement
  /** 登录表单。 */
  authForm: HTMLFormElement
  /** 登录弹窗。 */
  authModal: HTMLElement
  /** 邮箱验证码区域。 */
  emailCodeArea: HTMLElement
  /** 邮箱登录子界面内的发送验证码按钮。 */
  emailContinueButton: HTMLButtonElement
  /** 邮箱登录子界面入口容器。 */
  emailEntry: HTMLElement
  /** 邮箱登录子界面入口按钮。 */
  emailEntryButton: HTMLButtonElement
  /** Google 官方登录按钮容器。 */
  googleLoginButton: HTMLElement
  /** 登录态账户与 Credits 入口组。 */
  accountEntry: HTMLElement
  /** 圆形账户按钮。 */
  accountButton: HTMLButtonElement
  /** 账户头像。 */
  accountAvatar: HTMLImageElement
  /** 账户首字母。 */
  accountInitial: HTMLElement
  /** 账户下拉菜单。 */
  accountMenu: HTMLElement
  /** 账户下拉菜单邮箱展示。 */
  accountEmail: HTMLElement
  /** 账户下拉菜单登出按钮。 */
  accountLogoutButton: HTMLButtonElement
  /** Credits 胶囊按钮。 */
  creditsPill: HTMLButtonElement
  /** Credits 胶囊文案。 */
  creditsLabel: HTMLElement
  /** 签到弹窗根节点。 */
  checkinModal: HTMLElement
  /** 签到弹窗关闭触发元素列表。 */
  checkinCloseButtons: HTMLElement[]
  /** 签到弹窗标题。 */
  checkinTitle: HTMLElement
  /** 签到今日可领取 Credits。 */
  checkinTodayReward: HTMLElement
  /** 签到已领取结果。 */
  checkinResult: HTMLElement
  /** 签到下次可领取信息容器。 */
  checkinNext: HTMLElement
  /** 签到倒计时。 */
  checkinCountdown: HTMLElement
  /** 签到下次可领取绝对时间。 */
  checkinNextAt: HTMLElement
  /** 签到错误文案。 */
  checkinError: HTMLElement
  /** 签到领取按钮。 */
  checkinClaimButton: HTMLButtonElement
  /** 签到稍后再说按钮。 */
  checkinDismissButton: HTMLButtonElement
  /** 批量下载按钮。 */
  downloadAllButton: HTMLButtonElement
  /** 插件引导内嵌卡片。 */
  largeFileExtensionGuide: HTMLElement
  /** 登录验证码输入框。 */
  loginCode: HTMLInputElement
  /** 登录邮箱输入框。 */
  loginEmail: HTMLInputElement
  /** 登录提交按钮。 */
  loginSubmit: HTMLButtonElement
  /** 解析错误区域。 */
  parseError: HTMLElement
  /** 解析输入框清空按钮。 */
  parseClearButton: HTMLButtonElement
  /** 解析输入与提交控制区。 */
  parseForm: HTMLElement
  /** 解析输入框。 */
  parseInput: HTMLInputElement
  /** 可选的解析骨架屏。 */
  parseSkeleton: HTMLElement | null
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
  /** 发送验证码按钮。 */
  sendCodeButton: HTMLButtonElement
  /** 发送验证码状态。 */
  sendCodeStatus: HTMLElement
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
  const optionalQuery = <T extends HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector)

  return {
    root,
    authCloseButtons: Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-download-auth-close]')
    ),
    authError: query<HTMLElement>('[data-download-auth-error]'),
    authForm: query<HTMLFormElement>('[data-download-auth-form]'),
    anonymousModal: query<HTMLDialogElement>('[data-download-anonymous-modal]'),
    anonymousCountdown: query<HTMLElement>('[data-download-anonymous-countdown]'),
    anonymousLogin: query<HTMLButtonElement>('[data-download-anonymous-login]'),
    anonymousClose: query<HTMLButtonElement>('[data-download-anonymous-close]'),
    authModal: query<HTMLElement>('[data-download-auth-modal]'),
    emailCodeArea: query<HTMLElement>('[data-download-email-code-area]'),
    emailContinueButton: query<HTMLButtonElement>('[data-download-continue-email]'),
    emailEntry: query<HTMLElement>('[data-download-email-entry]'),
    emailEntryButton: query<HTMLButtonElement>('[data-download-email-entry-button]'),
    googleLoginButton: query<HTMLElement>('[data-download-google-login]'),
    accountEntry: query<HTMLElement>('[data-download-account-entry]'),
    accountButton: query<HTMLButtonElement>('[data-download-account-button]'),
    accountAvatar: query<HTMLImageElement>('[data-download-account-avatar]'),
    accountInitial: query<HTMLElement>('[data-download-account-initial]'),
    accountMenu: query<HTMLElement>('[data-download-account-menu]'),
    accountEmail: query<HTMLElement>('[data-download-account-email]'),
    accountLogoutButton: query<HTMLButtonElement>('[data-download-account-logout]'),
    creditsPill: query<HTMLButtonElement>('[data-download-credits-pill]'),
    creditsLabel: query<HTMLElement>('[data-download-credits-label]'),
    checkinModal: query<HTMLElement>('[data-download-checkin-modal]'),
    checkinCloseButtons: Array.from(root.querySelectorAll<HTMLElement>('[data-download-checkin-close]')),
    checkinTitle: query<HTMLElement>('[data-download-checkin-title]'),
    checkinTodayReward: query<HTMLElement>('[data-download-checkin-today-reward]'),
    checkinResult: query<HTMLElement>('[data-download-checkin-result]'),
    checkinNext: query<HTMLElement>('[data-download-checkin-next]'),
    checkinCountdown: query<HTMLElement>('[data-download-checkin-countdown]'),
    checkinNextAt: query<HTMLElement>('[data-download-checkin-next-at]'),
    checkinError: query<HTMLElement>('[data-download-checkin-error]'),
    checkinClaimButton: query<HTMLButtonElement>('[data-download-checkin-claim]'),
    checkinDismissButton: query<HTMLButtonElement>('[data-download-checkin-dismiss]'),
    downloadAllButton: query<HTMLButtonElement>('[data-download-all-button]'),
    largeFileExtensionGuide: query<HTMLElement>('[data-download-large-file-extension-inline]'),
    loginCode: query<HTMLInputElement>('[data-download-login-code]'),
    loginEmail: query<HTMLInputElement>('[data-download-login-email]'),
    loginSubmit: query<HTMLButtonElement>('[data-download-login-submit]'),
    parseError: query<HTMLElement>('[data-download-parse-error]'),
    parseClearButton: query<HTMLButtonElement>('[data-download-parse-clear]'),
    parseForm: query<HTMLElement>('[data-download-parse-form]'),
    parseInput: query<HTMLInputElement>('[data-download-parse-input]'),
    parseSkeleton: optionalQuery<HTMLElement>('[data-download-parse-skeleton]'),
    pendingResumeActions: query<HTMLElement>('[data-download-pending-resume-actions]'),
    pendingResumeContinue: query<HTMLButtonElement>('[data-download-pending-resume-continue]'),
    pendingResumeDismiss: query<HTMLButtonElement>('[data-download-pending-resume-dismiss]'),
    pendingResumeHint: query<HTMLElement>('[data-download-pending-resume-hint]'),
    parseSubmit: query<HTMLButtonElement>('[data-download-parse-submit]'),
    resultsActions: query<HTMLElement>('[data-download-results-actions]'),
    resultsContainer: query<HTMLElement>('[data-download-results]'),
    sendCodeButton: query<HTMLButtonElement>('[data-download-send-code]'),
    sendCodeStatus: query<HTMLElement>('[data-download-send-code-status]')
  }
}

/** 将登录弹窗提升到 body，避免 fixed 定位被外层滤镜、变换或裁剪容器限制。 */
export function mountAuthModalToBody(elements: Pick<WorkspaceElements, 'authModal'>): void {
  if (elements.authModal.parentElement === document.body) {
    return
  }

  document.body.append(elements.authModal)
}

/** 控制元素 hidden 状态。 */
export function setHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden
}

/** 锁定或恢复工作区所有按钮。 */
export function setWorkspaceButtonsLocked(elements: WorkspaceElements, locked: boolean): void {
  const buttons = new Set([
    ...elements.root.querySelectorAll<HTMLButtonElement>('button'),
    ...elements.authModal.querySelectorAll<HTMLButtonElement>('button')
  ])

  for (const button of buttons) {
    if (button.closest('[data-download-auth-modal], [data-download-anonymous-modal]')) continue
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
