/**
 * 下载文件名模板渲染（纯函数）。
 *
 * 设置项 `settings.filenamePattern` 是一份含 `{变量}` 占位的模板，background 在
 * `chrome.downloads.download` 前用任务上下文重渲染最终文件名（应用点唯一，content/offscreen
 * 双路径都经 background 落盘所以自动统一）；popup 设置弹层用同一函数做实时预览。
 * 这里只做「变量替换 + 空变量残留分隔符清理」；非法字符净化仍由 background
 * `buildDownloadFilename` 的既有规则统一承担，渲染结果不含扩展名，由调用方追加。
 */

/** 默认模板：标题、档位与类型组成主干，扩展名由实际交付格式决定。 */
export const FILENAME_PATTERN_DEFAULT = '{title}_{quality}_{type}'

/** 模板支持的变量全集，同时是设置弹层变量 chips 的展示顺序。 */
export const FILENAME_VARIABLES = ['title', 'quality', 'type', 'author', 'date', 'videoId'] as const

/** 模板变量名。 */
export type FilenameVariable = (typeof FILENAME_VARIABLES)[number]

/** 模板渲染上下文；缺数据的变量由调用方填空串，渲染为空后由分隔符清理收敛。 */
export interface FilenameTemplateContext {
  /** 媒体标题。 */
  title: string
  /** 档位/画质文本（如 `1080p HD`、`128 kbps`、字幕语言名）。 */
  quality: string
  /** 资源类型（`video`/`audio`/`subtitle`/`image`）。 */
  type: string
  /** 作者/上传者。 */
  author: string
  /** 下载时刻（`YYYY-MM-DD`）。 */
  date: string
  /** 站点视频 ID。 */
  videoId: string
}

/** 单个变量的字面占位（`{title}` 等）。 */
const VARIABLE_PLACEHOLDERS = {
  title: '{title}',
  quality: '{quality}',
  type: '{type}',
  author: '{author}',
  date: '{date}',
  videoId: '{videoId}'
} as const satisfies Record<FilenameVariable, string>

/** 空变量替换后两侧残留的分隔符：连续同类分隔符合并成一个。 */
const COLLAPSIBLE_SEPARATOR_RUN = /_{2,}|-{2,}|\s{2,}/g

/** 首尾裁掉的分隔符；`.` 只在裁剪参与不参与合并（标题里的点要保留）。 */
const TRIMMED_SEPARATORS = /^[_ .-]+|[_ .-]+$/g

/**
 * 按模板渲染文件名主干（不含扩展名）。
 *
 * 变量大小写敏感、未收录的 `{token}` 原样保留——用户写错变量名时能在文件名里直接看到，
 * 比静默丢弃更可诊断。缺字段变量渲染为空串后，把因此产生的连续同类分隔符合并成一个、
 * 裁掉首尾分隔符；全部变量皆空时返回空串，由调用方决定兜底名。
 */
export function renderFilenameBase(pattern: string, context: FilenameTemplateContext): string {
  let rendered = pattern
  for (const variable of FILENAME_VARIABLES) {
    const placeholder = VARIABLE_PLACEHOLDERS[variable]
    // 目标 lib 早于 es2021，没有 replaceAll：split/join 等价替换全部占位。
    rendered = rendered.split(placeholder).join(context[variable])
  }

  return rendered
    .replace(COLLAPSIBLE_SEPARATOR_RUN, match => match[0])
    .replace(TRIMMED_SEPARATORS, '')
}

/**
 * 下载时刻的模板日期段：本地时区的 `YYYY-MM-DD`。
 *
 * 文件名语境没有时区归属，按用户本地面板所见日期取值，不做后端业务时区换算。
 */
export function formatFilenameDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
