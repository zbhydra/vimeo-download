/**
 * client_mux 下载方法。
 *
 * 通过 download-anonymous-pre-v2 获取完整 tracks 材料。
 */

import {
  downloadClientMuxResource,
  type ClientMuxProgressSnapshot
} from './client-mux'
import { createMediaMaterialSession } from './media-material-session'
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
  const session = await createMediaMaterialSession(resource, context)
  const intent = await session.prepareClientMuxIntent()
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
    retryCount: 0
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

  return runClientMuxDownloadFromStart(resource, context, options)
}
