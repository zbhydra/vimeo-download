/**
 * 内嵌购买视图控制器。
 *
 * 购买收进插件内完成（卖点 + 套餐 + 发起支付），不跳官网 pricing 页；
 * 弹层宿主由 popup 根组件或插件订阅页挂载，其余入口只负责打开它。Vimeo 页面内的
 * 升级弹窗没有这个宿主，经 background 打开插件订阅页。
 */

import { ref } from 'vue'

/** 打开购买视图的业务入口，同时用作视图内登录门控的归因来源。 */
export type PremiumSource = 'popup_quota_counter' | 'popup_upgrade_now' | 'upgrade_modal'

/**
 * 匿名购买在登录成功后恢复的精确商品渠道。
 *
 * 购买视图在未登录确认购买时写入 `STORAGE_KEYS.PENDING_PREMIUM_PURCHASE`；登录后由
 * 插件订阅页恢复并消费持久化记录，再展示购买确认。
 */
export interface PendingPurchase {
  productId: string
  productPriceId: number
  paymentMethod: string
}

/** 购买视图当前是否可见。 */
export const premiumViewVisible = ref(false)

/** 打开购买视图的业务入口，供登录门控与后续归因读取。 */
const premiumSource = ref<PremiumSource>('upgrade_modal')
const premiumAttributionSource = ref<string>('upgrade_modal')

/** 打开购买视图。 */
export function openPremiumView(source: PremiumSource, attributionSource: string = source): void {
  premiumSource.value = source
  premiumAttributionSource.value = attributionSource
  premiumViewVisible.value = true
}

/** 关闭购买视图。 */
export function closePremiumView(): void {
  premiumViewVisible.value = false
}

/** 当前购买视图入口，供需要跨组件传递归因的调用方读取。 */
export function getPremiumSource(): PremiumSource {
  return premiumSource.value
}

/** 当前入口 URL source，仅用于定价页打点归因。 */
export function getPremiumAttributionSource(): string {
  return premiumAttributionSource.value
}
