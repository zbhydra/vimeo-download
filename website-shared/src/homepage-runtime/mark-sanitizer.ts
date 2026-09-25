/**
 * Homepage mark 脱敏工具。
 *
 * mark_msg 会进入前端日志和管理后台排查列表，只保留定位需要的 host/path 与错误类型。
 */

const MARK_URL_PATH_MAX_LENGTH = 120
const URL_TEXT_RE = /https?:\/\/[^\s"'<>]+/gi
const HEADER_SECRET_RE =
  /\b(cookie|set-cookie|authorization|proxy-authorization|headers?|request_headers|response_headers)\s*[:=]\s*[^,\n\r]+/gi
const HEADER_OBJECT_SECRET_RE =
  /(["']?)(headers?|request_headers|response_headers)\1\s*([:=])\s*\{[^{}]*\}/gi
const SENSITIVE_FIELD_RE =
  /(["']?)(cookie|set-cookie|authorization|proxy-authorization|direct_url|download_url|access_token|refresh_token|id_token|auth_token|token|sig|signature|client_secret|secret|session|sessionid|sid)\1\s*([:=])\s*(?!\[redacted\])(?:(["'])(.*?)\4|([^,\s;&}\]]+))/gi

function redactKeyValue(_match: string, key: string): string {
  return `${key}=[redacted]`
}

function redactObjectField(_match: string, quote: string, key: string, separator: string): string {
  return `${quote}${key}${quote}${separator}"[redacted]"`
}

function redactSensitiveField(
  _match: string,
  quote: string,
  key: string,
  separator: string,
  valueQuote: string | undefined
): string {
  const safeValue = valueQuote ? `${valueQuote}[redacted]${valueQuote}` : '[redacted]'
  return `${quote}${key}${quote}${separator}${safeValue}`
}

function sanitizeUrlText(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '[redacted-url]'
    }

    return `${parsed.protocol}//${parsed.host}${parsed.pathname.slice(0, MARK_URL_PATH_MAX_LENGTH)}`
  } catch {
    return '[redacted-url]'
  }
}

export function sanitizeMarkText(value: string): string {
  return value
    .replace(HEADER_OBJECT_SECRET_RE, redactObjectField)
    .replace(HEADER_SECRET_RE, redactKeyValue)
    .replace(SENSITIVE_FIELD_RE, redactSensitiveField)
    .replace(URL_TEXT_RE, sanitizeUrlText)
}

export function sanitizeMarkUrl(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return sanitizeMarkText(value)
    }

    return `${parsed.protocol}//${parsed.host}${parsed.pathname.slice(0, MARK_URL_PATH_MAX_LENGTH)}`
  } catch {
    return sanitizeMarkText(value)
  }
}
