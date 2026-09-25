/**
 * 下载工作区共享状态类型。
 *
 * 入口层持有完整状态，渲染、鉴权和下载模块只读取各自需要的子集。
 */

import type { HomepageUserInfo } from '../../homepage-runtime/auth'
import type { HomepageCheckinEntryStatus } from '../../homepage-runtime/checkin'
import type { DownloadWorkspaceContent } from '../schema'
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
  /** 当前签到入口状态。 */
  checkin: HomepageCheckinEntryStatus | null
  /** 当前 access token。 */
  token: string | null
  /** 当前用户信息。 */
  user: HomepageUserInfo | null
}

/** 渲染模块只读状态子集。 */
export type WorkspaceRenderState = Pick<
  WorkspaceState,
  'checkin' | 'copy' | 'pendingDownloadTask' | 'resources' | 'user'
>

/** 下载模块所需状态子集。 */
export type WorkspaceDownloadState = WorkspaceState

/** 鉴权模块返回的状态补丁。 */
export interface AuthStatePatch {
  /** 新 token；null 表示清理登录态。 */
  token?: string | null
  /** 新用户；null 表示清理用户。 */
  user?: HomepageUserInfo | null
}

/** 认证恢复结果。 */
export interface AuthRestoreResult {
  /** token 是否恢复失败。 */
  tokenFailed: boolean
  /** 需要应用到 WorkspaceState 的状态补丁。 */
  patch: AuthStatePatch
}
