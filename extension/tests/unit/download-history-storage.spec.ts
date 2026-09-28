/**
 * 下载历史存储服务测试。
 *
 * 覆盖回写去重（同键更新时间与状态并移到最前）、容量裁剪、单删、清空与坏数据兜底。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildHistoryKey,
  clearDownloadHistory,
  DOWNLOAD_HISTORY_MAX_ENTRIES,
  getDownloadHistory,
  recordDownloadHistory,
  removeDownloadHistoryEntry,
  type DownloadHistoryEntry
} from '@/core/storage/downloadHistory'
import { RESOURCE_TYPES } from '@/core/constants/resource'
import { STORAGE_KEYS } from '@/core/api/config'

/** 构造一条测试记录；同视频同类型同档位的键天然相同。 */
function makeEntry(overrides: Partial<DownloadHistoryEntry> = {}): DownloadHistoryEntry {
  return {
    videoId: '1196869805',
    title: 'My Video',
    type: RESOURCE_TYPES.VIDEO,
    quality: '1080p',
    status: 'success',
    downloadedAt: 1000,
    ...overrides
  }
}

/** chrome.storage.local 的测试后备存储（与 setup.ts 的 get stub 解耦，需自行接管读写）。 */
const storageData = new Map<string, unknown>()

describe('downloadHistory 存储服务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageData.clear()
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(async keys => {
      const result: Record<string, unknown> = {}
      const keyList =
        keys === null
          ? [...storageData.keys()]
          : typeof keys === 'string'
            ? [keys]
            : Array.isArray(keys)
              ? keys
              : []
      for (const key of keyList) {
        if (storageData.has(key)) {
          result[key] = storageData.get(key)
        }
      }
      return result
    })
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(async items => {
      for (const [key, value] of Object.entries(items)) {
        storageData.set(key, value)
      }
    })
    vi.spyOn(chrome.storage.local, 'remove').mockImplementation(async keys => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        storageData.delete(key)
      }
    })
  })

  it('空存储读取回退空数组', async () => {
    await expect(getDownloadHistory()).resolves.toEqual([])
  })

  it('回写记录并保持最新在前', async () => {
    await recordDownloadHistory(makeEntry({ downloadedAt: 1000 }))
    await recordDownloadHistory(makeEntry({ videoId: '2', downloadedAt: 2000 }))

    const entries = await getDownloadHistory()
    expect(entries.map(entry => entry.videoId)).toEqual(['2', '1196869805'])
  })

  it('同键去重：更新时间与状态并移到最前，不产生重复条目', async () => {
    await recordDownloadHistory(makeEntry({ status: 'failed', downloadedAt: 1000 }))
    await recordDownloadHistory(makeEntry({ videoId: '2', downloadedAt: 1500 }))
    await recordDownloadHistory(makeEntry({ status: 'success', downloadedAt: 2000 }))

    const entries = await getDownloadHistory()
    expect(entries).toHaveLength(2)
    // 同键旧记录被覆盖：状态与时间更新，且移到最前。
    expect(entries[0]).toMatchObject({ videoId: '1196869805', status: 'success', downloadedAt: 2000 })
    expect(entries[1]?.videoId).toBe('2')
  })

  it('quality 缺失与空串视为同键（占位一致）', () => {
    expect(buildHistoryKey({ videoId: 'v', type: RESOURCE_TYPES.AUDIO, quality: undefined })).toBe(
      buildHistoryKey({ videoId: 'v', type: RESOURCE_TYPES.AUDIO, quality: '' })
    )
  })

  it('超过容量上限时裁剪最旧记录', async () => {
    for (let i = 0; i < DOWNLOAD_HISTORY_MAX_ENTRIES + 5; i += 1) {
      await recordDownloadHistory(makeEntry({ videoId: String(i), downloadedAt: i }))
    }

    const entries = await getDownloadHistory()
    expect(entries).toHaveLength(DOWNLOAD_HISTORY_MAX_ENTRIES)
    // 最新（i 大）在前，最旧 5 条被裁掉。
    expect(entries[0]?.videoId).toBe(String(DOWNLOAD_HISTORY_MAX_ENTRIES + 4))
    expect(entries.map(entry => entry.videoId)).not.toContain('0')
  })

  it('按去重键删除单条记录', async () => {
    await recordDownloadHistory(makeEntry())
    await recordDownloadHistory(makeEntry({ videoId: '2' }))

    await removeDownloadHistoryEntry(
      buildHistoryKey({ videoId: '1196869805', type: RESOURCE_TYPES.VIDEO, quality: '1080p' })
    )

    const entries = await getDownloadHistory()
    expect(entries.map(entry => entry.videoId)).toEqual(['2'])
  })

  it('清空后存储键被移除', async () => {
    await recordDownloadHistory(makeEntry())
    await clearDownloadHistory()

    await expect(getDownloadHistory()).resolves.toEqual([])
    const raw = await chrome.storage.local.get(STORAGE_KEYS.DOWNLOAD_HISTORY)
    expect(raw[STORAGE_KEYS.DOWNLOAD_HISTORY]).toBeUndefined()
  })

  it('存储中的坏条目被丢弃，不影响读取', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.DOWNLOAD_HISTORY]: [
        makeEntry(),
        { broken: true },
        // 故意的坏数据：downloadedAt 不是数字。
        { ...makeEntry(), videoId: '2', downloadedAt: 'late' as unknown as number }
      ]
    })

    const entries = await getDownloadHistory()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.videoId).toBe('1196869805')
  })
})
