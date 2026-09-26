/**
 * 扩展单向事件类型。
 *
 * 只用于 Chrome/DOM EventBus 的通知链路，不承载 req-resp RPC。
 */

import type { DownloadQueueSnapshot } from '@/core/types'

/** EventBus 可传递的事件 payload。 */
export type EventPayload = object | string | number | boolean | null | void

/** EventBus 事件定义约束。 */
export type EventDefinition = Record<string, EventPayload>

/** 提取事件名。 */
export type EventNames<TEvents extends EventDefinition> = keyof TEvents & string

/** 提取事件数据。 */
export type EventData<
  TEvents extends EventDefinition,
  TEvent extends EventNames<TEvents>
> = TEvents[TEvent]

/** EventBus 内部消息格式。 */
export interface EventMessage<
  TEvents extends EventDefinition,
  TEvent extends EventNames<TEvents> = EventNames<TEvents>
> {
  /** 单向事件标记。 */
  __event__: true
  /** 事件名。 */
  event: TEvent
  /** 事件数据。 */
  data: EventData<TEvents, TEvent>
}

/** 待判断的事件消息。 */
interface EventMessageCandidate {
  /** 单向事件标记。 */
  __event__?: boolean
  /** 事件名。 */
  event?: string
  /** 事件数据。 */
  data?: EventPayload
}

/** 判断消息是否为单向事件。 */
export function isEventMessage(
  value: EventMessageCandidate
): value is EventMessage<EventDefinition> {
  return value.__event__ === true && typeof value.event === 'string'
}

/** popup/content 之间的 Chrome 单向事件。 */
export interface ExtensionEvents extends EventDefinition {
  /** 显示升级弹窗。 */
  showUpgradeModal: { resetAt?: number }
  /** 升级订阅弹窗从隐藏进入显示。 */
  upgradeModalOpened: void
  /** 游客登录提示从隐藏进入显示。 */
  loginModalOpened: void
  /** 当前页面未完成下载任务发生变化。 */
  downloadQueueUpdated: DownloadQueueSnapshot
}
