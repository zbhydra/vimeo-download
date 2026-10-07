/**
 * Offscreen document 入口。
 *
 * 承载 DASH/HLS 下载执行（分片 fetch + Mediabunny remux），使下载脱离 Vimeo 页面生命周期。
 * 生命周期由 background 惰性创建并常驻：首任务创建后不自动关闭，保证交付中的 blob URL
 * 持续有效，也避免重复冷启动。
 *
 * 消息流程：
 * 1. background startTask → 执行器后台跑分片下载与 remux，期间按节流回传 taskProgress、
 *    每 20s 发送 keepAlive 心跳；
 * 2. 产物以 blob URL 经 taskComplete 交 background 落盘（chrome.downloads）；
 * 3. background 经 downloads.onChanged 确认落盘后调用 releaseTaskArtifact 释放 blob；
 * 4. 签名失效时执行器经 refreshSignatureRequest 请求 background 重签；
 * 5. 取消经 cancelTask 触发 AbortController，执行器以 taskCancelled 确认。
 */

import { serve } from '@/core/rpc/serve'
import type {
  JsonObject,
  JsonValue,
  RpcServeHandlers,
  RpcServeRegistration
} from '@/core/rpc/types'
import { parseMediaResource } from '@/core/utils/mediaResource'
import { logger } from '@/core/utils/logger'
import {
  CHANNEL,
  METHOD_REQUEST_LIMITS,
  METHOD_RESPONSE_LIMITS,
  METHOD_TARGETS,
  METHOD_TRANSPORTS
} from '@/offscreen/offscreen-register'
import { offscreenTaskRunner } from './OffscreenTaskRunner'

/** 当前 RPC provider。 */
let rpcRegistration: RpcServeRegistration | null = null

/** 启动 offscreen RPC provider。 */
export function startOffscreenProvider(): void {
  rpcRegistration = serve(CHANNEL, createOffscreenRpcHandlers(), {
    transports: ['chrome'],
    methodTargets: METHOD_TARGETS,
    methodTransports: METHOD_TRANSPORTS,
    requestLimits: METHOD_REQUEST_LIMITS,
    responseLimits: METHOD_RESPONSE_LIMITS
  })
  logger.info('[Offscreen] RPC provider 已启动')
}

/** 停止 offscreen RPC provider。 */
export function stopOffscreenProvider(): void {
  rpcRegistration?.stop()
  rpcRegistration = null
}

/** 创建 offscreen RPC handler。 */
function createOffscreenRpcHandlers(): RpcServeHandlers {
  return {
    startTask: params => {
      const { taskId, resource } = parseStartTaskRequest(params)
      const started = offscreenTaskRunner.startTask(taskId, resource)
      if (!started) {
        throw new Error(`[Offscreen] 任务已在执行，拒绝重复启动: taskId=${taskId}`)
      }
      return { started: true }
    },
    cancelTask: params => {
      const taskId = parseTaskId(params, 'cancelTask')
      return { accepted: offscreenTaskRunner.cancelTask(taskId) }
    },
    listActiveTasks: () => ({ tasks: offscreenTaskRunner.listActiveTasks() }),
    releaseTaskArtifact: params => {
      const body = requireJsonObject(params, 'releaseTaskArtifact')
      const taskId = requireStringField(body, 'taskId', 'releaseTaskArtifact.taskId')
      const blobUrl = requireStringField(body, 'blobUrl', 'releaseTaskArtifact.blobUrl')
      return { released: offscreenTaskRunner.releaseTaskArtifact(taskId, blobUrl) }
    },
    saveTaskArtifact: params => {
      const body = requireJsonObject(params, 'saveTaskArtifact')
      const taskId = requireStringField(body, 'taskId', 'saveTaskArtifact.taskId')
      const blobUrl = requireStringField(body, 'blobUrl', 'saveTaskArtifact.blobUrl')
      const filename = requireStringField(body, 'filename', 'saveTaskArtifact.filename')
      return { started: offscreenTaskRunner.saveTaskArtifact(taskId, blobUrl, filename) }
    }
  }
}

/** 解析 startTask 请求。 */
function parseStartTaskRequest(params: JsonValue | undefined): {
  taskId: string
  resource: ReturnType<typeof parseMediaResource>
} {
  const body = requireJsonObject(params, 'startTask')
  return {
    taskId: requireStringField(body, 'taskId', 'startTask.taskId'),
    resource: parseMediaResource(body.resource, 'startTask.resource')
  }
}

/** 解析只携带任务 ID 的请求。 */
function parseTaskId(params: JsonValue | undefined, method: string): string {
  const body = requireJsonObject(params, method)
  return requireStringField(body, 'taskId', `${method}.taskId`)
}

/** 要求 JSON 对象参数。 */
function requireJsonObject(params: JsonValue | undefined, method: string): JsonObject {
  if (!isJsonObject(params)) {
    throw new Error(`[Offscreen] ${method} 请求体必须是对象`)
  }
  return params
}

/** 要求对象中指定字段为非空字符串。 */
function requireStringField(body: JsonObject, field: string, label: string): string {
  const value = body[field]
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw new Error(`[Offscreen] ${label} 必须是非空字符串`)
}

/** 判断值是否为 JSON 对象。 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

startOffscreenProvider()
