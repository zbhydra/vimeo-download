/**
 * 下载历史视图控制器。
 *
 * 历史视图以 popup 内全屏覆盖层承载（PremiumView/SettingsModal 同构）；入口唯一，在设置
 * 弹层的「下载历史」行。状态是模块级单例，宿主由 popup 根组件挂载，其余入口只负责打开。
 */

import { ref } from 'vue'

/** 历史视图当前是否可见。 */
export const historyViewVisible = ref(false)

/** 打开历史视图。 */
export function openHistoryView(): void {
  historyViewVisible.value = true
}

/** 关闭历史视图。 */
export function closeHistoryView(): void {
  historyViewVisible.value = false
}
