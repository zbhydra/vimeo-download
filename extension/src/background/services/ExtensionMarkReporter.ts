/**
 * ExtensionMarkReporter - 统一处理跨插件上下文的 SLS 行为事件。
 *
 * Popup 与 Content 只广播业务事件，background 负责实际 WebTracking 请求。
 */

import { STORAGE_KEYS } from '@/core/api/config'
import { markApi } from '@/core/api/mark'
import { MARK_TYPE, type ExtensionOpenSource, type MarkType } from '@/core/api/mark/types'
import type { ExtensionMarkRecordOptions } from '@/core/api/mark/sls'
import type { ExtensionEvents } from '@/core/events/types'
import { ChromeEventSubscriber } from '@/core/rpc/ChromeEventBus'
import { storageManager } from '@/core/storage'
import { logger } from '@/core/utils/logger'
import { getInstallation } from '../installation'

/** 「每日」按后端业务时区切日，不跟用户本地时区走。 */
const BUSINESS_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

/** 所有 background 打点共用安装身份；上报失败不改变业务结果。 */
export async function recordBackgroundMark(
  markType: MarkType,
  markMsg = '',
  options: ExtensionMarkRecordOptions = {}
): Promise<{ recorded: boolean }> {
  try {
    await getInstallation()
    return await markApi.record(markType, markMsg, options)
  } catch (error) {
    logger.error(`[ExtensionMarkReporter] SLS 打点失败: markType=${markType}`, error)
    return { recorded: false }
  }
}

/** 统一的插件行为打点订阅器。 */
export class ExtensionMarkReporter {
  /** 跨插件上下文的业务事件订阅器。 */
  private readonly eventSubscriber = new ChromeEventSubscriber<ExtensionEvents>()

  private modalUnsubscribes: Array<() => void> = []

  /** 本次 service worker 已处理的业务日；恢复多个标签页时多个入口会同时触发。 */
  private dailyOpenHandledDate: string | null = null

  /** 注册插件行为事件。重复调用不会重复订阅。 */
  setup(): void {
    if (this.modalUnsubscribes.length) {
      return
    }

    this.modalUnsubscribes = [
      this.eventSubscriber.on('upgradeModalOpened', () => {
        void recordBackgroundMark(MARK_TYPE.UPGRADE_MODAL_OPEN)
      }),
      this.eventSubscriber.on('loginModalOpened', () => {
        void recordBackgroundMark(
          MARK_TYPE.LOGIN_MODAL_OPEN,
          JSON.stringify({ source: 'upgrade_modal' })
        )
      }),
      this.eventSubscriber.on('extensionOpened', ({ source }) => {
        this.recordDailyFirstOpened(source).catch(error => {
          logger.error('[ExtensionMarkReporter] 每日首次打开上报失败:', error)
        })
      })
    ]
  }

  /** 每个业务日只上报一次；没发出去不记日期，下次打开再补。 */
  private async recordDailyFirstOpened(source: ExtensionOpenSource): Promise<void> {
    const today = BUSINESS_DATE_FORMAT.format(Date.now())
    if (this.dailyOpenHandledDate === today) {
      return
    }
    this.dailyOpenHandledDate = today
    if ((await storageManager.get<string>(STORAGE_KEYS.DAILY_FIRST_OPENED_DATE)) === today) {
      return
    }

    const { recorded } = await recordBackgroundMark(
      MARK_TYPE.DAILY_FIRST_OPENED,
      JSON.stringify({ source })
    )
    if (recorded) {
      await storageManager.set(STORAGE_KEYS.DAILY_FIRST_OPENED_DATE, today)
    } else {
      this.dailyOpenHandledDate = null
    }
  }

  /** 释放事件订阅器。 */
  destroy(): void {
    for (const unsubscribe of this.modalUnsubscribes) unsubscribe()
    this.modalUnsubscribes = []
    this.eventSubscriber.destroy()
  }
}
