/**
 * 页面下载按钮的瞬时进度出口。
 *
 * injected 下载器与 content 侧 Chrome 原生下载轮询共用该 DOM 事件；事件只驱动当前
 * 页面按钮，不承载权限操作、持久任务状态或下载完成判定。
 */

import { DOWNLOAD_PROGRESS_EVENT, type DownloadProgressDetail } from '@/core/protocol/injected'

/** 报告当前任务的展示进度；完成与取消终态仍由 downloadMedia 长调用负责。 */
export function reportDownloadProgress(progressDetail: DownloadProgressDetail): void {
  const detail: DownloadProgressDetail = {
    ...progressDetail,
    progress:
      progressDetail.progress === null ? null : Math.max(0, Math.min(100, progressDetail.progress))
  }

  document.dispatchEvent(
    new CustomEvent<DownloadProgressDetail>(DOWNLOAD_PROGRESS_EVENT, { detail })
  )
}
