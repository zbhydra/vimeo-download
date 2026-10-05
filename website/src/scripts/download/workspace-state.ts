/**
 * 下载工作区共享状态类型。
 *
 * 入口层持有完整状态，渲染和下载模块只读取各自需要的子集。
 */

import type { DownloadWorkspaceContent } from '../../i18n/schema'
import type { DownloadResumeRecord } from './download-resume-store'
import type { MediaPost } from './types'

/** 工作区完整状态。 */
export interface WorkspaceState {
  /** 是否已有下载任务在执行。 */
  activeDownload: boolean
  /** 当前语言文案。 */
  copy: DownloadWorkspaceContent
  /** 设备 ID。 */
  deviceId: string
  /** 当前待恢复下载任务。 */
  pendingDownloadTask: DownloadResumeRecord | null
  /** 当前解析资源列表。 */
  resources: MediaPost[]
}

/** 渲染模块只读状态子集。 */
export type WorkspaceRenderState = Pick<
  WorkspaceState,
  'copy' | 'pendingDownloadTask' | 'resources'
>

/** 下载模块所需状态子集。 */
export type WorkspaceDownloadState = WorkspaceState
