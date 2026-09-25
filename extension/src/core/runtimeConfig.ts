/**
 * 扩展运行时配置契约。
 *
 * 配置由 background 从扩展自有存储读取，再分发给其他运行上下文。
 */

/** 跨扩展上下文共享的运行时配置。 */
export interface RuntimeConfig {
  /** 是否在生产构建中启用 DEBUG 级别日志。 */
  debugLogging: boolean
}

/** 存储缺失或读取失败时使用的运行时配置。 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  debugLogging: false
}
