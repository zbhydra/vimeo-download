/**
 * direct 下载方法。
 *
 * 流程：
 * 1. 新下载先申请 direct intent，拿到当前 CDN 直链。
 * 2. 下载开始时选择 OPFS / IndexedDB / Memory，并把 direct URL 写入方法状态。
 * 3. 下载失败交给工作区，用户手动重试；本地恢复记录只负责继续或清理。
 */

import { createMediaMaterialSession } from './media-material-session'
import {
  DirectDownloadHttpError,
  DirectUrlExpiredError,
  fetchDirectDownloadResponse
} from './response-download'
import { createObjectUrlCompletionFromResponse } from './response-download'
import {
  AutoRangeResumeExhaustedError,
  hasRangeWriteProgress,
  RangeStreamInterruptedError,
  pipeRangeResponseToWriter
} from './download-range-stream'
import {
  cleanupResumeTempFile,
  clearDownloadResumeMetadata,
  clearDownloadResumeRecord,
  createResumeObjectUrl,
  openResumeWriter,
  prepareResumeRecord,
  resourceFromResumeRecord,
  updateDownloadResumeRecord,
  type DownloadResumeRecord
} from './download-resume-store'
import type {
  DownloadMethodContext,
  DownloadMethodOptions
} from './download-methods'
import type { DownloadCompletion, DownloadMethodResult } from './download-completion'
import type { DirectDownloadIntent, MediaPost } from './types'

const MAX_AUTO_RANGE_RESUME_RETRIES = 3

function totalBytesForIntent(intent: DirectDownloadIntent, resource: MediaPost): number | null {
  if (typeof intent.size === 'number' && intent.size >= 0) {
    return intent.size
  }
  return typeof resource.size === 'number' && resource.size >= 0 ? resource.size : null
}

function totalBytesForRecord(record: DownloadResumeRecord): number | null {
  return typeof record.totalBytes === 'number' && record.totalBytes >= 0
    ? record.totalBytes
    : null
}

class IncompleteDirectDownloadError extends Error {
  readonly downloadedBytes: number
  readonly totalBytes: number | null

  constructor(
    sourceId: string,
    downloadedBytes: number,
    totalBytes: number | null,
    context: string
  ) {
    super(
      `[direct-download] ${context}: response ended before expected size, sourceId=${sourceId}, downloadedBytes=${downloadedBytes}, totalBytes=${totalBytes ?? 'unknown'}`
    )
    this.name = 'IncompleteDirectDownloadError'
    this.downloadedBytes = downloadedBytes
    this.totalBytes = totalBytes
  }
}

function assertCompleteDownload(
  sourceId: string,
  downloadedBytes: number,
  totalBytes: number | null,
  context: string
): void {
  if (totalBytes !== null && downloadedBytes < totalBytes) {
    throw new IncompleteDirectDownloadError(sourceId, downloadedBytes, totalBytes, context)
  }
}

function retryStartByteFromError(error: Error): number | null {
  if (error instanceof IncompleteDirectDownloadError) {
    return error.downloadedBytes
  }
  if (error instanceof RangeStreamInterruptedError) {
    return error.downloadedBytes
  }
  return null
}

function logAutoRangeResumeRetry(
  sourceId: string,
  retryCount: number,
  consecutiveNetworkErrors: number,
  startByte: number,
  error: Error
): void {
  console.warn(
    `[direct-download] auto Range resume retry ${retryCount}, sourceId=${sourceId}, consecutiveNetworkErrors=${consecutiveNetworkErrors}/${MAX_AUTO_RANGE_RESUME_RETRIES}, startByte=${startByte}, cause=${error.name}: ${error.message}`
  )
}

function buildCompletion(
  record: DownloadResumeRecord,
  objectUrl: string,
  bytesWritten: number
): DownloadCompletion {
  return {
    kind: 'object_url',
    objectUrl,
    filename: record.filename,
    revokeAfterMs: 60_000,
    bytesWritten,
    objectUrlSource: 'file',
    cleanup: () => cleanupResumeTempFile(record)
  }
}

async function prepareIntent(
  resource: MediaPost,
  context: DownloadMethodContext
): Promise<{ intent: DirectDownloadIntent; nodeId?: number }> {
  const session = await createMediaMaterialSession(resource, context)
  const intent = await session.prepareDirectIntent()
  return {
    intent,
    nodeId: session.getLastUsedNodeId() ?? undefined
  }
}

type DirectIntentRefresh = () => Promise<{
  intent: DirectDownloadIntent
  nodeId?: number
}>

async function runDirectDownloadToOpfs(
  resource: MediaPost,
  options: DownloadMethodOptions,
  record: DownloadResumeRecord,
  directUrl: string,
  startByte: number,
  filename: string,
  fallbackTotalBytes: number | null,
  nodeId?: number
): Promise<DownloadMethodResult> {
  let activeRecord = record
  const response = await fetchDirectDownloadResponse(
    directUrl,
    `[direct-download] runDirectDownloadToOpfs sourceId=${resource.sourceId}, startByte=${startByte}`,
    startByte > 0 ? { Range: `bytes=${startByte}-` } : {}
  )
  if (nodeId !== undefined) {
    options.onUsedNode?.(nodeId)
  }
  const writer = await openResumeWriter(activeRecord, startByte)
  const result = await pipeRangeResponseToWriter(response, {
    sourceId: resource.sourceId,
    startByte,
    fallbackTotalBytes,
    writer,
    onProgress: options.onProgress,
    onCheckpoint: async snapshot => {
      activeRecord = await updateDownloadResumeRecord(activeRecord, {
        downloadedBytes: snapshot.downloadedBytes,
        totalBytes: snapshot.totalBytes,
        mimeType: snapshot.mimeType,
        filename,
        downloadUrl: directUrl
      })
    }
  })
  activeRecord = await updateDownloadResumeRecord(activeRecord, {
    downloadedBytes: result.downloadedBytes,
    totalBytes: result.totalBytes,
    mimeType: result.mimeType,
    filename,
    downloadUrl: directUrl
  })
  assertCompleteDownload(
    resource.sourceId,
    activeRecord.downloadedBytes,
    activeRecord.totalBytes,
    'runDirectDownloadToOpfs'
  )

  const { objectUrl, bytesWritten } = await createResumeObjectUrl(activeRecord)
  const completion = buildCompletion(activeRecord, objectUrl, bytesWritten)
  await clearDownloadResumeMetadata()
  return {
    completion,
    retryCount: 0
  }
}

async function runDirectDownloadToOpfsWithAutoResume(
  resource: MediaPost,
  options: DownloadMethodOptions,
  record: DownloadResumeRecord,
  initialDownloadUrl: string,
  initialStartByte: number,
  initialFilename: string,
  initialTotalBytes: number | null,
  initialNodeId?: number,
  refreshIntent?: DirectIntentRefresh,
  allowAutoRangeResume = true
): Promise<DownloadMethodResult> {
  let activeDownloadUrl = initialDownloadUrl
  let activeFilename = initialFilename
  let activeTotalBytes = initialTotalBytes
  let usedNodeId = initialNodeId
  let activeRecord = record
  let directIntentRefreshCount = 0
  let retryCount = 0
  let consecutiveNetworkErrors = 0
  let startByte = initialStartByte

  while (true) {
    try {
      const result = await runDirectDownloadToOpfs(
        resource,
        options,
        activeRecord,
        activeDownloadUrl,
        startByte,
        activeFilename,
        activeTotalBytes,
        usedNodeId
      )
      return {
        ...result,
        retryCount: result.retryCount + retryCount,
        usedNodeId
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }

      if (error instanceof DirectUrlExpiredError || error instanceof DirectDownloadHttpError) {
        if (!refreshIntent || directIntentRefreshCount >= 1) {
          throw error
        }

        console.error(error)
        const refreshed = await refreshIntent()
        activeDownloadUrl = refreshed.intent.downloadUrl
        activeFilename = refreshed.intent.filename || resource.filename
        activeTotalBytes = totalBytesForIntent(refreshed.intent, resource)
        usedNodeId = refreshed.nodeId
        activeRecord = await updateDownloadResumeRecord(activeRecord, {
          downloadedBytes: startByte,
          totalBytes: activeTotalBytes,
          mimeType: refreshed.intent.mimeType || activeRecord.mimeType,
          filename: activeFilename,
          downloadUrl: activeDownloadUrl
        })
        directIntentRefreshCount += 1
        continue
      }

      const retryStartByte = retryStartByteFromError(error)
      if (retryStartByte === null) {
        throw error
      }
      if (!allowAutoRangeResume) {
        throw error
      }

      const hasTransferredBytes = hasRangeWriteProgress(startByte, retryStartByte)
      if (!hasTransferredBytes && consecutiveNetworkErrors >= MAX_AUTO_RANGE_RESUME_RETRIES) {
        throw new AutoRangeResumeExhaustedError(
          resource.sourceId,
          retryStartByte,
          activeTotalBytes,
          retryCount,
          error,
          {
            reason: 'direct_consecutive_empty_retries',
            retryLimit: MAX_AUTO_RANGE_RESUME_RETRIES
          }
        )
      }

      retryCount += 1
      consecutiveNetworkErrors = hasTransferredBytes ? 0 : consecutiveNetworkErrors + 1
      logAutoRangeResumeRetry(
        resource.sourceId,
        retryCount,
        consecutiveNetworkErrors,
        retryStartByte,
        error
      )
      startByte = retryStartByte
    }
  }
}

async function runDirectIntentToMemory(
  resource: MediaPost,
  intent: DirectDownloadIntent,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  const response = await fetchDirectDownloadResponse(
    intent.downloadUrl,
    '[direct-download] runDirectIntentToMemory'
  )
  const completion = await createObjectUrlCompletionFromResponse(
    response,
    intent.filename || resource.filename,
    options.onProgress,
    '[direct-download] runDirectIntentToMemory'
  )
  return {
    completion,
    retryCount: 0
  }
}

/** 判断 direct 恢复记录是否可用。 */
export function canResumeDirectDownload(
  record: DownloadResumeRecord,
  context: DownloadMethodContext
): boolean {
  void context
  return (
    record.mode === 'direct' &&
    (
      (
        record.storageType === 'opfs' &&
        record.recoveryMode === 'resumable' &&
        record.methodState.kind === 'single_file_range' &&
        typeof record.methodState.downloadUrl === 'string' &&
        record.methodState.downloadUrl.length > 0
      ) ||
      (
        record.storageType === 'opfs' &&
        record.recoveryMode === 'restartable' &&
        record.methodState.kind === 'single_file_range'
      ) ||
      (
        record.storageType === 'indexeddb' &&
        record.recoveryMode === 'restartable'
      )
    )
  )
}

/** 清理 direct 恢复记录。 */
export async function clearDirectResume(record: DownloadResumeRecord): Promise<void> {
  await clearDownloadResumeRecord(record)
}

/** 恢复 direct 下载。 */
async function runDirectResumeDownload(
  record: DownloadResumeRecord,
  resource: MediaPost,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  if (
    (record.storageType === 'indexeddb' || record.storageType === 'opfs') &&
    record.recoveryMode === 'restartable'
  ) {
    await clearDownloadResumeRecord(record)
    return runDirectDownloadFromStart(resource, context, options)
  }

  if (
    record.storageType !== 'opfs' ||
    record.recoveryMode !== 'resumable' ||
    record.methodState.kind !== 'single_file_range' ||
    !record.methodState.downloadUrl
  ) {
    await clearDownloadResumeRecord(record)
    throw new Error(
      `[direct-download] runDirectDownload: unsupported resume record, sourceId=${record.sourceId}, storageType=${record.storageType}, recoveryMode=${record.recoveryMode}`
    )
  }

  try {
    return await runDirectDownloadToOpfsWithAutoResume(
      resource,
      options,
      record,
      record.methodState.downloadUrl,
      record.downloadedBytes,
      record.filename,
      totalBytesForRecord(record),
      undefined,
      undefined,
      false
    )
  } catch (error) {
    if (error instanceof AutoRangeResumeExhaustedError) {
      throw error
    }
    console.error(error)
    await clearDownloadResumeRecord(record)
    throw error
  }
}

async function runDirectDownloadFromStart(
  resource: MediaPost,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  const initialPrepared = await prepareIntent(resource, context)
  const initialIntent = initialPrepared.intent
  if (initialPrepared.nodeId !== undefined) {
    options.onUsedNode?.(initialPrepared.nodeId)
  }
  const record = await prepareResumeRecord(resource, context, {
    downloadUrl: initialIntent.downloadUrl,
    preferredNodeId: resource.preferredNodeId,
    rangeResumable: true
  })
  if (record.storageType !== 'opfs') {
    const result = await runDirectIntentToMemory(resource, initialIntent, options)
    await clearDownloadResumeRecord(record)
    return { ...result, usedNodeId: initialPrepared.nodeId }
  }

  return runDirectDownloadToOpfsWithAutoResume(
    resource,
    options,
    record,
    initialIntent.downloadUrl,
    0,
    initialIntent.filename || resource.filename,
    totalBytesForIntent(initialIntent, resource),
    initialPrepared.nodeId,
    undefined,
    false
  )
}

/** 执行授权直链下载。 */
export async function runDirectDownload(
  resource: MediaPost,
  resumeRecord: DownloadResumeRecord | undefined,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  if (!resumeRecord) {
    return runDirectDownloadFromStart(resource, context, options)
  }

  return runDirectResumeDownload(
    resumeRecord,
    resourceFromResumeRecord(resumeRecord),
    context,
    options
  )
}
