/**
 * 下载文件名净化（纯函数，无 chrome 依赖）。
 *
 * 是「落盘文件名」净化的唯一实现：background 在 `chrome.downloads.download` 前用它清洗最终
 * 保存名（`background/services/downloadFilename.ts`），popup 设置弹层的文件名模板预览用同一
 * 函数保证「预览 = 落盘」。从 background 版抽出单独成文件，是因为后者还聚合了存储读取与
 * 站点描述符解码，popup 预览不能把 chrome.storage 依赖拉进 UI 包。
 */

/** Chrome 下载目录文件名保守长度上限。 */
const MAX_FILENAME_LENGTH = 180

/**
 * 生成 Chrome 接受的相对下载文件名：单段名字，不含目录分隔符与控制字符。
 */
export function normalizeFilename(value: string): string {
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
