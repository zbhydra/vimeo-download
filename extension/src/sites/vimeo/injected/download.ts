/**
 * Vimeo injected 下载服务。
 *
 * 这里只处理必须依赖页面内存的 DASH/HLS：下载 init+segments 后用 Mediabunny remux。
 * Progressive/Thumbnail 完整文件 URL 在 content 分流后交给 Chrome 下载管理器。
 */

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import { reportDownloadProgress } from '@/core/downloadProgress'
import { assertDownloadContentType } from '@/core/injected/downloadValidation'
import { readResponseArrayBufferByChunk } from '@/core/injected/responseBody'
import type { IMediaSource } from '@/core/protocol/injected'
import type { JsonValue } from '@/core/rpc/types'
import type { MediaResource } from '@/core/types'
import { logger } from '@/core/utils/logger'
import { refreshVimeoResourcesFromConfigUrl } from '@/sites/vimeo/config'
import {
  estimateDashTrackBytes,
  findDashTrack,
  parseVimeoDashPlaylist,
  parseVimeoHlsMediaPlaylist,
  parseVimeoHlsMasterPlaylist,
  resolveDashSegmentUrl,
  type VimeoDashPlaylist,
  type VimeoDashTrack,
  type VimeoHlsMediaPlaylist
} from '@/sites/vimeo/media'
import { vimeoConfig } from '@/sites/vimeo/runtimeConfig'
import {
  decodeVimeoSourceDescriptor,
  encodeVimeoSourceDescriptor,
  isVimeoMediaCdnUrl,
  parseVimeoTimeRange,
  stripVimeoClipSuffix,
  type VimeoSourceDescriptor,
  type VimeoTimeRange
} from '@/sites/vimeo/shared'
import { muxVimeoVideoToMp4, remuxVimeoAudioToM4a, remuxVimeoMuxedMp4ToMp4 } from './mux'

const RETRYABLE_STATUS_CODES = new Set([403, 404, 410])
const VALID_MEDIA_STATUS_CODES = new Set([200, 206])

/** Vimeo 下载可刷新错误。 */
class VimeoRetryableDownloadError extends Error {
  /** HTTP 状态码。 */
  readonly status: number

  constructor(message: string, status: number) {
    super(`[VimeoDownloadService] ${message}, status=${status}`)
    this.name = 'VimeoRetryableDownloadError'
    this.status = status
  }
}

/** 刷新 config 后恢复出的下载源。 */
interface VimeoResolvedSource {
  /** 当前 source，包含刷新后的 URL/filename/documentId。 */
  source: IMediaSource
  /** 当前 descriptor。 */
  descriptor: VimeoSourceDescriptor
  /** 刷新 config 时已经解析出的 DASH playlist，避免恢复下载后重复拉取。 */
  dashPlaylist?: VimeoDashPlaylist
  /** 刷新 config 时已经解析出的 HLS media playlist。 */
  hlsMediaPlaylist?: VimeoHlsMediaPlaylist
}

/** 下载中累计字节预算。 */
interface VimeoByteBudget {
  /** 当前页面下载管理器分配的唯一任务 ID。 */
  taskId: string
  /** 当前资源 ID。 */
  mediaId: string
  /** 当前累计字节。 */
  bytes: number
  /** DASH playlist 已知的整份媒体总字节；HLS 等未知大小不设置。 */
  totalBytes?: number
  /** 上一次已发送的整数进度，避免同一百分比重复派发。 */
  lastReportedProgress: number | null
}

/** Vimeo 本地下载服务。 */
export class VimeoDownloadService {
  /** 下载单个媒体。 */
  async handleSingleDownload(taskId: string, source: IMediaSource): Promise<void> {
    const descriptor = this.requireDescriptor(source)
    logger.info(`[VimeoDownloadService] 开始下载: ${source.id}`)
    reportProgress(taskId, source.id, null)

    await this.downloadWithOneRefresh(taskId, source, descriptor)
    logger.info(`[VimeoDownloadService] 下载完成: ${source.id}`)
  }

  /** 根据 descriptor 分发下载，并允许 signed URL 过期后刷新一次。 */
  private async downloadWithOneRefresh(
    taskId: string,
    source: IMediaSource,
    descriptor: VimeoSourceDescriptor
  ): Promise<void> {
    try {
      await this.dispatchDownload(taskId, source, descriptor)
    } catch (error) {
      if (!(error instanceof VimeoRetryableDownloadError)) {
        throw error
      }

      console.error(error)
      reportProgress(taskId, source.id, null)
      const fresh = await this.resolveFreshSource(source, descriptor)
      await this.dispatchDownload(
        taskId,
        fresh.source,
        fresh.descriptor,
        fresh.dashPlaylist,
        fresh.hlsMediaPlaylist
      )
    }
  }

  /** 下载分发。 */
  private async dispatchDownload(
    taskId: string,
    source: IMediaSource,
    descriptor: VimeoSourceDescriptor,
    dashPlaylist?: VimeoDashPlaylist,
    hlsMediaPlaylist?: VimeoHlsMediaPlaylist
  ): Promise<void> {
    this.assertSourceDescriptorMatch(source, descriptor)

    if (descriptor.delivery === 'dash' && descriptor.kind === 'audio') {
      await this.downloadDashAudio(taskId, source, descriptor, dashPlaylist)
      return
    }

    if (descriptor.delivery === 'dash' && descriptor.kind === 'video') {
      await this.downloadDashVideo(taskId, source, descriptor, dashPlaylist)
      return
    }

    if (descriptor.delivery === 'hls' && descriptor.kind === 'video') {
      await this.downloadHlsVideo(taskId, source, descriptor, hlsMediaPlaylist)
      return
    }

    throw new Error(
      `[VimeoDownloadService] 不支持的 Vimeo 下载类型: id=${source.id}, delivery=${descriptor.delivery}, kind=${descriptor.kind}`
    )
  }

  /** DASH audio-only 下载。 */
  private async downloadDashAudio(
    taskId: string,
    source: IMediaSource,
    descriptor: VimeoSourceDescriptor,
    preparedPlaylist?: VimeoDashPlaylist
  ): Promise<void> {
    const { playlist, audioTrack } = await this.resolveDashAudioTrack(descriptor, preparedPlaylist)
    const totalBytes = estimateDashTrackBytes(audioTrack)
    this.assertKnownMuxSize(source.id, totalBytes, 'DASH audio')
    const budget = createByteBudget(taskId, source.id, totalBytes)
    const audioBlob = await this.downloadDashTrackBlob(playlist, audioTrack, source.id, budget)
    const remuxed = await remuxVimeoAudioToM4a(audioBlob, readDescriptorTimeRange(descriptor))
    this.triggerBrowserDownload(
      taskId,
      remuxed,
      source.filename || `${descriptor.videoId}.m4a`,
      source.id
    )
  }

  /** DASH video mux 下载；描述符没有 audio track 时输出纯视频文件。 */
  private async downloadDashVideo(
    taskId: string,
    source: IMediaSource,
    descriptor: VimeoSourceDescriptor,
    preparedPlaylist?: VimeoDashPlaylist
  ): Promise<void> {
    const { playlist, videoTrack, audioTrack } = await this.resolveDashVideoTracks(
      descriptor,
      preparedPlaylist
    )
    const totalBytes = sumKnownSizes(
      estimateDashTrackBytes(videoTrack),
      audioTrack ? estimateDashTrackBytes(audioTrack) : 0
    )
    this.assertKnownMuxSize(source.id, totalBytes, audioTrack ? 'DASH video+audio' : 'DASH video')
    const budget = createByteBudget(taskId, source.id, totalBytes)
    const videoBlob = await this.downloadDashTrackBlob(playlist, videoTrack, source.id, budget)
    const audioBlob = audioTrack
      ? await this.downloadDashTrackBlob(playlist, audioTrack, source.id, budget)
      : null
    const muxed = await muxVimeoVideoToMp4(
      videoBlob,
      audioBlob,
      readDescriptorTimeRange(descriptor)
    )
    this.triggerBrowserDownload(
      taskId,
      muxed,
      source.filename || `${descriptor.videoId}.mp4`,
      source.id
    )
  }

  /** HLS fMP4 fallback 下载。 */
  private async downloadHlsVideo(
    taskId: string,
    source: IMediaSource,
    descriptor: VimeoSourceDescriptor,
    preparedPlaylist?: VimeoHlsMediaPlaylist
  ): Promise<void> {
    const playlist = preparedPlaylist ?? (await this.resolveHlsMediaPlaylist(descriptor))
    const budget = createByteBudget(taskId, source.id)
    const buffers: ArrayBuffer[] = []

    buffers.push(await this.fetchSegment(playlist.initSegmentUrl, source.id, budget))
    for (const segment of playlist.segments) {
      buffers.push(await this.fetchSegment(segment.url, source.id, budget))
    }

    const inputBlob = new Blob(buffers, { type: 'video/mp4' })
    const remuxed = await remuxVimeoMuxedMp4ToMp4(inputBlob, readDescriptorTimeRange(descriptor))
    this.triggerBrowserDownload(
      taskId,
      remuxed,
      source.filename || `${descriptor.videoId}.mp4`,
      source.id
    )
  }

  /** 从最新 config 恢复同一个 sourceId 的 descriptor。 */
  private async resolveFreshSource(
    source: IMediaSource,
    descriptor: VimeoSourceDescriptor
  ): Promise<VimeoResolvedSource> {
    const configUrl = descriptor.refreshConfigUrl ?? descriptor.configUrl
    const snapshot = await refreshVimeoResourcesFromConfigUrl(configUrl)
    const resource = findFreshAdaptiveResource(snapshot.resources, source, descriptor)
    if (!resource) {
      throw new Error(
        `[VimeoDownloadService] 刷新 config 后找不到同 delivery 资源: id=${source.id}, delivery=${descriptor.delivery}, configHost=${urlHostname(configUrl)}, stage=config-refresh`
      )
    }

    const resolvedDescriptor = decodeVimeoSourceDescriptor(resource.documentId)
    if (!resolvedDescriptor) {
      throw new Error(
        `[VimeoDownloadService] 刷新 config 后资源缺少 descriptor: id=${source.id}, configHost=${urlHostname(configUrl)}, stage=config-refresh`
      )
    }
    const freshDescriptor: VimeoSourceDescriptor = {
      ...resolvedDescriptor,
      sourceId: source.id,
      optionId: descriptor.optionId,
      label: descriptor.label,
      // 展示词条跟着用户选中的档位走，刷新后按钮标签不能退回英文技术文本。
      ...(descriptor.labelKey ? { labelKey: descriptor.labelKey } : {}),
      ...(descriptor.labelParams ? { labelParams: descriptor.labelParams } : {}),
      // 刷新只换 signed URL：片段区间是用户选择，必须原样带过去。
      ...(readDescriptorTimeRange(descriptor) ?? {})
    }
    // 无音轨交付是用户选择，而新快照只描述全片选项；刷新不能让选中的纯视频重新带上音频。
    if (!descriptor.audioTrackId) {
      delete freshDescriptor.audioTrackId
    }

    return {
      source: {
        ...source,
        url: resource.url,
        type: resource.type,
        sourceKind: resource.sourceKind,
        filename: source.filename ?? resource.filename,
        mimeType: resource.mimeType ?? source.mimeType,
        size: resource.size ?? source.size,
        documentId: encodeVimeoSourceDescriptor(freshDescriptor)
      },
      descriptor: freshDescriptor,
      dashPlaylist:
        freshDescriptor.delivery === 'dash' ? (snapshot.dashPlaylist ?? undefined) : undefined,
      hlsMediaPlaylist:
        freshDescriptor.delivery === 'hls'
          ? snapshot.hlsMediaPlaylists.find(
              playlist => playlist.playlistUrl === freshDescriptor.hlsPlaylistUrl
            )
          : undefined
    }
  }

  /** 解析 DASH audio track。 */
  private async resolveDashAudioTrack(
    descriptor: VimeoSourceDescriptor,
    preparedPlaylist?: VimeoDashPlaylist
  ): Promise<{
    playlist: VimeoDashPlaylist
    audioTrack: VimeoDashTrack
  }> {
    const playlist = preparedPlaylist ?? (await this.loadDashPlaylist(descriptor))
    const audioTrack = findDashTrack(playlist.audioTracks, descriptor.audioTrackId)
    if (!audioTrack) {
      throw new Error(
        `[VimeoDownloadService] DASH audio track 不存在: videoId=${descriptor.videoId}, audioTrackId=${descriptor.audioTrackId}`
      )
    }

    return { playlist, audioTrack }
  }

  /** 解析 DASH video track；描述符带 audio track 时一并解析。 */
  private async resolveDashVideoTracks(
    descriptor: VimeoSourceDescriptor,
    preparedPlaylist?: VimeoDashPlaylist
  ): Promise<{
    playlist: VimeoDashPlaylist
    videoTrack: VimeoDashTrack
    audioTrack: VimeoDashTrack | null
  }> {
    const playlist = preparedPlaylist ?? (await this.loadDashPlaylist(descriptor))
    const videoTrack = findDashTrack(playlist.videoTracks, descriptor.videoTrackId)
    if (!videoTrack) {
      throw new Error(
        `[VimeoDownloadService] DASH video track 不存在: videoId=${descriptor.videoId}, videoTrackId=${descriptor.videoTrackId}`
      )
    }

    if (!descriptor.audioTrackId) {
      return { playlist, videoTrack, audioTrack: null }
    }

    const audioTrack = findDashTrack(playlist.audioTracks, descriptor.audioTrackId)
    if (!audioTrack) {
      throw new Error(
        `[VimeoDownloadService] DASH audio track 不存在: videoId=${descriptor.videoId}, audioTrackId=${descriptor.audioTrackId}`
      )
    }

    return { playlist, videoTrack, audioTrack }
  }

  /** 直接读取描述符中的 DASH playlist，过期时交给外层刷新一次 config。 */
  private async loadDashPlaylist(descriptor: VimeoSourceDescriptor): Promise<VimeoDashPlaylist> {
    const playlistUrl = descriptor.dashPlaylistUrl
    if (!playlistUrl) {
      throw new Error(
        `[VimeoDownloadService] DASH 描述符缺少 playlist URL: videoId=${descriptor.videoId}, sourceId=${descriptor.sourceId}, stage=dash-resolve`
      )
    }

    this.assertMediaUrl(playlistUrl, descriptor.sourceId)
    const response = await fetch(playlistUrl, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    })
    this.assertMediaUrl(response.url || playlistUrl, descriptor.sourceId)

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new VimeoRetryableDownloadError(
        `DASH playlist 已过期: id=${descriptor.sourceId}, host=${urlHostname(response.url || playlistUrl)}, stage=response`,
        response.status
      )
    }

    if (!response.ok) {
      throw new Error(
        `[VimeoDownloadService] DASH playlist fetch 失败: id=${descriptor.sourceId}, host=${urlHostname(response.url || playlistUrl)}, stage=response, status=${response.status}`
      )
    }

    assertDownloadContentType(
      response.headers.get('Content-Type'),
      'json',
      `Vimeo DASH playlist ${descriptor.sourceId}`
    )
    const playlistJson = (await response.json()) as JsonValue
    return parseVimeoDashPlaylist(playlistJson, response.url || playlistUrl)
  }

  /** 从 descriptor/config 恢复 HLS fMP4 media playlist。 */
  private async resolveHlsMediaPlaylist(
    descriptor: VimeoSourceDescriptor
  ): Promise<VimeoHlsMediaPlaylist> {
    const playlistUrl = descriptor.hlsPlaylistUrl
    if (!playlistUrl) {
      throw new Error(
        `[VimeoDownloadService] HLS 描述符缺少 playlist URL: videoId=${descriptor.videoId}, sourceId=${descriptor.sourceId}, stage=hls-resolve`
      )
    }

    const playlist = await this.loadHlsMediaPlaylist(playlistUrl)
    if (playlist) {
      return playlist
    }

    throw new Error(
      `[VimeoDownloadService] HLS fMP4 playlist 不满足安全结构: videoId=${descriptor.videoId}, optionId=${descriptor.optionId}, playlistHost=${urlHostname(playlistUrl)}, stage=hls-resolve`
    )
  }

  /** 拉取并验证 HLS media playlist。 */
  private async loadHlsMediaPlaylist(playlistUrl: string): Promise<VimeoHlsMediaPlaylist | null> {
    this.assertMediaUrl(playlistUrl, 'hls-playlist')
    const response = await fetch(playlistUrl, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    })
    this.assertMediaUrl(response.url || playlistUrl, 'hls-playlist')

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new VimeoRetryableDownloadError(
        `HLS media playlist 已过期: host=${urlHostname(response.url || playlistUrl)}, stage=response`,
        response.status
      )
    }

    if (!VALID_MEDIA_STATUS_CODES.has(response.status)) {
      throw new Error(
        `[VimeoDownloadService] HLS media playlist fetch 失败: host=${urlHostname(response.url || playlistUrl)}, stage=response, status=${response.status}`
      )
    }

    assertDownloadContentType(
      response.headers.get('Content-Type'),
      'hls-playlist',
      `Vimeo HLS media playlist host=${urlHostname(response.url || playlistUrl)}`
    )
    const text = await response.text()
    const masterText = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1x1,CODECS="avc1.64001f,mp4a.40.2"',
      playlistUrl
    ].join('\n')
    const variant = parseVimeoHlsMasterPlaylist(masterText, playlistUrl)[0]
    return variant ? parseVimeoHlsMediaPlaylist(text, response.url || playlistUrl, variant) : null
  }

  /** 下载单条 DASH track 的 init+segments。 */
  private async downloadDashTrackBlob(
    playlist: VimeoDashPlaylist,
    track: VimeoDashTrack,
    mediaId: string,
    budget: VimeoByteBudget
  ): Promise<Blob> {
    const initBuffer = decodeBase64ToArrayBuffer(track.initSegment)
    this.addBytesToBudget(budget, initBuffer.byteLength, 'DASH init segment')
    const buffers: ArrayBuffer[] = [initBuffer]
    for (const segment of track.segments) {
      const segmentUrl = resolveDashSegmentUrl(playlist, track, segment)
      buffers.push(await this.fetchSegment(segmentUrl, mediaId, budget))
    }

    return new Blob(buffers, { type: track.mimeType })
  }

  /** 下载 DASH segment。 */
  private async fetchSegment(
    url: string,
    mediaId: string,
    budget: VimeoByteBudget
  ): Promise<ArrayBuffer> {
    this.assertMediaUrl(url, mediaId)
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    })
    this.assertMediaUrl(response.url || url, mediaId)

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new VimeoRetryableDownloadError(
        `Vimeo segment 已过期: id=${mediaId}, host=${urlHostname(response.url || url)}, stage=response`,
        response.status
      )
    }

    if (!VALID_MEDIA_STATUS_CODES.has(response.status)) {
      throw new Error(
        `[VimeoDownloadService] Vimeo segment fetch 失败: id=${mediaId}, host=${urlHostname(response.url || url)}, stage=response, status=${response.status}`
      )
    }

    assertDownloadContentType(
      response.headers.get('Content-Type'),
      'media-segment',
      `Vimeo segment ${mediaId}`
    )
    return readResponseArrayBufferByChunk(response, byteLength => {
      this.addBytesToBudget(budget, byteLength, 'segment')
    })
  }

  /** 已知 size 超过上限时提前拒绝。 */
  private assertKnownMuxSize(mediaId: string, knownBytes: number | undefined, stage: string): void {
    if (knownBytes !== undefined && knownBytes > vimeoConfig.muxMaxBytes) {
      throw new Error(
        `[VimeoDownloadService] ${stage} 已知大小超过前端 mux 上限: id=${mediaId}, bytes=${knownBytes}, limit=${vimeoConfig.muxMaxBytes}`
      )
    }
  }

  /** 累计下载字节，未知 size 资源超过上限时中断。 */
  private addBytesToBudget(budget: VimeoByteBudget, bytes: number, stage: string): void {
    budget.bytes += bytes
    if (budget.bytes > vimeoConfig.muxMaxBytes) {
      throw new Error(
        `[VimeoDownloadService] 前端 mux 累计字节超过上限: id=${budget.mediaId}, stage=${stage}, bytes=${budget.bytes}, limit=${vimeoConfig.muxMaxBytes}`
      )
    }

    if (budget.totalBytes === undefined) {
      return
    }

    const progress = Math.min(99, Math.floor((budget.bytes / budget.totalBytes) * 100))
    if (progress !== budget.lastReportedProgress) {
      reportProgress(budget.taskId, budget.mediaId, progress)
      budget.lastReportedProgress = progress
    }
  }

  /** 读取并校验 descriptor。 */
  private requireDescriptor(source: IMediaSource): VimeoSourceDescriptor {
    const descriptor = decodeVimeoSourceDescriptor(source.documentId)
    if (!descriptor) {
      throw new Error(`[VimeoDownloadService] Vimeo source 缺少 documentId 描述符: id=${source.id}`)
    }

    return descriptor
  }

  /** EventRpc 输入必须与 descriptor 声明的同一个下载选项完全一致。 */
  private assertSourceDescriptorMatch(
    source: IMediaSource,
    descriptor: VimeoSourceDescriptor
  ): void {
    if (descriptor.sourceId !== source.id) {
      throw new Error(
        `[VimeoDownloadService] source.id 与 descriptor.sourceId 不一致: id=${source.id}, descriptorSourceId=${descriptor.sourceId}`
      )
    }

    const matches =
      (source.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO &&
        source.type === RESOURCE_TYPES.VIDEO &&
        descriptor.delivery === 'dash' &&
        descriptor.kind === 'video') ||
      (source.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO &&
        source.type === RESOURCE_TYPES.VIDEO &&
        descriptor.delivery === 'hls' &&
        descriptor.kind === 'video') ||
      (source.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO &&
        source.type === RESOURCE_TYPES.AUDIO &&
        descriptor.delivery === 'dash' &&
        descriptor.kind === 'audio')

    if (!matches) {
      throw new Error(
        `[VimeoDownloadService] sourceKind/type 与 descriptor 不匹配: id=${source.id}, sourceKind=${source.sourceKind ?? 'missing'}, type=${source.type}, delivery=${descriptor.delivery}, kind=${descriptor.kind}`
      )
    }
  }

  /** 媒体 URL 白名单校验。 */
  private assertMediaUrl(url: string, mediaId: string): void {
    if (!isVimeoMediaCdnUrl(url)) {
      throw new Error(
        `[VimeoDownloadService] URL 不在 Vimeo CDN 白名单: id=${mediaId}, host=${urlHostname(url)}, stage=validate`
      )
    }
  }

  /** 用临时 Blob URL 触发浏览器保存。 */
  private triggerBrowserDownload(
    taskId: string,
    blob: Blob,
    filename: string,
    sourceId: string
  ): void {
    const blobUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    try {
      document.body.appendChild(anchor)
      anchor.href = blobUrl
      anchor.download = filename
      anchor.click()
      reportProgress(taskId, sourceId, 100)
    } finally {
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    }
  }
}

/**
 * 刷新后只恢复当前 injected 任务原有的 adaptive delivery。
 *
 * `Best` 的稳定 source ID 可能因最新 config 的画质排序从 DASH/HLS 变成 Progressive；
 * 当前 EventRpc 无法在执行中切换到 Chrome API，因此优先恢复同 track，找不到时使用
 * 同 delivery 的最新最高选项，并继续沿用原按钮 ID 上报进度。
 */
function findFreshAdaptiveResource(
  resources: readonly MediaResource[],
  source: IMediaSource,
  descriptor: VimeoSourceDescriptor
): MediaResource | null {
  const candidates = resources.filter(resource => {
    const freshDescriptor = decodeVimeoSourceDescriptor(resource.documentId)
    return (
      resource.sourceKind === source.sourceKind &&
      freshDescriptor?.delivery === descriptor.delivery &&
      freshDescriptor.kind === descriptor.kind
    )
  })
  // 片段 ID 带区间后缀，而新快照永远只有全片选项，因此按去掉后缀的同一个画质定位。
  const baseSourceId = stripVimeoClipSuffix(source.id)
  const exact = candidates.find(resource => resource.id === baseSourceId)
  if (exact) {
    return exact
  }

  if (descriptor.optionId !== 'best' && descriptor.optionId !== 'best-audio') {
    return null
  }

  const sameTracks = candidates.find(resource => {
    const freshDescriptor = decodeVimeoSourceDescriptor(resource.documentId)
    return (
      freshDescriptor !== null &&
      (!descriptor.videoTrackId || freshDescriptor.videoTrackId === descriptor.videoTrackId) &&
      (!descriptor.audioTrackId || freshDescriptor.audioTrackId === descriptor.audioTrackId)
    )
  })
  return sameTracks ?? candidates[0] ?? null
}

/** 读取描述符中的片段区间；未裁剪时返回 undefined。 */
function readDescriptorTimeRange(descriptor: VimeoSourceDescriptor): VimeoTimeRange | undefined {
  return parseVimeoTimeRange(descriptor) ?? undefined
}

/** base64 init_segment 转 ArrayBuffer。 */
function decodeBase64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

/** 创建 mux 字节预算。 */
function createByteBudget(taskId: string, mediaId: string, totalBytes?: number): VimeoByteBudget {
  const budget: VimeoByteBudget = {
    taskId,
    mediaId,
    bytes: 0,
    totalBytes,
    lastReportedProgress: null
  }

  if (totalBytes !== undefined) {
    reportProgress(taskId, mediaId, 0)
    budget.lastReportedProgress = 0
  }

  return budget
}

/** 保持 Vimeo 既有仅百分比进度行为。 */
function reportProgress(taskId: string, sourceId: string, progress: number | null): void {
  reportDownloadProgress({
    taskId,
    sourceId,
    progress,
    receivedBytes: null,
    totalBytes: null,
    bytesAreEstimated: false
  })
}

/** 只保留日志定位需要的 host，不输出 signed path/query。 */
function urlHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch (_error) {
    return 'invalid'
  }
}

/** 两个可选 size 都已知时返回总 size。 */
function sumKnownSizes(left: number | undefined, right: number | undefined): number | undefined {
  return left !== undefined && right !== undefined ? left + right : undefined
}

/** Vimeo 下载服务单例。 */
export const vimeoDownloadService = new VimeoDownloadService()
