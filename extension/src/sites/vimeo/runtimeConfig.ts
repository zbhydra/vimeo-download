/**
 * Vimeo 站点运行时配置。
 *
 * 包内默认值编译期全量存在，远端只下发稀疏覆盖；content 与 injected 各自持有一份同构运行态，
 * 由 content 读到远端值后通过 applySiteConfig 同步给 MAIN world。改动在页面重新加载后生效。
 */

import type { JsonObject, JsonValue } from '@/core/rpc/types'

/** Vimeo 运行时配置。 */
export interface VimeoConfig {
  /** 前端 mux 的保守内存上限（字节），超过后不展示或中途中断。 */
  muxMaxBytes: number
  /** config 剩余有效期低于该秒数时先走 refresh URL。 */
  configRefreshWindowSeconds: number
  /** 等待 MAIN world 原生 config 捕获的超时（毫秒）。 */
  captureTimeoutMs: number
  /** DOM 变化后的扫描 debounce（毫秒）。 */
  scanDebounceMs: number
}

/** 当前扩展包的完整 Vimeo 默认配置。 */
export const DEFAULT_VIMEO_CONFIG: Readonly<VimeoConfig> = {
  muxMaxBytes: 768 * 1024 * 1024,
  configRefreshWindowSeconds: 30,
  captureTimeoutMs: 12_000,
  scanDebounceMs: 300
}

/** 当前运行上下文唯一生效的 Vimeo 配置。 */
export const vimeoConfig: VimeoConfig = { ...DEFAULT_VIMEO_CONFIG }

/** 全部已知配置字段，用于在不可信输入中按名取回。 */
const VIMEO_CONFIG_FIELDS = [
  'muxMaxBytes',
  'configRefreshWindowSeconds',
  'captureTimeoutMs',
  'scanDebounceMs'
] as const satisfies readonly (keyof VimeoConfig)[]

/**
 * 从不可信 JSON 中取回已知配置字段。
 *
 * 远端响应与 EventRpc 请求体都可能被伪造或写错类型，因此只接受有限正整数：缺失、类型不符或
 * 非法的字段一律丢弃并由调用方保留原值，不做隐式转换。
 */
export function pickVimeoConfig(value: JsonValue | undefined): Partial<VimeoConfig> {
  if (!isJsonObject(value)) {
    return {}
  }

  const picked: Partial<VimeoConfig> = {}
  for (const field of VIMEO_CONFIG_FIELDS) {
    const candidate = value[field]
    if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0) {
      picked[field] = candidate
    }
  }

  return picked
}

/** 判断值是否为可按字段读取的 JSON 对象。 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
