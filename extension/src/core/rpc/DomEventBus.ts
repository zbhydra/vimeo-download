/**
 * DOM 事件总线
 *
 * 类型安全的 DOM CustomEvent 发布/订阅系统
 * 用于 Content Script 内部或 Content ↔ Injected 通信
 */

import type { EventData, EventDefinition, EventNames } from '@/core/events/types'
import { logger } from '../utils/logger'

// ============================================================================
// DomEventEmitter
// ============================================================================

/**
 * DOM 事件发布者
 *
 * 使用 CustomEvent 发送事件
 *
 * @template TEvents 事件定义类型
 *
 * @example
 * ```typescript
 * import type { ContentEvents } from '@/core/events/types'
 *
 * const emitter = new DomEventEmitter<ContentEvents>('vdl_')
 *
 * emitter.emit('injectedReady', undefined)
 * ```
 */
export class DomEventEmitter<TEvents extends EventDefinition> {
  private readonly prefix: string

  constructor(prefix: string = '') {
    this.prefix = prefix
  }

  /**
   * 发送事件
   *
   * @param event 事件名
   * @param data 事件数据
   */
  emit<E extends EventNames<TEvents>>(event: E, data: EventData<TEvents, E>): void {
    const eventName = `${this.prefix}${String(event)}`
    const customEvent = new CustomEvent(eventName, { detail: data })
    document.dispatchEvent(customEvent)
  }

  /**
   * 发送带动态后缀的事件
   *
   * 用于 progress 等需要按 ID 区分的事件
   *
   * @param event 事件名
   * @param suffix 动态后缀（如 messageId）
   * @param data 事件数据
   */
  emitWithSuffix<E extends EventNames<TEvents>>(
    event: E,
    suffix: string,
    data: EventData<TEvents, E>
  ): void {
    const eventName = `${this.prefix}${String(event)}_${suffix}`
    const customEvent = new CustomEvent(eventName, { detail: data })
    document.dispatchEvent(customEvent)
  }
}

// ============================================================================
// DomEventSubscriber
// ============================================================================

/**
 * DOM 事件订阅者
 *
 * 监听 CustomEvent 事件
 *
 * @template TEvents 事件定义类型
 *
 * @example
 * ```typescript
 * const subscriber = new DomEventSubscriber<ContentEvents>('vdl_')
 *
 * subscriber.on('injectedReady', () => {
 *   handleInjectedReady()
 * })
 *
 * // 销毁
 * subscriber.destroy()
 * ```
 */
export class DomEventSubscriber<TEvents extends EventDefinition> {
  private readonly prefix: string
  private listeners: Array<{ eventName: string; handler: EventListener }> = []

  constructor(prefix: string = '') {
    this.prefix = prefix
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
    const eventName = `${this.prefix}${String(event)}`

    const wrappedHandler = (e: Event) => {
      const customEvent = e as CustomEvent<EventData<TEvents, E>>
      try {
        handler(customEvent.detail)
      } catch (error) {
        logger.error(`[DomEventSubscriber] Handler error for ${eventName}:`, error)
      }
    }

    document.addEventListener(eventName, wrappedHandler)
    this.listeners.push({ eventName, handler: wrappedHandler })

    return () => {
      document.removeEventListener(eventName, wrappedHandler)
      this.listeners = this.listeners.filter(l => l.handler !== wrappedHandler)
    }
  }

  /**
   * 订阅带动态后缀的事件
   *
   * @param event 事件名
   * @param suffix 动态后缀
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  onWithSuffix<E extends EventNames<TEvents>>(
    event: E,
    suffix: string,
    handler: (data: EventData<TEvents, E>) => void
  ): () => void {
    const eventName = `${this.prefix}${String(event)}_${suffix}`

    const wrappedHandler = (e: Event) => {
      const customEvent = e as CustomEvent<EventData<TEvents, E>>
      try {
        handler(customEvent.detail)
      } catch (error) {
        logger.error(`[DomEventSubscriber] Handler error for ${eventName}:`, error)
      }
    }

    document.addEventListener(eventName, wrappedHandler)
    this.listeners.push({ eventName, handler: wrappedHandler })

    return () => {
      document.removeEventListener(eventName, wrappedHandler)
      this.listeners = this.listeners.filter(l => l.handler !== wrappedHandler)
    }
  }

  /**
   * 销毁订阅者
   */
  destroy(): void {
    for (const { eventName, handler } of this.listeners) {
      document.removeEventListener(eventName, handler)
    }
    this.listeners = []
    logger.info('[DomEventSubscriber] Destroyed')
  }
}
