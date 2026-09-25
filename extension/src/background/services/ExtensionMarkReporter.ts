/**
 * ExtensionMarkReporter - 统一处理跨插件上下文的 SLS 行为事件。
 *
 * Popup 与 Content 只广播业务事件，background 负责实际 WebTracking 请求。
 */

import { markApi } from '@/core/api/mark'
import { MARK_TYPE, type MarkType } from '@/core/api/mark/types'
import type { ExtensionMarkRecordOptions } from '@/core/api/mark/sls'
import type { ExtensionEvents } from '@/core/events/types'
import { ChromeEventSubscriber } from '@/core/rpc/ChromeEventBus'
import { logger } from '@/core/utils/logger'
import { getInstallation } from '../installation'

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
      })
    ]
  }

  /** 释放事件订阅器。 */
  destroy(): void {
    for (const unsubscribe of this.modalUnsubscribes) unsubscribe()
    this.modalUnsubscribes = []
    this.eventSubscriber.destroy()
  }
}
