/**
 * 下载历史存储服务。
 *
 * 下载任务到达成功/失败终态时由 background 编排器回写一条记录（与竞品「点击即写、完成
 * 不回写」的差异化语义），popup 历史视图直接读写同一键。单键全量存 `chrome.storage.local`，
 * 容量固定 DOWNLOAD_HISTORY_MAX_ENTRIES 条、超限按时间裁剪最旧；同键去重与竞品覆盖式
 * 语义对齐：同视频同类型同档位再次下载时更新时间与状态并移到最前，不产生重复条目。
 */

import { STORAGE_KEYS } from '../api/config'
import { RESOURCE_TYPES, type ResourceType } from '../constants/resource'
import { logger } from '../utils/logger'
import { storageManager } from './index'

/** 历史容量上限：与竞品默认一致，MVP 不做设置项。 */
export const DOWNLOAD_HISTORY_MAX_ENTRIES = 500

/** 任务终态标记；取消与配额拒绝不回写，不是终态语义。 */
export type DownloadHistoryStatus = 'success' | 'failed'

/** 单条下载历史记录。 */
export interface DownloadHistoryEntry {
  /** 站点视频 ID（Vimeo videoId），去重键的一部分。 */
  videoId: string
  /** 媒体标题；站点未给出时回退文件名或资源 ID。 */
  title: string
  /** 作者/上传者名称；站点未给出时缺失。 */
  author?: string
  /** 档位文案（如 `1080p`、字幕语言名）；站点未给出时缺失。 */
  quality?: string
  /** 资源类型。 */
  type: ResourceType
  /** 下载发起页 URL；拿不到发起 tab 时缺失。 */
  pageUrl?: string
  /** 任务终态。 */
  status: DownloadHistoryStatus
  /** 保存文件名。 */
  filename?: string
  /** 终态回写时间（epoch 毫秒），也是排序与裁剪的依据。 */
  downloadedAt: number
}

/** 去重键的参与字段。 */
type HistoryKeyFields = Pick<DownloadHistoryEntry, 'videoId' | 'type' | 'quality'>

/** 去重键：同视频同类型同档位视为同一条记录；缺失字段用空串占位保持键稳定。 */
export function buildHistoryKey(entry: HistoryKeyFields): string {
  return `${entry.videoId}|${entry.type}|${entry.quality ?? ''}`
}

/** 读取全部历史记录，最新在前；键缺失或条目损坏时回退空表/丢弃坏条目。 */
export async function getDownloadHistory(): Promise<DownloadHistoryEntry[]> {
  const entries = await storageManager.get<DownloadHistoryEntry[]>(STORAGE_KEYS.DOWNLOAD_HISTORY)
  if (!Array.isArray(entries)) {
    return []
  }
  return entries.filter(isHistoryEntry)
}

/** 回写一条终态记录：同键去重、最新在前、超限裁剪最旧；写入失败只记日志。 */
export async function recordDownloadHistory(entry: DownloadHistoryEntry): Promise<void> {
  await withWriteLock(async () => {
    const entries = await getDownloadHistory()
    const key = buildHistoryKey(entry)
    const deduped = [entry, ...entries.filter(existing => buildHistoryKey(existing) !== key)]
    // 记录保持最新在前，容量裁剪直接从尾部丢弃最旧记录。
    const trimmed = deduped.slice(0, DOWNLOAD_HISTORY_MAX_ENTRIES)
    try {
      await storageManager.set(STORAGE_KEYS.DOWNLOAD_HISTORY, trimmed)
    } catch (error) {
      logger.error('[DownloadHistory] 历史记录写入失败', error)
    }
  })
}

/** 删除单条记录（按去重键定位）；失败只记日志。 */
export async function removeDownloadHistoryEntry(key: string): Promise<void> {
  await withWriteLock(async () => {
    try {
      const entries = await getDownloadHistory()
      await storageManager.set(
        STORAGE_KEYS.DOWNLOAD_HISTORY,
        entries.filter(entry => buildHistoryKey(entry) !== key)
      )
    } catch (error) {
      logger.error(`[DownloadHistory] 删除历史记录失败: key=${key}`, error)
    }
  })
}

/** 清空全部历史；与终态回写同锁串行，防止清空后并发回写复活已删记录。失败只记日志。 */
export async function clearDownloadHistory(): Promise<void> {
  await withWriteLock(async () => {
    try {
      await storageManager.remove(STORAGE_KEYS.DOWNLOAD_HISTORY)
    } catch (error) {
      logger.error('[DownloadHistory] 清空历史记录失败', error)
    }
  })
}

/**
 * 写操作串行化：两条任务同时到达终态时，读改写并发会互相覆盖丢记录。
 * 锁内错误不外泄也不断链，后续写照常进行。
 */
let writeLock: Promise<void> = Promise.resolve()
function withWriteLock(operation: () => Promise<void>): Promise<void> {
  const result = writeLock.then(operation)
  writeLock = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

/** 资源类型取值表，供存储边界做字符串校验。 */
const RESOURCE_TYPE_VALUES: readonly string[] = Object.values(RESOURCE_TYPES)

/** 轻量形状校验：存储数据可能来自旧版本或被手动改动，坏条目直接丢弃。 */
function isHistoryEntry(value: unknown): value is DownloadHistoryEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Partial<DownloadHistoryEntry>
  return (
    typeof entry.videoId === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.downloadedAt === 'number' &&
    typeof entry.type === 'string' &&
    RESOURCE_TYPE_VALUES.includes(entry.type)
  )
}
