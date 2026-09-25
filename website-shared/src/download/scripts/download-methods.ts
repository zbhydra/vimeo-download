/**
 * 下载方法注册与校验。
 *
 * 本文件是唯一 download_mode 注册表：定义 mode、能力、runner 引用和运行时校验。
 */

import { runClientMuxDownload } from './client-mux-download'
import {
  canResumeDirectDownload,
  clearDirectResume,
  runDirectDownload
} from './direct-download'
import type { DownloadMethodResult } from './download-completion'
import type { DownloadResumeRecord } from './download-resume-store'
import type { DownloadMode, DownloadProgressSnapshot, MediaPost } from './types'

function isDownloadMode(value: string | null | undefined): value is DownloadMode {
  return value === 'direct' || value === 'client_mux'
}

/** 未注册下载方法错误。 */
export class UnsupportedDownloadModeError extends Error {
  /** 原始 download_mode 值。 */
  readonly value: string | null | undefined
  /** 触发校验的位置。 */
  readonly context: string

  constructor(value: string | null | undefined, context: string) {
    super(
      `[download-methods] UnsupportedDownloadModeError: unsupported download_mode="${value ?? 'null'}", context=${context}`
    )
    this.name = 'UnsupportedDownloadModeError'
    this.value = value
    this.context = context
  }
}

/** 下载方法上下文。 */
export interface DownloadMethodContext {
  /** 当前设备 ID。 */
  deviceId: string
  /** 当前 owner sub，格式为 user:{id} 或 device:{id}。 */
  ownerSub: string
  /** 当前 access token，未登录时为 null。 */
  token: string | null
}

/** 下载方法调用选项。 */
export interface DownloadMethodOptions {
  /** 下载进度回调。 */
  onProgress?(progress: DownloadProgressSnapshot): void
  /** 本次下载实际命中的 download-v2 节点。 */
  onUsedNode?(nodeId: number): void
}

/** 下载方法 runner。 */
export type DownloadMethodRunner = (
  resource: MediaPost,
  resumeRecord: DownloadResumeRecord | undefined,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
) => Promise<DownloadMethodResult>

/** 下载完成后的保存策略。 */
export type DownloadSaveStrategy = 'object_url'

/** 下载会话恢复策略。 */
export type DownloadSessionPolicy = 'none' | 'restartable' | 'byte_resume' | 'method_managed'

/** Download all 默认入队策略。 */
export type DownloadQueueDefault = 'allow' | 'deny'

/** 下载方法能力定义。 */
export interface DownloadMethodDefinition {
  /** 下载方法 ID。 */
  mode: DownloadMode
  /** 是否需要先申请下载 intent。 */
  requiresIntent: boolean
  /** 该方法可能返回的保存策略。 */
  saveStrategies: DownloadSaveStrategy[]
  /** 该方法的跨刷新会话策略。 */
  sessionPolicy: DownloadSessionPolicy
  /** 新下载是否需要先检查浏览器 origin storage。 */
  requiresStoragePreflight: boolean
  /** Download all 默认入队策略。 */
  queueDefault: DownloadQueueDefault
  /** 配额消耗发生时机。 */
  quotaTiming: 'stream_start' | 'intent' | 'job_start'
  /** 具体方法 runner。 */
  run: DownloadMethodRunner
  /** 当前记录是否能由该方法恢复。 */
  canResume?(record: DownloadResumeRecord, context: DownloadMethodContext): boolean
  /** 清理当前方法自己的恢复状态。 */
  clearResume?(record: DownloadResumeRecord): Promise<void>
}

/** 下载方法注册表。 */
export const DOWNLOAD_METHODS: Record<DownloadMode, DownloadMethodDefinition> = {
  direct: {
    mode: 'direct',
    requiresIntent: true,
    saveStrategies: ['object_url'],
    sessionPolicy: 'byte_resume',
    requiresStoragePreflight: true,
    queueDefault: 'allow',
    quotaTiming: 'intent',
    run: runDirectDownload,
    canResume: canResumeDirectDownload,
    clearResume: clearDirectResume
  },
  client_mux: {
    mode: 'client_mux',
    requiresIntent: true,
    saveStrategies: ['object_url'],
    sessionPolicy: 'none',
    requiresStoragePreflight: true,
    queueDefault: 'deny',
    quotaTiming: 'intent',
    run: runClientMuxDownload,
    canResume: () => false
  }
}

/** 校验并返回合法下载方法 ID。 */
export function assertDownloadMode(
  value: string | null | undefined,
  context: string
): DownloadMode {
  if (isDownloadMode(value)) {
    return value
  }

  throw new UnsupportedDownloadModeError(value, context)
}

/** 读取下载方法定义。 */
export function getDownloadMethod(mode: DownloadMode): DownloadMethodDefinition {
  return DOWNLOAD_METHODS[mode]
}
