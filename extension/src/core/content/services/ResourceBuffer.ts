/**
 * 通用资源缓冲区。
 *
 * 站点层只提供 pageKey 和来源排序，缓存负责按视频分组去重、页面切换清空和 badge 更新。
 * 分组键是资源的 messageId（站点视频 ID）；两条写入路径共享这一个模型——
 * 有页面身份的站点页是单视频快照（`replaceSnapshot`），身份缺失的聚合页回退是逐视频
 * 合并（`mergeVideoResources`），不存在第二套缓冲结构。
 */

import { BackgroundChannel } from '@/content/rpc/background.rpc'
import type { MediaResource } from '@/core/types'
import { logger } from '@/core/utils/logger'

const DEFAULT_CHECK_INTERVAL_MS = 500

/** 通用资源缓冲区。 */
export abstract class ResourceBuffer {
  /** 当前页面的资源，按视频分组；组序即写入顺序，组内按资源 id 去重。 */
  private videoGroups = new Map<string, Map<string, MediaResource>>()

  /** 当前页面缓存键。 */
  private currentPageKey: string | null = null

  /** 页面检查定时器。 */
  private pageCheckTimer: number | null = null

  /** background RPC 客户端。 */
  private readonly backgroundClient = new BackgroundChannel()

  /** 站点日志名。 */
  protected abstract readonly siteName: string

  /** 当前页面缓存键。 */
  protected abstract getPageKey(): string

  /** 来源排序，数字越大优先级越高。 */
  protected abstract getSourceRank(resource: MediaResource): number

  /** 页面切换检查间隔。 */
  protected getCheckIntervalMs(): number {
    return DEFAULT_CHECK_INTERVAL_MS
  }

  /** 启动缓冲区。 */
  start(): void {
    logger.info(`[ResourceBuffer:${this.siteName}] 启动资源缓冲区`)
    this.currentPageKey = this.getPageKey()

    const intervalMs = this.getCheckIntervalMs()
    this.pageCheckTimer = window.setInterval(() => {
      this.checkPageChange()
    }, intervalMs)

    logger.info(`[ResourceBuffer:${this.siteName}] 当前页面键: ${this.currentPageKey}`)
  }

  /** 停止缓冲区。 */
  stop(): void {
    if (this.pageCheckTimer !== null) {
      clearInterval(this.pageCheckTimer)
      this.pageCheckTimer = null
    }

    this.clear()
    logger.info(`[ResourceBuffer:${this.siteName}] 资源缓冲区已停止`)
  }

  /**
   * 用单视频快照替换缓存（页面身份路径）。
   *
   * 有身份的页面只有一个主角视频，站点还会复用 DOM 与网络请求；整体替换让「当前页面
   * 可见/已挂载的媒体」成为唯一真相，上一轮扫描的陈旧资源与页面切换前的其他视频不会残留。
   */
  replaceSnapshot(videoId: string, resources: MediaResource[]): void {
    const nextGroups = new Map<string, Map<string, MediaResource>>()
    nextGroups.set(videoId, this.buildRankedGroup(resources))
    this.commit(nextGroups)
  }

  /**
   * 合并一个视频的资源（身份缺失聚合页的回退路径）。
   *
   * 聚合页没有唯一主角视频，各视频独立走校验链路后逐个并入：新视频追加成组，已有视频
   * 按资源 id 去重、来源排序择优。只影响该视频自己的分组，已并入的其他视频不受影响。
   */
  mergeVideoResources(videoId: string, resources: MediaResource[]): void {
    const existing = this.videoGroups.get(videoId)
    const nextGroup = existing ?? new Map<string, MediaResource>()
    let changed = false

    for (const resource of resources) {
      const previous = nextGroup.get(resource.id)
      if (!previous) {
        nextGroup.set(resource.id, resource)
        changed = true
        continue
      }

      if (this.shouldReplace(previous, resource)) {
        nextGroup.set(resource.id, resource)
        changed = true
      }
    }

    if (!changed) {
      return
    }

    // Map.set 对已存在的键不改变组序：视频顺序保持首次写入（捕获）顺序。
    this.videoGroups.set(videoId, nextGroup)
    this.notifyUpdate()
  }

  /** 根据资源 ID 获取资源。 */
  getResource(resourceId: string): MediaResource | undefined {
    for (const group of this.videoGroups.values()) {
      const resource = group.get(resourceId)
      if (resource) {
        return resource
      }
    }

    return undefined
  }

  /** 获取全部资源，按视频分组顺序展开。 */
  getAllResources(): MediaResource[] {
    const resources: MediaResource[] = []
    for (const group of this.videoGroups.values()) {
      for (const resource of group.values()) {
        resources.push(resource)
      }
    }

    return resources
  }

  /** 获取资源总数（badge 语义：当前页面可下载资源数，跨视频累计）。 */
  getCount(): number {
    let count = 0
    for (const group of this.videoGroups.values()) {
      count += group.size
    }

    return count
  }

  /** 清空资源。 */
  clear(): void {
    const previousCount = this.getCount()
    this.videoGroups.clear()

    if (previousCount > 0) {
      logger.info(`[ResourceBuffer:${this.siteName}] 缓冲区已清空，清除 ${previousCount} 个资源`)
      this.notifyUpdate()
    }
  }

  /** 页面已切换时同步 pageKey 并清空资源。 */
  resetForPageChange(): void {
    this.currentPageKey = this.getPageKey()
    this.clear()
  }

  /** 检测页面键变化。 */
  private checkPageChange(): void {
    const nextPageKey = this.getPageKey()
    if (nextPageKey === this.currentPageKey) {
      return
    }

    logger.info(
      `[ResourceBuffer:${this.siteName}] 检测到页面切换: ${this.currentPageKey} -> ${nextPageKey}`
    )
    this.currentPageKey = nextPageKey
    this.clear()
  }

  /** 来源排序，数字越大优先级越高。 */
  private shouldReplace(previous: MediaResource, next: MediaResource): boolean {
    return this.getSourceRank(next) >= this.getSourceRank(previous)
  }

  /** 按 id 去重生成新分组，同 id 保留更高来源排序版本。 */
  private buildRankedGroup(resources: MediaResource[]): Map<string, MediaResource> {
    const nextGroup = new Map<string, MediaResource>()

    for (const resource of resources) {
      const previous = nextGroup.get(resource.id)
      if (!previous || this.shouldReplace(previous, resource)) {
        nextGroup.set(resource.id, resource)
      }
    }

    return nextGroup
  }

  /** 用下一帧缓存整体替换并按需通知 badge。 */
  private commit(nextGroups: Map<string, Map<string, MediaResource>>): void {
    const changed = !this.isSameGroups(nextGroups)
    this.videoGroups = nextGroups

    if (changed) {
      this.notifyUpdate()
    }
  }

  /** 判断新旧缓存是否等价，避免定时扫描造成重复 badge 更新。 */
  private isSameGroups(nextGroups: Map<string, Map<string, MediaResource>>): boolean {
    if (this.videoGroups.size !== nextGroups.size) {
      return false
    }

    for (const [videoId, nextGroup] of nextGroups) {
      const previousGroup = this.videoGroups.get(videoId)
      if (!previousGroup || previousGroup.size !== nextGroup.size) {
        return false
      }

      for (const [id, next] of nextGroup) {
        const previous = previousGroup.get(id)
        if (!previous || !isSameResource(previous, next)) {
          return false
        }
      }
    }

    return true
  }

  /** 通知 background 更新 badge。 */
  private notifyUpdate(): void {
    const count = this.getCount()

    this.backgroundClient.updateBadge({ count }).catch(() => {
      // background 可能暂时不可用，badge 更新失败不影响页面扫描。
    })
  }
}

/** 比较会影响展示和下载的字段。 */
function isSameResource(left: MediaResource, right: MediaResource): boolean {
  return (
    left.id === right.id &&
    left.messageId === right.messageId &&
    left.index === right.index &&
    left.url === right.url &&
    left.type === right.type &&
    left.sourceKind === right.sourceKind &&
    left.filename === right.filename &&
    left.title === right.title &&
    left.author === right.author &&
    left.size === right.size &&
    left.thumbnail === right.thumbnail &&
    left.mimeType === right.mimeType &&
    left.documentId === right.documentId &&
    left.codec === right.codec &&
    left.width === right.width &&
    left.height === right.height &&
    left.duration === right.duration &&
    left.chatId === right.chatId
  )
}
