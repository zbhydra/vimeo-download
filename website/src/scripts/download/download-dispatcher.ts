/**
 * 下载方法 dispatcher。
 *
 * 新下载执行 action plan 已选定的方法；恢复任务按记录中的 downloadMode
 * 调用默认注册方法，避免恢复流程重新经过新下载 capability 判断。
 */

import type { DownloadMethodResult } from './download-completion'
import type { DownloadActionPlan } from './download-action-plan'
import type { DownloadResumeRecord } from './download-resume-store'
import {
  getDownloadMethod,
  type DownloadMethodContext,
  type DownloadMethodOptions
} from './download-methods'
import type { MediaPost } from './types'

/** 执行新下载 action plan 已选定的方法。 */
export async function downloadPlannedResource(
  plan: DownloadActionPlan,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  return plan.method.run(plan.resource, undefined, context, options)
}

/** 按恢复记录中的资源模式执行 Continue 或 Restart。 */
export async function resumeDownloadResource(
  resource: MediaPost,
  resumeRecord: DownloadResumeRecord,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  const method = getDownloadMethod(resource.downloadMode)
  return method.run(resource, resumeRecord, context, options)
}
