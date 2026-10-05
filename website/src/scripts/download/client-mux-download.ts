/**
 * client_mux 下载方法。
 *
 * 通过 download-anonymous-pre-v2 + download-v2 获取 tracks。
 */

import {
  ClientMuxDownloadError,
  downloadClientMuxResource,
  type ClientMuxProgressSnapshot
} from './client-mux'
import {
  createMediaDownloadV2Session,
  MediaDownloadV2ReauthorizationRequiredError
} from './media-download-v2'
import type { DownloadMethodResult } from './download-completion'
import type { DownloadResumeRecord } from './download-resume-store'
import type {
  DownloadMethodContext,
  DownloadMethodOptions
} from './download-methods'
import type { MediaPost } from './types'

async function runClientMuxDownloadFromStart(
  resource: MediaPost,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  const onProgress = (progress: ClientMuxProgressSnapshot): void => {
    options.onProgress?.(progress)
  }
  const session = await createMediaDownloadV2Session(resource, context)
  let intent = await session.prepareClientMuxIntent()
  let usedNodeId = session.getLastUsedNodeId() ?? undefined
  if (usedNodeId !== undefined) {
    options.onUsedNode?.(usedNodeId)
  }
  let retryCount = 0

  while (true) {
    try {
      const { blob, filename, cleanup } = await downloadClientMuxResource(intent, onProgress)
      return {
        completion: {
          kind: 'object_url',
          objectUrl: URL.createObjectURL(blob),
          filename,
          revokeAfterMs: 60_000,
          bytesWritten: blob.size,
          objectUrlSource: blob instanceof File ? 'file' : 'blob',
          cleanup
        },
        retryCount,
        usedNodeId
      }
    } catch (error) {
      if (
        retryCount > 0 ||
        !(error instanceof ClientMuxDownloadError) ||
        error.reason !== 'track_fetch_failed'
      ) {
        throw error
      }

      console.error(error)
      intent = await session.prepareClientMuxIntent()
      usedNodeId = session.getLastUsedNodeId() ?? undefined
      if (usedNodeId !== undefined) {
        options.onUsedNode?.(usedNodeId)
      }
      retryCount = 1
    }
  }
}

/** 执行 client_mux 多轨合成下载。 */
export async function runClientMuxDownload(
  resource: MediaPost,
  resumeRecord: DownloadResumeRecord | undefined,
  context: DownloadMethodContext,
  options: DownloadMethodOptions
): Promise<DownloadMethodResult> {
  if (resumeRecord) {
    throw new Error(
      `[client-mux-download] runClientMuxDownload: Continue is unsupported, sourceId=${resumeRecord.sourceId}`
    )
  }

  try {
    return await runClientMuxDownloadFromStart(resource, context, options)
  } catch (error) {
    if (!(error instanceof MediaDownloadV2ReauthorizationRequiredError)) {
      throw error
    }

    console.error(error)
    const result = await runClientMuxDownloadFromStart(resource, context, options)
    return {
      ...result,
      retryCount: result.retryCount + 1
    }
  }
}
