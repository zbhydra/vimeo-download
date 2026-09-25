/**
 * Chrome 事件总线
 *
 * 类型安全的 Chrome 扩展事件发布/订阅系统
 * 用于单向推送消息（不需要响应）
 */

import type {
  EventData,
  EventDefinition,
  EventMessage,
  EventNames,
  EventPayload
} from '@/core/events/types'
import { isEventMessage } from '@/core/events/types'
import { logger } from '../utils/logger'

// ============================================================================
// ChromeEventEmitter
// ============================================================================

/**
 * Chrome 事件发布者
 *
 * 用于在 Background/Content Script 中发送事件到 Popup/Options
 *
 * @template TEvents 事件定义类型
 *
 * @example
 * ```typescript
 * import type { ExtensionEvents } from '@/core/events/types'
 *
 * const emitter = new ChromeEventEmitter<ExtensionEvents>()
 *
 * // 发送事件到所有监听者
 * emitter.emit('showUpgradeModal', { resetAt: Date.now() + 60_000 })
 * ```
 */
export class ChromeEventEmitter<TEvents extends EventDefinition> {
  /**
   * 发送事件到所有监听者（通过 runtime.sendMessage）
   *
   * @param event 事件名
   * @param data 事件数据
   */
  emit<E extends EventNames<TEvents>>(event: E, data: EventData<TEvents, E>): void {
    const message: EventMessage<TEvents> = {
      __event__: true,
      event,
      data
    }

    // 发送到 runtime（Popup/Options 等）
    chrome.runtime.sendMessage(message).catch(() => {
      // 忽略错误（可能没有监听者）
    })
  }

  /**
   * 发送事件到指定标签页
   *
   * @param tabId 目标标签页 ID
   * @param event 事件名
   * @param data 事件数据
   */
  emitToTab<E extends EventNames<TEvents>>(
    tabId: number,
    event: E,
    data: EventData<TEvents, E>
  ): void {
    const message: EventMessage<TEvents> = {
      __event__: true,
      event,
      data
    }

    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // 忽略错误（可能没有 content script）
    })
  }

  /**
   * 广播事件到所有标签页
   *
   * @param event 事件名
   * @param data 事件数据
   */
  async broadcast<E extends EventNames<TEvents>>(
    event: E,
    data: EventData<TEvents, E>
  ): Promise<void> {
    const tabs = await chrome.tabs.query({})

    for (const tab of tabs) {
      if (tab.id) {
        this.emitToTab(tab.id, event, data)
      }
    }
  }
}

// ============================================================================
// ChromeEventSubscriber
// ============================================================================

/**
 * Chrome 事件订阅者
 *
 * 用于在 Popup/Options/Content Script 中订阅事件
 *
 * @template TEvents 事件定义类型
 *
 * @example
 * ```typescript
 * import type { ExtensionEvents } from '@/core/events/types'
 *
 * const subscriber = new ChromeEventSubscriber<ExtensionEvents>()
 *
 * // 订阅事件
 * subscriber.on('showUpgradeModal', payload => {
 *   console.info(payload.resetAt)
 *   showModal.value = true
 * })
 *
 * // 销毁时清理
 * onUnmounted(() => subscriber.destroy())
 * ```
 */
export class ChromeEventSubscriber<TEvents extends EventDefinition> {
  private handlers: Map<string, Set<(data: EventPayload) => void>> = new Map()
  private listener: ChromeRuntimeMessageListener | null = null

  constructor() {
    this.listener = message => {
      if (!isEventMessage(message)) {
        return
      }

      const eventMessage = message as EventMessage<TEvents>
      const handlers = this.handlers.get(eventMessage.event as string)

      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(eventMessage.data)
          } catch (error) {
            logger.error(
              `[ChromeEventSubscriber] Handler error for ${String(eventMessage.event)}:`,
              error
            )
          }
        }
      }
    }

    chrome.runtime.onMessage.addListener(this.listener)
  }

  /**
   * 订阅事件
   *
   * @param event 事件名
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  on<E extends EventNames<TEvents>>(
    event: E,
    handler: (data: EventData<TEvents, E>) => void
  ): () => void {
    const eventName = event as string
    let handlers = this.handlers.get(eventName)

    if (!handlers) {
      handlers = new Set()
      this.handlers.set(eventName, handlers)
    }

    const storedHandler = handler as (data: EventPayload) => void
    handlers.add(storedHandler)

    // 返回取消订阅函数
    return () => {
      handlers?.delete(storedHandler)
    }
  }

  /**
   * 销毁订阅者
   */
  destroy(): void {
    if (this.listener) {
      chrome.runtime.onMessage.removeListener(this.listener)
      this.listener = null
    }

    this.handlers.clear()
    logger.info('[ChromeEventSubscriber] Destroyed')
  }
}

type ChromeRuntimeMessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0]
