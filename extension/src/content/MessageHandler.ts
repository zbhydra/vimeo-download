/**
 * 通用 content RPC handler。
 *
 * popup/background 只和 content channel 通信，站点差异由调用方传入的资源缓存承接。
 */

import type { ResourceBuffer } from '@/core/content/services/ResourceBuffer'
import { downloadManager, enqueueMany } from '@/core/content/download'
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
} from '@/content/content-register'
import type {
  ContentCancelDownloadTaskRequest,
  ContentCancelDownloadTaskResponse,
  ContentDownloadBatchRequest,
  ContentDownloadBatchResponse,
  ContentGetResourcesResponse,
  ContentRetryDownloadTaskRequest,
  ContentRetryDownloadTaskResponse
} from '@/content/types'
import type { MediaResource } from '@/core/types'

/** 通用 content RPC handler。 */
export abstract class MessageHandler {
  /** RPC 注册句柄。 */
  private rpcRegistration: RpcServeRegistration | null = null

  /** 站点名。 */
  protected abstract readonly siteName: string

  /** 站点资源缓存。 */
  protected abstract readonly resourceBuffer: ResourceBuffer

  /** 启动 RPC handler。 */
  start(): void {
    this.rpcRegistration = serve(CHANNEL, this.createRpcHandlers(), {
      transports: ['chrome'],
      methodTargets: METHOD_TARGETS,
      methodTransports: METHOD_TRANSPORTS,
      requestLimits: METHOD_REQUEST_LIMITS,
      responseLimits: METHOD_RESPONSE_LIMITS
    })
    logger.info(`[MessageHandler:${this.siteName}] 消息监听器已启动`)
  }

  /** 停止 RPC handler。 */
  stop(): void {
    this.rpcRegistration?.stop()
    this.rpcRegistration = null
    logger.info(`[MessageHandler:${this.siteName}] 消息监听器已停止`)
  }

  /** 创建 RPC handlers。 */
  private createRpcHandlers(): RpcServeHandlers {
    return {
      getResources: () => this.getResources(),
      getDownloadQueue: () => downloadManager.getSnapshot(),
      downloadBatch: params => this.downloadBatch(parseDownloadBatchRequest(params)),
      cancelDownloadTask: params => this.cancelDownloadTask(parseCancelDownloadTaskRequest(params)),
      retryDownloadTask: params => this.retryDownloadTask(parseRetryDownloadTaskRequest(params))
    }
  }

  /** 按当前 document 唯一任务 ID 请求取消。 */
  private cancelDownloadTask(
    request: ContentCancelDownloadTaskRequest
  ): ContentCancelDownloadTaskResponse {
    return { accepted: downloadManager.cancel(request.taskId) }
  }

  /** 按当前 document 唯一任务 ID 人工重试失败下载。 */
  private retryDownloadTask(
    request: ContentRetryDownloadTaskRequest
  ): ContentRetryDownloadTaskResponse {
    return { accepted: downloadManager.retry(request.taskId) }
  }

  /** 获取资源列表。 */
  private getResources(): ContentGetResourcesResponse {
    const resources = this.resourceBuffer.getAllResources()
    return {
      resources,
      count: resources.length,
      videoGroups: this.resourceBuffer.getVideoGroups()
    }
  }

  /** 按请求顺序回查资源并逐项下载。 */
  private async downloadBatch(
    request: ContentDownloadBatchRequest
  ): Promise<ContentDownloadBatchResponse> {
    logger.info(`[MessageHandler:${this.siteName}] 处理批量下载请求:`, {
      count: request.resourceIds.length
    })

    const mediaResources = this.getResourcesForDownload(request.resourceIds)
    enqueueMany(mediaResources)

    return { accepted: mediaResources.length > 0, count: mediaResources.length }
  }

  /** 从 ResourceBuffer 回查完整资源。 */
  private getResourcesForDownload(resourceIds: string[]): MediaResource[] {
    const resources: MediaResource[] = []

    for (const resourceId of resourceIds) {
      const resource = this.resourceBuffer.getResource(resourceId)
      if (resource) {
        resources.push(resource)
        continue
      }

      logger.error(
        `[MessageHandler:${this.siteName}] downloadBatch 找不到资源: resourceId=${resourceId}`
      )
    }

    return resources
  }
}

/** 解析 v2 取消下载任务请求。 */
function parseCancelDownloadTaskRequest(
  params: JsonValue | undefined
): ContentCancelDownloadTaskRequest {
  if (!isJsonObject(params) || typeof params.taskId !== 'string') {
    throw new Error('[MessageHandler] cancelDownloadTask 请求缺少字符串 taskId')
  }

  return { taskId: params.taskId }
}

/** 解析 v2 重试下载任务请求。 */
function parseRetryDownloadTaskRequest(
  params: JsonValue | undefined
): ContentRetryDownloadTaskRequest {
  if (!isJsonObject(params) || typeof params.taskId !== 'string') {
    throw new Error('[MessageHandler] retryDownloadTask 请求缺少字符串 taskId')
  }

  return { taskId: params.taskId }
}

/** 解析 v2 批量下载请求。 */
function parseDownloadBatchRequest(params: JsonValue | undefined): ContentDownloadBatchRequest {
  if (!isJsonObject(params)) {
    throw new Error('[MessageHandler] downloadBatch 请求必须是对象')
  }

  const resourceIdsValue = params.resourceIds
  if (!Array.isArray(resourceIdsValue)) {
    throw new Error('[MessageHandler] downloadBatch 请求缺少 resourceIds')
  }

  return {
    resourceIds: resourceIdsValue.map(parseResourceId)
  }
}

/** 解析 v2 单个下载资源 ID。 */
function parseResourceId(value: JsonValue): string {
  if (typeof value !== 'string') {
    throw new Error('[MessageHandler] downloadBatch resourceIds 项必须是字符串')
  }

  return value
}

/** 判断值是否为 JSON 对象。 */
function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
