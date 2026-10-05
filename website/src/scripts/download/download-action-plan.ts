/**
 * 单资源下载动作计划。
 *
 * 工作区先把资源、方法能力和集合上下文收敛成计划，再交给 dispatcher 执行。
 */

import type { MediaPost } from './types'
import { getDownloadMethod, type DownloadMethodDefinition } from './download-methods'

/** 单资源下载动作计划。 */
export interface DownloadActionPlan {
  /** 本次下载目标资源。 */
  resource: MediaPost
  /** 资源 download_mode 对应的方法定义。 */
  method: DownloadMethodDefinition
  /** 当前资源是否允许点击下载。 */
  canDownload: boolean
  /** 当前资源是否允许进入 Download all 队列。 */
  canEnqueue: boolean
  /** 禁用下载时给用户或日志使用的原因。 */
  downloadDisabledReason?: string
  /** 禁用入队时给用户或日志使用的原因。 */
  queueDisabledReason?: string
}

/** 构建单资源下载动作计划。 */
export function buildDownloadActionPlan(
  resource: MediaPost,
  collection: readonly MediaPost[]
): DownloadActionPlan {
  const method = getDownloadMethod(resource.downloadMode)
  const canDownload = resource.capabilities.download !== false
  const singleResourceCollection = collection.length <= 1
  const queueDefaultDenied = method.queueDefault === 'deny'
  const resourceQueueDenied = resource.capabilities.downloadQueue === false
  const canEnqueue =
    canDownload &&
    !singleResourceCollection &&
    !queueDefaultDenied &&
    !resourceQueueDenied

  return {
    resource,
    method,
    canDownload,
    canEnqueue,
    downloadDisabledReason: canDownload
      ? undefined
      : `[download-action-plan] buildDownloadActionPlan: resource download disabled, sourceId=${resource.sourceId}, mode=${resource.downloadMode}`,
    queueDisabledReason: canEnqueue
      ? undefined
      : resolveQueueDisabledReason(
          resource,
          canDownload,
          singleResourceCollection,
          queueDefaultDenied,
          resourceQueueDenied
        )
  }
}

function resolveQueueDisabledReason(
  resource: MediaPost,
  canDownload: boolean,
  singleResourceCollection: boolean,
  queueDefaultDenied: boolean,
  resourceQueueDenied: boolean
): string | undefined {
  if (!canDownload) {
    return `[download-action-plan] buildDownloadActionPlan: resource cannot download, sourceId=${resource.sourceId}, mode=${resource.downloadMode}`
  }
  if (singleResourceCollection) {
    return `[download-action-plan] buildDownloadActionPlan: single resource collection cannot start queue, sourceId=${resource.sourceId}, mode=${resource.downloadMode}`
  }
  if (queueDefaultDenied) {
    return `[download-action-plan] buildDownloadActionPlan: method queue default denies enqueue, sourceId=${resource.sourceId}, mode=${resource.downloadMode}`
  }
  if (resourceQueueDenied) {
    return `[download-action-plan] buildDownloadActionPlan: resource capability disables queue, sourceId=${resource.sourceId}, mode=${resource.downloadMode}`
  }
  return undefined
}
