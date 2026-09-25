/**
 * 由 rpc-generate 生成的 content Chrome RPC 客户端。
 *
 * 来源：src/content/content-register.ts
 */

import { ChromeRpcTransport } from '@/core/rpc/transports/ChromeRpcTransport'
import type {
  RpcCallOptions,
  RpcMethodParams,
  RpcMethodResult,
  RpcTransport
} from '@/core/rpc/types'
import type { ContentHandler } from '@/content/content-register'

/** popup 调用 content provider 的生成客户端。 */
export class ContentChannel {
  /** RPC transport。 */
  private readonly transport: RpcTransport

  /** 创建 ContentChannel。 */
  constructor(options: RpcCallOptions = {}) {
    this.transport = new ChromeRpcTransport('content', options)
  }

  /** 调用 getResources 能力。 */
  getResources(options?: RpcCallOptions): Promise<RpcMethodResult<ContentHandler, 'getResources'>> {
    return this.transport.call<RpcMethodResult<ContentHandler, 'getResources'>>(
      'getResources',
      undefined,
      options
    )
  }

  /** 调用 getDownloadQueue 能力。 */
  getDownloadQueue(
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<ContentHandler, 'getDownloadQueue'>> {
    return this.transport.call<RpcMethodResult<ContentHandler, 'getDownloadQueue'>>(
      'getDownloadQueue',
      undefined,
      options
    )
  }

  /** 调用 downloadBatch 能力。 */
  downloadBatch(
    params: RpcMethodParams<ContentHandler, 'downloadBatch'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<ContentHandler, 'downloadBatch'>> {
    return this.transport.call<
      RpcMethodResult<ContentHandler, 'downloadBatch'>,
      RpcMethodParams<ContentHandler, 'downloadBatch'>
    >('downloadBatch', params, options)
  }

  /** 调用 cancelDownloadTask 能力。 */
  cancelDownloadTask(
    params: RpcMethodParams<ContentHandler, 'cancelDownloadTask'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<ContentHandler, 'cancelDownloadTask'>> {
    return this.transport.call<
      RpcMethodResult<ContentHandler, 'cancelDownloadTask'>,
      RpcMethodParams<ContentHandler, 'cancelDownloadTask'>
    >('cancelDownloadTask', params, options)
  }

  /** 调用 retryDownloadTask 能力。 */
  retryDownloadTask(
    params: RpcMethodParams<ContentHandler, 'retryDownloadTask'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<ContentHandler, 'retryDownloadTask'>> {
    return this.transport.call<
      RpcMethodResult<ContentHandler, 'retryDownloadTask'>,
      RpcMethodParams<ContentHandler, 'retryDownloadTask'>
    >('retryDownloadTask', params, options)
  }

  /** 销毁 RPC transport。 */
  destroy(): void {
    this.transport.destroy()
  }
}
