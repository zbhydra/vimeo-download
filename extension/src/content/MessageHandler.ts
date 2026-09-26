/**
 * 通用 content RPC handler。
 *
 * popup/background 只和 content channel 通信，站点差异由调用方传入的资源缓存承接。
 * 下载发起、取消与队列快照统一走 background 编排器（U8 起），content 只提供资源查询。
 */

import type { ResourceBuffer } from '@/core/content/services/ResourceBuffer'
import { serve } from '@/core/rpc/serve'
import type { RpcServeHandlers, RpcServeRegistration } from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'
import {
  CHANNEL,
  METHOD_REQUEST_LIMITS,
  METHOD_RESPONSE_LIMITS,
  METHOD_TARGETS,
  METHOD_TRANSPORTS
} from '@/content/content-register'
import type { ContentGetResourcesResponse } from '@/content/types'

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
      getResources: () => this.getResources()
    }
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
}
