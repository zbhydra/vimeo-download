/** 下载落盘成功计数；只由 background 编排器在确认完成后写入。 */

import { STORAGE_KEYS } from '@/core/api/config'
import { storageManager } from '@/core/storage'
import { logger } from '@/core/utils/logger'

/** 记录已完成的下载；存储失败不改变媒体下载结果。 */
export async function recordDownloadSuccess(): Promise<void> {
  try {
    const count = (await storageManager.get<number>(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)) ?? 0
    await storageManager.set(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT, count + 1)
  } catch (error) {
    logger.error('[DownloadSuccess] 写入下载成功计数失败:', error)
  }
}
