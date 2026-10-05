/**
 * Download all 串行队列计划。
 *
 * 队列只消费可下载且可入队的动作计划，执行策略固定为一次一个资源。
 */

import type { DownloadActionPlan } from './download-action-plan'

/** Download all 队列计划。 */
export interface DownloadQueuePlan {
  /** 最终进入队列的资源计划，顺序等同结果卡片顺序。 */
  items: DownloadActionPlan[]
  /** 当前队列是否可启动。 */
  canStart: boolean
  /** 执行模型，本阶段固定串行。 */
  execution: 'serial'
  /** 并发数，本阶段固定为 1。 */
  concurrency: 1
  /** 禁用队列时给用户或日志使用的原因。 */
  disabledReason?: string
}

/** 构建 Download all 串行队列计划。 */
export function buildDownloadQueuePlan(
  plans: readonly DownloadActionPlan[]
): DownloadQueuePlan {
  const items = plans.filter(plan => plan.canDownload && plan.canEnqueue)
  const canStart = items.length > 0

  return {
    items,
    canStart,
    execution: 'serial',
    concurrency: 1,
    disabledReason: canStart
      ? undefined
      : '[download-queue-plan] buildDownloadQueuePlan: no downloadable resource can enter serial queue.'
  }
}
