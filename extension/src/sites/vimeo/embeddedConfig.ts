/**
 * Vimeo 播放页内嵌原生 config 通道。
 *
 * 播放页初始 HTML 把完整 config 内联在 `window.playerConfig` 里。MAIN world 从 DOM 的 inline
 * script 读取它，background 直连播放页时从 HTML 文本读取它；两条通道共用同一份解析与身份校验，
 * 避免同一份内嵌 config 出现两套模型。
 */

import type { JsonValue } from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'
import { parseVimeoConfig } from './media'
import { parseVimeoConfigRefreshUrlVideoId, type VimeoCapturedConfigSnapshot } from './shared'

/** 播放页把原生 config 直接赋值给 window.playerConfig。 */
const PLAYER_CONFIG_ASSIGNMENT_RE = /window\.playerConfig\s*=\s*/

/**
 * 从内嵌原生 config 构建捕获快照。
 *
 * 内嵌 config 没有请求 URL，因此快照身份取自它自带的原生 signed `config_refresh_url`：
 * refresh URL 必须解析出 videoId，且与 config 内 `video.id` 一致。校验口径与网络通道一致
 * （URL videoId、config videoId 必须相同），但不接受网络通道之外的响应 URL 形式。
 *
 * @param config 已解析为 JSON 的 window.playerConfig。
 * @param baseUrl 读取到该 config 的页面 URL，只用于解析上下文与日志。
 */
export function createEmbeddedVimeoConfigSnapshot(
  config: JsonValue,
  baseUrl: string
): VimeoCapturedConfigSnapshot | null {
  const parsed = parseVimeoConfig(config, baseUrl)
  const configUrl = parsed.refreshConfigUrl
  const urlVideoId = configUrl ? parseVimeoConfigRefreshUrlVideoId(configUrl) : null
  if (!configUrl || !urlVideoId || urlVideoId !== parsed.videoId) {
    logger.debug(
      `[VimeoEmbeddedConfig] 内嵌 config 缺少匹配的原生 refresh URL: videoId=${parsed.videoId}, stage=embedded-validate`
    )
    return null
  }

  return {
    videoId: parsed.videoId,
    configUrl,
    config
  }
}

/**
 * 从播放页 HTML 文本读取内嵌的原生 config。
 *
 * background 没有 DOM 解析器，因此按赋值位置扫描一个括号平衡的 JSON 对象；扫描按 JSON 字符串
 * 规则跳过字符串内的括号，避免标题等文本里的 `}` 提前截断。
 */
export function readEmbeddedVimeoConfigFromHtml(html: string): JsonValue | null {
  const assignment = PLAYER_CONFIG_ASSIGNMENT_RE.exec(html)
  if (!assignment) {
    return null
  }

  const objectStart = html.indexOf('{', assignment.index)
  const jsonText = objectStart >= 0 ? sliceJsonObject(html, objectStart) : null
  if (!jsonText) {
    return null
  }

  try {
    return JSON.parse(jsonText) as JsonValue
  } catch (error) {
    logger.debug('[VimeoEmbeddedConfig] 内嵌 config JSON 解析跳过: stage=embedded-parse', error)
    return null
  }
}

/** 截取从 startIndex 开始的平衡 JSON 对象；不完整时返回 null。 */
function sliceJsonObject(text: string, startIndex: number): string | null {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return text.slice(startIndex, index + 1)
      }
    }
  }

  return null
}
