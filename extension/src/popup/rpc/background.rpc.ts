/**
 * 由 rpc-generate 生成的 background Chrome RPC 客户端。
 *
 * 来源：src/background/background-register.ts
 */

import { ChromeRpcTransport } from '@/core/rpc/transports/ChromeRpcTransport'
import type {
  RpcCallOptions,
  RpcMethodParams,
  RpcMethodResult,
  RpcTransport
} from '@/core/rpc/types'
import type { BackgroundHandler } from '@/background/background-register'

/** popup 调用 background provider 的生成客户端。 */
export class BackgroundChannel {
  /** RPC transport。 */
  private readonly transport: RpcTransport

  /** 创建 BackgroundChannel。 */
  constructor(options: RpcCallOptions = {}) {
    this.transport = new ChromeRpcTransport('background', options)
  }

  /** 调用 ping 能力。 */
  ping(options?: RpcCallOptions): Promise<RpcMethodResult<BackgroundHandler, 'ping'>> {
    return this.transport.call<RpcMethodResult<BackgroundHandler, 'ping'>>(
      'ping',
      undefined,
      options
    )
  }

  /** 调用 getState 能力。 */
  getState(options?: RpcCallOptions): Promise<RpcMethodResult<BackgroundHandler, 'getState'>> {
    return this.transport.call<RpcMethodResult<BackgroundHandler, 'getState'>>(
      'getState',
      undefined,
      options
    )
  }

  /** 调用 getRuntimeConfig 能力。 */
  getRuntimeConfig(
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'getRuntimeConfig'>> {
    return this.transport.call<RpcMethodResult<BackgroundHandler, 'getRuntimeConfig'>>(
      'getRuntimeConfig',
      undefined,
      options
    )
  }

  /** 调用 recordMark 能力。 */
  recordMark(
    params: RpcMethodParams<BackgroundHandler, 'recordMark'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'recordMark'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'recordMark'>,
      RpcMethodParams<BackgroundHandler, 'recordMark'>
    >('recordMark', params, options)
  }

  /** 调用 startGoogleLogin 能力。 */
  startGoogleLogin(
    params: RpcMethodParams<BackgroundHandler, 'startGoogleLogin'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'startGoogleLogin'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'startGoogleLogin'>,
      RpcMethodParams<BackgroundHandler, 'startGoogleLogin'>
    >('startGoogleLogin', params, options)
  }

  /** 调用 downloadBatch 能力。 */
  downloadBatch(
    params: RpcMethodParams<BackgroundHandler, 'downloadBatch'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'downloadBatch'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'downloadBatch'>,
      RpcMethodParams<BackgroundHandler, 'downloadBatch'>
    >('downloadBatch', params, options)
  }

  /** 调用 cancelDownloadTask 能力。 */
  cancelDownloadTask(
    params: RpcMethodParams<BackgroundHandler, 'cancelDownloadTask'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'cancelDownloadTask'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'cancelDownloadTask'>,
      RpcMethodParams<BackgroundHandler, 'cancelDownloadTask'>
    >('cancelDownloadTask', params, options)
  }

  /** 调用 retryDownloadTask 能力。 */
  retryDownloadTask(
    params: RpcMethodParams<BackgroundHandler, 'retryDownloadTask'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'retryDownloadTask'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'retryDownloadTask'>,
      RpcMethodParams<BackgroundHandler, 'retryDownloadTask'>
    >('retryDownloadTask', params, options)
  }

  /** 调用 getDownloadQueue 能力。 */
  getDownloadQueue(
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'getDownloadQueue'>> {
    return this.transport.call<RpcMethodResult<BackgroundHandler, 'getDownloadQueue'>>(
      'getDownloadQueue',
      undefined,
      options
    )
  }

  /** 销毁 RPC transport。 */
  destroy(): void {
    this.transport.destroy()
  }
}
