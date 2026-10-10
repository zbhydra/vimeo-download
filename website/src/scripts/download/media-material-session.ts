/**
 * 预授权后的材料消费协调。
 *
 * download-anonymous-pre-v2 已完成材料验签和业务计次；本模块只校验模式并把
 * direct/client_mux 材料交给对应下载方法。失败交给工作区，用户手动重试。
 */

import { authorizeWorkspaceDownload } from './anonymous-download'
import type { DownloadMethodContext } from './download-methods'
import type {
  ClientMuxDownloadIntent,
  DirectDownloadIntent,
  DownloadMode,
  MediaPost
} from './types'

export interface MediaMaterialSession {
  downloadMode: DownloadMode
  getLastUsedNodeId(): number | null
  prepareDirectIntent(): Promise<DirectDownloadIntent>
  prepareClientMuxIntent(): Promise<ClientMuxDownloadIntent>
}

export async function createMediaMaterialSession(
  resource: MediaPost,
  context: DownloadMethodContext
): Promise<MediaMaterialSession> {
  const result = await authorizeWorkspaceDownload(resource, context)
  if (result.material.downloadMode !== resource.downloadMode) {
    throw new Error(
      `[media-material] mode mismatch, sourceId=${resource.sourceId}, expected=${resource.downloadMode}, actual=${result.material.downloadMode}`
    )
  }
  const material = result.material
  return {
    downloadMode: material.downloadMode,
    getLastUsedNodeId: () => null,
    prepareDirectIntent: async () => {
      if (material.downloadMode !== 'direct') {
        throw new Error(`[media-material] direct material expected, sourceId=${resource.sourceId}`)
      }
      return material
    },
    prepareClientMuxIntent: async () => {
      if (material.downloadMode !== 'client_mux') {
        throw new Error(`[media-material] client_mux material expected, sourceId=${resource.sourceId}`)
      }
      return material
    }
  }
}
