/**
 * 下载恢复状态存储。
 *
 * 流程：
 * 1. 新下载开始时只探测一次 OPFS -> IndexedDB。
 * 2. OPFS 记录保存单文件临时文件名，刷新后按记录里的 offset 发 Range 续传。
 * 3. IndexedDB 记录只保存轻量任务，刷新后展示 Restart，从 0 重新下载。
 * 4. 两者都不可用时只走普通内存下载，不产生可恢复 pending 记录。
 */

import type {
  DownloadRecoveryMode,
  DownloadStorageType,
  DownloadMode,
  MediaPlatform,
  MediaPost
} from './types'
import { DownloadStorageError } from './download-storage-error'

/** 创建恢复记录需要的下载上下文。 */
interface ResumeRecordContext {
  /** 当前设备 ID，当前记录不持久化该值。 */
  deviceId: string
  /** 当前 owner sub，当前记录不持久化该值。 */
  ownerSub: string
}

/** 新版 OPFS 下载恢复记录 localStorage key。 */
export const DOWNLOAD_RESUME_RECORD_STORAGE_KEY = 'download:resume:record:v1'

/** IndexedDB 下载恢复数据库名。 */
export const DOWNLOAD_RESUME_IDB_DATABASE_NAME = 'download_resume_store_v1'

/** IndexedDB 下载恢复对象仓库名。 */
const DOWNLOAD_RESUME_IDB_STORE_NAME = 'records'

/** IndexedDB 唯一 pending 记录 key。 */
const DOWNLOAD_RESUME_IDB_PENDING_KEY = 'pending'

/** 恢复记录格式版本。 */
const DOWNLOAD_RESUME_RECORD_VERSION = 1

/** OPFS 临时文件名前缀；不使用请求 ID，避免把一次性请求 ID 写入恢复记录。 */
const DOWNLOAD_RESUME_OPFS_PREFIX = 'download_resume_'

/** JSON 基础值。 */
type JsonPrimitive = string | number | boolean | null
/** JSON 对象。 */
type JsonObject = { [key: string]: JsonValue | undefined }
/** JSON 数组。 */
type JsonArray = JsonValue[]
/** JSON 值。 */
type JsonValue = JsonPrimitive | JsonObject | JsonArray

/** OPFS 写入器，隐藏 FileSystemWritableFileStream 细节。 */
export interface DownloadResumeWriter {
  /** 当前写入器对应的存储类型。 */
  storageType?: DownloadStorageType
  /** 写入一个二进制分片。 */
  write(chunk: Uint8Array): Promise<void>
  /** 提交并关闭临时文件。 */
  close(): Promise<void>
}

/** 单文件 Range 恢复方法状态。 */
export interface SingleFileRangeState {
  /** 方法状态类型。 */
  kind: 'single_file_range'
  /** OPFS 临时文件名。 */
  tempFileName: string
  /** direct 模式已授权直链；恢复时只尝试这个 URL，不重新授权。 */
  downloadUrl?: string
}

/** IndexedDB restartable 轻量任务状态。 */
export interface RestartableTaskState {
  /** 方法状态类型。 */
  kind: 'restartable_task'
}

/** 当前页 Memory 任务状态。 */
export interface MemoryTaskState {
  /** 方法状态类型。 */
  kind: 'memory_task'
}

/** 下载方法自有恢复状态。 */
export type DownloadResumeMethodState =
  | SingleFileRangeState
  | RestartableTaskState
  | MemoryTaskState

/** 下载恢复记录。 */
export interface DownloadResumeRecord {
  /** 记录格式版本。 */
  version: 1
  /** 下载方法。 */
  mode: DownloadMode
  /** 资源平台。 */
  platform: MediaPlatform
  /** 来源链接。 */
  link: string
  /** 资源 ID。 */
  sourceId: string
  /** 服务端签发的资源 token，restartable 恢复重新授权时只透传该值。 */
  resourceToken: string
  /** 保存文件名。 */
  filename: string
  /** MIME 类型。 */
  mimeType: string
  /** 已写入字节数；IndexedDB restartable 固定按 0 恢复。 */
  downloadedBytes: number
  /** 总字节数，null 表示未知。 */
  totalBytes: number | null
  /** 最近更新时间，毫秒时间戳。 */
  updatedAt: number
  /** 是否跨刷新持久化。 */
  persistent: boolean
  /** 当前存储类型。 */
  storageType: DownloadStorageType
  /** 当前恢复模式。 */
  recoveryMode: DownloadRecoveryMode
  /** 具体下载方法自有状态。 */
  methodState: DownloadResumeMethodState
  /** V2 解析成功节点 ID，下载授权时仅作为节点亲和 hint。 */
  preferredNodeId?: number
}

/** 创建恢复记录需要补充的下载元信息。 */
interface PrepareResumeMetadata {
  /** direct 模式当前直链。 */
  downloadUrl?: string
  /** V2 解析成功节点 ID。 */
  preferredNodeId?: number
  /** 是否允许用非 0 Range 拼接恢复；false 时 OPFS 只保存本次写入和 Restart 记录。 */
  rangeResumable?: boolean
}

/** 更新恢复记录时允许变更的下载元信息。 */
interface UpdateResumePatch {
  /** 已写入 OPFS 的字节数。 */
  downloadedBytes: number
  /** 总字节数，null 表示未知。 */
  totalBytes: number | null
  /** MIME 类型。 */
  mimeType: string
  /** 保存文件名。 */
  filename: string
  /** direct 模式当前直链。 */
  downloadUrl?: string
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function finiteNumber(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optionalFiniteNumber(value: JsonValue | undefined): number | undefined {
  const parsed = finiteNumber(value)
  return parsed === null ? undefined : Math.floor(parsed)
}

function normalizeMode(value: JsonValue | undefined): DownloadMode | null {
  return value === 'direct' || value === 'client_mux' ? value : null
}

function normalizePlatform(value: JsonValue | undefined): MediaPlatform | null {
  return value === 'vimeo' ? value : null
}

function normalizeStorageType(value: JsonValue | undefined): DownloadStorageType | null {
  return value === 'opfs' || value === 'indexeddb' || value === 'memory' ? value : null
}

function normalizeRecoveryMode(value: JsonValue | undefined): DownloadRecoveryMode | null {
  return value === 'resumable' || value === 'restartable' || value === 'current_page'
    ? value
    : null
}

function normalizeMethodState(value: JsonValue | undefined): DownloadResumeMethodState | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.kind === 'single_file_range') {
    const tempFileName = nonEmptyString(value.tempFileName)
    if (!tempFileName || !tempFileName.startsWith(DOWNLOAD_RESUME_OPFS_PREFIX)) {
      return null
    }

    return {
      kind: 'single_file_range',
      tempFileName,
      downloadUrl: nonEmptyString(value.downloadUrl) ?? undefined
    }
  }

  if (value.kind === 'restartable_task') {
    return { kind: 'restartable_task' }
  }

  if (value.kind === 'memory_task') {
    return { kind: 'memory_task' }
  }

  return null
}

function methodStateMatchesStorage(
  storageType: DownloadStorageType,
  recoveryMode: DownloadRecoveryMode,
  methodState: DownloadResumeMethodState
): boolean {
  if (storageType === 'opfs') {
    return (
      (recoveryMode === 'resumable' || recoveryMode === 'restartable') &&
      methodState.kind === 'single_file_range'
    )
  }
  if (storageType === 'indexeddb') {
    return recoveryMode === 'restartable' && methodState.kind === 'restartable_task'
  }

  return recoveryMode === 'current_page' && methodState.kind === 'memory_task'
}

function normalizeRecord(value: JsonValue): DownloadResumeRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const mode = normalizeMode(value.mode)
  const platform = normalizePlatform(value.platform)
  const link = nonEmptyString(value.link)
  const sourceId = nonEmptyString(value.sourceId)
  const resourceToken = nonEmptyString(value.resourceToken)
  const filename = nonEmptyString(value.filename)
  const mimeType = nonEmptyString(value.mimeType)
  const downloadedBytes = finiteNumber(value.downloadedBytes)
  const totalBytes = value.totalBytes === null ? null : finiteNumber(value.totalBytes)
  const updatedAt = finiteNumber(value.updatedAt)
  const storageType = normalizeStorageType(value.storageType)
  const recoveryMode = normalizeRecoveryMode(value.recoveryMode)
  const methodState = normalizeMethodState(value.methodState)

  if (
    value.version !== DOWNLOAD_RESUME_RECORD_VERSION ||
    !mode ||
    !platform ||
    !link ||
    !sourceId ||
    !resourceToken ||
    !filename ||
    !mimeType ||
    downloadedBytes === null ||
    totalBytes === undefined ||
    updatedAt === null ||
    !storageType ||
    !recoveryMode ||
    !methodState ||
    !methodStateMatchesStorage(storageType, recoveryMode, methodState)
  ) {
    return null
  }

  return {
    version: DOWNLOAD_RESUME_RECORD_VERSION,
    mode,
    platform,
    link,
    sourceId,
    resourceToken,
    filename,
    mimeType,
    downloadedBytes:
      storageType === 'indexeddb' ? 0 : Math.max(0, Math.floor(downloadedBytes)),
    totalBytes: totalBytes === null ? null : Math.max(0, Math.floor(totalBytes)),
    updatedAt: Math.floor(updatedAt),
    persistent: storageType !== 'memory',
    storageType,
    recoveryMode,
    methodState,
    preferredNodeId: optionalFiniteNumber(value.preferredNodeId)
  }
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || typeof navigator.storage === 'undefined') {
    return null
  }

  const storage = navigator.storage as StorageManager & {
    /** OPFS 根目录读取函数。 */
    getDirectory?: () => Promise<FileSystemDirectoryHandle>
  }
  if (typeof storage.getDirectory !== 'function') {
    return null
  }

  try {
    return await storage.getDirectory()
  } catch (error) {
    console.error(error)
    return null
  }
}

function createTempFileName(sourceId: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
  const safeSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  return `${DOWNLOAD_RESUME_OPFS_PREFIX}${safeSourceId}_${suffix.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function createRecordStorageError(
  record: DownloadResumeRecord,
  operation: DownloadStorageError['operation'],
  context: string,
  cause: Error
): DownloadStorageError {
  return new DownloadStorageError({
    storageType: record.storageType,
    recoveryMode: record.recoveryMode,
    operation,
    sourceId: record.sourceId,
    context,
    cause
  })
}

function createOpfsStorageError(
  resource: MediaPost,
  recoveryMode: DownloadRecoveryMode,
  operation: DownloadStorageError['operation'],
  context: string,
  cause: Error
): DownloadStorageError {
  return new DownloadStorageError({
    storageType: 'opfs',
    recoveryMode,
    operation,
    sourceId: resource.sourceId,
    context,
    cause
  })
}

function readStoredOpfsRecord(): DownloadResumeRecord | null {
  const raw = window.localStorage.getItem(DOWNLOAD_RESUME_RECORD_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return normalizeRecord(JSON.parse(raw) as JsonValue)
  } catch (error) {
    console.error(error)
    return null
  }
}

function writeStoredOpfsRecord(record: DownloadResumeRecord): void {
  try {
    window.localStorage.setItem(DOWNLOAD_RESUME_RECORD_STORAGE_KEY, JSON.stringify(record))
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createRecordStorageError(
      record,
      'save_status',
      'download-resume-store writeStoredOpfsRecord',
      cause
    )
    console.error(storageError)
    throw storageError
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openResumeDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error('[download-resume-store] openResumeDatabase: indexedDB is unavailable.')
    )
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DOWNLOAD_RESUME_IDB_DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DOWNLOAD_RESUME_IDB_STORE_NAME)) {
        database.createObjectStore(DOWNLOAD_RESUME_IDB_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('[download-resume-store] openResumeDatabase: open blocked.'))
  })
}

async function readIndexedDbRecord(): Promise<DownloadResumeRecord | null> {
  if (typeof indexedDB === 'undefined') {
    return null
  }

  let database: IDBDatabase | null = null
  try {
    database = await openResumeDatabase()
    const transaction = database.transaction(DOWNLOAD_RESUME_IDB_STORE_NAME, 'readonly')
    const store = transaction.objectStore(DOWNLOAD_RESUME_IDB_STORE_NAME)
    const raw = await requestToPromise<JsonValue | undefined>(
      store.get(DOWNLOAD_RESUME_IDB_PENDING_KEY)
    )
    if (raw === undefined) {
      return null
    }

    const record = normalizeRecord(raw)
    if (!record) {
      database.close()
      database = null
      await clearIndexedDbRecord()
    }
    return record
  } catch (error) {
    console.error(error)
    return null
  } finally {
    database?.close()
  }
}

async function writeIndexedDbRecord(record: DownloadResumeRecord): Promise<void> {
  let database: IDBDatabase | null = null
  try {
    database = await openResumeDatabase()
    const transaction = database.transaction(DOWNLOAD_RESUME_IDB_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(DOWNLOAD_RESUME_IDB_STORE_NAME)
    await requestToPromise(store.put(record, DOWNLOAD_RESUME_IDB_PENDING_KEY))
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createRecordStorageError(
      record,
      'save_status',
      'download-resume-store writeIndexedDbRecord',
      cause
    )
    console.error(storageError)
    throw storageError
  } finally {
    database?.close()
  }
}

async function clearIndexedDbRecord(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return
  }

  let database: IDBDatabase | null = null
  try {
    database = await openResumeDatabase()
    const transaction = database.transaction(DOWNLOAD_RESUME_IDB_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(DOWNLOAD_RESUME_IDB_STORE_NAME)
    await requestToPromise(store.delete(DOWNLOAD_RESUME_IDB_PENDING_KEY))
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = new DownloadStorageError({
      storageType: 'indexeddb',
      recoveryMode: 'restartable',
      operation: 'clear',
      context: 'download-resume-store clearIndexedDbRecord',
      cause
    })
    console.error(storageError)
  } finally {
    database?.close()
  }
}

async function removeOpfsTempFile(record: DownloadResumeRecord): Promise<void> {
  if (record.methodState.kind !== 'single_file_range') {
    return
  }

  const root = await getOpfsRoot()
  if (!root) {
    return
  }

  try {
    await root.removeEntry(record.methodState.tempFileName)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return
    }
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createRecordStorageError(
      record,
      'clear',
      'download-resume-store removeOpfsTempFile',
      cause
    )
    console.error(storageError)
  }
}

async function getOpfsTempFile(record: DownloadResumeRecord): Promise<File | null> {
  if (record.methodState.kind !== 'single_file_range') {
    return null
  }

  const root = await getOpfsRoot()
  if (!root) {
    return null
  }

  try {
    const handle = await root.getFileHandle(record.methodState.tempFileName)
    return await handle.getFile()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null
    }
    console.error(error)
    return null
  }
}

function totalBytesForResource(resource: MediaPost): number | null {
  return typeof resource.size === 'number' && resource.size >= 0 ? resource.size : null
}

/** 从恢复记录还原下载资源；只用于 Continue/Restart 的统一 dispatcher 入口。 */
export function resourceFromResumeRecord(record: DownloadResumeRecord): MediaPost {
  return {
    sourceId: record.sourceId,
    resourceToken: record.resourceToken,
    filename: record.filename,
    type: 'file',
    size: record.totalBytes,
    link: record.link,
    mimeType: record.mimeType,
    platform: record.platform,
    downloadMode: record.mode,
    preferredNodeId: record.preferredNodeId,
    capabilities: {
      download: true
    }
  }
}

function buildBaseRecord(
  resource: MediaPost,
  storageType: DownloadStorageType,
  recoveryMode: DownloadRecoveryMode,
  methodState: DownloadResumeMethodState,
  metadata: PrepareResumeMetadata
): DownloadResumeRecord {
  return {
    version: DOWNLOAD_RESUME_RECORD_VERSION,
    mode: resource.downloadMode,
    platform: resource.platform,
    link: resource.link,
    sourceId: resource.sourceId,
    resourceToken: resource.resourceToken,
    filename: resource.filename,
    mimeType: resource.mimeType || 'application/octet-stream',
    downloadedBytes: 0,
    totalBytes: totalBytesForResource(resource),
    updatedAt: Date.now(),
    persistent: storageType !== 'memory',
    storageType,
    recoveryMode,
    methodState,
    preferredNodeId: metadata.preferredNodeId
  }
}

async function prepareOpfsRecord(
  resource: MediaPost,
  metadata: PrepareResumeMetadata
): Promise<DownloadResumeRecord | null> {
  const root = await getOpfsRoot()
  if (!root) {
    return null
  }

  const recoveryMode = metadata.rangeResumable === false ? 'restartable' : 'resumable'
  const tempFileName = createTempFileName(resource.sourceId)
  try {
    const handle = await root.getFileHandle(tempFileName, { create: true })
    const writable = await handle.createWritable({ keepExistingData: true })
    await writable.truncate(0)
    await writable.close()
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    console.error(
      createOpfsStorageError(
        resource,
        recoveryMode,
        'probe',
        'download-resume-store prepareOpfsRecord',
        cause
      )
    )
    return null
  }

  const record = buildBaseRecord(
    resource,
    'opfs',
    recoveryMode,
    {
      kind: 'single_file_range',
      tempFileName,
      downloadUrl: metadata.downloadUrl
    },
    metadata
  )
  try {
    writeStoredOpfsRecord(record)
    return record
  } catch (error) {
    await removeOpfsTempFile(record)
    return null
  }
}

async function prepareIndexedDbRecord(
  resource: MediaPost,
  metadata: PrepareResumeMetadata
): Promise<DownloadResumeRecord | null> {
  if (typeof indexedDB === 'undefined') {
    return null
  }

  const record = buildBaseRecord(
    resource,
    'indexeddb',
    'restartable',
    { kind: 'restartable_task' },
    metadata
  )

  try {
    await writeIndexedDbRecord(record)
    return record
  } catch (error) {
    console.error(error)
    return null
  }
}

function prepareMemoryFallbackRecord(
  resource: MediaPost,
  metadata: PrepareResumeMetadata
): DownloadResumeRecord {
  return buildBaseRecord(
    resource,
    'memory',
    'current_page',
    { kind: 'memory_task' },
    metadata
  )
}

async function persistRecord(record: DownloadResumeRecord): Promise<void> {
  if (record.storageType === 'opfs') {
    writeStoredOpfsRecord(record)
    return
  }

  if (record.storageType === 'indexeddb') {
    await writeIndexedDbRecord(record)
    return
  }
}

/**
 * 新下载开始时创建恢复记录。
 *
 * @param resource - 当前下载资源。
 * @param context - 当前下载上下文，保留参数是为了调用点语义一致。
 * @param metadata - 下载方式自有恢复元信息。
 */
export async function prepareResumeRecord(
  resource: MediaPost,
  context: ResumeRecordContext,
  metadata: PrepareResumeMetadata = {}
): Promise<DownloadResumeRecord> {
  void context
  await clearDownloadResumeRecord()

  const opfsRecord = await prepareOpfsRecord(resource, metadata)
  if (opfsRecord) {
    return opfsRecord
  }

  const indexedDbRecord = await prepareIndexedDbRecord(resource, metadata)
  if (indexedDbRecord) {
    return indexedDbRecord
  }

  return prepareMemoryFallbackRecord(resource, metadata)
}

/** 读取唯一 pending 恢复记录；恢复时不重新探测和改判存储类型。 */
export async function loadDownloadResumeRecord(): Promise<DownloadResumeRecord | null> {
  const opfsRecord = readStoredOpfsRecord()
  if (opfsRecord) {
    if (opfsRecord.storageType !== 'opfs') {
      window.localStorage.removeItem(DOWNLOAD_RESUME_RECORD_STORAGE_KEY)
      return null
    }

    if (opfsRecord.recoveryMode === 'restartable') {
      return {
        ...opfsRecord,
        downloadedBytes: 0
      }
    }

    const tempFile = await getOpfsTempFile(opfsRecord)
    if (!tempFile || tempFile.size !== opfsRecord.downloadedBytes) {
      await clearDownloadResumeRecord(opfsRecord)
      return null
    }

    return opfsRecord
  }

  if (window.localStorage.getItem(DOWNLOAD_RESUME_RECORD_STORAGE_KEY) !== null) {
    window.localStorage.removeItem(DOWNLOAD_RESUME_RECORD_STORAGE_KEY)
  }

  const indexedDbRecord = await readIndexedDbRecord()
  if (indexedDbRecord) {
    if (indexedDbRecord.storageType !== 'indexeddb') {
      await clearDownloadResumeRecord(indexedDbRecord)
      return null
    }

    return {
      ...indexedDbRecord,
      downloadedBytes: 0,
      recoveryMode: 'restartable'
    }
  }

  return null
}

/** 更新恢复记录的下载进度。 */
export async function updateDownloadResumeRecord(
  record: DownloadResumeRecord,
  patch: UpdateResumePatch
): Promise<DownloadResumeRecord> {
  const nextMethodState =
    record.methodState.kind === 'single_file_range'
      ? {
        ...record.methodState,
        downloadUrl: patch.downloadUrl ?? record.methodState.downloadUrl
      }
      : record.methodState
  const nextRecord: DownloadResumeRecord = {
    ...record,
    filename: patch.filename,
    mimeType: patch.mimeType || 'application/octet-stream',
    downloadedBytes:
      record.storageType === 'indexeddb' ? 0 : Math.max(0, Math.floor(patch.downloadedBytes)),
    totalBytes: patch.totalBytes === null ? null : Math.max(0, Math.floor(patch.totalBytes)),
    updatedAt: Date.now(),
    methodState: nextMethodState
  }
  await persistRecord(nextRecord)
  return nextRecord
}

/** 清理恢复记录和对应临时文件。 */
export async function clearDownloadResumeRecord(record?: DownloadResumeRecord): Promise<void> {
  const activeRecord = record ?? readStoredOpfsRecord()
  window.localStorage.removeItem(DOWNLOAD_RESUME_RECORD_STORAGE_KEY)
  await clearIndexedDbRecord()
  if (activeRecord) {
    await removeOpfsTempFile(activeRecord)
  }
}

/** 只清理 pending 恢复记录，保留 OPFS 临时文件给浏览器下载器继续读取。 */
export async function clearDownloadResumeMetadata(): Promise<void> {
  window.localStorage.removeItem(DOWNLOAD_RESUME_RECORD_STORAGE_KEY)
  await clearIndexedDbRecord()
}

/** 延迟删除 OPFS 临时文件。 */
export async function cleanupResumeTempFile(record: DownloadResumeRecord): Promise<void> {
  await removeOpfsTempFile(record)
}

/** 打开 OPFS 临时文件写入器。 */
export async function openResumeWriter(
  record: DownloadResumeRecord,
  startByte: number
): Promise<DownloadResumeWriter> {
  if (record.methodState.kind !== 'single_file_range') {
    throw new Error(
      `[download-resume-store] openResumeWriter: record has no OPFS temp file, sourceId=${record.sourceId}, storageType=${record.storageType}, recoveryMode=${record.recoveryMode}`
    )
  }

  const root = await getOpfsRoot()
  if (!root) {
    throw new Error(
      `[download-resume-store] openResumeWriter: OPFS unavailable, sourceId=${record.sourceId}, temp=${record.methodState.tempFileName}`
    )
  }

  let handle: FileSystemFileHandle
  let file: File
  try {
    handle = await root.getFileHandle(record.methodState.tempFileName, { create: true })
    file = await handle.getFile()
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createRecordStorageError(
      record,
      'write_temp',
      'download-resume-store openResumeWriter open file',
      cause
    )
    console.error(storageError)
    throw storageError
  }
  if (startByte > file.size) {
    throw new Error(
      `[download-resume-store] openResumeWriter: startByte exceeds temp size, sourceId=${record.sourceId}, startByte=${startByte}, tempSize=${file.size}`
    )
  }

  let writable: FileSystemWritableFileStream
  try {
    writable = await handle.createWritable({ keepExistingData: true })
    await writable.truncate(startByte)
    await writable.seek(startByte)
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createRecordStorageError(
      record,
      'write_temp',
      'download-resume-store openResumeWriter prepare writer',
      cause
    )
    console.error(storageError)
    throw storageError
  }
  return {
    storageType: 'opfs',
    async write(chunk: Uint8Array): Promise<void> {
      const chunkCopy = new Uint8Array(chunk.byteLength)
      chunkCopy.set(chunk)
      try {
        await writable.write(chunkCopy)
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error))
        const storageError = createRecordStorageError(
          record,
          'write_temp',
          'download-resume-store openResumeWriter write',
          cause
        )
        console.error(storageError)
        throw storageError
      }
    },
    async close(): Promise<void> {
      try {
        await writable.close()
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error))
        const storageError = createRecordStorageError(
          record,
          'write_temp',
          'download-resume-store openResumeWriter close',
          cause
        )
        console.error(storageError)
        throw storageError
      }
    }
  }
}

/** 基于 OPFS File 创建 object URL。 */
export async function createResumeObjectUrl(
  record: DownloadResumeRecord
): Promise<{ objectUrl: string; bytesWritten: number }> {
  const file = await getOpfsTempFile(record)
  if (!file || record.methodState.kind !== 'single_file_range') {
    throw new Error(
      `[download-resume-store] createResumeObjectUrl: OPFS temp file missing, sourceId=${record.sourceId}, storageType=${record.storageType}, recoveryMode=${record.recoveryMode}`
    )
  }

  try {
    return {
      objectUrl: URL.createObjectURL(file),
      bytesWritten: file.size
    }
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error))
    const storageError = createRecordStorageError(
      record,
      'read_temp',
      'download-resume-store createResumeObjectUrl',
      cause
    )
    console.error(storageError)
    throw storageError
  }
}
