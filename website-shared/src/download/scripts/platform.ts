/**
 * 前端平台识别（仅用于埋点）。
 *
 * 最终平台以后端响应为准，前端识别仅提前填充 GA4 event。
 */

import type { MediaPlatform } from './types'
import { parseUserLink } from './url'

/** Vimeo 域名列表。 */
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])

/**
 * 判断运行时平台值是否属于前端支持范围。
 *
 * @param value - 待判断的平台值
 * @returns true 表示是支持的平台
 */
export function isMediaPlatform(value: string | null | undefined): value is MediaPlatform {
  return value === 'vimeo'
}

/**
 * 识别链接所属平台（仅用于埋点，不阻断提交）。
 *
 * @param link - 用户输入的链接
 * @returns 识别到的平台，null 表示无法识别
 */
export function detectPlatform(link: string): MediaPlatform | null {
  const parsed = parseUserLink(link)
  if (!parsed) {
    return null
  }

  return VIMEO_HOSTS.has(parsed.hostname.toLowerCase()) ? 'vimeo' : null
}
