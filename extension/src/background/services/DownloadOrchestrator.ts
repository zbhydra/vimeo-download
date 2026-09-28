/**
 * Background 下载编排器。
 *
 * DASH/HLS 下载从 Vimeo 页面迁移到 offscreen document 执行后，这里承担全局编排：
 *
 * - 全局单并发 FIFO 队列，跨 tab 共享（行为变化：所有站点页面共享同一下载通道）；
 * - 任务表只保留未完成任务投影，经 downloadQueueUpdated 事件推给 popup，并可由
 *   getDownloadQueue RPC 查询；
 * - 直连类（progressive/封面/字幕）由 background 直接 chrome.downloads 执行；
 *   DASH/HLS 交 offscreen document 执行，产物 blob 由 background 落盘并用
 *   downloads.onChanged 拿到落盘回执（修复旧 injected 路径「触发即算完成」的缺陷）；
 * - 配额在任务出队执行时检查（API 失败 fail-open），不足时通知发起
 *   tab 的 content 显示既有升级弹窗（content 不在场则跳过）；
 * - SW 冷启动对账：offscreen 是执行真相源，启动时（或收到未知任务消息时）向 offscreen
 *   查询活跃任务并重建编排表，消灭孤儿任务。
 */

import { OffscreenChannel } from '@/background/rpc/offscreen.rpc'
import type {
  BackgroundBrowserDownloadSource,
  BackgroundGetDownloadQueueResponse,
  BackgroundTaskCancelledRequest,
  BackgroundTaskCancelledResponse,
  BackgroundTaskCompleteRequest,
  BackgroundTaskCompleteResponse,
  BackgroundTaskFailedRequest,
  BackgroundTaskFailedResponse,
  BackgroundTaskProgressRequest,
  BackgroundTaskProgressResponse
} from '@/background/types'
import { MARK_TYPE, type MarkType } from '@/core/api/mark/types'
import type { QuotaCheckResponse } from '@/core/api/quota/types'
import { quotaApi } from '@/core/api/quota'
import { RESOURCE_SOURCE_KINDS, isBrowserManagedSourceKind } from '@/core/constants/resource'
import type { ExtensionEvents } from '@/core/events/types'
import { ChromeEventEmitter } from '@/core/rpc/ChromeEventBus'
import type { DownloadTaskSnapshot, MediaResource } from '@/core/types'
import { SettingsManager } from '@/core/storage/settings'
import { logger } from '@/core/utils/logger'
import { recordBackgroundMark } from './ExtensionMarkReporter'
import { buildDownloadFilename, buildResourceFilename } from './downloadFilename'
import { recordDownloadTaskOutcome } from './downloadHistoryWriteback'
import { notifyDownloadFinished } from './downloadNotifications'
import { ensureOffscreenDocument, hasOffscreenDocument } from './offscreenDocument'
import { resolveVerifiedDirectSource } from './directSource'

/** 编排队列的稳定作用域；popup 据此区分 background 快照与旧页面快照。 */
const QUEUE_SCOPE_ID = 'background'

/** 可由刷新 Vimeo signed config 修复的 Chrome 服务端中断原因。 */
const REFRESHABLE_INTERRUPT_REASONS = new Set([
  'SERVER_FAILED',
  'SERVER_UNAUTHORIZED',
  'SERVER_FORBIDDEN'
])

/** 编排任务终态执行结果；配额拒绝不计入下载失败。 */
type TaskOutcome = 'completed' | 'quota_rejected' | 'cancelled'

/** 任务已被受理取消；用于从直连/offscreen 执行路径中短路退出。 */
class TaskCancelledError extends Error {
  readonly taskId: string

  constructor(taskId: string) {
    super(`[DownloadOrchestrator] 任务已取消: taskId=${taskId}`)
    this.name = 'TaskCancelledError'
    this.taskId = taskId
  }
}

/** 编排器内部任务；对 Popup 只暴露 snapshot。 */
interface OrchestratorTask {
  /** Popup 可见的任务字段。 */
  snapshot: DownloadTaskSnapshot
  /** 执行使用的完整资源。 */
  resource: MediaResource
  /** 按文件名模板渲染的最终保存名（含扩展名）；入队/对账时渲染一次，终态挂钩共用。 */
  finalName: string
  /** 发起下载的站点标签页；配额不足时用于弹升级窗。 */
  tabId: number | null
  /** 下载发起页 URL（入队时快照）；用于历史回写，拿不到时缺省。 */
  pageUrl?: string
  /** 执行通道：Chrome 直连或 offscreen document。 */
  kind: 'direct' | 'offscreen'
  /** 取消已受理。 */
  cancelRequested: boolean
  /** 直连/blob 下载的 Chrome download ID；用于取消。 */
  downloadId: number | null
  /** offscreen 执行轮次的收敛回调；直连任务与等待任务为 null。 */
  resolveCompletion: ((outcome: TaskOutcome) => void) | null
  rejectCompletion: ((error: Error) => void) | null
  /** 人工重试从下一次执行起永久跳过配额；用户已见过的失败不重复扣额度。 */
  retryQuotaExempt: boolean
}

/** Chrome 下载 settle 结果。 */
type DownloadSettle = { kind: 'complete' } | { kind: 'interrupted'; reason: string }

/**
 * 取消墓碑上限：超限按插入序淘汰最早记录，防长驻 SW 内存膨胀。
 */
const CANCELLED_TASK_IDS_LIMIT = 500

/** Background 下载编排器单例。 */
export class DownloadOrchestrator {
  /** 未完成任务投影（waiting/downloading/failed），按创建顺序。 */
  private readonly tasks = new Map<string, OrchestratorTask>()

  /**
   * 取消墓碑：已受理取消的 taskId 集合，统一语义为「该 taskId 的任何后续交付必须拒绝」。
   *
   * 取消转发 offscreen 偶发空响应失败时，任务被本地终止移出投影，而 offscreen 实际存活
   * 继续执行；若无墓碑，对账会以 offscreen 为真相源把任务复活为 cancelRequested:false，
   * 迟到的产物交付照常落盘。墓碑在对账与交付入口拦住这条路径。
   */
  private readonly cancelledTaskIds = new Set<string>()

  /** waiting 任务 FIFO。 */
  private readonly queue: string[] = []

  /** 当前唯一执行任务。 */
  private activeTaskId: string | null = null

  /** drain 锁：enqueue 与任务终态都会触发 pump，只允许一个 drain 循环。 */
  private pumping = false

  /** 投影版本；每次可见变化递增。 */
  private revision = 0

  /** 任务 ID 自增序号。 */
  private nextSequence = 0

  /** SW 冷启动对账单飞。 */
  private reconcilePromise: Promise<void> | null = null

  /** popup 快照推送器；没有打开的 popup 时发送失败由 EventBus 忽略。 */
  private readonly eventEmitter = new ChromeEventEmitter<ExtensionEvents>()

  /** offscreen 通道客户端。 */
  private readonly offscreenClient = new OffscreenChannel()

  // ============================================================================
  // 入口（popup/content）
  // ============================================================================

  /** 按输入顺序入队；同资源已有 waiting/downloading 任务时去重合并。 */
  async enqueueBatch(
    resources: readonly MediaResource[],
    tabId: number | null
  ): Promise<{ accepted: boolean; count: number }> {
    await this.ensureReconciled()

    // 历史回写需要发起页 URL，入队时快照一次（终态时 tab 可能已被关闭或导航走）。
    const pageUrl = await resolveTabUrl(tabId)

    let count = 0
    for (const resource of resources) {
      if (
        !isBrowserManagedSourceKind(resource.sourceKind) &&
        !isAdaptiveSourceKind(resource.sourceKind)
      ) {
        throw new Error(
          `[DownloadOrchestrator] 资源类型不支持编排下载: resourceId=${resource.id}, sourceKind=${resource.sourceKind}`
        )
      }

      const existing = this.findByResourceId(resource.id)
      if (
        existing &&
        (existing.snapshot.status === 'waiting' || existing.snapshot.status === 'downloading')
      ) {
        count += 1
        continue
      }

      const task = await this.createTask(resource, tabId, pageUrl)
      this.tasks.set(task.snapshot.taskId, task)
      this.queue.push(task.snapshot.taskId)
      count += 1
      logger.info(
        `[DownloadOrchestrator] 任务已入队: taskId=${task.snapshot.taskId}, resourceId=${resource.id}, kind=${task.kind}`
      )
    }

    if (count > 0) {
      this.publish()
      this.pump()
    }
    return { accepted: count > 0, count }
  }

  /** 取消任务：waiting 直接移除，downloading 按执行通道转发取消。 */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task) {
      return false
    }

    if (task.snapshot.status === 'waiting') {
      const queueIndex = this.queue.indexOf(taskId)
      if (queueIndex >= 0) {
        this.queue.splice(queueIndex, 1)
      }
      this.removeTask(taskId)
      this.publish()
      logger.info(`[DownloadOrchestrator] 已取消等待任务: taskId=${taskId}`)
      return true
    }

    task.cancelRequested = true
    if (task.downloadId !== null) {
      try {
        await chrome.downloads.cancel(task.downloadId)
      } catch (error) {
        // 下载可能刚好结束；执行路径会按 cancelRequested 收敛为取消。
        logger.warn(
          `[DownloadOrchestrator] 取消 Chrome 下载失败（可能已结束）: taskId=${taskId}`,
          error
        )
      }
      return true
    }

    if (task.kind === 'offscreen') {
      try {
        await ensureOffscreenDocument()
        await this.offscreenClient.cancelTask({ taskId })
        // 转发成功也记墓碑：防 offscreen 已在途的交付竞态迟到。
        this.addCancelledTaskTombstone(taskId)
      } catch (error) {
        // 空响应不代表 offscreen 不在场：记墓碑后本地终止，迟到的执行与交付由墓碑拦截。
        logger.error(
          `[DownloadOrchestrator] 转发取消到 offscreen 失败，本地终止并记录取消墓碑: taskId=${taskId}`,
          error
        )
        this.addCancelledTaskTombstone(taskId)
        this.settleOffscreenTask(task, { kind: 'cancelled' })
      }
    }
    return true
  }

  /** 把失败任务重新入队；重试轮次跳过配额。 */
  retryTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.snapshot.status !== 'failed') {
      return false
    }

    task.retryQuotaExempt = true
    task.cancelRequested = false
    task.snapshot.status = 'waiting'
    task.snapshot.progress = null
    task.snapshot.receivedBytes = null
    task.snapshot.bytesPerSecond = null
    this.queue.push(taskId)
    this.publish()
    this.pump()
    logger.info(`[DownloadOrchestrator] 失败任务已重新入队: taskId=${taskId}`)
    return true
  }

  /** 当前编排队列快照。 */
  getSnapshot(): BackgroundGetDownloadQueueResponse {
    return {
      scopeId: QUEUE_SCOPE_ID,
      revision: this.revision,
      tasks: Array.from(this.tasks.values()).map(task => ({ ...task.snapshot }))
    }
  }

  // ============================================================================
  // offscreen 回传
  // ============================================================================

  /**
   * 记录 offscreen 下载进度。
   *
   * 取消墓碑命中的任务不在此投影：墓碑任务已被移出投影，requireTrackedTask 会先对账，
   * doReconcile 的墓碑分支不复活任务且趁机补发取消，这里自然收敛为 recorded:false。
   */
  async handleTaskProgress(
    request: BackgroundTaskProgressRequest
  ): Promise<BackgroundTaskProgressResponse> {
    const task = await this.requireTrackedTask(request.taskId)
    if (
      !task ||
      task.snapshot.status !== 'downloading' ||
      task.snapshot.resourceId !== request.sourceId
    ) {
      return { recorded: false }
    }

    task.snapshot.progress = request.progress
    task.snapshot.receivedBytes = request.receivedBytes
    if (request.totalBytes !== null) {
      task.snapshot.totalBytes = request.totalBytes
    }
    this.publish()
    return { recorded: true }
  }

  /**
   * 接收 offscreen 交付的产物 blob 并落盘。
   *
   * 落盘回执在本方法内等待 downloads.onChanged 才返回 offscreen：确认完成或中断后释放
   * blob、收敛任务。这是对旧 injected 路径「触发浏览器保存即上报完成」的落盘回执修复。
   */
  async handleTaskComplete(
    request: BackgroundTaskCompleteRequest
  ): Promise<BackgroundTaskCompleteResponse> {
    const task = await this.requireTrackedTask(request.taskId)
    if (!task) {
      // 墓碑命中：已取消任务的迟到交付，拒绝落盘并消费墓碑。
      if (this.consumeCancelledTaskTombstone(request.taskId)) {
        logger.warn(
          `[DownloadOrchestrator] 已取消任务的迟到产物交付被拒绝，不落盘: taskId=${request.taskId}`
        )
      }
      // 未知任务（对账竞态或已收敛后的迟到交付）：直接释放产物，避免 blob 泄漏。
      await this.releaseArtifact(request.taskId, request.blobUrl)
      return { accepted: false }
    }

    if (task.cancelRequested) {
      // 交付已随取消被拒绝，墓碑使命完成（offscreen 该任务已交付完毕，不会再有后续消息）。
      this.consumeCancelledTaskTombstone(request.taskId)
      await this.releaseArtifact(request.taskId, request.blobUrl)
      this.settleOffscreenTask(task, { kind: 'cancelled' })
      return { accepted: false }
    }

    task.snapshot.progress = 100
    this.publish()

    try {
      const settings = await SettingsManager.getSettings()
      const downloadId = await chrome.downloads.download({
        url: request.blobUrl,
        filename: buildDownloadFilename(settings.downloadPath, task.finalName),
        conflictAction: 'uniquify',
        saveAs: false
      })
      task.downloadId = downloadId
      logger.info(
        `[DownloadOrchestrator] 产物开始落盘: taskId=${request.taskId}, resourceId=${task.snapshot.resourceId}, downloadId=${downloadId}`
      )

      const settle = await this.waitForDownloadSettle(downloadId)
      task.downloadId = null
      await this.releaseArtifact(request.taskId, request.blobUrl)

      if (settle.kind === 'complete') {
        logger.info(
          `[DownloadOrchestrator] 产物落盘完成: taskId=${request.taskId}, downloadId=${downloadId}`
        )
        this.settleOffscreenTask(task, { kind: 'completed' })
        return { accepted: true }
      }

      if (task.cancelRequested) {
        this.settleOffscreenTask(task, { kind: 'cancelled' })
        return { accepted: true }
      }

      this.settleOffscreenTask(task, {
        kind: 'failed',
        error: new Error(
          `[DownloadOrchestrator] 产物落盘中断: taskId=${request.taskId}, downloadId=${downloadId}, reason=${settle.reason}`
        )
      })
      return { accepted: true }
    } catch (error) {
      await this.releaseArtifact(request.taskId, request.blobUrl)
      this.settleOffscreenTask(task, {
        kind: 'failed',
        error: error instanceof Error ? error : new Error(String(error))
      })
      return { accepted: true }
    }
  }

  /** 记录 offscreen 任务失败。 */
  async handleTaskFailed(
    request: BackgroundTaskFailedRequest
  ): Promise<BackgroundTaskFailedResponse> {
    const task = await this.requireTrackedTask(request.taskId)
    if (!task) {
      return { accepted: false }
    }

    this.settleOffscreenTask(task, {
      kind: 'failed',
      error: new Error(
        `[DownloadOrchestrator] offscreen 任务失败: taskId=${request.taskId}, resourceId=${task.snapshot.resourceId}, message=${request.message}`
      )
    })
    return { accepted: true }
  }

  /** 记录 offscreen 任务取消确认。 */
  async handleTaskCancelled(
    request: BackgroundTaskCancelledRequest
  ): Promise<BackgroundTaskCancelledResponse> {
    // offscreen 已确认取消即执行方终止，墓碑防迟到交付的使命完成，消费之。
    this.consumeCancelledTaskTombstone(request.taskId)

    const task = await this.requireTrackedTask(request.taskId)
    if (!task) {
      return { accepted: false }
    }

    task.cancelRequested = true
    this.settleOffscreenTask(task, { kind: 'cancelled' })
    return { accepted: true }
  }

  // ============================================================================
  // SW 冷启动对账
  // ============================================================================

  /**
   * 与 offscreen 对账：以它的活跃任务清单为准重建编排表。
   *
   * SW 会在下载中 idle 退出；offscreen 是执行真相源，唤醒后的第一件事是把仍在执行的任务
   * 接回投影。旧 SW 内存中的 waiting 队列无法恢复（无持久化，属裁决范围），执行中任务不丢。
   */
  async reconcile(): Promise<void> {
    if (!this.reconcilePromise) {
      this.reconcilePromise = this.doReconcile().finally(() => {
        this.reconcilePromise = null
      })
    }
    return this.reconcilePromise
  }

  /** 未知任务消息先对账再判死，压缩冷启动竞态窗口。 */
  private async requireTrackedTask(taskId: string): Promise<OrchestratorTask | null> {
    const known = this.tasks.get(taskId)
    if (known) {
      return known
    }

    await this.reconcile()
    return this.tasks.get(taskId) ?? null
  }

  private async doReconcile(): Promise<void> {
    // 没有 offscreen document 说明没有任何可能存活的执行任务，也不要为此创建文档。
    if (!(await hasOffscreenDocument())) {
      return
    }

    let activeTasks: Awaited<ReturnType<OffscreenChannel['listActiveTasks']>>['tasks']
    try {
      const response = await this.offscreenClient.listActiveTasks()
      activeTasks = response.tasks
    } catch (error) {
      logger.error('[DownloadOrchestrator] 冷启动对账查询活跃任务失败', error)
      return
    }

    for (const active of activeTasks) {
      if (this.tasks.has(active.taskId)) {
        continue
      }

      if (this.cancelledTaskIds.has(active.taskId)) {
        // 墓碑命中：已取消的任务不复活为可执行任务；趁 offscreen 在场补发一次取消，
        // 成功即消费墓碑收敛，失败保留墓碑等下次对账重试。
        try {
          await this.offscreenClient.cancelTask({ taskId: active.taskId })
          this.consumeCancelledTaskTombstone(active.taskId)
          logger.info(
            `[DownloadOrchestrator] 墓碑任务已补发取消并收敛，不复活: taskId=${active.taskId}, resourceId=${active.resourceId}`
          )
        } catch (error) {
          logger.error(
            `[DownloadOrchestrator] 墓碑任务补发取消失败，保留墓碑等待下次对账: taskId=${active.taskId}`,
            error
          )
        }
        continue
      }

      const filename = await buildResourceFilename(active.resource)
      const task: OrchestratorTask = {
        snapshot: {
          taskId: active.taskId,
          resourceId: active.resourceId,
          filename,
          type: active.resource.type,
          resourceIndex: active.resource.index,
          status: 'downloading',
          progress: active.progress,
          receivedBytes: active.receivedBytes,
          totalBytes: active.totalBytes ?? active.resource.size ?? null,
          bytesPerSecond: null,
          bytesAreEstimated: false
        },
        resource: active.resource,
        finalName: filename,
        tabId: null,
        kind: isBrowserManagedSourceKind(active.resource.sourceKind) ? 'direct' : 'offscreen',
        cancelRequested: false,
        downloadId: null,
        resolveCompletion: null,
        rejectCompletion: null,
        retryQuotaExempt: false
      }
      this.tasks.set(task.snapshot.taskId, task)
      if (this.activeTaskId === null) {
        this.activeTaskId = task.snapshot.taskId
      }
      logger.info(
        `[DownloadOrchestrator] 以 offscreen 为准重建执行任务: taskId=${active.taskId}, resourceId=${active.resourceId}`
      )
    }

    if (activeTasks.length > 0) {
      this.publish()
    }
  }

  private async ensureReconciled(): Promise<void> {
    await this.reconcile()
  }

  // ============================================================================
  // 执行
  // ============================================================================

  /** 触发 drain；drain 串行消费 FIFO。 */
  private pump(): void {
    if (this.pumping) {
      return
    }

    this.pumping = true
    void this.drain()
  }

  /** 唯一 drain 循环：单并发逐个执行 waiting 任务。 */
  private async drain(): Promise<void> {
    try {
      while (this.activeTaskId === null) {
        const taskId = this.queue.shift()
        if (taskId === undefined) {
          break
        }
        const task = this.tasks.get(taskId)
        if (!task || task.snapshot.status !== 'waiting') {
          continue
        }

        this.activeTaskId = taskId
        task.snapshot.status = 'downloading'
        this.publish()

        const outcome = await this.performTask(task).then(
          result => ({ kind: 'result' as const, result }),
          error => ({ kind: 'error' as const, error })
        )

        if (outcome.kind === 'result') {
          if (outcome.result === 'completed') {
            this.recordTaskMark(task, MARK_TYPE.DOWNLOAD_SUCCESS)
            this.notifyTaskFinished(task, true)
            this.recordTaskHistory(task, true)
          } else if (outcome.result === 'quota_rejected') {
            this.recordTaskMark(task, MARK_TYPE.DOWNLOAD_QUOTA_INSUFFICIENT)
          }
          this.removeTask(task.snapshot.taskId)
        } else if (outcome.error instanceof TaskCancelledError || task.cancelRequested) {
          logger.info(
            `[DownloadOrchestrator] 任务已取消: taskId=${taskId}, resourceId=${task.resource.id}`
          )
          this.removeTask(taskId)
        } else {
          logger.error(
            `[DownloadOrchestrator] 下载任务失败: taskId=${taskId}, resourceId=${task.resource.id}, sourceKind=${task.resource.sourceKind}, stage=execute`,
            outcome.error
          )
          this.recordTaskMark(task, MARK_TYPE.DOWNLOAD_FAILED, outcome.error)
          this.notifyTaskFinished(task, false)
          this.recordTaskHistory(task, false)
          task.snapshot.status = 'failed'
        }

        if (this.activeTaskId === taskId) {
          this.activeTaskId = null
        }
        this.publish()
      }
    } finally {
      this.pumping = false
    }
  }

  /** 执行当前任务：配额检查后按通道分发；落盘名用入队时渲染好的 finalName。 */
  private async performTask(task: OrchestratorTask): Promise<TaskOutcome> {
    if (!task.retryQuotaExempt) {
      const quota = await this.checkAndConsumeQuota(task)
      if (!quota.accepted) {
        this.notifyUpgradeModal(task, quota.resetAt)
        return 'quota_rejected'
      }
    }

    if (task.cancelRequested) {
      throw new TaskCancelledError(task.snapshot.taskId)
    }

    if (task.kind === 'direct') {
      await this.runDirectDownload(task, task.finalName)
      return 'completed'
    }

    return this.runOffscreenDownload(task)
  }

  /** 直连下载：chrome.downloads + onChanged 等待落盘回执，signed URL 过期刷新一次。 */
  private async runDirectDownload(task: OrchestratorTask, filename: string): Promise<void> {
    const source = toDirectSource(task.resource, filename)
    let refreshSource = false

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const verified = await resolveVerifiedDirectSource(source, refreshSource)
      const settings = await SettingsManager.getSettings()
      const downloadId = await chrome.downloads.download({
        url: verified.url,
        filename: buildDownloadFilename(settings.downloadPath, verified.filename),
        conflictAction: 'uniquify',
        saveAs: false
      })
      task.downloadId = downloadId
      const settle = await this.pollDirectDownload(task, downloadId)
      task.downloadId = null

      if (settle.kind === 'complete') {
        return
      }
      if (task.cancelRequested) {
        throw new TaskCancelledError(task.snapshot.taskId)
      }

      const refreshable = !refreshSource && REFRESHABLE_INTERRUPT_REASONS.has(settle.reason)
      logger.error(
        `[DownloadOrchestrator] 直连下载中断: taskId=${task.snapshot.taskId}, resourceId=${task.resource.id}, downloadId=${downloadId}, reason=${settle.reason}, refreshable=${refreshable}`
      )
      if (refreshable) {
        refreshSource = true
        continue
      }
      throw new Error(
        `[DownloadOrchestrator] 直连下载中断: taskId=${task.snapshot.taskId}, resourceId=${task.resource.id}, downloadId=${downloadId}, reason=${settle.reason}`
      )
    }

    throw new Error(
      `[DownloadOrchestrator] 直连下载重试后仍中断: taskId=${task.snapshot.taskId}, resourceId=${task.resource.id}`
    )
  }

  /** offscreen 下载：确保文档存在、下发任务，等待终态回传收敛。 */
  private async runOffscreenDownload(task: OrchestratorTask): Promise<TaskOutcome> {
    await ensureOffscreenDocument()
    await this.offscreenClient.startTask({
      taskId: task.snapshot.taskId,
      resource: task.resource
    })

    return new Promise<TaskOutcome>((resolve, reject) => {
      task.resolveCompletion = resolve
      task.rejectCompletion = reject
    })
  }

  /**
   * 收敛 offscreen 任务的终态。
   *
   * 正常路径由 drain 等待 completion Promise 并负责移除/打点；SW 冷启动对账重建的任务没有
   * 等待方，由这里直接收敛投影并唤醒队列。
   */
  private settleOffscreenTask(
    task: OrchestratorTask,
    settle: { kind: 'completed' } | { kind: 'cancelled' } | { kind: 'failed'; error: Error }
  ): void {
    if (task.resolveCompletion) {
      if (settle.kind === 'failed') {
        task.rejectCompletion?.(settle.error)
      } else {
        task.resolveCompletion?.(settle.kind === 'completed' ? 'completed' : 'cancelled')
      }
      return
    }

    if (settle.kind === 'failed') {
      logger.error(
        `[DownloadOrchestrator] 对账重建的任务失败: taskId=${task.snapshot.taskId}`,
        settle.error
      )
      this.recordTaskMark(task, MARK_TYPE.DOWNLOAD_FAILED, settle.error)
      this.notifyTaskFinished(task, false)
      this.recordTaskHistory(task, false)
      task.snapshot.status = 'failed'
    } else if (settle.kind === 'completed') {
      this.recordTaskMark(task, MARK_TYPE.DOWNLOAD_SUCCESS)
      this.notifyTaskFinished(task, true)
      this.recordTaskHistory(task, true)
      this.removeTask(task.snapshot.taskId)
    } else {
      this.removeTask(task.snapshot.taskId)
    }
    if (this.activeTaskId === task.snapshot.taskId) {
      this.activeTaskId = null
    }
    this.publish()
    this.pump()
  }

  // ============================================================================
  // Chrome 下载 / 配额 / 投影工具
  // ============================================================================

  /** 直连下载状态轮询间隔；轮询本身每次 chrome.downloads.search 都会重置 SW idle 计时器。 */
  private static readonly DIRECT_POLL_INTERVAL_MS = 500

  /**
   * 轮询直连下载状态直到 settle。
   *
   * onChanged 不携带 bytesReceived 增量，进度投影沿用旧 content 轮询口径（500ms search）；
   * 轮询的 API 调用同时保活 SW，覆盖整个网络传输期。
   */
  private async pollDirectDownload(
    task: OrchestratorTask,
    downloadId: number
  ): Promise<DownloadSettle> {
    while (true) {
      const items = await chrome.downloads.search({ id: downloadId })
      const item = items[0]
      if (!item) {
        return { kind: 'interrupted', reason: 'DOWNLOAD_REMOVED' }
      }
      if (item.state === 'complete') {
        return { kind: 'complete' }
      }
      if (item.state === 'interrupted') {
        return { kind: 'interrupted', reason: item.error ?? 'UNKNOWN' }
      }

      this.updateDirectProgress(task, item.bytesReceived)
      await delay(DownloadOrchestrator.DIRECT_POLL_INTERVAL_MS)
    }
  }

  /** 等待 Chrome 下载 settle（blob 落盘路径；本地写盘耗时短，onChanged 足够）。 */
  private waitForDownloadSettle(downloadId: number): Promise<DownloadSettle> {
    return new Promise(resolve => {
      const listener = (delta: chrome.downloads.DownloadDelta): void => {
        if (delta.id !== downloadId) {
          return
        }

        if (delta.state?.current === 'complete') {
          cleanup()
          resolve({ kind: 'complete' })
          return
        }
        if (delta.state?.current === 'interrupted') {
          cleanup()
          resolve({ kind: 'interrupted', reason: delta.error?.current ?? 'UNKNOWN' })
        }
      }
      const cleanup = (): void => {
        chrome.downloads.onChanged.removeListener(listener)
      }

      chrome.downloads.onChanged.addListener(listener)
    })
  }

  /** 直连下载的字节进度投影；总大小未知时只展示字节。 */
  private updateDirectProgress(task: OrchestratorTask, bytesReceived: number): void {
    task.snapshot.receivedBytes = bytesReceived
    const totalBytes = task.resource.size ?? null
    if (totalBytes !== null && totalBytes > 0) {
      task.snapshot.totalBytes = totalBytes
      const progress = Math.min(99, Math.floor((bytesReceived / totalBytes) * 100))
      if (progress !== task.snapshot.progress) {
        task.snapshot.progress = progress
        this.publish()
      }
      return
    }
    this.publish()
  }

  /** 检查并消耗 1 次下载配额；API 失败 fail-open，不阻断用户下载。 */
  private async checkAndConsumeQuota(
    task: OrchestratorTask
  ): Promise<{ accepted: boolean; resetAt?: number }> {
    let response: QuotaCheckResponse
    try {
      response = await quotaApi.checkAndConsume({ count: 1 })
    } catch (error) {
      logger.error(
        `[DownloadOrchestrator] 配额 API 请求失败，允许下载: taskId=${task.snapshot.taskId}`,
        error
      )
      return { accepted: true }
    }

    if (response.status === 1) {
      return { accepted: true }
    }

    logger.warn(
      `[DownloadOrchestrator] 配额不足: taskId=${task.snapshot.taskId}, remaining=${response.remaining}`
    )
    return { accepted: false, resetAt: response.reset_at }
  }

  /** 通知发起 tab 的 content 显示既有升级弹窗；content 不在场时静默跳过。 */
  private notifyUpgradeModal(task: OrchestratorTask, resetAt?: number): void {
    if (task.tabId === null) {
      return
    }

    this.eventEmitter.emitToTab(task.tabId, 'showUpgradeModal', { resetAt })
  }

  /** 通知 offscreen 释放已确认落盘（或不再跟踪）的 blob 产物。 */
  private async releaseArtifact(taskId: string, blobUrl: string): Promise<void> {
    try {
      await this.offscreenClient.releaseTaskArtifact({ taskId, blobUrl })
    } catch (error) {
      // offscreen 不在场时 blob 随文档销毁；释放失败不影响落盘结果。
      logger.warn(
        `[DownloadOrchestrator] 释放产物失败（offscreen 可能已不在）: taskId=${taskId}`,
        error
      )
    }
  }

  /** 创建等待任务并记录下载点击打点；文件名模板在入队时渲染一次，终态挂钩共用。 */
  private async createTask(
    resource: MediaResource,
    tabId: number | null,
    pageUrl?: string
  ): Promise<OrchestratorTask> {
    this.nextSequence += 1
    const taskId = `bg-${Date.now().toString(36)}-${this.nextSequence}-${globalThis.crypto.randomUUID().slice(0, 8)}`
    const filename = await buildResourceFilename(resource)

    void recordBackgroundMark(MARK_TYPE.DOWNLOAD_CLICK, buildDownloadMarkMessage(resource))

    return {
      snapshot: {
        taskId,
        resourceId: resource.id,
        filename,
        type: resource.type,
        resourceIndex: resource.index,
        status: 'waiting',
        progress: null,
        receivedBytes: null,
        totalBytes: resource.size ?? null,
        bytesPerSecond: null,
        bytesAreEstimated: false
      },
      resource,
      finalName: filename,
      tabId,
      ...(pageUrl ? { pageUrl } : {}),
      kind: isBrowserManagedSourceKind(resource.sourceKind) ? 'direct' : 'offscreen',
      cancelRequested: false,
      downloadId: null,
      resolveCompletion: null,
      rejectCompletion: null,
      retryQuotaExempt: false
    }
  }

  /** 提升版本并推送完整快照：runtime 送达扩展页（popup），tabs 广播送达 content 页面按钮。 */
  private publish(): void {
    this.revision += 1
    const snapshot = this.getSnapshot()
    this.eventEmitter.emit('downloadQueueUpdated', snapshot)
    // emit 走 runtime.sendMessage，只达扩展页；content script 只能经 tabs.sendMessage 收到。
    void this.eventEmitter.broadcast('downloadQueueUpdated', snapshot)
  }

  /** 按资源 ID 查找任务。 */
  private findByResourceId(resourceId: string): OrchestratorTask | null {
    for (const task of this.tasks.values()) {
      if (task.snapshot.resourceId === resourceId) {
        return task
      }
    }
    return null
  }

  /** 从共享投影移除任务。 */
  private removeTask(taskId: string): void {
    this.tasks.delete(taskId)
  }

  /** 记录取消墓碑；超限按插入序淘汰最早记录。 */
  private addCancelledTaskTombstone(taskId: string): void {
    this.cancelledTaskIds.add(taskId)
    while (this.cancelledTaskIds.size > CANCELLED_TASK_IDS_LIMIT) {
      const oldest = this.cancelledTaskIds.keys().next()
      if (oldest.done) {
        break
      }
      this.cancelledTaskIds.delete(oldest.value)
    }
  }

  /** 消费取消墓碑；返回是否命中（命中即该任务的一切后续交付必须拒绝）。 */
  private consumeCancelledTaskTombstone(taskId: string): boolean {
    return this.cancelledTaskIds.delete(taskId)
  }

  /** 统一打点；上报失败由 reporter 自行记录，不影响任务状态。 */
  private recordTaskMark(task: OrchestratorTask, markType: MarkType, error?: Error): void {
    void recordBackgroundMark(markType, buildDownloadMarkMessage(task.resource, error))
  }

  /**
   * 任务终态挂钩：发系统通知，成功时向扩展页（popup）广播成功事件供评分引导计数。
   * 挂钩失败（通知 API 异常、无接收方）不影响编排循环本身。
   */
  private notifyTaskFinished(task: OrchestratorTask, succeeded: boolean): void {
    void notifyDownloadFinished({ filename: task.finalName, succeeded })

    if (succeeded) {
      this.eventEmitter.emit('downloadTaskSucceeded', {
        taskId: task.snapshot.taskId,
        resourceId: task.snapshot.resourceId
      })
    }
  }

  /**
   * 任务终态历史回写挂钩：与通知挂钩同一批调用点，把成功/失败终态写入下载历史。
   * 回写失败（存储异常）只记日志，不影响编排循环。
   */
  private recordTaskHistory(task: OrchestratorTask, succeeded: boolean): void {
    void recordDownloadTaskOutcome({
      resource: task.resource,
      ...(task.pageUrl ? { pageUrl: task.pageUrl } : {}),
      filename: task.finalName,
      succeeded
    })
  }
}

/** 判断来源是否为需要 offscreen 执行的 Vimeo adaptive 下载。 */
function isAdaptiveSourceKind(sourceKind: string): boolean {
  return (
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_HLS_VIDEO ||
    sourceKind === RESOURCE_SOURCE_KINDS.VIMEO_DASH_AUDIO
  )
}

/**
 * 构造不包含媒体 URL 的下载事件摘要。
 *
 * 失败原因放在对象前部，确保 SLS 的总长度截断仍优先保留错误内容；最终文本还会经过 mark
 * sanitizer，避免下游 Error message 意外携带 token 或完整直链。
 */
function buildDownloadMarkMessage(resource: MediaResource, error?: Error): string {
  return JSON.stringify({
    ...(error ? { error_name: error.name, error_message: error.message } : {}),
    resource_type: resource.type,
    source_kind: resource.sourceKind
  })
}

/** 把页面资源收敛成 Chrome 直连下载的最小合同。 */
function toDirectSource(
  resource: MediaResource,
  filename: string
): BackgroundBrowserDownloadSource {
  if (!resource.mimeType || !resource.documentId) {
    throw new Error(
      `[DownloadOrchestrator] 直连资源缺少 MIME 或 descriptor: sourceId=${resource.id}, mimeType=${resource.mimeType ?? 'missing'}, documentId=${resource.documentId ? 'present' : 'missing'}`
    )
  }
  if (!isBrowserManagedSourceKind(resource.sourceKind)) {
    throw new Error(
      `[DownloadOrchestrator] 来源不支持 Chrome 直连下载: sourceId=${resource.id}, sourceKind=${resource.sourceKind}`
    )
  }

  return {
    source_id: resource.id,
    url: resource.url,
    type: resource.type,
    source_kind: resource.sourceKind,
    filename,
    mime_type: resource.mimeType,
    document_id: resource.documentId
  }
}

/** Background 下载编排器单例。 */
export const downloadOrchestrator = new DownloadOrchestrator()

/**
 * 读取发起 tab 的当前 URL，供历史回写记录发起页。
 *
 * tab 已关闭或无 host 权限读 URL 时缺省；host_permissions 覆盖平台页，正常路径都能拿到。
 */
async function resolveTabUrl(tabId: number | null): Promise<string | undefined> {
  if (tabId === null) {
    return undefined
  }
  try {
    const tab = await chrome.tabs.get(tabId)
    return typeof tab.url === 'string' && tab.url.length > 0 ? tab.url : undefined
  } catch (error) {
    logger.warn(
      `[DownloadOrchestrator] 读取发起 tab URL 失败（tab 可能已关闭）: tabId=${tabId}`,
      error
    )
    return undefined
  }
}

/** 不阻塞编排循环的轮询延迟。 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
