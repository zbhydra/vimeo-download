/**
 * MAIN world 运行时配置边界。
 *
 * EventRpc 可被宿主页面伪造，因此只接受不会授予扩展权限的日志配置。
 */

import type { RuntimeConfig } from '@/core/runtimeConfig'
import type { JsonObject, JsonValue } from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'

/** 校验并应用 content 传入的运行时配置。 */
export function applyInjectedRuntimeConfig(params: JsonValue | undefined): { applied: boolean } {
  const body = requireRuntimeConfigObject(params)
  if (typeof body.debugLogging !== 'boolean') {
    throw new Error('[InjectedRuntimeConfig] debugLogging 必须是 boolean')
  }

  const config: RuntimeConfig = {
    debugLogging: body.debugLogging
  }
  logger.applyRuntimeConfig(config)
  return { applied: true }
}

function requireRuntimeConfigObject(value: JsonValue | undefined): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('[InjectedRuntimeConfig] 运行时配置必须是对象')
  }
  return value as JsonObject
}
