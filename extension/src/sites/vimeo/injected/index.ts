/**
 * Vimeo injected MAIN world 入口。
 *
 * 提供检测与配置 RPC provider：原生 config 捕获、运行时/站点配置同步；解析和按钮渲染在
 * content 侧完成，DASH/HLS 下载由 background 编排 + offscreen document 执行（U8 起），
 * MAIN world 不再承载下载。
 */

import { applyInjectedRuntimeConfig } from '@/core/injected/runtimeConfig'
import { serve } from '@/core/rpc/serve'
import type {
  JsonObject,
  JsonValue,
  RpcServeHandlers,
  RpcServeRegistration
} from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'
import {
  CHANNEL,
  METHOD_REQUEST_LIMITS,
  METHOD_RESPONSE_LIMITS,
  METHOD_TARGETS,
  METHOD_TRANSPORTS
} from '@/injected/injected-register'
import { pickVimeoConfig, vimeoConfig } from '@/sites/vimeo/runtimeConfig'
import {
  installVimeoConfigCapture,
  listCapturedVimeoConfigs,
  waitForCapturedVimeoConfig
} from './configCapture'

/** Vimeo injected 是否已启动。 */
let injectedStarted = false

/** 当前 RPC provider。 */
let rpcRegistration: RpcServeRegistration | null = null

/** 启动 Vimeo injected。 */
export function startVimeoInjected(): void {
  if (injectedStarted) {
    logger.warn('[VimeoInjected] 已启动，跳过重复启动')
    return
  }

  installVimeoConfigCapture()
  rpcRegistration = serve(CHANNEL, createInjectedRpcHandlers(), {
    transports: ['event'],
    methodTargets: METHOD_TARGETS,
    methodTransports: METHOD_TRANSPORTS,
    requestLimits: METHOD_REQUEST_LIMITS,
    responseLimits: METHOD_RESPONSE_LIMITS
  })

  injectedStarted = true
  logger.info('[VimeoInjected] 固定 EventRpc provider 已启动')
}

/** 停止 Vimeo injected。 */
export function stopVimeoInjected(): void {
  rpcRegistration?.stop()
  rpcRegistration = null
  injectedStarted = false
}

/** 创建 Vimeo injected RPC handler。 */
function createInjectedRpcHandlers(): RpcServeHandlers {
  return {
    applyRuntimeConfig: params => applyInjectedRuntimeConfig(params),
    applySiteConfig: params => applySiteConfig(params),
    getCapturedVimeoConfig: async params => {
      const videoId = parseCapturedConfigRequest(params)
      return { snapshot: await waitForCapturedVimeoConfig(videoId) }
    },
    listCapturedVimeoConfigs: () => ({ videos: listCapturedVimeoConfigs() })
  }
}

/**
 * 应用 content 下发的站点配置。
 *
 * EventRpc 是页面可伪造的通道，因此逐字段取回已知且合法的值：非法字段直接丢弃并保留当前值，
 * 不让远端脏类型进入内存上限判定。
 */
function applySiteConfig(params: JsonValue | undefined): { applied: boolean } {
  Object.assign(vimeoConfig, pickVimeoConfig(params))
  return { applied: true }
}

/** 解析 getCapturedVimeoConfig 请求。 */
function parseCapturedConfigRequest(params: JsonValue | undefined): string {
  const body = requireJsonObject(params, 'getCapturedVimeoConfig')
  const videoId = requireStringField(body, 'videoId', 'getCapturedVimeoConfig.videoId')
  if (!/^\d+$/.test(videoId)) {
    throw new Error(
      `[VimeoInjected] getCapturedVimeoConfig.videoId 必须是数字 ID: value=${videoId}`
    )
  }
  return videoId
}

/** 要求值为 JSON 对象。 */
function requireJsonObject(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as JsonObject
  }

  throw new Error(`[VimeoInjected] ${label} 请求体必须是对象`)
}

/** 要求对象字段为字符串。 */
function requireStringField(body: JsonObject, field: string, label: string): string {
  const value = body[field]

  if (typeof value === 'string') {
    return value
  }

  throw new Error(`[VimeoInjected] ${label} 必须是字符串`)
}
