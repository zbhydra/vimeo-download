/**
 * chrome.downloads 下载路径共享工具。
 *
 * 由 DownloadOrchestrator 共用（direct 直连与 offscreen 产物落盘），
 * 统一保存位置子目录与文件名清洗语义。
 */

import { DEFAULT_DOWNLOAD_PATH } from '@/core/storage/settings'

/** Chrome 下载目录文件名保守长度上限。 */
const MAX_FILENAME_LENGTH = 180

/** 保存子目录保守长度上限；超出的目录段直接丢弃，保证路径长度可控。 */
const MAX_DIRECTORY_LENGTH = 120

/**
 * 生成 `chrome.downloads.download` 接受的相对下载路径。
 *
 * Chrome 只接受下载目录下的相对路径：绝对路径、空路径和含 `..` 回退段的路径都会让整个下载
 * 失败（`@types/chrome` 的 `DownloadOptions.filename`）。保存位置是用户可控输入，所以目录
 * 逐段丢弃非法段，而不是像文件名那样把非法字符替换成空格——替换会把 `../x` 变成 `.. x`
 * 这种看起来合法、语义却变了的目录名，等于放过了回退意图。
 */
export function buildDownloadFilename(directory: string | undefined, filename: string): string {
  return [...normalizeDownloadDirectory(directory), normalizeFilename(filename)].join('/')
}

/**
 * 把保存位置归一化成安全的相对目录段。
 *
 * 反斜杠先按分隔符处理（`..\x` 不能绕过回退段判定），然后逐段判定：绝对路径的开头 `/` 与
 * 连续 `/` 产生的空段、`.` 与 `..` 回退段、以 `~` 开头的段、含 `:`（Windows 盘符）或
 * `<>"|?*` 与控制字符的段全部丢弃，剩下的段按原顺序拼回相对路径；全部丢弃时回退默认子目录，
 * 保证交给 Chrome 的永远是非空相对路径。
 */
export function normalizeDownloadDirectory(directory: string | undefined): string[] {
  const segments = (directory ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map(segment => segment.trim())
    .filter(isSafeDirectorySegment)

  const kept: string[] = []
  let length = 0
  for (const segment of segments) {
    if (length + segment.length + 1 > MAX_DIRECTORY_LENGTH) {
      break
    }
    kept.push(segment)
    length += segment.length + 1
  }

  return kept.length > 0 ? kept : [DEFAULT_DOWNLOAD_PATH]
}

/** 目录段里不允许出现的路径保留字符；`:` 同时挡掉 Windows 盘符。 */
const RESERVED_SEGMENT_CHARACTERS = '<>:"|?*'

/** 目录段合法性：非空、不是 `.` / `..` 回退段、不以 `~` 开头、不含保留字符与控制字符。 */
function isSafeDirectorySegment(segment: string): boolean {
  if (segment.length === 0 || segment === '.' || segment === '..' || segment.startsWith('~')) {
    return false
  }

  // 控制字符按码点判定：与 `normalizeFilename` 同一口径，正则里的控制字符转义会被 lint 拦下。
  return Array.from(segment).every(
    character => character.charCodeAt(0) >= 32 && !RESERVED_SEGMENT_CHARACTERS.includes(character)
  )
}

/** 生成 Chrome 接受的相对下载文件名：单段名字，不含目录分隔符与控制字符。 */
function normalizeFilename(value: string): string {
  const normalized = Array.from(value.trim(), character =>
    character.charCodeAt(0) < 32 ? ' ' : character
  )
    .join('')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_FILENAME_LENGTH)
  // 清洗后正好是 `.` / `..` 的名字仍带路径语义（Chrome 会直接报错），换兜底名。
  if (normalized.length === 0 || normalized === '.' || normalized === '..') {
    return 'vimeo-download'
  }
  return normalized
}
