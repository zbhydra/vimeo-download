/**
 * 公共订单 checkout 弹窗 DOM 查询。
 *
 * 所有 data attribute 入口集中在这里，业务入口只依赖 controller 和事件，
 * 不直接操作弹窗内部 DOM。
 */

/** 公共订单 checkout 弹窗 DOM 元素集合。 */
export interface OrderCheckoutElements {
  /** 弹窗根节点。 */
  root: HTMLElement
  /** 关闭按钮列表。 */
  closeButtons: HTMLButtonElement[]
  /** 支付方式选择弹窗。 */
  paymentDialog: HTMLElement
  /** 订单等待弹窗。 */
  orderDialog: HTMLElement
  /** 支付方式弹窗错误文案。 */
  paymentError: HTMLElement
  /** 支付方式弹窗标题。 */
  paymentTitle: HTMLElement
  /** 已选商品标题摘要。 */
  selectedTitle: HTMLElement
  /** 已选商品展示价摘要。 */
  selectedPrice: HTMLElement
  /** 已选商品使用范围提示。 */
  selectedUsage: HTMLElement
  /** 支付渠道按钮列表。 */
  channelList: HTMLElement
  /** 返回/取消按钮。 */
  backButton: HTMLButtonElement
  /** 支付方式确认购买按钮。 */
  submitButton: HTMLButtonElement
  /** 订单弹窗标题。 */
  orderTitle: HTMLElement
  /** 订单弹窗说明。 */
  orderMessage: HTMLElement
  /** 订单弹窗错误文案。 */
  orderError: HTMLElement
  /** 订单弹窗支持邮箱容器。 */
  orderSupport: HTMLElement
  /** 订单弹窗支持邮箱前缀。 */
  orderSupportPrefix: HTMLElement
  /** 订单弹窗支持邮箱链接。 */
  orderSupportMail: HTMLAnchorElement
  /** 订单弹窗等待动画。 */
  orderSpinner: HTMLElement
  /** success 态信息面板。 */
  successPanel: HTMLElement
  /** success 态第一行。 */
  successPrimary: HTMLElement
  /** success 态第二行。 */
  successSecondary: HTMLElement
  /** 订单弹窗底部关闭按钮。 */
  orderCloseButton: HTMLButtonElement
  /** 协议勾选框。 */
  agreement: HTMLInputElement
  /** 服务条款链接。 */
  terms: HTMLAnchorElement
  /** 隐私政策链接。 */
  privacy: HTMLAnchorElement
}

/** 查询公共订单 checkout 弹窗 DOM。 */
export function getOrderCheckoutElements(root: HTMLElement): OrderCheckoutElements {
  const query = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector)
    if (!element) {
      throw new Error(`[order-checkout-elements] Missing element: ${selector}`)
    }
    return element
  }

  return {
    root,
    closeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-order-checkout-close]')),
    paymentDialog: query<HTMLElement>('[data-order-checkout-payment-dialog]'),
    orderDialog: query<HTMLElement>('[data-order-checkout-order-dialog]'),
    paymentError: query<HTMLElement>('[data-order-checkout-payment-error]'),
    paymentTitle: query<HTMLElement>('[data-order-checkout-payment-title]'),
    selectedTitle: query<HTMLElement>('[data-order-checkout-selected-title]'),
    selectedPrice: query<HTMLElement>('[data-order-checkout-selected-price]'),
    selectedUsage: query<HTMLElement>('[data-order-checkout-selected-usage]'),
    channelList: query<HTMLElement>('[data-order-checkout-channel-list]'),
    backButton: query<HTMLButtonElement>('[data-order-checkout-back]'),
    submitButton: query<HTMLButtonElement>('[data-order-checkout-submit]'),
    orderTitle: query<HTMLElement>('[data-order-checkout-order-title]'),
    orderMessage: query<HTMLElement>('[data-order-checkout-order-message]'),
    orderError: query<HTMLElement>('[data-order-checkout-order-error]'),
    orderSupport: query<HTMLElement>('[data-order-checkout-order-support]'),
    orderSupportPrefix: query<HTMLElement>('[data-order-checkout-order-support-prefix]'),
    orderSupportMail: query<HTMLAnchorElement>('[data-order-checkout-order-support-mail]'),
    orderSpinner: query<HTMLElement>('[data-order-checkout-order-spinner]'),
    successPanel: query<HTMLElement>('[data-order-checkout-success-panel]'),
    successPrimary: query<HTMLElement>('[data-order-checkout-success-primary]'),
    successSecondary: query<HTMLElement>('[data-order-checkout-success-secondary]'),
    orderCloseButton: query<HTMLButtonElement>('[data-order-checkout-order-close]'),
    agreement: query<HTMLInputElement>('[data-order-checkout-agreement]'),
    terms: query<HTMLAnchorElement>('[data-order-checkout-terms]'),
    privacy: query<HTMLAnchorElement>('[data-order-checkout-privacy]')
  }
}

/** 控制元素 hidden 状态。 */
export function setOrderCheckoutHidden(element: HTMLElement, hidden: boolean): void {
  element.hidden = hidden
}
