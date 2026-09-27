/**
 * offscreen DASH/HLS 下载执行器。
 *
 * 分片 fetch + Mediabunny remux 在 offscreen document 执行（U8 前在 Vimeo 页面 MAIN world，
 * 该 injected 下载链已退役），任务由 background DownloadOrchestrator 经 RPC 驱动，因此切换
 * 视频/刷新/关闭 Vimeo 页面不再中断下载。与旧页面内实现的差异：
 *
 * - 进度经 background 通道回传（下载中 250ms 节流），不再派发页面 DOM 事件；
 * - 合成产物流式写入 OPFS（避免整份驻留内存），以 File 引用创建 blob URL 交 background
 *   落盘（chrome.downloads），落盘回执由 downloads.onChanged 确认后再 revoke 并删除临时文件；
 * - 签名 URL 失效不再直接刷新页面 config，而是请求 background 重签，并按 track 一致性
 *   守卫续跑（分片游标按索引续）或以新快照整任务重跑；
 * - 任务全程持有 AbortController，下载阶段取消即时生效；remux 阶段的取消在交付边界生效。
 */

import { readResponseArrayBufferByChunk } from '@/core/injected/responseBody'
import { assertDownloadContentType } from '@/core/injected/downloadValidation'
import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import { BackgroundChannel } from '@/offscreen/rpc/background.rpc'
import type { MediaResource } from '@/core/types'
import type { JsonValue } from '@/core/rpc/types'
import { logger } from '@/core/utils/logger'
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
  isVimeoMediaCdnUrl,
  parseVimeoTimeRange,
  type VimeoSourceDescriptor,
  type VimeoTimeRange
} from '@/sites/vimeo/shared'
import { muxVimeoVideoToMp4, remuxVimeoAudioToM4a, remuxVimeoMuxedMp4ToMp4 } from './mux'
import type { MuxOutputArtifact } from './muxArtifactStore'
import { removeMuxArtifact, sweepMuxArtifacts } from './muxArtifactStore'

const RETRYABLE_STATUS_CODES = new Set([403, 404, 410])
const VALID_MEDIA_STATUS_CODES = new Set([200, 206])

/** 下载中进度回传节流间隔；终态与首次报告不受节流约束。 */
const PROGRESS_THROTTLE_MS = 250

/**
 * taskComplete 交付调用的独立超时（默认 30s 不够）。
 *
 * background 在应答前要等 downloads.onChanged 落盘回执：超大产物（数百 MB）在慢盘上落盘
 * 可能远超默认 RPC 超时，误判失败会让执行侧撤销登记并 revoke 正在落盘的 blob，直接中断下载。
 */
const TASK_COMPLETE_TIMEOUT_MS = 120_000

/** 任务执行期间向 background 发送保活心跳的间隔。 */
const HEARTBEAT_INTERVAL_MS = 20_000

/** Vimeo 下载可重签错误：签名过期（403）或资源下线（404/410）。 */
class VimeoRetryableDownloadError extends Error {
  /** HTTP 状态码。 */
  readonly status: number

  constructor(message: string, status: number) {
    super(`[OffscreenTaskRunner] ${message}, status=${status}`)
    this.name = 'VimeoRetryableDownloadError'
    this.status = status
  }
}

/** 任务已被取消；用于从分片/remux 路径中短路退出。 */
class TaskCancelledError extends Error {
  readonly taskId: string

  constructor(taskId: string) {
    super(`[OffscreenTaskRunner] 任务已取消: taskId=${taskId}`)
    this.name = 'TaskCancelledError'
    this.taskId = taskId
  }
}

/**
 * 重签后 track 不一致的整任务重跑信号。
 *
 * best 回落换 track 时无法按游标续跑，由 dispatch 外层捕获并以新快照从头执行，与既有
 * 「刷新后按同 delivery 最新最高选项重下」的行为一致。
 */
class RestartTaskError extends Error {
  readonly resource: MediaResource
  readonly descriptor: VimeoSourceDescriptor

  constructor(resource: MediaResource, descriptor: VimeoSourceDescriptor) {
    super(`[OffscreenTaskRunner] 重签后 track 不一致，整任务重跑: resourceId=${resource.id}`)
    this.name = 'RestartTaskError'
    this.resource = resource
    this.descriptor = descriptor
  }
}

/** 单个任务在 offscreen 内的执行状态。 */
interface RunnerTask {
  /** 编排器分配的全局唯一任务 ID。 */
  taskId: string
  /** 当前执行使用的完整资源；整任务重跑时被新快照替换。 */
  resource: MediaResource
  /** 与 resource.documentId 对应的下载描述符。 */
  descriptor: VimeoSourceDescriptor
  /** 取消控制器；abort 即中止所有在途分片 fetch。 */
  controller: AbortController
  /** 取消已受理；runTask 据此把各类异常收敛为 taskCancelled。 */
  cancelRequested: boolean
  /** 每任务只允许一次签名重签；重签后的再次 403 直接失败，与旧「只刷新一次」语义一致。 */
  refreshUsed: boolean
  /** 最近回传的百分比。 */
  progress: number | null
  /** 最近回传的累计字节。 */
  receivedBytes: number | null
  /** 估算总字节。 */
  totalBytes: number | null
  /** 上一次进度回传时间戳。 */
  lastProgressSentAt: number
}

/** 下载中累计字节预算。 */
interface ByteBudget {
  /** 当前累计字节。 */
  bytes: number
  /** DASH playlist 已知的整份媒体总字节；HLS 等未知大小不设置。 */
  totalBytes?: number
  /** 上一次已发送的整数进度，避免同一百分比重复派发。 */
  lastReportedProgress: number | null
}

/** 已交付、等待 background 落盘回执后释放的产物。 */
interface DeliveredArtifact {
  /** 产物 blob URL；release 时 revoke。 */
  blobUrl: string
  /** 产物所在的 OPFS 临时文件名；release 时删除。 */
  tempFileName: string
}

/** offscreen 下载任务执行器。 */
export class OffscreenTaskRunner {
  /** background 通道客户端；进度/交付/取消/重签/心跳都走这里。 */
  private readonly client = new BackgroundChannel()

  /** 执行中的任务表。 */
  private readonly tasks = new Map<string, RunnerTask>()

  /** 已交付、等待 background 确认落盘后释放的产物。 */
  private readonly deliveredArtifacts = new Map<string, DeliveredArtifact>()

  constructor() {
    // 启动清扫：清掉上次会话泄漏在 OPFS 的未交付产物（崩溃、浏览器异常退出等场景）。
    void sweepMuxArtifacts()
  }

  /** 保活心跳定时器；仅在存在执行中任务时保持。 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  /** 启动一个下载任务；重复 ID 幂等忽略。 */
  startTask(taskId: string, resource: MediaResource): boolean {
    if (this.tasks.has(taskId) || this.deliveredArtifacts.has(taskId)) {
      logger.warn(`[OffscreenTaskRunner] 任务已在执行，忽略重复启动: taskId=${taskId}`)
      return false
    }

    const descriptor = decodeVimeoSourceDescriptor(resource.documentId)
    if (!descriptor) {
      throw new Error(
        `[OffscreenTaskRunner] 任务缺少 Vimeo 下载描述符: taskId=${taskId}, resourceId=${resource.id}, sourceKind=${resource.sourceKind}`
      )
    }

    const task: RunnerTask = {
      taskId,
      resource,
      descriptor,
      controller: new AbortController(),
      cancelRequested: false,
      refreshUsed: false,
      progress: null,
      receivedBytes: null,
      totalBytes: null,
      lastProgressSentAt: 0
    }
    this.tasks.set(taskId, task)
    this.ensureHeartbeat()
    void this.runTask(task)
    return true
  }

  /** 请求取消任务；下载阶段即时生效，remux 阶段在交付边界生效。 */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) {
      return false
    }

    task.cancelRequested = true
    task.controller.abort()
    return true
  }

  /** 执行中任务清单；SW 冷启动对账以它为真相源。 */
  listActiveTasks(): Array<{
    taskId: string
    resourceId: string
    progress: number | null
    receivedBytes: number | null
    totalBytes: number | null
    resource: MediaResource
  }> {
    return Array.from(this.tasks.values()).map(task => ({
      taskId: task.taskId,
      resourceId: task.resource.id,
      progress: task.progress,
      receivedBytes: task.receivedBytes,
      totalBytes: task.totalBytes,
      resource: task.resource
    }))
  }

  /** 释放 background 已确认落盘的产物：revoke blob URL 并删除 OPFS 临时文件。 */
  releaseTaskArtifact(taskId: string, blobUrl: string): boolean {
    const held = this.deliveredArtifacts.get(taskId)
    if (held === undefined || held.blobUrl !== blobUrl) {
      logger.warn(
        `[OffscreenTaskRunner] 释放请求与持有产物不匹配: taskId=${taskId}, held=${held ? 'present' : 'missing'}`
      )
      return false
    }

    this.deliveredArtifacts.delete(taskId)
    URL.revokeObjectURL(blobUrl)
    // 走到这里落盘已被 downloads.onChanged 确认，OPFS 临时文件可以安全删除；
    // 删除是尽力而为，失败由下次启动清扫兜底。
    void removeMuxArtifact(held.tempFileName)
    return true
  }

  /** 任务主流程：整任务重跑只允许一次，最终状态经 background 通道回传。 */
  private async runTask(task: RunnerTask): Promise<void> {
    let restarts = 0
    try {
      while (true) {
        try {
          await this.dispatchDownload(task)
          return
        } catch (error) {
          if (error instanceof RestartTaskError && restarts === 0) {
            restarts += 1
            logger.error(
              `[OffscreenTaskRunner] ${error.message}: taskId=${task.taskId}, 新trackId=${error.descriptor.videoTrackId ?? 'none'}/${error.descriptor.audioTrackId ?? 'none'}`,
              error
            )
            task.resource = error.resource
            task.descriptor = error.descriptor
            continue
          }
          throw error
        }
      }
    } catch (error) {
      this.tasks.delete(task.taskId)
      this.syncHeartbeat()

      if (task.cancelRequested || error instanceof TaskCancelledError) {
        logger.info(
          `[OffscreenTaskRunner] 任务已取消: taskId=${task.taskId}, resourceId=${task.resource.id}`
        )
        this.sendTaskCancelled(task)
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      logger.error(
        `[OffscreenTaskRunner] 下载任务失败: taskId=${task.taskId}, resourceId=${task.resource.id}, sourceKind=${task.resource.sourceKind}, stage=execute`,
        error
      )
      this.client.taskFailed({ taskId: task.taskId, message }).catch(failure => {
        logger.error(`[OffscreenTaskRunner] taskFailed 回传失败: taskId=${task.taskId}`, failure)
      })
    }
  }

  // ============================================================================
  // 下载分发（对应 injected download.ts 的 dispatch 与各分支）
  // ============================================================================

  /** 根据 descriptor 分发下载。 */
  private async dispatchDownload(task: RunnerTask): Promise<void> {
    this.assertSourceDescriptorMatch(task)
    this.sendProgress(task, null, true)

    if (task.descriptor.delivery === 'dash' && task.descriptor.kind === 'audio') {
      await this.downloadDashAudio(task)
      return
    }

    if (task.descriptor.delivery === 'dash' && task.descriptor.kind === 'video') {
      await this.downloadDashVideo(task)
      return
    }

    if (task.descriptor.delivery === 'hls' && task.descriptor.kind === 'video') {
      await this.downloadHlsVideo(task)
      return
    }

    throw new Error(
      `[OffscreenTaskRunner] 不支持的 Vimeo 下载类型: taskId=${task.taskId}, delivery=${task.descriptor.delivery}, kind=${task.descriptor.kind}`
    )
  }

  /** DASH audio-only 下载。 */
  private async downloadDashAudio(task: RunnerTask): Promise<void> {
    const playlist = await this.loadDashPlaylistWithRefresh(task)
    const audioTrack = this.requireDashTrack(task, playlist, 'audio')
    const totalBytes = estimateDashTrackBytes(audioTrack)
    this.assertKnownMuxSize(task, totalBytes, 'DASH audio')
    const budget = this.createByteBudget(task, totalBytes)
    const audioBlob = await this.downloadDashTrackBlob(task, playlist, audioTrack, 'audio', budget)
    const remuxed = await remuxVimeoAudioToM4a(
      audioBlob,
      readDescriptorTimeRange(task.descriptor),
      task.taskId
    )
    await this.deliver(task, remuxed, this.resolveArtifactFilename(task, 'm4a'))
  }

  /** DASH video mux 下载；描述符没有 audio track 时输出纯视频文件。 */
  private async downloadDashVideo(task: RunnerTask): Promise<void> {
    const playlist = await this.loadDashPlaylistWithRefresh(task)
    const videoTrack = this.requireDashTrack(task, playlist, 'video')
    const audioTrack = task.descriptor.audioTrackId
      ? this.requireDashTrack(task, playlist, 'audio')
      : null
    const totalBytes = sumKnownSizes(
      estimateDashTrackBytes(videoTrack),
      audioTrack ? estimateDashTrackBytes(audioTrack) : 0
    )
    this.assertKnownMuxSize(task, totalBytes, audioTrack ? 'DASH video+audio' : 'DASH video')
    const budget = this.createByteBudget(task, totalBytes)
    const videoBlob = await this.downloadDashTrackBlob(task, playlist, videoTrack, 'video', budget)
    const audioBlob = audioTrack
      ? await this.downloadDashTrackBlob(task, playlist, audioTrack, 'audio', budget)
      : null
    const muxed = await muxVimeoVideoToMp4(
      videoBlob,
      audioBlob,
      readDescriptorTimeRange(task.descriptor),
      task.taskId
    )
    await this.deliver(task, muxed, this.resolveArtifactFilename(task, 'mp4'))
  }

  /** HLS fMP4 fallback 下载。 */
  private async downloadHlsVideo(task: RunnerTask): Promise<void> {
    const budget = this.createByteBudget(task)
    const buffers: ArrayBuffer[] = []
    let playlist = await this.loadHlsMediaPlaylistWithRefresh(task)

    let initDone = false
    let segmentIndex = 0
    while (!initDone || segmentIndex < playlist.segments.length) {
      this.assertNotCancelled(task)
      const segmentUrl = initDone ? playlist.segments[segmentIndex].url : playlist.initSegmentUrl
      try {
        buffers.push(await this.fetchSegment(task, segmentUrl, budget))
      } catch (error) {
        const refreshed = await this.resolveRetryableRefresh(task, error)
        if (!refreshed) {
          throw error
        }
        // 按新签名 playlist 重建后原地重试同一位置。
        playlist = await this.loadHlsMediaPlaylist(refreshed)
        continue
      }
      if (initDone) {
        segmentIndex += 1
      } else {
        initDone = true
      }
    }

    const inputBlob = new Blob(buffers, { type: 'video/mp4' })
    const remuxed = await remuxVimeoMuxedMp4ToMp4(
      inputBlob,
      readDescriptorTimeRange(task.descriptor),
      task.taskId
    )
    await this.deliver(task, remuxed, this.resolveArtifactFilename(task, 'mp4'))
  }

  /** 下载单条 DASH track 的 init+segments；签名失效时重签并按索引续跑。 */
  private async downloadDashTrackBlob(
    task: RunnerTask,
    initialPlaylist: VimeoDashPlaylist,
    initialTrack: VimeoDashTrack,
    kind: 'video' | 'audio',
    budget: ByteBudget
  ): Promise<Blob> {
    let playlist = initialPlaylist
    let track = initialTrack
    const initBuffer = decodeBase64ToArrayBuffer(track.initSegment)
    this.addBytesToBudget(task, budget, initBuffer.byteLength, 'DASH init segment')
    const buffers: ArrayBuffer[] = [initBuffer]

    let segmentIndex = 0
    while (segmentIndex < track.segments.length) {
      this.assertNotCancelled(task)
      const segmentUrl = resolveDashSegmentUrl(playlist, track, track.segments[segmentIndex])
      try {
        buffers.push(await this.fetchSegment(task, segmentUrl, budget))
        segmentIndex += 1
      } catch (error) {
        const refreshed = await this.resolveRetryableRefresh(task, error)
        if (!refreshed) {
          throw error
        }
        // track 一致性守卫已在 background 通过：按新签名 playlist 重建同 track，游标不回退。
        playlist = await this.loadDashPlaylist(refreshed)
        track = this.requireDashTrack(task, playlist, kind)
      }
    }

    return new Blob(buffers, { type: track.mimeType })
  }

  // ============================================================================
  // playlist 加载与重签
  // ============================================================================

  /** 加载 DASH playlist；签名过期时重签一次。 */
  private async loadDashPlaylistWithRefresh(task: RunnerTask): Promise<VimeoDashPlaylist> {
    try {
      return await this.loadDashPlaylist(task.descriptor)
    } catch (error) {
      const refreshed = await this.resolveRetryableRefresh(task, error)
      if (!refreshed) {
        throw error
      }
      return this.loadDashPlaylist(refreshed)
    }
  }

  /** 从 descriptor 恢复 HLS fMP4 media playlist；签名过期时重签一次。 */
  private async loadHlsMediaPlaylistWithRefresh(task: RunnerTask): Promise<VimeoHlsMediaPlaylist> {
    try {
      return await this.loadHlsMediaPlaylist(task.descriptor)
    } catch (error) {
      const refreshed = await this.resolveRetryableRefresh(task, error)
      if (!refreshed) {
        throw error
      }
      return this.loadHlsMediaPlaylist(refreshed)
    }
  }

  /** 直接读取描述符中的 DASH playlist，过期时抛可重签错误。 */
  private async loadDashPlaylist(descriptor: VimeoSourceDescriptor): Promise<VimeoDashPlaylist> {
    const playlistUrl = descriptor.dashPlaylistUrl
    if (!playlistUrl) {
      throw new Error(
        `[OffscreenTaskRunner] DASH 描述符缺少 playlist URL: videoId=${descriptor.videoId}, sourceId=${descriptor.sourceId}, stage=dash-resolve`
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
        `[OffscreenTaskRunner] DASH playlist fetch 失败: id=${descriptor.sourceId}, host=${urlHostname(response.url || playlistUrl)}, stage=response, status=${response.status}`
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

  /** 拉取并验证 HLS media playlist，不满足安全结构时抛错。 */
  private async loadHlsMediaPlaylist(
    descriptor: VimeoSourceDescriptor
  ): Promise<VimeoHlsMediaPlaylist> {
    const playlistUrl = descriptor.hlsPlaylistUrl
    if (!playlistUrl) {
      throw new Error(
        `[OffscreenTaskRunner] HLS 描述符缺少 playlist URL: videoId=${descriptor.videoId}, sourceId=${descriptor.sourceId}, stage=hls-resolve`
      )
    }

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
        `[OffscreenTaskRunner] HLS media playlist fetch 失败: host=${urlHostname(response.url || playlistUrl)}, stage=response, status=${response.status}`
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
    const playlist = variant
      ? parseVimeoHlsMediaPlaylist(text, response.url || playlistUrl, variant)
      : null
    if (!playlist) {
      throw new Error(
        `[OffscreenTaskRunner] HLS fMP4 playlist 不满足安全结构: videoId=${descriptor.videoId}, optionId=${descriptor.optionId}, playlistHost=${urlHostname(playlistUrl)}, stage=hls-resolve`
      )
    }
    return playlist
  }

  /**
   * 判断分片/playlist 错误是否可重签。
   *
   * 可重签时请求 background 重签：track 一致返回新签名描述符（续跑）；不一致时 background
   * 直接给出新快照并由 RestartTaskError 触发整任务重跑；重签名额已用或错误不可重签返回 null。
   */
  private async resolveRetryableRefresh(
    task: RunnerTask,
    error: unknown
  ): Promise<VimeoSourceDescriptor | null> {
    if (!(error instanceof VimeoRetryableDownloadError) || task.refreshUsed) {
      return null
    }

    task.refreshUsed = true
    logger.error(
      `[OffscreenTaskRunner] 签名失效，请求 background 重签: taskId=${task.taskId}, resourceId=${task.resource.id}, status=${error.status}`,
      error
    )
    const response = await this.client.refreshSignatureRequest({
      taskId: task.taskId,
      descriptor: task.descriptor
    })
    const descriptor = decodeVimeoSourceDescriptor(response.resource.documentId)
    if (!descriptor) {
      throw new Error(
        `[OffscreenTaskRunner] 重签响应缺少下载描述符: taskId=${task.taskId}, resourceId=${response.resource.id}, stage=refresh`
      )
    }

    if (response.mode === 'restart') {
      throw new RestartTaskError(response.resource, descriptor)
    }

    // 续跑也同步更新任务资源，让最终交付的 filename/size 与新签名快照一致。
    task.resource = response.resource
    task.descriptor = descriptor
    return descriptor
  }

  // ============================================================================
  // 分片 fetch / 预算 / 交付
  // ============================================================================

  /** 下载单个媒体分片。 */
  private async fetchSegment(
    task: RunnerTask,
    url: string,
    budget: ByteBudget
  ): Promise<ArrayBuffer> {
    this.assertMediaUrl(url, task.resource.id)
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: task.controller.signal
    })
    this.assertMediaUrl(response.url || url, task.resource.id)

    if (task.cancelRequested) {
      throw new TaskCancelledError(task.taskId)
    }

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new VimeoRetryableDownloadError(
        `Vimeo segment 已过期: id=${task.resource.id}, host=${urlHostname(response.url || url)}, stage=response`,
        response.status
      )
    }

    if (!VALID_MEDIA_STATUS_CODES.has(response.status)) {
      throw new Error(
        `[OffscreenTaskRunner] Vimeo segment fetch 失败: id=${task.resource.id}, host=${urlHostname(response.url || url)}, stage=response, status=${response.status}`
      )
    }

    assertDownloadContentType(
      response.headers.get('Content-Type'),
      'media-segment',
      `Vimeo segment ${task.resource.id}`
    )
    return readResponseArrayBufferByChunk(response, byteLength => {
      this.addBytesToBudget(task, budget, byteLength, 'segment')
    })
  }

  /** 已知 size 超过上限时提前拒绝。 */
  private assertKnownMuxSize(
    task: RunnerTask,
    knownBytes: number | undefined,
    stage: string
  ): void {
    if (knownBytes !== undefined && knownBytes > vimeoConfig.muxMaxBytes) {
      throw new Error(
        `[OffscreenTaskRunner] ${stage} 已知大小超过 mux 上限: id=${task.resource.id}, bytes=${knownBytes}, limit=${vimeoConfig.muxMaxBytes}`
      )
    }
  }

  /** 累计下载字节，未知 size 资源超过上限时中断。 */
  private addBytesToBudget(
    task: RunnerTask,
    budget: ByteBudget,
    bytes: number,
    stage: string
  ): void {
    budget.bytes += bytes
    task.receivedBytes = budget.bytes
    if (budget.bytes > vimeoConfig.muxMaxBytes) {
      throw new Error(
        `[OffscreenTaskRunner] mux 累计字节超过上限: id=${task.resource.id}, stage=${stage}, bytes=${budget.bytes}, limit=${vimeoConfig.muxMaxBytes}`
      )
    }

    if (budget.totalBytes === undefined) {
      // 总大小未知时算不出百分比，仍按 250ms 节流回传字节进度，供 popup 队列展示传输量。
      this.sendProgress(task, null)
      return
    }

    task.totalBytes = budget.totalBytes
    const progress = Math.min(99, Math.floor((budget.bytes / budget.totalBytes) * 100))
    if (progress !== budget.lastReportedProgress) {
      budget.lastReportedProgress = progress
      this.sendProgress(task, progress)
    }
  }

  /** 创建 mux 字节预算。 */
  private createByteBudget(task: RunnerTask, totalBytes?: number): ByteBudget {
    const budget: ByteBudget = {
      bytes: 0,
      totalBytes,
      lastReportedProgress: null
    }

    if (totalBytes !== undefined) {
      task.totalBytes = totalBytes
      this.sendProgress(task, 0, true)
      budget.lastReportedProgress = 0
    }

    return budget
  }

  /** 交付 remux 产物：blob URL 交 background 落盘，落盘确认后由 background 通知释放。 */
  private async deliver(
    task: RunnerTask,
    artifact: MuxOutputArtifact,
    filename: string
  ): Promise<void> {
    const blobUrl = URL.createObjectURL(artifact.file)
    let handedOff = false
    try {
      this.assertNotCancelled(task)
      // 先登记后交付：background 在应答 taskComplete 之前就会（落盘回执确认后）发起
      // releaseTaskArtifact，释放请求到达时登记必须已就位，否则按 mismatch 拒绝、blob 永不 revoke。
      this.tasks.delete(task.taskId)
      this.deliveredArtifacts.set(task.taskId, {
        blobUrl,
        tempFileName: artifact.tempFileName
      })
      this.syncHeartbeat()
      // remux 完成、blob 交给 Chrome 下载后，执行侧进度已经到顶；落盘进度由 background 投影接管。
      this.sendProgress(task, 100, true)
      await this.client.taskComplete(
        {
          taskId: task.taskId,
          blobUrl,
          filename,
          mimeType: artifact.mimeType
        },
        { timeout: TASK_COMPLETE_TIMEOUT_MS }
      )
      handedOff = true
      logger.info(
        `[OffscreenTaskRunner] 产物已交付 background 落盘: taskId=${task.taskId}, resourceId=${task.resource.id}, filename=${filename}`
      )
    } finally {
      if (!handedOff) {
        // 交付失败（取消边界/RPC 失败或超时）：撤销登记并自行回收 blob 与 OPFS 临时文件，
        // 此后不再有 background 持有方。
        this.deliveredArtifacts.delete(task.taskId)
        URL.revokeObjectURL(blobUrl)
        void removeMuxArtifact(artifact.tempFileName)
      }
    }
  }

  // ============================================================================
  // 进度 / 心跳 / 校验工具
  // ============================================================================

  /** 回传进度；非强制发送按 250ms 节流。 */
  private sendProgress(task: RunnerTask, progress: number | null, force = false): void {
    task.progress = progress
    const now = Date.now()
    if (!force && now - task.lastProgressSentAt < PROGRESS_THROTTLE_MS) {
      return
    }
    task.lastProgressSentAt = now
    this.client
      .taskProgress({
        taskId: task.taskId,
        sourceId: task.resource.id,
        progress: task.progress,
        receivedBytes: task.receivedBytes,
        totalBytes: task.totalBytes
      })
      .catch(error => {
        logger.error(`[OffscreenTaskRunner] 进度回传失败: taskId=${task.taskId}`, error)
      })
  }

  /** 发送取消确认。 */
  private sendTaskCancelled(task: RunnerTask): void {
    this.client.taskCancelled({ taskId: task.taskId }).catch(error => {
      logger.error(`[OffscreenTaskRunner] taskCancelled 回传失败: taskId=${task.taskId}`, error)
    })
  }

  /** 任务执行期间保持 20s 心跳，覆盖无进度消息的 remux 与网络停滞阶段。 */
  private ensureHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      return
    }

    this.heartbeatTimer = setInterval(() => {
      this.client.keepAlive().catch(error => {
        logger.error('[OffscreenTaskRunner] 保活心跳失败', error)
      })
    }, HEARTBEAT_INTERVAL_MS)
  }

  /** 没有执行中任务时停止心跳。 */
  private syncHeartbeat(): void {
    if (this.tasks.size === 0 && this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** 任务已受理取消时短路退出。 */
  private assertNotCancelled(task: RunnerTask): void {
    if (task.cancelRequested) {
      throw new TaskCancelledError(task.taskId)
    }
  }

  /** EventRpc 时代残留的输入一致性守卫：资源必须与 descriptor 声明同一下载选项。 */
  private assertSourceDescriptorMatch(task: RunnerTask): void {
    const { resource, descriptor } = task
    if (descriptor.sourceId !== resource.id) {
      throw new Error(
        `[OffscreenTaskRunner] resource.id 与 descriptor.sourceId 不一致: id=${resource.id}, descriptorSourceId=${descriptor.sourceId}`
      )
    }

    const matches =
      (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO &&
        resource.type === RESOURCE_TYPES.VIDEO &&
        descriptor.delivery === 'dash' &&
        descriptor.kind === 'video') ||
      (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO &&
        resource.type === RESOURCE_TYPES.VIDEO &&
        descriptor.delivery === 'hls' &&
        descriptor.kind === 'video') ||
      (resource.sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO &&
        resource.type === RESOURCE_TYPES.AUDIO &&
        descriptor.delivery === 'dash' &&
        descriptor.kind === 'audio')

    if (!matches) {
      throw new Error(
        `[OffscreenTaskRunner] sourceKind/type 与 descriptor 不匹配: id=${resource.id}, sourceKind=${resource.sourceKind}, type=${resource.type}, delivery=${descriptor.delivery}, kind=${descriptor.kind}`
      )
    }
  }

  /** 从 playlist 中解析指定 kind 的 track；缺失时抛错。 */
  private requireDashTrack(
    task: RunnerTask,
    playlist: VimeoDashPlaylist,
    kind: 'video' | 'audio'
  ): VimeoDashTrack {
    const trackId = kind === 'video' ? task.descriptor.videoTrackId : task.descriptor.audioTrackId
    const candidates = kind === 'video' ? playlist.videoTracks : playlist.audioTracks
    const track = findDashTrack(candidates, trackId)
    if (!track) {
      throw new Error(
        `[OffscreenTaskRunner] DASH ${kind} track 不存在: taskId=${task.taskId}, videoId=${task.descriptor.videoId}, trackId=${trackId ?? 'missing'}`
      )
    }
    return track
  }

  /** 媒体 URL 白名单校验。 */
  private assertMediaUrl(url: string, mediaId: string): void {
    if (!isVimeoMediaCdnUrl(url)) {
      throw new Error(
        `[OffscreenTaskRunner] URL 不在 Vimeo CDN 白名单: id=${mediaId}, host=${urlHostname(url)}, stage=validate`
      )
    }
  }

  /** 产物文件名：资源自带名字优先，否则按 videoId 兜底。 */
  private resolveArtifactFilename(task: RunnerTask, extension: string): string {
    return task.resource.filename || `${task.descriptor.videoId}.${extension}`
  }
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

/** 两个可选 size 都已知时返回总 size。 */
function sumKnownSizes(left: number | undefined, right: number | undefined): number | undefined {
  return left !== undefined && right !== undefined ? left + right : undefined
}

/** 只保留日志定位需要的 host，不输出 signed path/query。 */
function urlHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch (_error) {
    return 'invalid'
  }
}

/** offscreen 下载任务执行器单例。 */
export const offscreenTaskRunner = new OffscreenTaskRunner()
