/**
 * offscreen DASH/HLS 下载执行器。
 *
 * 分片 fetch + Mediabunny remux 在 offscreen document 执行（U8 前在 Vimeo 页面 MAIN world，
 * 该 injected 下载链已退役），任务由 background DownloadOrchestrator 经 RPC 驱动，因此切换
 * 视频/刷新/关闭 Vimeo 页面不再中断下载。与旧页面内实现的差异：
 *
 * - 进度经 background 通道回传（下载中 250ms 节流），不再派发页面 DOM 事件；
 * - 合成产物流式写入 OPFS（避免整份驻留内存），以 File 引用创建 blob URL 交 background
 *   落盘（chrome.downloads），落盘回执由 downloads.search 确认后再 revoke 并删除临时文件；
 * - 签名 URL 失效不再直接刷新页面 config，而是请求 background 重签，并按 track 一致性
 *   守卫续跑（分片游标按索引续）或以新快照整任务重跑；
 * - 任务全程持有 AbortController，下载阶段取消即时生效；remux 阶段的取消在交付边界生效。
 */

import { readResponseArrayBufferByChunk } from '@/core/injected/responseBody'
import { assertDownloadContentType } from '@/core/injected/downloadValidation'
import {
  AUDIO_TARGET_FORMATS,
  RESOURCE_SOURCE_KINDS,
  RESOURCE_TYPES
} from '@/core/constants/resource'
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
  isAllowedVimeoFetchUrl,
  isVimeoMediaCdnUrl,
  parseVimeoTimeRange,
  type VimeoSourceDescriptor,
  type VimeoTimeRange
} from '@/sites/vimeo/shared'
import { muxVimeoVideoToMp4, remuxVimeoAudioToM4a, remuxVimeoMuxedMp4ToMp4 } from './mux'
import { transcodeMuxArtifactToMp3 } from './mp3'
import { AES_128_KEY_LENGTH, decryptAes128Segment } from './decrypt'
import type { MuxOutputArtifact } from './muxArtifactStore'
import { openMuxInputWriter, removeMuxArtifact, sweepMuxArtifacts } from './muxArtifactStore'

const RETRYABLE_STATUS_CODES = new Set([403, 404, 410])
const VALID_MEDIA_STATUS_CODES = new Set([200, 206])

/** 下载中进度回传节流间隔；终态与首次报告不受节流约束。 */
const PROGRESS_THROTTLE_MS = 250

/**
 * taskComplete 交付调用的独立超时（默认 30s 不够）。
 *
 * background 在应答前要查询 Chrome 落盘回执：超大产物（数百 MB）在慢盘上落盘
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

/** 分片输入；never 模式落 OPFS，auto 模式保留现有 Blob 聚合路径。 */
interface DownloadedInput {
  source: Blob | File
  tempFileName?: string
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
    // 走到这里落盘已被 background 确认，OPFS 临时文件可以安全删除；
    // 删除是尽力而为，失败由下次启动清扫兜底。
    void removeMuxArtifact(held.tempFileName)
    return true
  }

  /** 通过隐藏 anchor 触发浏览器保存；产物继续由 background 持有直至落盘回执。 */
  saveTaskArtifact(taskId: string, blobUrl: string, filename: string): boolean {
    const held = this.deliveredArtifacts.get(taskId)
    if (!held || held.blobUrl !== blobUrl) {
      logger.warn(`[OffscreenTaskRunner] 保存请求与持有产物不匹配: taskId=${taskId}`)
      return false
    }
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = filename
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
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
    } finally {
      this.tasks.delete(task.taskId)
      this.syncHeartbeat()
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

  /** DASH audio-only 下载；MP3 目标格式在 m4a remux 产物上继续转码，m4a 走透传零改动。 */
  private async downloadDashAudio(task: RunnerTask): Promise<void> {
    const playlist = await this.loadDashPlaylistWithRefresh(task)
    const audioTrack = selectDashTrackWindow(
      this.requireDashTrack(task, playlist, 'audio'),
      task.descriptor.audioSegmentTimeline,
      readDescriptorTimeRange(task.descriptor)
    )
    const totalBytes = estimateDashTrackBytes(audioTrack)
    this.assertKnownMuxSize(task, totalBytes, 'DASH audio')
    const budget = this.createByteBudget(task, totalBytes)
    const audioInput = await this.downloadDashTrackInput(
      task,
      playlist,
      audioTrack,
      'audio',
      budget
    )
    try {
      const remuxed = await remuxVimeoAudioToM4a(
        audioInput.source,
        rebaseDescriptorRange(
          readDescriptorTimeRange(task.descriptor),
          task.descriptor.audioSegmentTimeline
        ),
        task.taskId
      )
      if (task.resource.targetFormat === AUDIO_TARGET_FORMATS.MP3) {
        const mp3 = await transcodeMuxArtifactToMp3(remuxed, task.taskId)
        await this.deliver(task, mp3, this.resolveArtifactFilename(task, 'mp3'))
        return
      }
      await this.deliver(task, remuxed, this.resolveArtifactFilename(task, 'm4a'))
    } finally {
      await this.disposeDownloadedInput(audioInput)
    }
  }

  /** DASH video mux 下载；描述符没有 audio track 时输出纯视频文件。 */
  private async downloadDashVideo(task: RunnerTask): Promise<void> {
    const playlist = await this.loadDashPlaylistWithRefresh(task)
    const videoTrack = selectDashTrackWindow(
      this.requireDashTrack(task, playlist, 'video'),
      task.descriptor.videoSegmentTimeline,
      readDescriptorTimeRange(task.descriptor)
    )
    const audioTrack = task.descriptor.audioTrackId
      ? selectDashTrackWindow(
          this.requireDashTrack(task, playlist, 'audio'),
          task.descriptor.audioSegmentTimeline,
          readDescriptorTimeRange(task.descriptor)
        )
      : null
    const muxRange = rebaseDescriptorRange(
      readDescriptorTimeRange(task.descriptor),
      task.descriptor.videoSegmentTimeline
    )
    const totalBytes = sumKnownSizes(
      estimateDashTrackBytes(videoTrack),
      audioTrack ? estimateDashTrackBytes(audioTrack) : 0
    )
    this.assertKnownMuxSize(task, totalBytes, audioTrack ? 'DASH video+audio' : 'DASH video')
    const budget = this.createByteBudget(task, totalBytes)
    const videoInput = await this.downloadDashTrackInput(
      task,
      playlist,
      videoTrack,
      'video',
      budget
    )
    let audioInput: DownloadedInput | null = null
    try {
      audioInput = audioTrack
        ? await this.downloadDashTrackInput(task, playlist, audioTrack, 'audio', budget)
        : null
      const muxed = await muxVimeoVideoToMp4(
        videoInput.source,
        audioInput?.source ?? null,
        muxRange,
        task.taskId
      )
      await this.deliver(task, muxed, this.resolveArtifactFilename(task, 'mp4'))
    } finally {
      await this.disposeDownloadedInput(videoInput)
      if (audioInput) {
        await this.disposeDownloadedInput(audioInput)
      }
    }
  }

  /**
   * HLS fMP4 fallback 下载。
   *
   * 加密分片在 fetch 后、入队前解密；init segment 不解密——RFC 8216 §4.3.2.4 虽允许 init
   * 加密，但现实交付（Vimeo 与竞品口径一致）均为明文 init，遇加密 init 会在 remux 期
   * 无可解 video track 而大声失败，不做静默兜底。解密与 key fetch 的失败共用分片 fetch 的
   * 重试链——签名过期走重签续跑，其余直接失败。AES key 按任务缓存，避免每分片重复请求同一 key URL。
   */
  private async downloadHlsVideo(task: RunnerTask): Promise<void> {
    const budget = this.createByteBudget(task)
    const buffers: ArrayBuffer[] = []
    const aesKeys = new Map<string, ArrayBuffer>()
    let playlist = await this.loadHlsMediaPlaylistWithRefresh(task)
    const range = readDescriptorTimeRange(task.descriptor)
    const filteredSegments = filterHlsSegments(
      playlist.segments,
      task.descriptor.videoSegmentTimeline,
      range
    )
    const muxRange = rebaseDescriptorRange(range, task.descriptor.videoSegmentTimeline)
    if (filteredSegments !== playlist.segments) {
      playlist = { ...playlist, segments: filteredSegments }
    }
    const inputWriter =
      task.resource.streamingMode === 'never'
        ? await openMuxInputWriter(`${task.taskId}-input-hls`)
        : null

    let inputFinalized = false
    try {
      let initDone = false
      let segmentIndex = 0
      while (!initDone || segmentIndex < playlist.segments.length) {
        this.assertNotCancelled(task)
        const isInit = !initDone
        const segmentUrl = isInit ? playlist.initSegmentUrl : playlist.segments[segmentIndex].url
        const encryption = isInit ? undefined : playlist.segments[segmentIndex].encryption
        try {
          const data = await this.fetchSegment(task, segmentUrl, budget)
          const input = encryption
            ? await decryptAes128Segment(
                await this.fetchHlsAesKey(task, encryption.keyUrl, aesKeys),
                encryption.iv,
                data
              )
            : data
          if (inputWriter) {
            await inputWriter.write(new Uint8Array(input))
          } else {
            buffers.push(input)
          }
        } catch (error) {
          const refreshed = await this.resolveRetryableRefresh(task, error)
          if (!refreshed) {
            throw error
          }
          // 按新签名 playlist 重建后原地重试同一位置。
          const refreshedPlaylist = await this.loadHlsMediaPlaylist(
            refreshed,
            task.controller.signal
          )
          playlist = {
            ...refreshedPlaylist,
            segments: filterHlsSegments(
              refreshedPlaylist.segments,
              task.descriptor.videoSegmentTimeline,
              range
            )
          }
          continue
        }
        if (isInit) {
          initDone = true
        } else {
          segmentIndex += 1
        }
      }

      const input = inputWriter
        ? { source: await inputWriter.finalize(), tempFileName: inputWriter.fileName }
        : { source: new Blob(buffers, { type: 'video/mp4' }) }
      inputFinalized = inputWriter !== null
      try {
        const remuxed = await remuxVimeoMuxedMp4ToMp4(input.source, muxRange, task.taskId)
        await this.deliver(task, remuxed, this.resolveArtifactFilename(task, 'mp4'))
      } finally {
        await this.disposeDownloadedInput(input)
      }
    } finally {
      if (inputWriter && !inputFinalized) {
        await inputWriter.dispose()
      }
    }
  }

  /** 下载单条 DASH track 的 init+segments；签名失效时重签并按索引续跑。 */
  private async downloadDashTrackInput(
    task: RunnerTask,
    initialPlaylist: VimeoDashPlaylist,
    initialTrack: VimeoDashTrack,
    kind: 'video' | 'audio',
    budget: ByteBudget
  ): Promise<DownloadedInput> {
    let playlist = initialPlaylist
    let track = initialTrack
    const initBuffer = decodeBase64ToArrayBuffer(track.initSegment)
    this.addBytesToBudget(task, budget, initBuffer.byteLength, 'DASH init segment')
    const inputWriter =
      task.resource.streamingMode === 'never'
        ? await openMuxInputWriter(`${task.taskId}-input-${kind}`)
        : null
    const buffers: ArrayBuffer[] = inputWriter ? [] : [initBuffer]

    try {
      if (inputWriter) {
        await inputWriter.write(new Uint8Array(initBuffer))
      }
      let segmentIndex = 0
      while (segmentIndex < track.segments.length) {
        this.assertNotCancelled(task)
        const segmentUrl = resolveDashSegmentUrl(playlist, track, track.segments[segmentIndex])
        try {
          const segment = await this.fetchSegment(task, segmentUrl, budget)
          if (inputWriter) {
            await inputWriter.write(new Uint8Array(segment))
          } else {
            buffers.push(segment)
          }
          segmentIndex += 1
        } catch (error) {
          const refreshed = await this.resolveRetryableRefresh(task, error)
          if (!refreshed) {
            throw error
          }
          // track 一致性守卫已在 background 通过：按新签名 playlist 重建同 track，游标不回退。
          playlist = await this.loadDashPlaylist(refreshed, task.controller.signal)
          track = selectDashTrackWindow(
            this.requireDashTrack(task, playlist, kind),
            kind === 'video'
              ? task.descriptor.videoSegmentTimeline
              : task.descriptor.audioSegmentTimeline,
            readDescriptorTimeRange(task.descriptor)
          )
        }
      }

      return inputWriter
        ? { source: await inputWriter.finalize(), tempFileName: inputWriter.fileName }
        : { source: new Blob(buffers, { type: track.mimeType }) }
    } catch (error) {
      await inputWriter?.dispose()
      throw error
    }
  }

  // ============================================================================
  // playlist 加载与重签
  // ============================================================================

  /** 加载 DASH playlist；签名过期时重签一次。 */
  private async loadDashPlaylistWithRefresh(task: RunnerTask): Promise<VimeoDashPlaylist> {
    try {
      return await this.loadDashPlaylist(task.descriptor, task.controller.signal)
    } catch (error) {
      const refreshed = await this.resolveRetryableRefresh(task, error)
      if (!refreshed) {
        throw error
      }
      return this.loadDashPlaylist(refreshed, task.controller.signal)
    }
  }

  /** 从 descriptor 恢复 HLS fMP4 media playlist；签名过期时重签一次。 */
  private async loadHlsMediaPlaylistWithRefresh(task: RunnerTask): Promise<VimeoHlsMediaPlaylist> {
    try {
      return await this.loadHlsMediaPlaylist(task.descriptor, task.controller.signal)
    } catch (error) {
      const refreshed = await this.resolveRetryableRefresh(task, error)
      if (!refreshed) {
        throw error
      }
      return this.loadHlsMediaPlaylist(refreshed, task.controller.signal)
    }
  }

  /** 直接读取描述符中的 DASH playlist，过期时抛可重签错误。 */
  private async loadDashPlaylist(
    descriptor: VimeoSourceDescriptor,
    signal: AbortSignal
  ): Promise<VimeoDashPlaylist> {
    const playlistUrl = descriptor.dashPlaylistUrl
    if (!playlistUrl) {
      throw new Error(
        `[OffscreenTaskRunner] DASH 描述符缺少 playlist URL: videoId=${descriptor.videoId}, sourceId=${descriptor.sourceId}, stage=dash-resolve`
      )
    }

    this.assertMediaUrl(playlistUrl, descriptor.sourceId)
    const response = await fetch(playlistUrl, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal
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
    descriptor: VimeoSourceDescriptor,
    signal: AbortSignal
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
      referrerPolicy: 'no-referrer',
      signal
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

    // 重签只更新来源，输出格式与低内存模式始终由用户选定的任务持有。
    const resource = {
      ...response.resource,
      ...(task.resource.streamingMode ? { streamingMode: task.resource.streamingMode } : {}),
      targetFormat: task.resource.targetFormat
    }
    if (response.mode === 'restart') {
      throw new RestartTaskError(resource, descriptor)
    }

    // 续跑也同步更新任务资源，让最终交付的 filename/size 与新签名快照一致。
    task.resource = resource
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

  /**
   * 获取 HLS AES-128 key，同任务内按 key URL 缓存。
   *
   * key host 必须命中 Vimeo fetch 白名单（player.vimeo.com / *.vimeocdn.com）：白名单外
   * 的加密交付不受支持，拒绝任务而不是扩大网络边界。签名过期（403/404/410）与分片 fetch
   * 同口径抛可重签错误，交给既有重签续跑链。
   */
  private async fetchHlsAesKey(
    task: RunnerTask,
    keyUrl: string,
    cache: Map<string, ArrayBuffer>
  ): Promise<ArrayBuffer> {
    const cached = cache.get(keyUrl)
    if (cached) {
      return cached
    }

    if (!isAllowedVimeoFetchUrl(keyUrl)) {
      throw new Error(
        `[OffscreenTaskRunner] 加密 key URL 不在 Vimeo fetch 白名单: id=${task.resource.id}, host=${urlHostname(keyUrl)}, stage=hls-key`
      )
    }

    const response = await fetch(keyUrl, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: task.controller.signal
    })
    // 与分片/playlist 同口径补齐 30x 跟随后的最终 URL 复检；key 的边界是它的白名单
    // （player.vimeo.com / *.vimeocdn.com），不是媒体 CDN 判定。
    if (!isAllowedVimeoFetchUrl(response.url || keyUrl)) {
      throw new Error(
        `[OffscreenTaskRunner] 加密 key 重定向后 URL 不在 Vimeo fetch 白名单: id=${task.resource.id}, host=${urlHostname(response.url || keyUrl)}, stage=hls-key`
      )
    }
    if (task.cancelRequested) {
      throw new TaskCancelledError(task.taskId)
    }

    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new VimeoRetryableDownloadError(
        `HLS 加密 key 已过期: id=${task.resource.id}, host=${urlHostname(response.url || keyUrl)}, stage=hls-key`,
        response.status
      )
    }

    if (!response.ok) {
      throw new Error(
        `[OffscreenTaskRunner] HLS 加密 key fetch 失败: id=${task.resource.id}, host=${urlHostname(response.url || keyUrl)}, stage=hls-key, status=${response.status}`
      )
    }

    assertDownloadContentType(
      response.headers.get('Content-Type'),
      'media-segment',
      `Vimeo HLS AES key ${task.resource.id}`
    )
    const key = await response.arrayBuffer()
    if (key.byteLength !== AES_128_KEY_LENGTH) {
      throw new Error(
        `[OffscreenTaskRunner] HLS 加密 key 字节数非法: id=${task.resource.id}, host=${urlHostname(keyUrl)}, bytes=${key.byteLength}, stage=hls-key`
      )
    }

    cache.set(keyUrl, key)
    return key
  }

  /** 已知 size 超过上限时提前拒绝。 */
  private assertKnownMuxSize(
    task: RunnerTask,
    knownBytes: number | undefined,
    stage: string
  ): void {
    if (task.resource.streamingMode === 'never') return
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
    if (task.resource.streamingMode !== 'never' && budget.bytes > vimeoConfig.muxMaxBytes) {
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

  /** 清理 never 模式的 OPFS 输入；auto 模式没有临时文件。 */
  private async disposeDownloadedInput(input: DownloadedInput): Promise<void> {
    if (input.tempFileName) {
      await removeMuxArtifact(input.tempFileName)
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
      this.deliveredArtifacts.set(task.taskId, {
        blobUrl,
        tempFileName: artifact.tempFileName
      })
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

  /**
   * 产物文件名：资源自带名字优先（扩展名按本次交付产物强制重写），否则按 videoId 兜底。
   * MP3 转码交付时资源名仍指向 .m4a，扩展名在这里收敛，background 不依赖交付名的正确性。
   */
  private resolveArtifactFilename(task: RunnerTask, extension: string): string {
    const base = (task.resource.filename || task.descriptor.videoId).replace(/\.[^.]*$/, '')
    return `${base}.${extension}`
  }
}

function filterHlsSegments<T extends { durationSeconds?: number }>(
  segments: T[],
  timeline: ReadonlyArray<{ startSeconds: number; endSeconds: number }> | undefined,
  range: VimeoTimeRange | undefined
): T[] {
  if (!timeline || !range || timeline.length !== segments.length) {
    return segments
  }
  const filtered = segments.filter((_segment, index) => {
    const window = timeline[index]
    return (
      window !== undefined &&
      window.endSeconds > range.startSeconds &&
      window.startSeconds < range.endSeconds
    )
  })
  return filtered.length > 0 ? filtered : segments
}

/** 读取描述符中的片段区间；未裁剪时返回 undefined。 */
function readDescriptorTimeRange(descriptor: VimeoSourceDescriptor): VimeoTimeRange | undefined {
  return parseVimeoTimeRange(descriptor) ?? undefined
}

function selectDashTrackWindow(
  track: VimeoDashTrack,
  timeline: ReadonlyArray<{ startSeconds: number; endSeconds: number }> | undefined,
  range: VimeoTimeRange | undefined
): VimeoDashTrack {
  if (!timeline || !range || timeline.length !== track.segments.length) {
    return track
  }
  const segments = track.segments.filter((_segment, index) => {
    const window = timeline[index]
    return (
      window !== undefined &&
      window.endSeconds > range.startSeconds &&
      window.startSeconds < range.endSeconds
    )
  })
  return segments.length > 0 ? { ...track, segments } : track
}

function rebaseDescriptorRange(
  range: VimeoTimeRange | undefined,
  timeline: ReadonlyArray<{ startSeconds: number; endSeconds: number }> | undefined
): VimeoTimeRange | undefined {
  if (!range || !timeline) return range
  const first = timeline.find(window => window.endSeconds > range.startSeconds)
  if (!first) return range
  const startSeconds = Math.max(0, range.startSeconds - first.startSeconds)
  const endSeconds = Math.max(startSeconds, range.endSeconds - first.startSeconds)
  return endSeconds > startSeconds ? { startSeconds, endSeconds } : undefined
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
