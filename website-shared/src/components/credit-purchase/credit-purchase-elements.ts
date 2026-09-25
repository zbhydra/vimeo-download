/**
 * Credits 购买弹窗 DOM 查询。
 *
 * 所有 data attribute 入口集中在这里，controller 不散落 querySelector，
 * 后续 E2E 和复用页面只依赖稳定 data-* 合同。
 */

/** Credits 购买弹窗 DOM 元素集合。 */
export interface CreditPurchaseElements {
  /** 弹窗根节点。 */
  root: HTMLElement
  /** 关闭按钮列表。 */
  closeButtons: HTMLButtonElement[]
  /** 商品选择弹窗。 */
  shopDialog: HTMLElement
  /** 弹窗标题。 */
  title: HTMLElement
  /** 安装引导说明，随注册时长切换文案。 */
  installGuideText: HTMLElement
  /** 安装引导按钮，`data-install-url` 保留原插件安装地址。 */
  installLink: HTMLAnchorElement
  /** 错误文案。 */
  error: HTMLElement
  /** 商品卡片列表。 */
  list: HTMLElement
  /** 商品卡片模板。 */
  cardTemplate: HTMLTemplateElement
}

/** 查询 Credits 购买弹窗 DOM。 */
export function getCreditPurchaseElements(root: HTMLElement): CreditPurchaseElements {
  const query = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector)
    if (!element) {
      throw new Error(`[credit-purchase-elements] Missing element: ${selector}`)
    }
    return element
  }

  return {
    root,
    closeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-credit-purchase-close]')),
    shopDialog: query<HTMLElement>('[data-credit-purchase-shop-dialog]'),
    title: query<HTMLElement>('[data-credit-purchase-title]'),
    installGuideText: query<HTMLElement>('[data-credit-purchase-install-guide-text]'),
    installLink: query<HTMLAnchorElement>('[data-credit-purchase-install-link]'),
    error: query<HTMLElement>('[data-credit-purchase-error]'),
    list: query<HTMLElement>('[data-credit-purchase-list]'),
    cardTemplate: query<HTMLTemplateElement>('[data-credit-purchase-card-template]')
  }
}

/** 控制元素 hidden 状态。 */
export function setCreditPurchaseHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden
}
