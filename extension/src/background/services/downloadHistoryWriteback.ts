/**
 * 下载任务终态历史回写挂钩。
 *
 * DownloadOrchestrator 在任务成功/失败终态调用（与系统通知挂钩 downloadNotifications 同一批
 * 调用点），把任务资源收敛成历史记录并写入下载历史存储。取消与配额拒绝不回写：前者是用户
 * 主动行为，后者没有发生下载。回写链路任何异常都不反噬下载编排，只记日志。
 */

import { RESOURCE_TYPES } from '@/core/constants/resource'
import { recordDownloadHistory, type DownloadHistoryEntry } from '@/core/storage/downloadHistory'
import type { MediaResource } from '@/core/types'
import { logger } from '@/core/utils/logger'
import { decodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

/** 任务终态回写输入。 */
export interface DownloadTaskOutcomeInfo {
  /** 到达终态的资源。 */
  resource: MediaResource
  /** 下载发起页 URL；拿不到发起 tab 时缺省。 */
  pageUrl?: string
  /** 已确认的保存文件名；缺省回退资源自带文件名。 */
  filename?: string
  /** 任务是否成功落盘。 */
  succeeded: boolean
}

/**
 * 解析历史档位文案：视频优先取分辨率（`1080p`），其余回退站点描述符原文（字幕语言名、
 * 音频码率等站点数据）。原文与界面语言无关，可直接作为去重键的一部分。
 */
export function resolveHistoryQuality(resource: MediaResource): string | undefined {
  if (resource.type === RESOURCE_TYPES.VIDEO && resource.height) {
    return `${resource.height}p`
  }
  const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
  return descriptor?.label ?? undefined
}

/** 把任务资源收敛成一条历史记录字段。 */
export function buildHistoryEntry(info: DownloadTaskOutcomeInfo): DownloadHistoryEntry {
  const { resource } = info
  // 标题缺失时回退文件名再回退资源 ID，保证条目永远有一列可展示、可搜索。
  const title = resource.title || resource.filename || resource.id
  const quality = resolveHistoryQuality(resource)
  const filename = info.filename ?? resource.filename

  return {
    videoId: resource.messageId,
    title,
    ...(resource.author ? { author: resource.author } : {}),
    ...(quality ? { quality } : {}),
    type: resource.type,
    ...(info.pageUrl ? { pageUrl: info.pageUrl } : {}),
    status: info.succeeded ? 'success' : 'failed',
    ...(filename ? { filename } : {}),
    downloadedAt: Date.now()
  }
}

/** 终态回写入口：历史存储异常不影响下载链路，只记录日志。 */
export async function recordDownloadTaskOutcome(info: DownloadTaskOutcomeInfo): Promise<void> {
  try {
    await recordDownloadHistory(buildHistoryEntry(info))
  } catch (error) {
    logger.error(
      `[DownloadHistoryWriteback] 终态回写失败: resourceId=${info.resource.id}, succeeded=${info.succeeded}`,
      error
    )
  }
}
