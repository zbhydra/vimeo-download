/** 插件登录页入口与登录打点；入口归因由调用方和登录页 URL 显式传递。 */
import { BackgroundChannel } from '@/content/rpc/background.rpc'
import { MARK_TYPE, type LoginSource, type MarkType } from '@/core/api/mark/types'
import { logger } from '@/core/utils/logger'
import { buildExtensionLoginUrl } from '@/core/utils/loginUrl'
import { openExternalPage } from '@/core/utils/navigation'

/** 记录登录链路打点；失败不影响登录本身。 */
function recordLoginMark(markType: MarkType, markMsg: string): void {
  new BackgroundChannel().recordMark({ mark_type: markType, mark_msg: markMsg }).catch(error => {
    logger.error('[LoginPage] SLS 打点失败:', error)
  })
}

/** 记录登录点击；订阅页在当前标签页登录，popup 新开登录标签页。 */
export function openLoginPage(source: LoginSource): void {
  recordLoginMark(MARK_TYPE.LOGIN_CLICK, JSON.stringify({ source }))
  const url = buildExtensionLoginUrl(source)
  if (window.location.pathname === '/ext-pricing.html') {
    window.location.assign(url)
    return
  }
  void openExternalPage(url, `extension-login:${source}`)
}

/** 插件本地完成的登录（邮箱验证码）记成功；background 完成的 Google 登录已自行打点，不走这里。 */
export function recordLoginSucceeded(source: LoginSource): void {
  recordLoginMark(MARK_TYPE.LOGIN_SUCCESS, JSON.stringify({ source }))
}

/** 登录失败：只记录打点，登录界面保留以便用户重试。 */
export function recordLoginFailed(source: LoginSource, stage: string, reason: string): void {
  recordLoginMark(MARK_TYPE.LOGIN_FAILED, JSON.stringify({ source, stage, reason }))
}
