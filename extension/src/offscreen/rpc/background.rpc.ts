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

/** offscreen 调用 background provider 的生成客户端。 */
export class BackgroundChannel {
  /** RPC transport。 */
  private readonly transport: RpcTransport

  /** 创建 BackgroundChannel。 */
  constructor(options: RpcCallOptions = {}) {
    this.transport = new ChromeRpcTransport('background', options)
  }

  /** 调用 taskProgress 能力。 */
  taskProgress(
    params: RpcMethodParams<BackgroundHandler, 'taskProgress'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'taskProgress'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'taskProgress'>,
      RpcMethodParams<BackgroundHandler, 'taskProgress'>
    >('taskProgress', params, options)
  }

  /** 调用 taskComplete 能力。 */
  taskComplete(
    params: RpcMethodParams<BackgroundHandler, 'taskComplete'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'taskComplete'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'taskComplete'>,
      RpcMethodParams<BackgroundHandler, 'taskComplete'>
    >('taskComplete', params, options)
  }

  /** 调用 taskFailed 能力。 */
  taskFailed(
    params: RpcMethodParams<BackgroundHandler, 'taskFailed'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'taskFailed'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'taskFailed'>,
      RpcMethodParams<BackgroundHandler, 'taskFailed'>
    >('taskFailed', params, options)
  }

  /** 调用 taskCancelled 能力。 */
  taskCancelled(
    params: RpcMethodParams<BackgroundHandler, 'taskCancelled'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'taskCancelled'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'taskCancelled'>,
      RpcMethodParams<BackgroundHandler, 'taskCancelled'>
    >('taskCancelled', params, options)
  }

  /** 调用 refreshSignatureRequest 能力。 */
  refreshSignatureRequest(
    params: RpcMethodParams<BackgroundHandler, 'refreshSignatureRequest'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<BackgroundHandler, 'refreshSignatureRequest'>> {
    return this.transport.call<
      RpcMethodResult<BackgroundHandler, 'refreshSignatureRequest'>,
      RpcMethodParams<BackgroundHandler, 'refreshSignatureRequest'>
    >('refreshSignatureRequest', params, options)
  }

  /** 调用 keepAlive 能力。 */
  keepAlive(options?: RpcCallOptions): Promise<RpcMethodResult<BackgroundHandler, 'keepAlive'>> {
    return this.transport.call<RpcMethodResult<BackgroundHandler, 'keepAlive'>>(
      'keepAlive',
      undefined,
      options
    )
  }

  /** 销毁 RPC transport。 */
  destroy(): void {
    this.transport.destroy()
  }
}
