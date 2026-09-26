/**
 * 由 rpc-generate 生成的 injected Event RPC 客户端。
 *
 * 来源：src/injected/injected-register.ts
 */

import { EventRpcTransport } from '@/core/rpc/transports/EventRpcTransport'
import type { RpcCallOptions, RpcMethodParams, RpcMethodResult } from '@/core/rpc/types'
import type { InjectedHandler } from '@/injected/injected-register'

/** content 调用 injected provider 的生成客户端。 */
export class InjectedChannel {
  /** 固定 EventRpc transport。 */
  private readonly transport: EventRpcTransport

  /** 创建 InjectedChannel。 */
  constructor(options: RpcCallOptions = {}) {
    this.transport = new EventRpcTransport('injected', options)
  }

  /** 调用 applyRuntimeConfig 能力。 */
  applyRuntimeConfig(
    params: RpcMethodParams<InjectedHandler, 'applyRuntimeConfig'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<InjectedHandler, 'applyRuntimeConfig'>> {
    return this.transport.call<
      RpcMethodResult<InjectedHandler, 'applyRuntimeConfig'>,
      RpcMethodParams<InjectedHandler, 'applyRuntimeConfig'>
    >('applyRuntimeConfig', params, options)
  }

  /** 调用 applySiteConfig 能力。 */
  applySiteConfig(
    params: RpcMethodParams<InjectedHandler, 'applySiteConfig'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<InjectedHandler, 'applySiteConfig'>> {
    return this.transport.call<
      RpcMethodResult<InjectedHandler, 'applySiteConfig'>,
      RpcMethodParams<InjectedHandler, 'applySiteConfig'>
    >('applySiteConfig', params, options)
  }

  /** 调用 getCapturedVimeoConfig 能力。 */
  getCapturedVimeoConfig(
    params: RpcMethodParams<InjectedHandler, 'getCapturedVimeoConfig'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<InjectedHandler, 'getCapturedVimeoConfig'>> {
    return this.transport.call<
      RpcMethodResult<InjectedHandler, 'getCapturedVimeoConfig'>,
      RpcMethodParams<InjectedHandler, 'getCapturedVimeoConfig'>
    >('getCapturedVimeoConfig', params, options)
  }

  /** 调用 listCapturedVimeoConfigs 能力。 */
  listCapturedVimeoConfigs(
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<InjectedHandler, 'listCapturedVimeoConfigs'>> {
    return this.transport.call<RpcMethodResult<InjectedHandler, 'listCapturedVimeoConfigs'>>(
      'listCapturedVimeoConfigs',
      undefined,
      options
    )
  }

  /** 销毁 RPC transport。 */
  destroy(): void {
    this.transport.destroy()
  }
}
