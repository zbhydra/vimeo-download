/**
 * 用户链接解析工具。
 *
 * 负责把下载工作区中的原始输入整理成可提交给解析流程的 URL。
 */

/** 可提交给解析流程的用户链接协议。 */
const VALID_USER_LINK_PROTOCOLS = new Set(['http:', 'https:'])

/** 允许进入 Vimeo 粘连拆分的 token 起点（vimeo.com / www.vimeo.com / player.vimeo.com）。 */
const VIMEO_LINK_TOKEN_START_PATTERN =
  /^(?:https?:\/\/)?(?:www\.|player\.)?vimeo\.com\//i

/** Vimeo 链接粘连后，后续链接必须带协议才视为新链接起点。 */
const GLUED_VIMEO_LINK_BOUNDARY_PATTERN =
  /https?:\/\/(?:www\.|player\.)?vimeo\.com\//gi

/** 按 Vimeo 链接起点切开粘连的链接 token。 */
function splitGluedLinkToken(token: string): string[] {
  if (!VIMEO_LINK_TOKEN_START_PATTERN.test(token)) {
    return [token]
  }

  const protocolStarts = Array.from(token.matchAll(GLUED_VIMEO_LINK_BOUNDARY_PATTERN), match => match.index)
    .filter((index): index is number => typeof index === 'number')

  const starts = Array.from(new Set([0, ...protocolStarts.filter(index => index > 0)]))
  if (starts.length <= 1) {
    return [token]
  }

  return starts
    .map((start, index) => token.slice(start, starts[index + 1]).trim())
    .filter(Boolean)
}

/**
 * 从用户输入中提取待解析链接。
 *
 * 用户常会直接连续粘贴多个 Vimeo 链接，例如
 * `https://vimeo.com/1https://vimeo.com/2`。这里只把 Vimeo URL 起点视为边界，
 * 避免影响其他站点 URL 中可能出现的普通 `https://` 文本。
 */
export function extractUserLinks(input: string): string[] {
  return input
    .trim()
    .split(/\s+/)
    .flatMap(splitGluedLinkToken)
    .map(link => link.trim())
    .filter(Boolean)
}

/** 从脏输入中提取第一条可提交解析的链接。 */
export function extractFirstValidUserLink(input: string): string | null {
  return extractUserLinks(input).find(isValidUserLink) ?? null
}

/** 解析用户输入链接；内部 host 识别可补齐协议，提交前仍必须显式带 http(s)。 */
export function parseUserLink(link: string): URL | null {
  const trimmed = link.trim()
  if (!trimmed) {
    return null
  }

  const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  try {
    return new URL(normalized)
  } catch {
    return null
  }
}

/** 判断 HTTP(S) 链接是否带有可被用户识别的主机名。 */
function hasValidHttpHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.includes('.') || hostname.startsWith('[')
}

/** 判断用户输入是否是可提交解析的 URL。 */
export function isValidUserLink(link: string): boolean {
  const trimmed = link.trim()
  if (!trimmed || /\s/.test(trimmed)) {
    return false
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return false
  }

  const parsed = parseUserLink(trimmed)
  if (!parsed || !VALID_USER_LINK_PROTOCOLS.has(parsed.protocol)) {
    return false
  }

  return hasValidHttpHostname(parsed.hostname)
}

/** 安全提取用户输入链接 host，失败返回 invalid。 */
export function safeUserLinkHost(link: string): string {
  return parseUserLink(link)?.host ?? 'invalid'
}
