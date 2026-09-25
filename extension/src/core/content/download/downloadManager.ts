/**
 * 当前 content 页面唯一的下载管理器。
 *
 * 所有单项和批量入口只把任务加入同一 FIFO 列表；唯一 async worker 立即开始排空列表，
 * 任意时刻最多执行一个真实下载。任务列表同时是 Popup 状态的唯一数据源。
 */

import { injectedClient } from '@/content/rpc/injectedClient'
import { MARK_TYPE } from '@/core/api/mark/types'
import { getDefaultResourceExtension, isBrowserManagedSourceKind } from '@/core/constants/resource'
import { quotaService } from '@/core/content/services/QuotaService'
import { recordContentMark } from '@/core/content/services/ContentMarkReporter'
import type { ContentEvents, ExtensionEvents } from '@/core/events/types'
import { DOWNLOAD_EVENT_PREFIX, type IMediaSource } from '@/core/protocol/injected'
import { ChromeEventEmitter } from '@/core/rpc/ChromeEventBus'
import { DomEventSubscriber } from '@/core/rpc/DomEventBus'
import type { DownloadQueueSnapshot, DownloadTaskSnapshot, MediaResource } from '@/core/types'
import { logger } from '@/core/utils/logger'
import { downloadWithBrowserManager } from './browserDownload'

/**
 * 完整下载 RPC 跟随页面生命周期等待。
 *
 * caller timeout 不会中止 MAIN 的真实传输；已开始的传输没有取消协议，timeout 只约束
 * 页面生命周期内的长调用。
 */
const DOWNLOAD_TIMEOUT_MS = 24 * 60 * 60 * 1000

/** 固定采样让无进度事件时也能衰减并清空陈旧速度。 */
const DOWNLOAD_SPEED_SAMPLE_INTERVAL_MS = 500

/** 首次展示前积累更长区间，避免首个短区间放大分块完成抖动。 */
const DOWNLOAD_SPEED_INITIAL_SAMPLE_MS = 1000

/** 连续无新增字节达到该时长后，速度恢复为未知。 */
const DOWNLOAD_SPEED_STALE_MS = 3000

/** EMA 新观测权重；较低权重用于平滑并发分块完成造成的瞬时尖峰。 */
const DOWNLOAD_SPEED_EMA_ALPHA = 0.2

/** 下载执行结果；额度拒绝不计入下载失败。 */
type DownloadExecutionResult = 'completed' | 'quota_rejected'

/** 单个活动任务的固定速度采样状态。 */
interface DownloadSpeedState {
  latestReceivedBytes: number
  lastObservedAt: number
  lastBytesChangedAt: number
  sampledBytes: number
  sampledAt: number
  smoothedBytesPerSecond: number | null
}

/** 管理器内部任务；对 Popup 只暴露 snapshot。 */
interface ManagedDownloadTask {
  /** Popup 可见的任务字段。 */
  snapshot: DownloadTaskSnapshot
  /** 执行真实下载与人工重试共用的完整资源。 */
  resource: MediaResource
  /** 调用方等待本任务当前执行轮次结束的 Promise。 */
  completion: Promise<void>
  /** 成功或额度拒绝时完成调用方 Promise。 */
  resolveCompletion: () => void
  /** 下载抛错时拒绝调用方 Promise。 */
  rejectCompletion: (error: Error) => void
  /** 进度事件只更新累计字节；固定采样器负责计算并发布展示速度。 */
  speedState: DownloadSpeedState | null
  /** 当前执行轮次 completion 是否已经 settled。 */
  completionSettled: boolean
  /** 人工重试从第一次开始永久跳过额度消耗。 */
  retryQuotaExempt: boolean
}

/** 当前页面 FIFO 下载管理器。 */
class DownloadManager {
  /** 当前 document 生命周期唯一作用域。 */
  private readonly scopeId = createScopeId()

  /** Popup 状态推送器；没有打开的 Popup 时发送失败会由 EventBus 忽略。 */
  private readonly eventEmitter = new ChromeEventEmitter<ExtensionEvents>()

  /** MAIN/content 共用的非可信进度事件订阅器。 */
  private readonly progressSubscriber = new DomEventSubscriber<ContentEvents>(DOWNLOAD_EVENT_PREFIX)

  /** 唯一 FIFO 下载列表；首项可能正在执行，其余项等待。 */
  private readonly downloadList: ManagedDownloadTask[] = []

  /** content 页面内直接消费队列快照的订阅者。 */
  private readonly snapshotListeners = new Set<(snapshot: DownloadQueueSnapshot) => void>()

  /** 防止多个 enqueue 调用创建并行 worker。 */
  private isDraining = false

  /** 当前唯一真实执行任务；failed 可以留在列表前部，因此不能用数组首项代替。 */
  private activeTaskId: string | null = null

  /** 同一页面内的任务自增序号。 */
  private nextTaskSequence = 0

  /** FIFO 同时只有一个活动项，因此全页面只维护一个速度采样器。 */
  private speedSampleTimer: ReturnType<typeof setInterval> | null = null

  /** 状态版本；只有可见快照发生变化时递增。 */
  private revision = 0

  constructor() {
    this.progressSubscriber.on('downloadProgress', detail => {
      this.updateProgress(detail)
    })
  }

  /**
   * 把资源一次性加入 FIFO，并立即唤醒唯一 worker。
   *
   * @returns 与输入顺序一致的单任务完成 Promise
   */
  enqueue(resources: readonly MediaResource[]): Promise<void>[] {
    if (resources.length === 0) {
      return []
    }

    let snapshotChanged = false
    const completions = resources.map(resource => {
      const existingIndex = this.downloadList.findIndex(task => task.resource.id === resource.id)
      if (existingIndex < 0) {
        const task = this.createTask(resource)
        this.downloadList.push(task)
        snapshotChanged = true
        return task.completion
      }

      const task = this.downloadList[existingIndex]
      if (task.snapshot.status === 'waiting') {
        snapshotChanged = this.refreshWaitingTask(task, resource) || snapshotChanged
      } else if (task.snapshot.status === 'failed') {
        this.restoreFailedTask(existingIndex, resource)
        snapshotChanged = true
      }
      return task.completion
    })
    if (snapshotChanged) {
      this.publish()
    }
    void this.drain()
    return completions
  }

  /** 返回不共享内部引用的当前快照。 */
  getSnapshot(): DownloadQueueSnapshot {
    return {
      scopeId: this.scopeId,
      revision: this.revision,
      tasks: this.downloadList.map(task => ({ ...task.snapshot }))
    }
  }

  /** 订阅当前 document 的队列快照；注册时立即推送当前值。 */
  subscribe(listener: (snapshot: DownloadQueueSnapshot) => void): () => void {
    this.snapshotListeners.add(listener)
    listener(this.getSnapshot())
    return () => this.snapshotListeners.delete(listener)
  }

  /**
   * 按任务 ID 取消等待中的任务。
   *
   * 真实传输由 injected 长调用持有且没有取消协议，本地移除只会让页面在传输结束后丢弃
   * 结果；因此已开始的任务与失败任务都不接受取消。
   */
  cancel(taskId: string): boolean {
    const taskIndex = this.downloadList.findIndex(task => task.snapshot.taskId === taskId)
    if (taskIndex < 0 || this.downloadList[taskIndex].snapshot.status !== 'waiting') {
      return false
    }

    const task = this.downloadList[taskIndex]
    this.downloadList.splice(taskIndex, 1)
    this.resolveTaskCompletion(task)
    this.publish()
    logger.info(
      `[DownloadManager] 已接受取消: taskId=${taskId}, status=waiting, result=waiting-removed`
    )
    return true
  }

  /** 把失败任务恢复为初始展示状态并移到 FIFO 尾部重新执行。 */
  retry(taskId: string): boolean {
    const taskIndex = this.downloadList.findIndex(task => task.snapshot.taskId === taskId)
    if (taskIndex < 0 || this.downloadList[taskIndex].snapshot.status !== 'failed') {
      return false
    }

    this.restoreFailedTask(taskIndex, this.downloadList[taskIndex].resource)
    this.publish()
    void this.drain()
    return true
  }

  /** 一次移除全部等待任务并完成其原调用方 Promise。 */
  clearWaiting(): number {
    const waitingTasks = this.downloadList.filter(task => task.snapshot.status === 'waiting')
    if (waitingTasks.length === 0) {
      return 0
    }
    const waitingIds = new Set(waitingTasks.map(task => task.snapshot.taskId))
    removeTasks(this.downloadList, waitingIds)
    waitingTasks.forEach(task => this.resolveTaskCompletion(task))
    this.publish()
    return waitingTasks.length
  }

  /** 一次清理全部等待与失败任务。 */
  clearAll(): number {
    const removableTasks = this.downloadList.filter(
      task => task.snapshot.status === 'waiting' || task.snapshot.status === 'failed'
    )
    if (removableTasks.length === 0) {
      return 0
    }

    const removableIds = new Set(removableTasks.map(task => task.snapshot.taskId))
    removeTasks(this.downloadList, removableIds)
    removableTasks
      .filter(task => task.snapshot.status === 'waiting')
      .forEach(task => this.resolveTaskCompletion(task))
    this.publish()
    return removableTasks.length
  }

  /** 创建一个等待任务及其调用方完成 Promise。 */
  private createTask(resource: MediaResource): ManagedDownloadTask {
    const taskId = `${this.scopeId}:${++this.nextTaskSequence}`

    recordContentMark(MARK_TYPE.DOWNLOAD_CLICK, buildDownloadMarkMessage(resource))

    return {
      snapshot: createWaitingSnapshot(taskId, resource),
      resource,
      ...createCompletionRound(),
      speedState: null,
      completionSettled: false,
      retryQuotaExempt: false
    }
  }

  /** waiting 保持位置与当前 completion，只刷新下一次执行使用的材料和可见字段。 */
  private refreshWaitingTask(task: ManagedDownloadTask, resource: MediaResource): boolean {
    const previousSnapshot = task.snapshot
    const nextSnapshot = createWaitingSnapshot(previousSnapshot.taskId, resource)
    task.resource = resource
    task.snapshot = nextSnapshot
    return !sameSnapshot(previousSnapshot, nextSnapshot)
  }

  /** failed 复用同一任务行，尾插并建立新的当前执行轮次。 */
  private restoreFailedTask(taskIndex: number, resource: MediaResource): ManagedDownloadTask {
    const [task] = this.downloadList.splice(taskIndex, 1)
    task.resource = resource
    task.snapshot = createWaitingSnapshot(task.snapshot.taskId, resource)
    task.speedState = null
    task.retryQuotaExempt = true
    Object.assign(task, createCompletionRound())
    this.downloadList.push(task)
    return task
  }

  /**
   * 立即排空 FIFO。
   *
   * isDraining 是唯一 worker 锁；任务完成后直接取下一项，不使用定时轮询，因此没有额外
   * 1 秒等待，也不会产生重叠 interval tick。
   */
  private async drain(): Promise<void> {
    if (this.isDraining) {
      return
    }

    this.isDraining = true
    let task = this.downloadList.find(candidate => candidate.snapshot.status === 'waiting')
    while (task) {
      this.activeTaskId = task.snapshot.taskId
      task.snapshot.status = 'downloading'
      task.snapshot.progress = null
      this.startSpeedSampling()
      this.publish()

      const outcome = await this.performDownload(task).then(
        result => ({ kind: 'result' as const, result }),
        error => ({ kind: 'error' as const, error })
      )

      if (outcome.kind === 'result') {
        if (outcome.result === 'completed') {
          recordContentMark(MARK_TYPE.DOWNLOAD_SUCCESS, buildDownloadMarkMessage(task.resource))
        } else if (outcome.result === 'quota_rejected') {
          recordContentMark(
            MARK_TYPE.DOWNLOAD_QUOTA_INSUFFICIENT,
            buildDownloadMarkMessage(task.resource)
          )
        }
        this.resolveTaskCompletion(task)
        this.removeTask(task.snapshot.taskId)
      } else {
        const error = outcome.error
        const taskError =
          error instanceof Error
            ? error
            : new Error(
                `[DownloadManager] 下载任务抛出非 Error: resourceId=${task.resource.id}, valueType=${error === null ? 'null' : typeof error}`
              )
        logger.error(
          `[DownloadManager] 下载任务失败: taskId=${task.snapshot.taskId}, resourceId=${task.resource.id}, sourceKind=${task.resource.sourceKind}`,
          taskError
        )
        recordContentMark(
          MARK_TYPE.DOWNLOAD_FAILED,
          buildDownloadMarkMessage(task.resource, taskError)
        )
        task.snapshot.status = 'failed'
        this.rejectTaskCompletion(task, taskError)
      }

      this.stopSpeedSampling(task)
      if (this.activeTaskId === task.snapshot.taskId) {
        this.activeTaskId = null
      }
      this.publish()
      task = this.downloadList.find(candidate => candidate.snapshot.status === 'waiting')
    }
    this.isDraining = false
  }

  /** 执行当前显式活动项。 */
  private async performDownload(task: ManagedDownloadTask): Promise<DownloadExecutionResult> {
    this.publishResolvedResource(task)

    const quotaAccepted = task.retryQuotaExempt || (await quotaService.checkAndConsume(1))
    if (!quotaAccepted) {
      return 'quota_rejected'
    }

    const resource = task.resource
    const filename = resolveFilename(resource)
    if (isBrowserManagedSourceKind(resource.sourceKind)) {
      await downloadWithBrowserManager(task.snapshot.taskId, resource, filename)
      return 'completed'
    }

    await injectedClient.downloadMedia(
      { taskId: task.snapshot.taskId, source: toMediaSource(resource, filename) },
      { timeout: DOWNLOAD_TIMEOUT_MS }
    )
    return 'completed'
  }

  /** 发布最终文件名、类型和声明大小，再进入额度检查。 */
  private publishResolvedResource(task: ManagedDownloadTask): void {
    const filename = resolveFilename(task.resource)
    const totalBytes = task.resource.size ?? null
    const changed =
      task.snapshot.filename !== filename ||
      task.snapshot.type !== task.resource.type ||
      task.snapshot.totalBytes !== totalBytes
    task.snapshot.filename = filename
    task.snapshot.type = task.resource.type
    task.snapshot.totalBytes = totalBytes
    if (changed) {
      this.publish()
    }
  }

  /**
   * 接收页面下载器进度。
   *
   * 页面可伪造 DOM 事件，因此这里只接受显式活动任务，且任务/资源 ID 必须同时匹配；事件不能
   * 新增、启动、完成或移除任务。
   */
  private updateProgress(detail: ContentEvents['downloadProgress']): void {
    if (
      !detail ||
      typeof detail.taskId !== 'string' ||
      typeof detail.sourceId !== 'string' ||
      (detail.progress !== null &&
        (typeof detail.progress !== 'number' || !Number.isFinite(detail.progress))) ||
      (detail.receivedBytes !== null &&
        (typeof detail.receivedBytes !== 'number' ||
          !Number.isFinite(detail.receivedBytes) ||
          detail.receivedBytes < 0)) ||
      (detail.totalBytes !== null &&
        (typeof detail.totalBytes !== 'number' ||
          !Number.isFinite(detail.totalBytes) ||
          detail.totalBytes < 0)) ||
      typeof detail.bytesAreEstimated !== 'boolean' ||
      (detail.filename !== undefined && typeof detail.filename !== 'string')
    ) {
      return
    }

    const activeTask = this.getActiveTask()
    if (
      !activeTask ||
      activeTask.snapshot.status !== 'downloading' ||
      activeTask.snapshot.taskId !== detail.taskId ||
      activeTask.snapshot.resourceId !== detail.sourceId
    ) {
      return
    }

    const normalizedProgress =
      detail.progress === null ? null : Math.max(0, Math.min(100, detail.progress))
    const previousSnapshot = { ...activeTask.snapshot }
    activeTask.snapshot.progress = normalizedProgress
    activeTask.snapshot.receivedBytes = detail.receivedBytes
    if (detail.totalBytes !== null) {
      activeTask.snapshot.totalBytes = detail.totalBytes
    }
    activeTask.snapshot.bytesAreEstimated = detail.bytesAreEstimated
    if (detail.filename !== undefined) {
      activeTask.snapshot.filename = detail.filename
    }
    this.observeReceivedBytes(activeTask, detail.receivedBytes)

    if (!sameSnapshot(previousSnapshot, activeTask.snapshot)) {
      this.publish()
    }
  }

  /** 进度事件只记录最新累计字节；时钟或字节回退时重新建立速度基线。 */
  private observeReceivedBytes(task: ManagedDownloadTask, receivedBytes: number | null): void {
    if (receivedBytes === null) {
      task.speedState = null
      task.snapshot.bytesPerSecond = null
      return
    }

    const observedAt = Date.now()
    const state = task.speedState
    if (
      !state ||
      observedAt < state.lastObservedAt ||
      receivedBytes < state.latestReceivedBytes ||
      observedAt - state.lastBytesChangedAt >= DOWNLOAD_SPEED_STALE_MS
    ) {
      task.speedState = createSpeedState(receivedBytes, observedAt)
      task.snapshot.bytesPerSecond = null
      return
    }

    if (receivedBytes > state.latestReceivedBytes) {
      state.latestReceivedBytes = receivedBytes
      state.lastBytesChangedAt = observedAt
    }
    state.lastObservedAt = observedAt
  }

  /** 启动当前活动任务的唯一固定采样器；FIFO 串行切换必经 finally 停止，无残留定时器。 */
  private startSpeedSampling(): void {
    this.speedSampleTimer = setInterval(
      () => this.sampleDownloadSpeed(),
      DOWNLOAD_SPEED_SAMPLE_INTERVAL_MS
    )
  }

  /** 停止采样并清空任务的速度状态。 */
  private stopSpeedSampling(task: ManagedDownloadTask): void {
    if (this.speedSampleTimer !== null) {
      clearInterval(this.speedSampleTimer)
      this.speedSampleTimer = null
    }
    task.speedState = null
    task.snapshot.bytesPerSecond = null
  }

  /** 按固定时钟计算区间吞吐，再用 EMA 平滑后发布快照。 */
  private sampleDownloadSpeed(): void {
    const task = this.getActiveTask()
    const state = task?.speedState
    if (!task || task.snapshot.status !== 'downloading' || !state) {
      return
    }

    const sampledAt = Date.now()
    const sampleSpan = sampledAt - state.sampledAt
    if (sampleSpan < 0) {
      task.speedState = createSpeedState(state.latestReceivedBytes, sampledAt)
      if (task.snapshot.bytesPerSecond !== null) {
        task.snapshot.bytesPerSecond = null
        this.publish()
      }
      return
    }
    if (sampledAt - state.lastBytesChangedAt >= DOWNLOAD_SPEED_STALE_MS) {
      task.speedState = createSpeedState(state.latestReceivedBytes, sampledAt)
      if (task.snapshot.bytesPerSecond !== null) {
        task.snapshot.bytesPerSecond = null
        this.publish()
      }
      return
    }
    if (
      sampleSpan <
      (state.smoothedBytesPerSecond === null
        ? DOWNLOAD_SPEED_INITIAL_SAMPLE_MS
        : DOWNLOAD_SPEED_SAMPLE_INTERVAL_MS)
    ) {
      return
    }
    if (state.smoothedBytesPerSecond === null && state.latestReceivedBytes === state.sampledBytes) {
      return
    }

    const intervalBytesPerSecond =
      ((state.latestReceivedBytes - state.sampledBytes) * 1000) / sampleSpan
    const smoothedBytesPerSecond =
      state.smoothedBytesPerSecond === null
        ? intervalBytesPerSecond
        : state.smoothedBytesPerSecond * (1 - DOWNLOAD_SPEED_EMA_ALPHA) +
          intervalBytesPerSecond * DOWNLOAD_SPEED_EMA_ALPHA
    state.sampledBytes = state.latestReceivedBytes
    state.sampledAt = sampledAt
    state.smoothedBytesPerSecond = smoothedBytesPerSecond
    task.snapshot.bytesPerSecond = smoothedBytesPerSecond
    this.publish()
  }

  /** 提升版本并向 Popup 与 content 本地订阅者推送完整快照。 */
  private publish(): void {
    this.revision += 1
    const snapshot = this.getSnapshot()
    this.eventEmitter.emit('downloadQueueUpdated', snapshot)
    this.snapshotListeners.forEach(listener => listener(snapshot))
  }

  /** 返回当前显式活动任务。 */
  private getActiveTask(): ManagedDownloadTask | undefined {
    return this.activeTaskId === null
      ? undefined
      : this.downloadList.find(task => task.snapshot.taskId === this.activeTaskId)
  }

  /** 从共享列表移除指定任务。 */
  private removeTask(taskId: string): void {
    const index = this.downloadList.findIndex(task => task.snapshot.taskId === taskId)
    if (index >= 0) {
      this.downloadList.splice(index, 1)
    }
  }

  /** 当前执行轮次 Promise 只允许完成一次。 */
  private resolveTaskCompletion(task: ManagedDownloadTask): void {
    if (!task.completionSettled) {
      task.completionSettled = true
      task.resolveCompletion()
    }
  }

  /** 当前执行轮次 Promise 只允许拒绝一次。 */
  private rejectTaskCompletion(task: ManagedDownloadTask, error: Error): void {
    if (!task.completionSettled) {
      task.completionSettled = true
      task.rejectCompletion(error)
    }
  }
}

/** completion 只表示当前执行轮次；内部 observer 保证 RPC 重试失败不会成为未处理拒绝。 */
function createCompletionRound(): Pick<
  ManagedDownloadTask,
  'completion' | 'resolveCompletion' | 'rejectCompletion' | 'completionSettled'
> {
  let resolveCompletion: () => void
  let rejectCompletion: (error: Error) => void
  const completion = new Promise<void>((resolve, reject) => {
    resolveCompletion = resolve
    rejectCompletion = error => reject(error)
  })
  void completion.catch(() => undefined)
  return {
    completion,
    resolveCompletion: resolveCompletion!,
    rejectCompletion: rejectCompletion!,
    completionSettled: false
  }
}

/** 从初始资源构造等待展示字段，人工重试复用同一口径。 */
function createWaitingSnapshot(taskId: string, resource: MediaResource): DownloadTaskSnapshot {
  return {
    taskId,
    resourceId: resource.id,
    ...(resource.filename ? { filename: resource.filename } : {}),
    type: resource.type,
    resourceIndex: resource.index,
    status: 'waiting',
    progress: null,
    receivedBytes: null,
    totalBytes: resource.size ?? null,
    bytesPerSecond: null,
    bytesAreEstimated: false
  }
}

/** 原地批量删除任务，保留其余任务顺序与唯一列表引用。 */
function removeTasks(tasks: ManagedDownloadTask[], taskIds: ReadonlySet<string>): void {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (taskIds.has(tasks[index].snapshot.taskId)) {
      tasks.splice(index, 1)
    }
  }
}

/** 判断展示快照是否发生变化。 */
function sameSnapshot(left: DownloadTaskSnapshot, right: DownloadTaskSnapshot): boolean {
  return (
    left.resourceId === right.resourceId &&
    left.type === right.type &&
    left.resourceIndex === right.resourceIndex &&
    left.status === right.status &&
    left.filename === right.filename &&
    left.progress === right.progress &&
    left.receivedBytes === right.receivedBytes &&
    left.totalBytes === right.totalBytes &&
    left.bytesPerSecond === right.bytesPerSecond &&
    left.bytesAreEstimated === right.bytesAreEstimated
  )
}

/**
 * 构造不包含媒体 URL、文件名和消息身份的下载事件摘要。
 *
 * 失败原因放在对象前部，确保 SLS 的总长度截断仍优先保留用户要求的错误内容；最终文本还会
 * 经过 mark sanitizer，避免下游 Error message 意外携带 token 或完整直链。
 */
function buildDownloadMarkMessage(resource: MediaResource, error?: Error): string {
  return JSON.stringify({
    ...(error ? { error_name: error.name, error_message: error.message } : {}),
    resource_type: resource.type,
    source_kind: resource.sourceKind
  })
}

/** 用首个有效累计字节建立固定采样基线。 */
function createSpeedState(receivedBytes: number, sampledAt: number): DownloadSpeedState {
  return {
    latestReceivedBytes: receivedBytes,
    lastObservedAt: sampledAt,
    lastBytesChangedAt: sampledAt,
    sampledBytes: receivedBytes,
    sampledAt,
    smoothedBytesPerSecond: null
  }
}

/** 把站点资源转换为 injected 下载协议。 */
function toMediaSource(resource: MediaResource, filename: string): IMediaSource {
  return {
    url: resource.url,
    id: resource.id,
    type: resource.type,
    sourceKind: resource.sourceKind,
    page: 'content',
    messageId: resource.messageId,
    documentId: resource.documentId,
    codec: resource.codec,
    chatId: resource.chatId,
    filename,
    size: resource.size,
    mimeType: resource.mimeType
  }
}

/** 统一生成 injected 与 Chrome 原生下载使用的文件名。 */
function resolveFilename(resource: MediaResource): string {
  return (
    resource.filename ??
    `${resource.chatId || 'unknown'}_${resource.messageId}_${resource.index + 1}${getDefaultResourceExtension(resource.type, resource.mimeType)}`
  )
}

/** 生成无需持久化的页面生命周期作用域 ID。 */
function createScopeId(): string {
  return `${Date.now().toString(36)}-${globalThis.crypto.randomUUID()}`
}

/** 当前 content document 唯一下载管理器。 */
export const downloadManager = new DownloadManager()
