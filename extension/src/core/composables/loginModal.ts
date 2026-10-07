/**
 * 登录弹窗控制器。
 *
 * 登录只在插件 popup 内完成，不再跳转官网；弹窗宿主由 popup 根组件挂载，其余入口只负责打开它。
 * 宿主页面（content）没有 popup 弹窗可挂载，此时退回订阅页，保证页面入口仍有一条可用路径。
 */

import { ref } from 'vue'
import { BackgroundChannel } from '@/content/rpc/background.rpc'
import { MARK_TYPE, type LoginSource, type MarkType } from '@/core/api/mark/types'
import { logger } from '@/core/utils/logger'
import { openPricingPage } from '@/core/utils/navigation'

/** 弹窗当前是否可见。 */
export const loginModalVisible = ref(false)

/** 打开弹窗的业务入口，仅用于埋点归因。 */
const loginSource = ref<LoginSource>('popup')

/** popup 内是否已挂载弹窗宿主。 */
const hostMounted = ref(false)

/** 记录登录链路打点；失败不影响登录本身。 */
function recordLoginMark(markType: MarkType, markMsg: string): void {
  new BackgroundChannel().recordMark({ mark_type: markType, mark_msg: markMsg }).catch(error => {
    logger.error('[LoginModal] SLS 打点失败:', error)
  })
}

/** 由弹窗宿主在挂载/卸载时登记，决定该上下文是否有登录面。 */
export function setLoginModalHostMounted(mounted: boolean): void {
  hostMounted.value = mounted
}

/** 打开登录弹窗；没有登录面的上下文退回订阅页。 */
export function openLoginModal(source: LoginSource): void {
  if (!hostMounted.value) {
    logger.warn(`[LoginModal] 当前上下文没有登录面，退回订阅页: source=${source}`)
    void openPricingPage('upgrade_modal')
    return
  }

  loginSource.value = source
  loginModalVisible.value = true
  recordLoginMark(MARK_TYPE.LOGIN_CLICK, JSON.stringify({ source }))
}

/** 关闭登录弹窗；用户主动关闭计为取消。 */
export function closeLoginModal(): void {
  if (!loginModalVisible.value) {
    return
  }

  loginModalVisible.value = false
  notifyLoginCancelled()
  recordLoginMark(
    MARK_TYPE.LOGIN_CANCELLED,
    JSON.stringify({ source: loginSource.value, stage: 'modal' })
  )
}

/** 通知购买流程清理待购意图；Google 授权取消时弹窗仍可保持打开。 */
export function notifyLoginCancelled(): void {
  window.dispatchEvent(new Event('vdl-login-cancelled'))
}

/** 当前登录入口，供需要跨上下文传递归因的登录方式读取。 */
export function getLoginSource(): LoginSource {
  return loginSource.value
}

/** 登录成功：关闭弹窗并记录成功打点。 */
export function completeLoginModal(): void {
  loginModalVisible.value = false
  recordLoginMark(MARK_TYPE.LOGIN_SUCCESS, JSON.stringify({ source: loginSource.value }))
}

/**
 * 关闭弹窗但不记成功打点。
 *
 * 用于登录由 background 完成并已自行打点的路径（如 Google 授权），避免同一次登录记两次成功。
 */
export function dismissLoginModal(): void {
  loginModalVisible.value = false
}

/** 登录失败：只记录打点，弹窗保留以便用户重试。 */
export function failLoginModal(stage: string, reason: string): void {
  recordLoginMark(
    MARK_TYPE.LOGIN_FAILED,
    JSON.stringify({ source: loginSource.value, stage, reason })
  )
}
