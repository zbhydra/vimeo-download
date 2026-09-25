/**
 * Credits 购买弹窗内部状态。
 *
 * 状态机：
 * idle -> loading_configs -> ready -> failed
 * 点击具体商品后交给公共 OrderCheckoutModal 处理支付方式与订单状态。
 */

import type { CreditCheckoutPlan } from './credit-checkout'
import type { CreditPurchaseOpenOptions } from './credit-purchase-types'

/** Credits 购买弹窗状态机枚举。 */
export type CreditPurchaseStatus =
  | 'idle'
  | 'loading_configs'
  | 'ready'
  | 'failed'

/** 组件内部可变状态。 */
export interface CreditPurchaseState {
  /** 弹窗是否打开。 */
  open: boolean
  /** 当前打开弹窗的业务参数。 */
  openOptions: CreditPurchaseOpenOptions | null
  /** 当前状态机状态。 */
  status: CreditPurchaseStatus
  /** 可售 Credits 商品配置。 */
  configs: CreditCheckoutPlan[]
  /** 用户可见错误文案。 */
  error: string | null
}

/** 创建初始状态。 */
export function createCreditPurchaseState(): CreditPurchaseState {
  return {
    open: false,
    openOptions: null,
    status: 'idle',
    configs: [],
    error: null
  }
}

/** 保留已缓存配置，重置一次打开流程的交易态。 */
export function resetCreditPurchaseTransactionState(state: CreditPurchaseState): void {
  state.status = 'idle'
  state.error = null
}
