/**
 * 前端全局异常捕获模块。
 *
 * 流程：
 * window error / unhandledrejection
 *   -> 过滤资源加载错误
 *   -> 规范化异常字段
 *   -> 30 秒内同指纹去重
 *   -> 调用注册的回调函数
 *
 * 本模块不关心日志写入目标；SLS、console 或后续其他通道都应作为回调接入。
 */

/** 同一页面生命周期内，同一异常指纹的去重窗口。 */
const ERROR_DEDUP_WINDOW_MS = 30_000

/** 普通异常字段最大长度，避免异常对象字符串化后过长。 */
const MAX_ERROR_FIELD_LENGTH = 512

/** 前端异常来源类型。 */
export type FrontendCapturedErrorKind = 'error_event' | 'unhandled_rejection'

/** Promise rejection reason 可能出现的值类型。 */
type FrontendErrorValue = Error | object | string | number | boolean | symbol | bigint | null | undefined

/** 规范化后的前端异常。 */
export interface FrontendCapturedError {
  /** 异常来源。 */
  errorKind: FrontendCapturedErrorKind
  /** 异常名称。 */
  errorName: string
  /** 异常消息。 */
  errorMessage: string
  /** 当前页面 path，不包含 query。 */
  pagePath: string
  /** 浏览器提供的脚本文件 URL。 */
  sourceFile: string
  /** 浏览器提供的源码行号；无法获取时为 0。 */
  line: number
  /** 浏览器提供的源码列号；无法获取时为 0。 */
  column: number
}

/** 捕获到异常后的处理函数。 */
export type FrontendCapturedErrorHandler = (capturedError: FrontendCapturedError) => void

/** 近期已分发异常指纹。 */
const recentErrorTimes = new Map<string, number>()

/** 捕获到异常后的回调集合。 */
const capturedErrorHandlers = new Set<FrontendCapturedErrorHandler>()

/** 全局监听是否已安装。 */
let captureInstalled = false

/** 裁剪普通异常字段。 */
function truncateErrorField(value: string): string {
  return value.length > MAX_ERROR_FIELD_LENGTH ? value.slice(0, MAX_ERROR_FIELD_LENGTH) : value
}

/** 安全字符串化任意异常值。 */
function stringifyErrorValue(value: FrontendErrorValue, fallback: string): string {
  try {
    const text = String(value)
    return text.length > 0 ? truncateErrorField(text) : fallback
  } catch {
    return fallback
  }
}

/** 读取当前页面 path。 */
function getCurrentPagePath(): string {
  if (typeof location === 'undefined') {
    return ''
  }

  return truncateErrorField(location.pathname)
}

/** 把 Error 或非 Error rejection reason 规范成统一异常字段。 */
function normalizeFrontendError(value: FrontendErrorValue, fallbackMessage: string): Pick<
  FrontendCapturedError,
  'errorName' | 'errorMessage'
> {
  if (value instanceof Error) {
    return {
      errorName: truncateErrorField(value.name || 'Error'),
      errorMessage: truncateErrorField(value.message || fallbackMessage)
    }
  }

  const valueType = value === null ? 'Null' : typeof value
  return {
    errorName: truncateErrorField(valueType),
    errorMessage: stringifyErrorValue(value, fallbackMessage)
  }
}

/** 构造短窗口去重指纹。 */
function buildErrorFingerprint(capturedError: FrontendCapturedError): string {
  return [
    capturedError.errorKind,
    capturedError.errorName,
    capturedError.errorMessage,
    capturedError.pagePath,
    capturedError.sourceFile,
    String(capturedError.line),
    String(capturedError.column)
  ].join('|')
}

/** 判断当前异常指纹是否应被短窗口去重。 */
function shouldSkipDuplicateError(fingerprint: string): boolean {
  const now = Date.now()

  for (const [key, time] of recentErrorTimes.entries()) {
    if (now - time > ERROR_DEDUP_WINDOW_MS) {
      recentErrorTimes.delete(key)
    }
  }

  const lastTime = recentErrorTimes.get(fingerprint)
  if (lastTime !== undefined && now - lastTime <= ERROR_DEDUP_WINDOW_MS) {
    return true
  }

  recentErrorTimes.set(fingerprint, now)
  return false
}

/** 将捕获到的异常分发给调用方注册的回调。 */
function dispatchCapturedError(capturedError: FrontendCapturedError): void {
  if (shouldSkipDuplicateError(buildErrorFingerprint(capturedError))) {
    return
  }

  for (const handler of capturedErrorHandlers) {
    try {
      handler(capturedError)
    } catch (error) {
      console.error('[FrontendErrorCapture] 异常处理回调执行失败:', error)
    }
  }
}

/** 资源加载 error 也会冒泡到 window 捕获阶段，这类噪音不分发给回调。 */
function isResourceLoadError(event: ErrorEvent): boolean {
  return Boolean(event.target && typeof window !== 'undefined' && event.target !== window)
}

/** window error 事件处理。 */
function handleWindowError(event: ErrorEvent): void {
  if (isResourceLoadError(event)) {
    return
  }

  const normalized = normalizeFrontendError(
    event.error instanceof Error ? event.error : event.message,
    event.message || 'Window error'
  )

  dispatchCapturedError({
    errorKind: 'error_event',
    errorName: normalized.errorName,
    errorMessage: normalized.errorMessage,
    pagePath: getCurrentPagePath(),
    sourceFile: truncateErrorField(event.filename || ''),
    line: event.lineno || 0,
    column: event.colno || 0
  })
}

/** 未处理 Promise rejection 事件处理。 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const normalized = normalizeFrontendError(event.reason, 'Unhandled promise rejection')

  dispatchCapturedError({
    errorKind: 'unhandled_rejection',
    errorName: normalized.errorName,
    errorMessage: normalized.errorMessage,
    pagePath: getCurrentPagePath(),
    sourceFile: '',
    line: 0,
    column: 0
  })
}

/** 安装全局前端异常捕获器，并注册捕获后的处理回调。 */
export function installFrontendErrorCapture(onCapturedError: FrontendCapturedErrorHandler): void {
  capturedErrorHandlers.add(onCapturedError)

  if (captureInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return
  }

  captureInstalled = true
  window.addEventListener('error', handleWindowError, true)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
}
