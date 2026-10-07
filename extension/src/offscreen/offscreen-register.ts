/**
 * Offscreen RPC v2 register。
 *
 * offscreen document 是 DASH/HLS 下载的执行真相源：这里声明 background 驱动它的能力边界，
 * 任务生命周期（进度/交付/失败/取消/重签）由 offscreen 反向调用 background 通道回传。
 *
 * U9 待办：offscreen document 常驻、不自动关闭——首任务创建后保留，避免 blob URL 失效与
 * 重复冷启动；无任务时的内存占用是已知限制。
 */

import type {
  OffscreenCancelTaskRequest,
  OffscreenCancelTaskResponse,
  OffscreenListActiveTasksResponse,
  OffscreenReleaseTaskArtifactRequest,
  OffscreenReleaseTaskArtifactResponse,
  OffscreenSaveTaskArtifactRequest,
  OffscreenSaveTaskArtifactResponse,
  OffscreenStartTaskRequest,
  OffscreenStartTaskResponse
} from './types'

/** offscreen provider channel。 */
export const CHANNEL = 'offscreen' as const

/** offscreen 生成客户端类名。 */
export const CLASS_NAME = 'OffscreenChannel' as const

/** Offscreen RPC 方法签名声明。 */
export const Handler = {
  /** 启动一个 DASH/HLS 下载任务；执行结果经 background 通道异步回传。 */
  startTask(_params: OffscreenStartTaskRequest): Promise<OffscreenStartTaskResponse> {
    return declarationOnly('offscreen.startTask')
  },

  /** 请求中止一个执行中的下载任务。 */
  cancelTask(_params: OffscreenCancelTaskRequest): Promise<OffscreenCancelTaskResponse> {
    return declarationOnly('offscreen.cancelTask')
  },

  /** 查询执行中任务清单；SW 冷启动后以它重建编排表。 */
  listActiveTasks(): Promise<OffscreenListActiveTasksResponse> {
    return declarationOnly('offscreen.listActiveTasks')
  },

  /** 释放已确认落盘（或不再跟踪）的 blob 产物。 */
  releaseTaskArtifact(
    _params: OffscreenReleaseTaskArtifactRequest
  ): Promise<OffscreenReleaseTaskArtifactResponse> {
    return declarationOnly('offscreen.releaseTaskArtifact')
  },

  /** 以 offscreen 隐藏 anchor 触发 blob 保存。 */
  saveTaskArtifact(
    _params: OffscreenSaveTaskArtifactRequest
  ): Promise<OffscreenSaveTaskArtifactResponse> {
    return declarationOnly('offscreen.saveTaskArtifact')
  }
}

/** offscreen register handler 类型。 */
export type OffscreenHandler = typeof Handler

/** offscreen 方法允许调用方。 */
export const METHOD_TARGETS = {
  /** 任务编排只由 background 驱动。 */
  startTask: ['background'],
  /** 取消只由 background 驱动。 */
  cancelTask: ['background'],
  /** 对账只由 background 发起。 */
  listActiveTasks: ['background'],
  /** 产物释放只由 background 确认落盘后发起。 */
  releaseTaskArtifact: ['background'],
  saveTaskArtifact: ['background']
} as const satisfies Record<keyof OffscreenHandler, readonly ['background']>

/** offscreen 方法允许传输。 */
export const METHOD_TRANSPORTS = {
  /** startTask 使用 Chrome message。 */
  startTask: ['chrome'],
  /** cancelTask 使用 Chrome message。 */
  cancelTask: ['chrome'],
  /** listActiveTasks 使用 Chrome message。 */
  listActiveTasks: ['chrome'],
  /** releaseTaskArtifact 使用 Chrome message。 */
  releaseTaskArtifact: ['chrome'],
  saveTaskArtifact: ['chrome']
} as const satisfies Record<keyof OffscreenHandler, readonly ['chrome']>

/** offscreen 方法请求体限制，单位字节。 */
export const METHOD_REQUEST_LIMITS = {
  /** startTask 携带完整 MediaResource（含 Vimeo 下载描述符）。 */
  startTask: 32768,
  /** cancelTask 只携带任务 ID。 */
  cancelTask: 1024,
  /** listActiveTasks 无业务参数。 */
  listActiveTasks: 1024,
  /** releaseTaskArtifact 携带任务 ID 与 blob URL。 */
  releaseTaskArtifact: 2048,
  saveTaskArtifact: 4096
} as const satisfies Record<keyof OffscreenHandler, number>

/** offscreen 方法响应体限制，单位字节。 */
export const METHOD_RESPONSE_LIMITS = {
  /** startTask 返回受理结果。 */
  startTask: 1024,
  /** cancelTask 返回是否受理。 */
  cancelTask: 1024,
  /** listActiveTasks 返回活跃任务及完整资源；单并发下通常 0~1 条。 */
  listActiveTasks: 65536,
  /** releaseTaskArtifact 返回释放结果。 */
  releaseTaskArtifact: 1024,
  saveTaskArtifact: 1024
} as const satisfies Record<keyof OffscreenHandler, number>

/** register 占位函数，避免声明被业务代码误调用。 */
function declarationOnly(methodName: string): never {
  throw new Error(`[rpc-register] ${methodName} is declaration only`)
}
