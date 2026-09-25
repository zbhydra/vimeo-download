/**
 * Content 调用 MAIN world injected provider 的唯一 RPC 客户端实例。
 *
 * 所有站点共享同一个 EventRpc transport；不同能力的等待时间由调用方逐次传入。
 */

import { InjectedChannel } from './injected.rpc'

/** Content 发起 injected RPC 的唯一具体客户端。 */
export const injectedClient = new InjectedChannel()
