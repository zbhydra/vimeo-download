/**
 * 下载本地存储错误。
 *
 * 给 OPFS、IndexedDB、Memory 相关失败统一补充 storageType，避免浏览器原始
 * QuotaExceededError 只说超过配额却看不出是哪条本地存储链路。
 */

import type {
  DownloadRecoveryMode,
  DownloadStorageOperation,
  DownloadStorageType
} from './types'

/** 创建存储错误需要的上下文。 */
interface DownloadStorageErrorOptions {
  /** 当前存储类型。 */
  storageType: DownloadStorageType
  /** 当前恢复能力。 */
  recoveryMode: DownloadRecoveryMode
  /** 当前失败的存储操作。 */
  operation: DownloadStorageOperation
  /** 当前资源 ID。 */
  sourceId?: string
  /** 出错位置。 */
  context: string
  /** 浏览器或底层 API 抛出的原始错误。 */
  cause: Error
}

/** 带 storageType 的下载本地存储失败。 */
export class DownloadStorageError extends Error {
  /** 当前存储类型。 */
  readonly storageType: DownloadStorageType

  /** 当前恢复能力。 */
  readonly recoveryMode: DownloadRecoveryMode

  /** 当前失败的存储操作。 */
  readonly operation: DownloadStorageOperation

  /** 当前资源 ID。 */
  readonly sourceId?: string

  /** 原始错误名。 */
  readonly originalName: string

  /** 原始错误消息。 */
  readonly originalMessage: string

  constructor(options: DownloadStorageErrorOptions) {
    const sourceText = options.sourceId ? `, sourceId=${options.sourceId}` : ''
    const causeName = options.cause.name || 'Error'
    const causeMessage = options.cause.message || String(options.cause)
    super(
      `[download-storage] ${options.context}: storage=${options.storageType}, recovery=${options.recoveryMode}, operation=${options.operation}${sourceText}; cause=${causeName}: ${causeMessage}`
    )
    this.name = 'DownloadStorageError'
    this.storageType = options.storageType
    this.recoveryMode = options.recoveryMode
    this.operation = options.operation
    this.sourceId = options.sourceId
    this.originalName = causeName
    this.originalMessage = causeMessage
  }
}
