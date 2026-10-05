/**
 * Website 通用确认框运行时。
 *
 * 业务脚本调用 confirmSiteAction，弹窗以 Promise<boolean> 返回用户选择。
 */

/** 通用确认框展示选项。 */
export interface SiteConfirmOptions {
  /** 弹窗标题。 */
  title: string
  /** 弹窗正文。 */
  message: string
  /** 正文里的可点击链接；message 中的 {link} 会被替换为安全创建的 a 节点。 */
  messageLink?: {
    /** 链接文案。 */
    label: string
    /** 链接地址。 */
    href: string
  }
  /** 确认按钮文案。 */
  confirmLabel: string
  /** 取消按钮文案。 */
  cancelLabel: string
}

interface SiteConfirmElements {
  /** 弹窗根节点。 */
  modal: HTMLElement
  /** 标题节点。 */
  title: HTMLElement
  /** 正文节点。 */
  message: HTMLElement
  /** 确认按钮。 */
  submitButton: HTMLButtonElement
  /** 所有取消入口，包含关闭按钮和遮罩。 */
  cancelButtons: HTMLButtonElement[]
}

interface PendingConfirmation {
  /** Promise resolver，true 表示确认，false 表示取消。 */
  resolve: (confirmed: boolean) => void
  /** 打开弹窗前的焦点元素，用于关闭后恢复键盘位置。 */
  previousFocus: FocusableElement | null
}

interface FocusableElement extends Element {
  /** 恢复键盘焦点。 */
  focus: () => void
}

const SITE_CONFIRM_SELECTOR = '[data-site-confirm-modal]'

let pendingConfirmation: PendingConfirmation | null = null
let keydownBound = false

function getConfirmElements(): SiteConfirmElements {
  const modal = document.querySelector<HTMLElement>(SITE_CONFIRM_SELECTOR)
  if (!modal) {
    throw new Error('Missing site confirm modal host: [data-site-confirm-modal].')
  }

  const title = modal.querySelector<HTMLElement>('[data-site-confirm-title]')
  const message = modal.querySelector<HTMLElement>('[data-site-confirm-message]')
  const submitButton = modal.querySelector<HTMLButtonElement>('[data-site-confirm-submit]')
  const cancelButtons = Array.from(
    modal.querySelectorAll<HTMLButtonElement>('[data-site-confirm-cancel]')
  )

  if (!title || !message || !submitButton || cancelButtons.length === 0) {
    throw new Error('Missing site confirm modal child elements.')
  }

  return {
    modal,
    title,
    message,
    submitButton,
    cancelButtons
  }
}

function closeConfirm(elements: SiteConfirmElements, confirmed: boolean): void {
  if (!pendingConfirmation) {
    elements.modal.hidden = true
    return
  }

  const pending = pendingConfirmation
  pendingConfirmation = null
  elements.modal.hidden = true
  pending.resolve(confirmed)
  pending.previousFocus?.focus()
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!pendingConfirmation) {
    return
  }

  if (event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  closeConfirm(getConfirmElements(), false)
}

function ensureKeydownHandler(): void {
  if (keydownBound) {
    return
  }

  document.addEventListener('keydown', handleDocumentKeydown)
  keydownBound = true
}

function canRestoreFocus(element: Element | null | undefined): element is FocusableElement {
  return element != null && typeof (element as Partial<FocusableElement>).focus === 'function'
}

/** 渲染支持单个安全链接占位符的正文，避免业务方传 HTML。 */
function renderConfirmMessage(element: HTMLElement, options: SiteConfirmOptions): void {
  element.textContent = ''

  if (!options.messageLink) {
    element.textContent = options.message
    return
  }

  const linkPlaceholder = '{link}'
  const placeholderIndex = options.message.indexOf(linkPlaceholder)
  const beforeLink =
    placeholderIndex >= 0 ? options.message.slice(0, placeholderIndex) : `${options.message} `
  const afterLink =
    placeholderIndex >= 0 ? options.message.slice(placeholderIndex + linkPlaceholder.length) : ''
  const link = document.createElement('a')

  link.href = options.messageLink.href
  link.textContent = options.messageLink.label
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  element.append(document.createTextNode(beforeLink), link)
  if (afterLink) {
    element.append(document.createTextNode(afterLink))
  }
}

/** 打开全站通用确认框，用户确认时返回 true，取消或 Escape 时返回 false。 */
export function confirmSiteAction(options: SiteConfirmOptions): Promise<boolean> {
  const elements = getConfirmElements()
  if (pendingConfirmation) {
    closeConfirm(elements, false)
  }

  elements.title.textContent = options.title
  renderConfirmMessage(elements.message, options)
  elements.submitButton.textContent = options.confirmLabel

  for (const button of elements.cancelButtons) {
    button.setAttribute('aria-label', options.cancelLabel)
    if (button.classList.contains('site-confirm-action')) {
      button.textContent = options.cancelLabel
    }
  }

  ensureKeydownHandler()
  elements.submitButton.onclick = () => closeConfirm(elements, true)
  for (const button of elements.cancelButtons) {
    button.onclick = () => closeConfirm(elements, false)
  }

  const previousFocus = canRestoreFocus(document.activeElement) ? document.activeElement : null
  elements.modal.hidden = false
  if (typeof window.requestAnimationFrame !== 'function') {
    elements.submitButton.focus()
  } else {
    window.requestAnimationFrame(() => {
      elements.submitButton.focus()
    })
  }

  return new Promise<boolean>(resolve => {
    pendingConfirmation = {
      resolve,
      previousFocus
    }
  })
}

declare global {
  interface Window {
    /** 全站通用确认框，供命令式脚本调用。 */
    siteConfirmAction?: (options: SiteConfirmOptions) => Promise<boolean>
  }
}

if (typeof window !== 'undefined') {
  window.siteConfirmAction = confirmSiteAction
}
