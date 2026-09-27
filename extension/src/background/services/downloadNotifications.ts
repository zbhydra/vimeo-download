/**
 * Background 系统通知工具。
 *
 * 下载任务在 SW 独立推进（popup 关闭后照常执行），用户回来时只能靠系统通知得知结果；
 * 完成与失败终态各发一条 basic 通知。文案经 I18nService 按用户界面语言解析（background
 * 与 popup 共享同一份 locale 字典，语言跟随 settings.language），不另建 chrome.i18n 文案。
 */

import { I18nService } from '@/locales'
import { I18N_KEYS } from '@/core/constants/i18n'
import { logger } from '@/core/utils/logger'

/** 通知图标：扩展内置的最高分辨率 logo（仓库无独立 logo.png，与商店页共用 128px 图标）。 */
const NOTIFICATION_ICON_PATH = 'icons/128.png'

/** 通知 ID → 点击跳转页；下载链路暂无可靠回跳页面，预留给失败详情页。 */
const clickTargets = new Map<string, string>()

/** 下载任务终态通知的输入。 */
export interface DownloadFinishedNotification {
  /** 目标文件名，用于通知正文。 */
  filename: string
  /** 任务是否成功落盘。 */
  succeeded: boolean
  /** 点击通知打开的页面 URL；缺省时点击为 noop。 */
  pageUrl?: string
}

/** 发送下载终态系统通知；通知能力异常不反噬下载链路，只记录日志。 */
export async function notifyDownloadFinished(info: DownloadFinishedNotification): Promise<void> {
  try {
    const notificationId = await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON_PATH),
      title: I18nService.t(
        info.succeeded ? I18N_KEYS.NOTIFICATION.COMPLETE_TITLE : I18N_KEYS.NOTIFICATION.FAILED_TITLE
      ),
      message: I18nService.t(
        info.succeeded
          ? I18N_KEYS.NOTIFICATION.COMPLETE_MESSAGE
          : I18N_KEYS.NOTIFICATION.FAILED_MESSAGE,
        { filename: info.filename }
      )
    })

    if (info.pageUrl) {
      clickTargets.set(notificationId, info.pageUrl)
    }
  } catch (error) {
    logger.error(
      `[DownloadNotifications] 发送系统通知失败: filename=${info.filename}, succeeded=${info.succeeded}`,
      error
    )
  }
}

/** 通知点击：跳转登记的目标页，没有目标（如未携带 pageUrl）保持 noop。 */
chrome.notifications.onClicked.addListener(notificationId => {
  const target = clickTargets.get(notificationId)
  if (!target) {
    return
  }

  clickTargets.delete(notificationId)
  chrome.tabs.create({ url: target }).catch(error => {
    logger.error(`[DownloadNotifications] 打开通知目标页失败: url=${target}`, error)
  })
})

/** 通知关闭后清理点击目标，防止 SW 长驻期间映射膨胀。 */
chrome.notifications.onClosed.addListener(notificationId => {
  clickTargets.delete(notificationId)
})
