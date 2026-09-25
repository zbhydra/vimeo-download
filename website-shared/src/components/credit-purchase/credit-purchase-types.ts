/**
 * Credits 购买弹窗的对外类型。
 *
 * 该文件只描述组件边界：打开参数、成功事件和全局 controller。
 * 具体下单、轮询、DOM 渲染分别放在同目录其他模块，避免 workspace 与订单状态机耦合。
 */

/** 打开 Credits 购买弹窗的来源。 */
export type CreditPurchaseSource = 'workspace_download' | 'workspace_batch_download' | string

/** Credits 购买弹窗打开原因。 */
export type CreditPurchaseReason = 'credits_insufficient'

/** 打开 Credits 购买弹窗的参数。 */
export interface CreditPurchaseOpenOptions {
  /** 触发弹窗的业务来源。 */
  source: CreditPurchaseSource
  /** 打开弹窗的业务原因。 */
  reason: CreditPurchaseReason
  /** 本次下载还需要的 Credits，当前后端不足错误未稳定返回该值，因此允许为空。 */
  requiredCredits?: number | null
  /** 未来推荐档位提示，本期只用于保留边界，不强依赖。 */
  productHintId?: string | null
}

/** Credits 购买成功后广播给外部页面的 payload。 */
export interface CreditPurchaseSuccessPayload {
  /** 成功履约的订单号。 */
  orderNo: string
  /** 本次购买到账 Credits 数量。 */
  purchasedCredits: number
  /** auth/me 刷新后的最新 Credits 余额。 */
  latestBalance: number
}

/** Credits 购买弹窗 controller 对外接口。 */
export interface CreditPurchaseController {
  /** 打开弹窗并加载可售 Credits 商品。 */
  open(options: CreditPurchaseOpenOptions): Promise<void>
  /** 关闭弹窗，关闭时停止轮询且不恢复 pending 订单。 */
  close(): void
  /** 当前弹窗是否打开。 */
  isOpen(): boolean
}

/** 弹窗成功事件名。 */
export const CREDIT_PURCHASE_SUCCESS_EVENT = 'credit-purchase:success'

/** 弹窗关闭事件名。 */
export const CREDIT_PURCHASE_CLOSE_EVENT = 'credit-purchase:close'

/** 弹窗遇到登录失效事件名。 */
export const CREDIT_PURCHASE_AUTH_INVALID_EVENT = 'credit-purchase:auth-invalid'

declare global {
  interface Window {
    /** 全站唯一 Credits 购买弹窗 controller。 */
    creditPurchaseController?: CreditPurchaseController
  }
}
