/**
 * 下载历史 CSV 导出测试。
 *
 * 覆盖 RFC 4180 转义（逗号/引号/换行）、BOM 头、列头与行序、文件名日期格式。
 */

import { describe, expect, it } from 'vitest'

import type { DownloadHistoryEntry } from '@/core/storage/downloadHistory'
import { RESOURCE_TYPES } from '@/core/constants/resource'
import { buildHistoryCsv, buildHistoryCsvFilename } from '@/popup/utils/historyCsv'

const HEADERS = [
  'Downloaded at',
  'Title',
  'Author',
  'Type',
  'Quality',
  'Status',
  'File',
  'Page URL'
] as const

/** 换行/BOM 控制字符，避免在源码里书写转义序列。 */
const LF = String.fromCharCode(10)
const BOM_CHAR = String.fromCharCode(0xfeff)

function makeEntry(overrides: Partial<DownloadHistoryEntry> = {}): DownloadHistoryEntry {
  return {
    videoId: '1',
    title: 'My Video',
    type: RESOURCE_TYPES.VIDEO,
    quality: '1080p',
    status: 'success',
    downloadedAt: Date.UTC(2026, 8, 28, 12, 0, 0),
    ...overrides
  }
}

describe('historyCsv', () => {
  it('基础导出：BOM 开头、列头行、字段全包裹、一行一条', () => {
    const csv = buildHistoryCsv(
      [makeEntry({ author: 'Studio', filename: 'my-video-1080p.mp4' })],
      HEADERS
    )

    expect(csv.startsWith(BOM_CHAR)).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(
      '"Downloaded at","Title","Author","Type","Quality","Status","File","Page URL"'
    )
    expect(lines[1]).toBe(
      '"2026-09-28T12:00:00.000Z","My Video","Studio","video","1080p","success","my-video-1080p.mp4",""'
    )
  })

  it('字段内逗号、双引号与换行被正确转义', () => {
    const csv = buildHistoryCsv(
      [
        makeEntry({
          title: ['Video, "The Best"', 'Edition'].join(LF),
          author: 'O’Brien & Co'
        })
      ],
      HEADERS
    )

    const dataLine = csv.slice(1).split('\r\n')[1]
    expect(dataLine).toBe(
      [
        '"2026-09-28T12:00:00.000Z"',
        '"Video, ""The Best""' + LF + 'Edition"',
        '"O’Brien & Co"',
        '"video"',
        '"1080p"',
        '"success"',
        '""',
        '""'
      ].join(',')
    )
  })

  it('文件名按本机日期补零：vimeo-history-YYYY-MM-DD.csv', () => {
    expect(buildHistoryCsvFilename(new Date(2026, 0, 5, 3, 40))).toBe('vimeo-history-2026-01-05.csv')
    expect(buildHistoryCsvFilename(new Date(2026, 11, 28))).toBe('vimeo-history-2026-12-28.csv')
  })
})
