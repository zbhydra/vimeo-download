/**
 * 由 rpc-generate 生成的 content Chrome RPC 客户端。
 *
 * 来源：src/content/content-register.ts
 */

import { ChromeRpcTransport } from '@/core/rpc/transports/ChromeRpcTransport'
import type { RpcCallOptions, RpcMethodResult, RpcTransport } from '@/core/rpc/types'
import type { ContentHandler } from '@/content/content-register'

/** background 调用 content provider 的生成客户端。 */
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

  /** 销毁 RPC transport。 */
  destroy(): void {
    this.transport.destroy()
  }
}
