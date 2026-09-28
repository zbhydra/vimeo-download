/**
 * chrome.downloads 下载路径共享工具。
 *
 * 由 DownloadOrchestrator 共用（direct 直连与 offscreen 产物落盘），统一保存位置子目录、
 * 文件名模板渲染与清洗语义。模板是文件名的唯一应用点：resource.filename 由 content 侧生成、
 * 只作变量兜底，最终落盘名一律按 settings.filenamePattern 在这里重渲染（content/offscreen
 * 双路径都经 background 落盘，自动统一）。
 */

import { DEFAULT_DOWNLOAD_PATH } from '@/core/storage/settings'
import {
  AUDIO_TARGET_FORMATS,
  RESOURCE_TYPES,
  getDefaultResourceExtension,
  getExtensionFromMimeType
} from '@/core/constants/resource'
import type { MediaResource } from '@/core/types'
import { SettingsManager } from '@/core/storage/settings'
import {
  FILENAME_PATTERN_DEFAULT,
  formatFilenameDate,
  renderFilenameBase,
  type FilenameTemplateContext
} from '@/core/utils/filenameTemplate'
import { decodeVimeoSourceDescriptor } from '@/sites/vimeo/shared'

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
 * 按文件名模板渲染一个资源的最终保存名（含扩展名，不含目录）。
 *
 * 变量数据源：title/author 在 resource；quality 取 descriptor 的按钮标签（档位文本）、
 * videoId 取 descriptor（兜底 messageId）；date 是本次下载时刻；type 从 resource.type 直取。
 * 模板渲染后主干为空（模板只含空变量等）时回退 resource.filename 主干，再退固定名。
 * 返回值仍会经 `buildDownloadFilename` 的 normalizeFilename 净化，安全语义保持单一。
 */
export async function buildResourceFilename(resource: MediaResource): Promise<string> {
  const settings = await SettingsManager.getSettings()
  const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
  const context: FilenameTemplateContext = {
    title: resource.title ?? '',
    quality: descriptor?.label ?? '',
    type: resource.type,
    author: resource.author ?? '',
    date: formatFilenameDate(new Date()),
    videoId: descriptor?.videoId ?? resource.messageId
  }

  const base =
    renderFilenameBase(settings.filenamePattern ?? FILENAME_PATTERN_DEFAULT, context) ||
    stripExtension(resource.filename ?? '') ||
    'vimeo-download'
  return `${base}.${resolveResourceExtension(resource)}`
}

/** 资源交付扩展名：MP3 目标格式显式覆盖，其余按站点 MIME 推断、类型默认值兜底。 */
function resolveResourceExtension(resource: MediaResource): string {
  if (
    resource.type === RESOURCE_TYPES.AUDIO &&
    resource.targetFormat === AUDIO_TARGET_FORMATS.MP3
  ) {
    return AUDIO_TARGET_FORMATS.MP3
  }
  return (
    getExtensionFromMimeType(resource.mimeType) ?? getDefaultResourceExtension(resource.type)
  ).replace(/^\./, '')
}

/** 去掉文件名主干末尾的扩展名；无扩展名时原样返回。 */
function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]*$/, '')
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
