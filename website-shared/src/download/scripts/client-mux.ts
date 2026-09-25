/**
 * 客户端双轨 MP4 合成：CDN 流写入临时文件，再按时间交错复制 encoded packets。
 * OPFS 不可用时仅允许已知小文件使用内存，不做转码或分片续传。
 */

import {
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type StreamTargetChunk
} from 'mediabunny'
import { createOpfsDownloadTempFile } from './download-temp-storage'
import type { ClientMuxDownloadIntent, ClientMuxTrackIntent, DownloadProgressSnapshot } from './types'

export type ClientMuxStage = 'download' | 'mux'

/** client_mux 进度快照。 */
export interface ClientMuxProgressSnapshot extends DownloadProgressSnapshot {
  stage: ClientMuxStage
}

/** client_mux 失败；存储不可用与资源超限分别展示。 */
export class ClientMuxDownloadError extends Error {
  readonly reason:
    | 'track_fetch_failed'
    | 'client_mux_failed'
    | 'client_mux_too_large'
    | 'opfs_unavailable_for_large_file'
  readonly status: number
  readonly trackKind?: 'video' | 'audio'

  constructor(reason: ClientMuxDownloadError['reason'], status: number, trackKind?: 'video' | 'audio') {
    super(`[client-mux] ${reason}, status=${status}, track=${trackKind ?? 'none'}`)
    this.name = 'ClientMuxDownloadError'
    this.reason = reason
    this.status = status
    this.trackKind = trackKind
  }
}

const MEMORY_MAX_BYTES = 50 * 1024 * 1024
const RESOURCE_MAX_BYTES = 4 * 1024 * 1024 * 1024
type TempFile = Awaited<ReturnType<typeof createOpfsDownloadTempFile>>

async function cleanupTempFiles(files: TempFile[]): Promise<void> {
  for (const file of files) {
    try {
      await file.cleanup()
    } catch (error) {
      console.error(error)
    }
  }
}

async function fetchTrackWithProgress(
  track: ClientMuxTrackIntent,
  file: TempFile | undefined,
  offsetBytes: number,
  knownTotalBytes: number | null,
  startedAt: number,
  onProgress?: (progress: ClientMuxProgressSnapshot) => void
): Promise<Blob> {
  const chunks: ArrayBuffer[] = []
  let trackBytes = 0
  const write = async (chunk: Uint8Array): Promise<void> => {
    const downloadedBytes = offsetBytes + trackBytes + chunk.byteLength
    if (downloadedBytes > RESOURCE_MAX_BYTES) {
      throw new ClientMuxDownloadError('client_mux_too_large', 0)
    }
    if (!file && downloadedBytes > MEMORY_MAX_BYTES) {
      throw new ClientMuxDownloadError('opfs_unavailable_for_large_file', 0)
    }
    if (file) await file.writable.write(chunk.slice().buffer)
    else chunks.push(chunk.slice().buffer)
    trackBytes += chunk.byteLength
    onProgress?.({
      stage: 'download',
      downloadedBytes,
      totalBytes: knownTotalBytes,
      progress: knownTotalBytes !== null && knownTotalBytes > 0
        ? Math.min(80, downloadedBytes / knownTotalBytes * 80)
        : undefined,
      speedBytesPerSecond: downloadedBytes / Math.max((Date.now() - startedAt) / 1000, 0.001)
    })
  }

  if (track.delivery === 'segments') {
    const init = Uint8Array.from(atob(track.initSegment), character => character.charCodeAt(0))
    await write(init)
  }
  const urls = track.delivery === 'file' ? [track.url] : track.segments.map(segment => segment.url)
  for (const url of urls) {
    let response: Response
    try {
      response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    } catch (error) {
      console.error(error)
      throw new ClientMuxDownloadError('track_fetch_failed', 0, track.kind)
    }
    if ((response.status !== 200 && response.status !== 206) || !response.body) {
      await response.body?.cancel()
      throw new ClientMuxDownloadError('track_fetch_failed', response.status, track.kind)
    }
    const reader = response.body.getReader()
    try {
      while (true) {
        let result: ReadableStreamReadResult<Uint8Array>
        try {
          result = await reader.read()
        } catch (error) {
          console.error(error)
          throw new ClientMuxDownloadError('track_fetch_failed', 0, track.kind)
        }
        if (result.done) break
        await write(result.value)
      }
    } finally {
      try {
        await reader.cancel()
      } catch (error) {
        console.error(error)
      }
      reader.releaseLock()
    }
  }
  if (file) {
    await file.writable.close()
    return file.getFile()
  }
  return new Blob(chunks, { type: track.mimeType })
}

async function muxToMp4(videoBlob: Blob, audioBlob: Blob, file?: TempFile): Promise<Blob> {
  const videoInput = new Input({ formats: [MP4], source: new BlobSource(videoBlob) })
  const audioInput = new Input({ formats: [MP4], source: new BlobSource(audioBlob) })
  let output: Output | undefined
  let videoReady = false
  let audioReady = false
  try {
    await videoInput.getFormat()
    videoReady = true
    await audioInput.getFormat()
    audioReady = true
    const videoTrack = await videoInput.getPrimaryVideoTrack()
    const audioTrack = await audioInput.getPrimaryAudioTrack()
    const videoCodec = await videoTrack?.getCodec()
    const audioCodec = await audioTrack?.getCodec()
    if (!videoTrack || !audioTrack || !videoCodec || !audioCodec) {
      throw new ClientMuxDownloadError('client_mux_failed', 0)
    }
    const bufferTarget = file ? undefined : new BufferTarget()
    const target = file ? new StreamTarget(new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        if (chunk.position + chunk.data.byteLength > RESOURCE_MAX_BYTES) {
          throw new ClientMuxDownloadError('client_mux_too_large', 0)
        }
        await file.writable.write(chunk)
      },
      close: () => file.writable.close(),
      abort: () => file.writable.abort()
    })) : bufferTarget!
    output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target })
    const videoSource = new EncodedVideoPacketSource(videoCodec)
    const audioSource = new EncodedAudioPacketSource(audioCodec)
    output.addVideoTrack(videoSource, { rotation: await videoTrack.getRotation() })
    output.addAudioTrack(audioSource)
    const videoConfig = await videoTrack.getDecoderConfig()
    const audioConfig = await audioTrack.getDecoderConfig()
    const videoStart = await videoTrack.getFirstTimestamp()
    const audioStart = await audioTrack.getFirstTimestamp()
    const videoPackets = new EncodedPacketSink(videoTrack).packets(undefined, undefined, { verifyKeyPackets: true })
    const audioPackets = new EncodedPacketSink(audioTrack).packets()
    await output.start()
    try {
      let video = await videoPackets.next()
      let audio = await audioPackets.next()
      // 每轨只保留一个待写包，防止一条轨道跑完整条后才等待另一轨而积压内存。
      while (!video.done || !audio.done) {
        if (!video.done && (audio.done || video.value.timestamp - videoStart <= audio.value.timestamp - audioStart)) {
          await videoSource.add(video.value.clone({ timestamp: Math.max(0, video.value.timestamp - videoStart) }), {
            decoderConfig: videoConfig ?? undefined
          })
          video = await videoPackets.next()
        } else if (!audio.done) {
          await audioSource.add(audio.value.clone({ timestamp: Math.max(0, audio.value.timestamp - audioStart) }), {
            decoderConfig: audioConfig ?? undefined
          })
          audio = await audioPackets.next()
        }
      }
    } finally {
      await videoPackets.return()
      await audioPackets.return()
    }
    videoSource.close()
    audioSource.close()
    await output.finalize()
    if (file) return file.getFile()
    if (!bufferTarget?.buffer) throw new ClientMuxDownloadError('client_mux_failed', 0)
    return new Blob([bufferTarget.buffer], { type: 'video/mp4' })
  } catch (error) {
    console.error(error)
    try {
      await output?.cancel()
    } catch (cancelError) {
      console.error(cancelError)
    }
    if (error instanceof ClientMuxDownloadError) throw error
    throw new ClientMuxDownloadError('client_mux_failed', 0)
  } finally {
    // Mediabunny 1.46 在格式探测拒绝后 dispose 会再次抛出未处理拒绝；BlobSource 本身没有文件句柄。
    if (videoReady) videoInput.dispose()
    if (audioReady) audioInput.dispose()
  }
}

/** 下载并合成资源；输出 OPFS 文件由保存流程延迟 cleanup。 */
export async function downloadClientMuxResource(
  intent: ClientMuxDownloadIntent,
  onProgress?: (progress: ClientMuxProgressSnapshot) => void
): Promise<{ blob: Blob; filename: string; cleanup?: () => Promise<void> }> {
  const knownTotalBytes = intent.videoTrack.size !== null && intent.audioTrack.size !== null
    ? intent.videoTrack.size + intent.audioTrack.size
    : intent.size
  if (knownTotalBytes !== null && knownTotalBytes > RESOURCE_MAX_BYTES) {
    throw new ClientMuxDownloadError('client_mux_too_large', 0)
  }
  const files: TempFile[] = []
  try {
    try {
      for (let index = 0; index < 3; index++) files.push(await createOpfsDownloadTempFile())
    } catch (error) {
      console.error(error)
      await cleanupTempFiles(files)
      files.length = 0
      if (knownTotalBytes === null || knownTotalBytes > MEMORY_MAX_BYTES) {
        throw new ClientMuxDownloadError('opfs_unavailable_for_large_file', 0)
      }
    }
    const startedAt = Date.now()
    const videoBlob = await fetchTrackWithProgress(intent.videoTrack, files[0], 0, knownTotalBytes, startedAt, onProgress)
    const audioBlob = await fetchTrackWithProgress(intent.audioTrack, files[1], videoBlob.size, knownTotalBytes, startedAt, onProgress)
    const progress = { stage: 'mux' as const, downloadedBytes: videoBlob.size + audioBlob.size, totalBytes: knownTotalBytes, speedBytesPerSecond: null }
    onProgress?.({ ...progress, progress: 90 })
    const blob = await muxToMp4(videoBlob, audioBlob, files[2])
    await cleanupTempFiles(files.slice(0, 2))
    onProgress?.({ ...progress, progress: 100 })
    const outputFile = files[2]
    return { blob, filename: intent.filename, cleanup: outputFile ? () => outputFile.cleanup() : undefined }
  } catch (error) {
    console.error(error)
    await cleanupTempFiles(files)
    throw error
  }
}
