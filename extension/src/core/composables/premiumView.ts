/**
 * 内嵌购买视图控制器。
 *
 * 购买收进插件 popup 内完成（卖点 + 套餐 + 发起支付），不再跳官网 pricing 页；
 * 弹层宿主由 popup 根组件挂载，其余入口只负责打开它。官网 pricing 页保留给
 * 无法承载 popup 视图的场景（如 Vimeo 页面内的升级弹窗）。
 */

import { ref } from 'vue'

/** 打开购买视图的业务入口，同时用作视图内登录门控的归因来源。 */
export type PremiumSource = 'popup_quota_counter' | 'popup_upgrade_now' | 'upgrade_modal'

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
