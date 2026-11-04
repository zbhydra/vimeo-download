/**
 * 下载文件名净化（纯函数，无 chrome 依赖）。
 *
 * 是「落盘文件名」净化的唯一实现：background 在 `chrome.downloads.download` 前用它清洗最终
 * 保存名（`background/services/downloadFilename.ts`），popup 设置弹层的文件名模板预览用同一
 * 函数保证「预览 = 落盘」。从 background 版抽出单独成文件，是因为后者还聚合了存储读取与
 * 站点描述符解码，popup 预览不能把 chrome.storage 依赖拉进 UI 包。
 *
 * 字符规则对齐 Chrome 的相对路径校验（`IsSafePortableRelativePath`）：不满足时
 * `chrome.downloads.download` 直接报 `Invalid filename`，整个下载失败。
 */

/** Chrome 下载目录文件名保守长度上限；按码点计，含扩展名。 */
const MAX_FILENAME_LENGTH = 180

/** 主干清洗后为空时的兜底名。 */
const FALLBACK_STEM = 'vimeo-download'

/** 格式字符（ZWJ、LRM 等）肉眼不可见，直接删除；换成空格反而会在标题里插入多余空隙。 */
const FORMAT_CHARACTERS = /\p{Cf}/gu

/** 控制字符、非字符与路径保留字符；`:` 同时挡掉 Windows 盘符。 */
const ILLEGAL_CHARACTERS = /[\p{Cc}\p{Noncharacter_Code_Point}<>:"/\\|?*]/gu

/** Chrome 不接受路径段以空白、`.`、`~` 开头或结尾。 */
const EDGE_CHARACTERS = /^[\s.~]+|[\s.~]+$/g

/** 末尾扩展名；截断和首尾清理都只作用于主干，避免把扩展名截掉。 */
const TRAILING_EXTENSION = /\.[a-z0-9]{1,5}$/i

/**
 * 生成 Chrome 接受的相对下载文件名：单段名字，不含目录分隔符与非法字符。
 */
export function normalizeFilename(value: string): string {
  const cleaned = value
    .replace(FORMAT_CHARACTERS, '')
    .replace(ILLEGAL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const extension = cleaned.match(TRAILING_EXTENSION)?.[0] ?? ''
  // 按码点截断，避免切开 surrogate pair；截断后才裁首尾，截断点可能正好落在空格或点上。
  const stem = Array.from(cleaned.slice(0, cleaned.length - extension.length))
    .slice(0, MAX_FILENAME_LENGTH - extension.length)
    .join('')
    .replace(EDGE_CHARACTERS, '')
  return `${stem || FALLBACK_STEM}${extension}`
}

/**
 * 路径段是否含 Chrome 校验会拒绝的字符，或以空白、`.`、`~` 开头结尾。
 *
 * 目录段判定用它，保证与 `normalizeFilename` 同一套字符规则。`search` 不受 `g` 标志的
 * lastIndex 状态影响。
 */
export function hasUnsafePathCharacters(segment: string): boolean {
  return (
    segment.search(FORMAT_CHARACTERS) >= 0 ||
    segment.search(ILLEGAL_CHARACTERS) >= 0 ||
    segment.search(EDGE_CHARACTERS) >= 0
  )
}
