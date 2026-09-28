/**
 * 下载历史视图的过滤/排序/分页/相对时间纯逻辑。
 *
 * 抽成纯函数便于直接单测；HistoryView 组件只持有交互状态并调用这里的实现。
 */

import type { DownloadHistoryEntry } from '@/core/storage/downloadHistory'

/** 每页条数（对齐竞品分页粒度）。 */
export const HISTORY_PAGE_SIZE = 20

/** 排序方式：最新/最早/标题正序/标题倒序。 */
export type HistorySortMode = 'newest' | 'oldest' | 'titleAsc' | 'titleDesc'

/** 按关键词过滤：命中标题或作者（大小写不敏感）。 */
export function filterHistoryEntries(
  entries: readonly DownloadHistoryEntry[],
  query: string
): DownloadHistoryEntry[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return [...entries]
  }
  return entries.filter(
    entry =>
      entry.title.toLowerCase().includes(keyword) ||
      (entry.author?.toLowerCase().includes(keyword) ?? false)
  )
}

/** 按排序方式排序（返回新数组，不改动存储顺序）。 */
export function sortHistoryEntries(
  entries: readonly DownloadHistoryEntry[],
  mode: HistorySortMode
): DownloadHistoryEntry[] {
  const sorted = [...entries]
  switch (mode) {
    case 'newest':
      sorted.sort((a, b) => b.downloadedAt - a.downloadedAt)
      break
    case 'oldest':
      sorted.sort((a, b) => a.downloadedAt - b.downloadedAt)
      break
    case 'titleAsc':
      sorted.sort((a, b) => a.title.localeCompare(b.title))
      break
    case 'titleDesc':
      sorted.sort((a, b) => b.title.localeCompare(a.title))
      break
  }
  return sorted
}

/** 计算总页数；空列表也视作一页，页码指示始终有值。 */
export function countHistoryPages(entryCount: number): number {
  return Math.max(1, Math.ceil(entryCount / HISTORY_PAGE_SIZE))
}

/** 取某一页条目；页码越界时收敛到最后一页。 */
export function paginateHistoryEntries(
  entries: readonly DownloadHistoryEntry[],
  page: number
): { page: number; items: DownloadHistoryEntry[] } {
  const totalPages = countHistoryPages(entries.length)
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * HISTORY_PAGE_SIZE
  return { page: safePage, items: entries.slice(start, start + HISTORY_PAGE_SIZE) }
}

/**
 * 相对时间文案：秒→分→小时→天→周→月→年逐级放大，交给 Intl.RelativeTimeFormat 按当前
 * 界面语言本地化（内建能力，零新依赖、零新文案键）。
 */
export function formatRelativeTime(timestamp: number, locale: string, now: number): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diffSeconds = Math.round((timestamp - now) / 1000)
  const absSeconds = Math.abs(diffSeconds)

  const units: Array<{ limit: number; unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { limit: 60, unit: 'second', seconds: 1 },
    { limit: 3600, unit: 'minute', seconds: 60 },
    { limit: 86400, unit: 'hour', seconds: 3600 },
    { limit: 604800, unit: 'day', seconds: 86400 },
    { limit: 2629800, unit: 'week', seconds: 604800 },
    { limit: 31557600, unit: 'month', seconds: 2629800 }
  ]

  for (const { limit, unit, seconds } of units) {
    if (absSeconds < limit) {
      return formatter.format(Math.round(diffSeconds / seconds), unit)
    }
  }
  return formatter.format(Math.round(diffSeconds / 31557600), 'year')
}
