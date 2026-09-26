/**
 * 由 rpc-generate 生成的 offscreen Chrome RPC 客户端。
 *
 * 来源：src/offscreen/offscreen-register.ts
 */

import { ChromeRpcTransport } from '@/core/rpc/transports/ChromeRpcTransport'
import type {
  RpcCallOptions,
  RpcMethodParams,
  RpcMethodResult,
  RpcTransport
} from '@/core/rpc/types'
import type { OffscreenHandler } from '@/offscreen/offscreen-register'

/** background 调用 offscreen provider 的生成客户端。 */
export class OffscreenChannel {
  /** RPC transport。 */
  private readonly transport: RpcTransport

  /** 创建 OffscreenChannel。 */
  constructor(options: RpcCallOptions = {}) {
    this.transport = new ChromeRpcTransport('offscreen', options)
  }

  /** 调用 startTask 能力。 */
  startTask(
    params: RpcMethodParams<OffscreenHandler, 'startTask'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<OffscreenHandler, 'startTask'>> {
    return this.transport.call<
      RpcMethodResult<OffscreenHandler, 'startTask'>,
      RpcMethodParams<OffscreenHandler, 'startTask'>
    >('startTask', params, options)
  }

  /** 调用 cancelTask 能力。 */
  cancelTask(
    params: RpcMethodParams<OffscreenHandler, 'cancelTask'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<OffscreenHandler, 'cancelTask'>> {
    return this.transport.call<
      RpcMethodResult<OffscreenHandler, 'cancelTask'>,
      RpcMethodParams<OffscreenHandler, 'cancelTask'>
    >('cancelTask', params, options)
  }

  /** 调用 listActiveTasks 能力。 */
  listActiveTasks(
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<OffscreenHandler, 'listActiveTasks'>> {
    return this.transport.call<RpcMethodResult<OffscreenHandler, 'listActiveTasks'>>(
      'listActiveTasks',
      undefined,
      options
    )
  }

  /** 调用 releaseTaskArtifact 能力。 */
  releaseTaskArtifact(
    params: RpcMethodParams<OffscreenHandler, 'releaseTaskArtifact'>,
    options?: RpcCallOptions
  ): Promise<RpcMethodResult<OffscreenHandler, 'releaseTaskArtifact'>> {
    return this.transport.call<
      RpcMethodResult<OffscreenHandler, 'releaseTaskArtifact'>,
      RpcMethodParams<OffscreenHandler, 'releaseTaskArtifact'>
    >('releaseTaskArtifact', params, options)
  }

  /** 销毁 RPC transport。 */
  destroy(): void {
    this.transport.destroy()
  }
}
