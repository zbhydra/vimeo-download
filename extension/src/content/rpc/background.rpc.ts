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

/** content 调用 background provider 的生成客户端。 */
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

  /** 调用 updateBadge 能力。 */
  updateBadge(
    params: RpcMethodParams<BackgroundHandler, 'updateBadge'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'updateBadge'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'updateBadge'>,
      RpcMethodParams<BackgroundHandler, 'updateBadge'>
    >('updateBadge', params, options)
  }

  /** 调用 getRemoteConfig 能力。 */
  getRemoteConfig(
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'getRemoteConfig'>> {
    return this.transport.call<RpcMethodResult<BackgroundHandler, 'getRemoteConfig'>>(
      'getRemoteConfig',
      undefined,
      options
    )
  }

  /** 调用 getVimeoPlayerConfig 能力。 */
  getVimeoPlayerConfig(
    params: RpcMethodParams<BackgroundHandler, 'getVimeoPlayerConfig'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'getVimeoPlayerConfig'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'getVimeoPlayerConfig'>,
      RpcMethodParams<BackgroundHandler, 'getVimeoPlayerConfig'>
    >('getVimeoPlayerConfig', params, options)
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

  /** 调用 checkQuota 能力。 */
  checkQuota(
    params: RpcMethodParams<BackgroundHandler, 'checkQuota'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'checkQuota'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'checkQuota'>,
      RpcMethodParams<BackgroundHandler, 'checkQuota'>
    >('checkQuota', params, options)
  }

  /** 调用 startBrowserDownload 能力。 */
  startBrowserDownload(
    params: RpcMethodParams<BackgroundHandler, 'startBrowserDownload'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'startBrowserDownload'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'startBrowserDownload'>,
      RpcMethodParams<BackgroundHandler, 'startBrowserDownload'>
    >('startBrowserDownload', params, options)
  }

  /** 调用 getBrowserDownloadStatus 能力。 */
  getBrowserDownloadStatus(
    params: RpcMethodParams<BackgroundHandler, 'getBrowserDownloadStatus'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'getBrowserDownloadStatus'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'getBrowserDownloadStatus'>,
      RpcMethodParams<BackgroundHandler, 'getBrowserDownloadStatus'>
    >('getBrowserDownloadStatus', params, options)
  }

  /** 销毁 RPC transport。 */
  destroy(): void {
    this.transport.destroy()
  }
}
