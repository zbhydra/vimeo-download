/**
 * V2 下载授权与节点执行编排。
 *
 * 流程：
 * 1. 使用 resource_token 调用 download-pre-v2。
 * 2. 按 download-pre-v2 返回顺序调用 download-v2。
 * 3. 只对网络、超时、网关和节点临时不可用换节点。
 * 4. token 失效时抛出重授权错误，由具体下载方法决定是否重新授权。
 */

import { HomepageApiError } from '../../homepage-runtime/api'
import {
  requestMediaDownloadV2ClientMuxIntent,
  requestMediaDownloadV2DirectIntent,
  type MediaDownloadPreV2Authorization,
  type MediaV2Node
} from './media-api'
import { authorizeWorkspaceDownload } from './anonymous-download'
import type { DownloadMethodContext } from './download-methods'
import type {
  ClientMuxDownloadIntent,
  DirectDownloadIntent,
  DownloadMode,
  MediaPost
} from './types'

/** download-v2 节点临时不可用错误码；收到后继续尝试下一个节点。 */
const CODE_MEDIA_DOWNLOAD_NODE_UNAVAILABLE = 24039

/** download-v2 节点重新解析到的媒体资源暂不可达。 */
const CODE_MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE = 24037

/** download-v2 token 无效错误码；收到后必须重新走 download-pre-v2 授权。 */
const CODE_MEDIA_DOWNLOAD_TOKEN_INVALID = 24035

/** download-v2 token 过期错误码；收到后必须重新走 download-pre-v2 授权。 */
const CODE_MEDIA_DOWNLOAD_TOKEN_EXPIRED = 24036

/** download-pre-v2 短锁或扣额度暂不可用；前端不本地重试。 */
const CODE_MEDIA_DOWNLOAD_PRE_UNAVAILABLE = 24048

/** 允许自动重试 download-pre-v2 的次数。 */
const DOWNLOAD_PRE_V2_RETRY_COUNT = 1

/** 所有节点临时失败后刷新一次节点列表，仍失败才把错误交给 UI。 */
const DOWNLOAD_V2_NODE_LIST_REFRESH_COUNT = 1

/** V2 授权后可执行的下载 session。 */
export interface MediaDownloadV2Session {
  /** 本次授权的 download_mode。 */
  downloadMode: DownloadMode
  /** 当前授权返回的最新 Credits 余额。 */
  getLatestCreditsBalance(): number | undefined
  /** 最近一次成功命中的 download-v2 节点 ID。 */
  getLastUsedNodeId(): number | null
  /** direct 模式：获取平台 CDN 直链材料。 */
  prepareDirectIntent(): Promise<DirectDownloadIntent>
  /** client_mux 模式：获取视频和音频 tracks。 */
  prepareClientMuxIntent(): Promise<ClientMuxDownloadIntent>
}

/** token 失效，需要重新创建授权动作。 */
export class MediaDownloadV2ReauthorizationRequiredError extends Error {
  /** 后端业务错误码。 */
  readonly code: number | null

  constructor(message: string, code: number | null) {
    super(`[media-download-v2] ReauthorizationRequired: ${message}, code=${code ?? 'none'}`)
    this.name = 'MediaDownloadV2ReauthorizationRequiredError'
    this.code = code
  }
}

function numericApiCode(error: Error): number | null {
  if (!(error instanceof HomepageApiError)) {
    return null
  }

  const code = typeof error.code === 'string' ? Number(error.code) : error.code
  return typeof code === 'number' && Number.isFinite(code) ? code : null
}

function isGatewayStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function isServerStatus(status: number): boolean {
  return status >= 500 && status <= 599
}

function isTemporaryDownloadNodeError(error: Error): boolean {
  if (!(error instanceof HomepageApiError)) {
    return false
  }

  const code = numericApiCode(error)
  return (
    error.status === 0 ||
    isGatewayStatus(error.status) ||
    code === CODE_MEDIA_DOWNLOAD_NODE_UNAVAILABLE ||
    code === CODE_MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE
  )
}

function isDownloadTokenInvalidOrExpired(error: Error): boolean {
  const code = numericApiCode(error)
  return code === CODE_MEDIA_DOWNLOAD_TOKEN_INVALID || code === CODE_MEDIA_DOWNLOAD_TOKEN_EXPIRED
}

function assertAuthorizationMode(
  authorization: MediaDownloadPreV2Authorization,
  resource: MediaPost
): void {
  if (authorization.downloadMode === resource.downloadMode) {
    return
  }

  throw new Error(
    `[media-download-v2] assertAuthorizationMode: download-pre-v2 mode mismatch, sourceId=${resource.sourceId}, expected=${resource.downloadMode}, actual=${authorization.downloadMode}`
  )
}

async function authorizeDownloadV2(
  resource: MediaPost,
  context: DownloadMethodContext
): Promise<MediaDownloadPreV2Authorization> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= DOWNLOAD_PRE_V2_RETRY_COUNT; attempt += 1) {
    try {
      const authorization = await authorizeWorkspaceDownload(
        resource,
        context
      )
      assertAuthorizationMode(authorization, resource)
      return authorization
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }

      if (numericApiCode(error) === CODE_MEDIA_DOWNLOAD_PRE_UNAVAILABLE) {
        throw error
      }

      lastError = error
      if (
        attempt >= DOWNLOAD_PRE_V2_RETRY_COUNT ||
        !(error instanceof HomepageApiError) ||
        (error.status !== 0 && !isServerStatus(error.status))
      ) {
        throw error
      }

      console.error(error)
    }
  }

  throw lastError ?? new Error('[media-download-v2] authorizeDownloadV2: download-pre-v2 did not run')
}

async function requestThroughDownloadNodes<T>(
  resource: MediaPost,
  getAuthorization: () => MediaDownloadPreV2Authorization,
  refreshAuthorization: () => Promise<MediaDownloadPreV2Authorization>,
  requestNode: (node: MediaV2Node, authorization: MediaDownloadPreV2Authorization) => Promise<T>
): Promise<T> {
  let lastError: Error | null = null

  for (let refreshAttempt = 0; refreshAttempt <= DOWNLOAD_V2_NODE_LIST_REFRESH_COUNT; refreshAttempt += 1) {
    const authorization = refreshAttempt === 0 ? getAuthorization() : await refreshAuthorization()

    for (const node of authorization.nodes) {
      try {
        return await requestNode(node, authorization)
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error
        }

        if (isDownloadTokenInvalidOrExpired(error)) {
          throw new MediaDownloadV2ReauthorizationRequiredError(
            `download-v2 token rejected, sourceId=${resource.sourceId}, node_id=${node.node_id}`,
            numericApiCode(error)
          )
        }

        if (!isTemporaryDownloadNodeError(error)) {
          throw error
        }

        console.error(error)
        lastError = error
      }
    }
  }

  throw lastError ?? new Error(
    `[media-download-v2] requestThroughDownloadNodes: empty download-v2 node list, sourceId=${resource.sourceId}`
  )
}

/**
 * 创建 V2 下载 session。
 *
 * @param resource - parse-v2 返回的当前资源
 * @param context - 请求上下文
 */
export async function createMediaDownloadV2Session(
  resource: MediaPost,
  context: DownloadMethodContext
): Promise<MediaDownloadV2Session> {
  let authorization = await authorizeDownloadV2(resource, context)
  let lastUsedNodeId: number | null = null
  const getAuthorization = (): MediaDownloadPreV2Authorization => authorization
  const refreshAuthorization = async (): Promise<MediaDownloadPreV2Authorization> => {
    authorization = await authorizeDownloadV2(resource, context)
    return authorization
  }

  return {
    downloadMode: authorization.downloadMode,
    getLatestCreditsBalance: () => authorization.creditsBalance,
    getLastUsedNodeId: () => lastUsedNodeId,
    prepareDirectIntent: () =>
      requestThroughDownloadNodes(
        resource,
        getAuthorization,
        refreshAuthorization,
        async (node, activeAuthorization) => {
          const intent = await requestMediaDownloadV2DirectIntent(
            node.url,
            activeAuthorization.token,
            context
          )
          lastUsedNodeId = node.node_id
          return intent
        }
      ),
    prepareClientMuxIntent: () =>
      requestThroughDownloadNodes(
        resource,
        getAuthorization,
        refreshAuthorization,
        async (node, activeAuthorization) => {
          const intent = await requestMediaDownloadV2ClientMuxIntent(
            node.url,
            activeAuthorization.token,
            context
          )
          lastUsedNodeId = node.node_id
          return intent
        }
      )
  }
}
