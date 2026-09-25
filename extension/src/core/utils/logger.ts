import { LOG_LEVELS, type LogLevel, LOG_LEVEL_NAMES } from '../constants/logging'
import type { RuntimeConfig } from '../runtimeConfig'

/**
 * 日志工具类
 *
 * 提供四个日志级别：debug、info、warn、error
 * - 开发环境：输出所有级别
 * - 生产环境：默认仅输出 error，可由 background 分发的运行时配置启用 DEBUG
 *
 * 使用方式：
 * ```typescript
 * import { logger } from '@/core/utils/logger'
 *
 * logger.debug('debug message')
 * logger.info('info message')
 * logger.warn('warning message')
 * logger.error('error message')
 *
 * // 关闭日志输出
 * logger.close()
 * ```
 */
class Logger {
  private readonly module: string
  private level: LogLevel
  private closed: boolean = false

  /**
   * 创建 Logger 实例
   * @param module 模块名称（用于日志前缀）
   * @param level 初始日志级别（默认根据环境自动判断）
   */
  constructor(module: string, level?: LogLevel) {
    this.module = module
    // 根据环境设置默认级别：dev=DEBUG, prod=ERROR
    this.level = level ?? this.getDefaultLevel()
  }

  /**
   * 获取默认日志级别
   */
  private getDefaultLevel(): LogLevel {
    // 检查开发环境：优先使用全局变量，避免在 Service Worker 中使用 import.meta.env
    // Vite 会在构建时替换 __DEV__ 为 true/false
    const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false
    return isDev ? LOG_LEVELS.DEBUG : LOG_LEVELS.ERROR
  }

  /** 应用 background 分发的扩展运行时配置。 */
  applyRuntimeConfig(config: RuntimeConfig): void {
    this.level = config.debugLogging ? LOG_LEVELS.DEBUG : this.getDefaultLevel()
  }

  /**
   * 设置日志级别
   * @param level 新的日志级别
   */
  setLevel(level: LogLevel): void {
    if (level < LOG_LEVELS.DEBUG || level > LOG_LEVELS.ERROR) {
      throw new TypeError(`Invalid log level: ${level}`)
    }
    this.level = level
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.level
  }

  /**
   * 判断是否应该输出日志
   */
  private shouldLog(level: LogLevel): boolean {
    return !this.closed && level >= this.level
  }

  /**
   * 格式化日志前缀
   */
  private formatPrefix(level: LogLevel): string {
    const levelName = LOG_LEVEL_NAMES[level]
    return this.module === 'Root' ? `[${levelName}]` : `[${this.module}] [${levelName}]`
  }

  /**
   * 输出 DEBUG 级别日志
   * 仅在开发环境或级别设置允许时输出
   */
  debug(...args: unknown[]): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      const prefix = this.formatPrefix(LOG_LEVELS.DEBUG)
      console.debug(prefix, ...args)
    }
  }

  /**
   * 输出 INFO 级别日志
   * 仅在开发环境或级别设置允许时输出
   */
  info(...args: unknown[]): void {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      const prefix = this.formatPrefix(LOG_LEVELS.INFO)
      console.info(prefix, ...args)
    }
  }

  /**
   * 输出 WARN 级别日志
   * 仅在开发环境或级别设置允许时输出
   */
  warn(...args: unknown[]): void {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      const prefix = this.formatPrefix(LOG_LEVELS.WARN)
      console.warn(prefix, ...args)
    }
  }

  /**
   * 输出 ERROR 级别日志
   * 始终输出（忽略级别检查）
   */
  error(...args: unknown[]): void {
    const prefix = this.formatPrefix(LOG_LEVELS.ERROR)
    console.error(prefix, ...args)
  }

  /**
   * 关闭日志输出
   * 调用后所有日志将不再输出
   */
  close(): void {
    this.closed = true
  }
}

/**
 * 全局 logger 单例
 */
export const logger = new Logger('Root')
