/**
 * 下载历史视图纯逻辑（过滤/排序/分页/相对时间）测试。
 */

import { describe, expect, it } from 'vitest'

import type { DownloadHistoryEntry } from '@/core/storage/downloadHistory'
import { RESOURCE_TYPES } from '@/core/constants/resource'
import {
  countHistoryPages,
  filterHistoryEntries,
  formatRelativeTime,
  HISTORY_PAGE_SIZE,
  paginateHistoryEntries,
  sortHistoryEntries
} from '@/popup/utils/historyPresentation'

function makeEntry(overrides: Partial<DownloadHistoryEntry> = {}): DownloadHistoryEntry {
  return {
    videoId: '1',
    title: 'My Video',
    type: RESOURCE_TYPES.VIDEO,
    status: 'success',
    downloadedAt: 1000,
    ...overrides
  }
}

const fixtures: DownloadHistoryEntry[] = [
  makeEntry({ title: 'Alpha Tutorial', author: 'Vimeo Staff', downloadedAt: 3000 }),
  makeEntry({ title: 'beta clip', author: 'Alice', downloadedAt: 1000 }),
  makeEntry({ title: 'Gamma Reel', downloadedAt: 2000 })
]

describe('historyPresentation', () => {
  it('搜索命中标题或作者，大小写不敏感；空关键词返回全量', () => {
    expect(filterHistoryEntries(fixtures, 'ALPHA')).toHaveLength(1)
    expect(filterHistoryEntries(fixtures, 'alice')).toHaveLength(1)
    expect(filterHistoryEntries(fixtures, '  ')).toHaveLength(3)
    expect(filterHistoryEntries(fixtures, 'missing')).toHaveLength(0)
  })

  it('四种排序：最新/最早/标题正序/标题倒序', () => {
    expect(sortHistoryEntries(fixtures, 'newest').map(e => e.downloadedAt)).toEqual([3000, 2000, 1000])
    expect(sortHistoryEntries(fixtures, 'oldest').map(e => e.downloadedAt)).toEqual([1000, 2000, 3000])
    expect(sortHistoryEntries(fixtures, 'titleAsc').map(e => e.title)).toEqual([
      'Alpha Tutorial',
      'beta clip',
      'Gamma Reel'
    ])
    expect(sortHistoryEntries(fixtures, 'titleDesc').map(e => e.title)).toEqual([
      'Gamma Reel',
      'beta clip',
      'Alpha Tutorial'
    ])
  })

  it('分页：20 条一页，页码越界收敛到最后一页', () => {
    const many = Array.from({ length: HISTORY_PAGE_SIZE + 5 }, (_, i) =>
      makeEntry({ videoId: String(i) })
    )

    expect(countHistoryPages(many.length)).toBe(2)
    expect(paginateHistoryEntries(many, 1).items).toHaveLength(HISTORY_PAGE_SIZE)
    expect(paginateHistoryEntries(many, 2).items).toHaveLength(5)
    expect(paginateHistoryEntries(many, 99).items).toHaveLength(5)
    expect(countHistoryPages(0)).toBe(1)
  })

  it('相对时间按 locale 本地化并随间隔选单位', () => {
    const now = Date.UTC(2026, 8, 28, 12, 0, 0)
    const en = formatRelativeTime(now - 30 * 1000, 'en-US', now)
    expect(en).toContain('second')

    const zhMinute = formatRelativeTime(now - 5 * 60 * 1000, 'zh-CN', now)
    expect(zhMinute).toContain('分钟')

    const enYear = formatRelativeTime(now - 400 * 24 * 60 * 60 * 1000, 'en-US', now)
    expect(enYear).toContain('year')
  })
})
