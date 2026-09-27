/**
 * 设置弹层控制器。
 *
 * 设置集中在插件 popup 内完成（不设独立 options 页）；弹层宿主由 popup 根组件挂载，
 * 其余入口只负责打开它。状态是模块级单例，与 LoginModal/PremiumView 控制器同构。
 */

import { ref } from 'vue'

/** 设置弹层当前是否可见。 */
export const settingsModalVisible = ref(false)

/** 打开设置弹层。 */
export function openSettingsModal(): void {
  settingsModalVisible.value = true
}

/** 关闭设置弹层。 */
export function closeSettingsModal(): void {
  settingsModalVisible.value = false
}
