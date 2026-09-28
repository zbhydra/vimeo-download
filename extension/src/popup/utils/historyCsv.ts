/**
 * 下载历史 CSV 导出（零依赖手写）。
 *
 * 裁决不引入 xlsx 依赖，CSV 即可满足「备份/迁移记录」诉求：RFC 4180 风格全字段双引号包裹
 * （内部引号翻倍，逗号/换行/引号都不会破坏列结构），`\r\n` 行分隔，头部加 UTF-8 BOM 保证
 * Excel 直接打开中文不乱码。
 */

import type { DownloadHistoryEntry } from '@/core/storage/downloadHistory'

/** UTF-8 BOM：Excel 依据它识别 UTF-8。 */
const CSV_BOM = '\uFEFF'

const CSV_FIELD_SEPARATOR = ','
const CSV_ROW_SEPARATOR = '\r\n'

/** CSV 列头文案（由调用方按当前界面语言翻译后传入）。 */
export type HistoryCsvHeaders = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string
]

/** 全字段双引号包裹；字段内的双引号翻倍转义，逗号与换行因此不会破坏列结构。 */
function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/** 生成 CSV 内容（含 BOM 与列头行），行序即传入顺序。 */
export function buildHistoryCsv(
  entries: readonly DownloadHistoryEntry[],
  headers: HistoryCsvHeaders
): string {
  const rows = entries.map(entry =>
    [
      new Date(entry.downloadedAt).toISOString(),
      entry.title,
      entry.author ?? '',
      entry.type,
      entry.quality ?? '',
      entry.status,
      entry.filename ?? '',
      entry.pageUrl ?? ''
    ]
      .map(field => escapeCsvField(String(field)))
      .join(CSV_FIELD_SEPARATOR)
  )

  // BOM 直接紧贴列头行（BOM 不是独立行）。
  return (
    CSV_BOM +
    [headers.map(escapeCsvField).join(CSV_FIELD_SEPARATOR), ...rows].join(CSV_ROW_SEPARATOR)
  )
}

/** 导出文件名：`vimeo-history-YYYY-MM-DD.csv`，日期取本机时区。 */
export function buildHistoryCsvFilename(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `vimeo-history-${now.getFullYear()}-${month}-${day}.csv`
}
