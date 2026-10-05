/**
 * Vimeo content 入口。
 *
 * 在 Vimeo 页面提取 videoId，消费 MAIN world 捕获（或 background 播放页兜底）的原生
 * player config，直接渲染 Video/Audio/Subtitle/Image 四行按钮，并把同一批资源写入 popup
 * 可见的 ResourceBuffer。
 */

import { upgradeModalManager } from '@/core/content/services/UpgradeModalManager'
import type { ExtensionEvents } from '@/core/events/types'
import { BackgroundChannel } from '@/content/rpc/background.rpc'
import { ChromeEventSubscriber } from '@/core/rpc/ChromeEventBus'
import { waitForInjectedReady } from '@/core/rpc/injectedReady'
import { synchronizeRuntimeConfig } from '@/content/runtimeConfig'
import { logger } from '@/core/utils/logger'
import { I18nService } from '@/locales'
import {
  loadVimeoResourcesFromCapturedConfig,
  type VimeoResourceSnapshot
} from '@/sites/vimeo/config'
import { vimeoConfig } from '@/sites/vimeo/runtimeConfig'
import {
  extractVimeoIdentityFromDocument,
  isVimeoFrameIdentityAttachedToDocument,
  isVimeoPlayerHostname,
  parseUrl,
  parseVimeoFrameIdentityMessage,
  type VimeoVideoIdentity
} from '@/sites/vimeo/shared'
import { VimeoButtonPanel } from './buttons'
import {
  listCapturedVimeoVideoIds,
  requestCapturedVimeoConfig,
  resetVimeoConfigFallback,
  runWithBoundedConcurrency
} from './configCaptureClient'
import { vimeoMessageHandler } from './messageHandler'
import { vimeoResourceBuffer } from './resourceBuffer'
import { synchronizeVimeoConfig } from './siteConfig'

/**
 * 聚合页回退重扫间隔。
 *
 * 轮播在页面稳定后仍持续向 MAIN world 供给新捕获（实测 74s 内累计 15 个），但此后页面不再
 * 产生 content 口径相关的 DOM 变化（实测 80s 内零相关 mutation），枚举推进只能靠定时重扫；
 * 间隔取秒级即可跟上轮播节奏，每轮成本仅一次本地枚举 RPC。
 */
const FALLBACK_RESWEEP_DELAY_MS = 3_000

/** 聚合页回退加载的最大并发数：单视频加载以 playlist 网络为主，4 路已能压满等待窗口。 */
const FALLBACK_LOAD_CONCURRENCY = 4

/** Vimeo content 控制器。 */
class VimeoContentController {
  /** 页面按钮面板。 */
  private readonly buttonPanel = new VimeoButtonPanel()

  /** background 下载编排快照订阅器：驱动页面按钮进度并在终态复位。 */
  private readonly queueEventSubscriber = new ChromeEventSubscriber<ExtensionEvents>()

  /** background RPC 客户端：下载发起统一改道 background 编排（U8）。 */
  private readonly backgroundClient = new BackgroundChannel()

  /** 当前 videoId。 */
  private currentVideoId: string | null = null

  /** 当前视频已经解析的资源快照。 */
  private currentSnapshot: VimeoResourceSnapshot | null = null

  /** 同一 videoId 的捕获与 playlist 加载单飞任务。 */
  private readonly resourceLoads = new Map<string, Promise<VimeoResourceSnapshot | null>>()

  /** 聚合页回退检测已编排过的 videoId；与 ResourceBuffer 同步重置，避免重复编排。 */
  private readonly fallbackLoadedVideoIds = new Set<string>()

  /** 聚合页回退重扫定时器；同一时刻最多存在一个。 */
  private fallbackResweepTimer: number | null = null

  /** player frame helper 提供的兜底身份。 */
  private frameIdentity: VimeoVideoIdentity | null = null

  /** debounce 定时器。 */
  private scanTimer: number | null = null

  /** DOM observer。 */
  private observer: MutationObserver | null = null

  /** 是否已启动。 */
  private started = false

  /** 启动 Vimeo content。 */
  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true
    await waitForInjectedReady('Vimeo')
    // 两条配置链互不依赖：任一条失败都只记日志，不阻断另一条也不阻断后续渲染。
    await Promise.all([synchronizeRuntimeConfig(), synchronizeVimeoConfig()])

    this.injectStyles()
    this.buttonPanel.onClick(resourceId => {
      this.downloadResource(resourceId).catch(error => {
        logger.error('[VimeoContent] 页面按钮下载失败:', error)
      })
    })

    vimeoResourceBuffer.onPageChange(() => this.handleRouteChange())
    vimeoResourceBuffer.start()
    vimeoMessageHandler.start()
    this.installQueueSnapshotListener()
    this.installUpgradeModalListener()
    this.installFrameIdentityListener()
    this.installMutationObserver()
    I18nService.onLanguageChange(() => {
      if (!this.currentVideoId) return
      const snapshot = this.currentSnapshot
      this.buttonPanel.render(
        this.currentVideoId,
        snapshot?.resources ?? [],
        snapshot?.config.expiresAt
      )
    })
    this.scanAndRender()

    logger.info('[VimeoContent] 初始化完成')
  }

  /**
   * 订阅 background 下载编排快照，驱动页面按钮进度。
   *
   * 下载执行在 background/offscreen，页面按钮只消费投影：仍在队列的任务更新进度，
   * 消失（完成/取消）或失败的任务复位按钮。
   */
  private installQueueSnapshotListener(): void {
    this.queueEventSubscriber.on('downloadQueueUpdated', snapshot => {
      this.buttonPanel.applyQueueSnapshot(snapshot.tasks)
    })
  }

  /** background 配额不足时会让发起 tab 的 content 显示既有升级弹窗。 */
  private installUpgradeModalListener(): void {
    this.queueEventSubscriber.on('showUpgradeModal', ({ resetAt }) => {
      // 直接 show 而不走 showWithFallback：后者失败时会向 runtime 广播，可能让其它
      // Vimeo 标签页的订阅器收到并重复弹窗。
      const shown = upgradeModalManager.show(resetAt)
      if (!shown) {
        logger.warn('[VimeoContent] 升级弹窗显示失败: stage=quota-rejected')
      }
    })
  }

  /** 注入面板样式。 */
  private injectStyles(): void {
    const existing = document.querySelector('link[data-vdl-vimeo-style="1"]')
    if (existing) {
      return
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = chrome.runtime.getURL('sites/vimeo/content/styles/buttons.css')
    link.setAttribute('data-vdl-vimeo-style', '1')
    document.head.appendChild(link)
  }

  /** 监听 DOM 增量渲染。 */
  private installMutationObserver(): void {
    const target = document.querySelector('main') ?? document.body
    this.observer = new MutationObserver(mutations => {
      if (mutations.some(hasRelevantMutation)) {
        this.scheduleScan()
      }
    })
    this.observer.observe(target, {
      childList: true,
      subtree: true
    })
  }

  /** 监听 Vimeo player frame helper 的身份消息。 */
  private installFrameIdentityListener(): void {
    window.addEventListener('message', event => {
      const message = parseVimeoFrameIdentityMessage(event.data)
      if (!message || !this.isTrustedFrameIdentityEvent(event)) {
        return
      }

      this.frameIdentity = { videoId: message.videoId }
      this.scheduleScan()
    })
  }

  /** SPA 路由变化处理。 */
  private handleRouteChange(): void {
    logger.info(`[VimeoContent] SPA 路由切换: host=${window.location.hostname}, stage=route-change`)
    this.currentVideoId = null
    this.currentSnapshot = null
    this.frameIdentity = null
    this.fallbackLoadedVideoIds.clear()
    resetVimeoConfigFallback()
    this.buttonPanel.clear()
    this.scheduleScan()
  }

  /** debounce 扫描。 */
  private scheduleScan(): void {
    if (this.scanTimer !== null) {
      clearTimeout(this.scanTimer)
    }

    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = null
      this.scanAndRender()
    }, vimeoConfig.scanDebounceMs)
  }

  /** 扫描资源并刷新面板。 */
  private async scanAndRender(): Promise<void> {
    const identity = extractVimeoIdentityFromDocument() ?? this.getAttachedFrameIdentity()
    if (!identity) {
      await this.loadFallbackCapturedVideos()
      return
    }

    if (this.currentVideoId !== identity.videoId) {
      vimeoResourceBuffer.resetForPageChange()
      this.currentVideoId = identity.videoId
      this.currentSnapshot = null
      this.fallbackLoadedVideoIds.clear()
      this.buttonPanel.clear()
      this.buttonPanel.renderEmpty(identity.videoId)
    }

    if (this.currentSnapshot) {
      this.renderSnapshot(identity.videoId, this.currentSnapshot)
      return
    }

    try {
      const snapshot = await this.loadCapturedResources(identity.videoId)
      if (this.currentVideoId !== identity.videoId) {
        return
      }
      if (!snapshot) {
        logger.warn(
          `[VimeoContent] 原生 config 捕获超时: videoId=${identity.videoId}, timeout=${vimeoConfig.captureTimeoutMs}ms, stage=capture`
        )
        this.buttonPanel.renderEmpty(identity.videoId)
        return
      }

      this.currentSnapshot = snapshot
      this.renderSnapshot(identity.videoId, snapshot)
    } catch (error) {
      logger.error('[VimeoContent] Vimeo 资源扫描失败:', error)
      this.buttonPanel.renderEmpty(identity.videoId)
    }
  }

  /** 取得 config 快照并解析资源，同一 videoId 的两条捕获通道只执行一轮。 */
  private loadCapturedResources(videoId: string): Promise<VimeoResourceSnapshot | null> {
    const currentLoad = this.resourceLoads.get(videoId)
    if (currentLoad) {
      return currentLoad
    }

    const load = this.requestCapturedResources(videoId).finally(() => {
      this.resourceLoads.delete(videoId)
    })
    this.resourceLoads.set(videoId, load)
    return load
  }

  /** 通过多通道取得原生 config 快照，再加载其中的 signed playlist。 */
  private async requestCapturedResources(videoId: string): Promise<VimeoResourceSnapshot | null> {
    const snapshot = await requestCapturedVimeoConfig(videoId)
    if (!snapshot) {
      return null
    }

    return loadVimeoResourcesFromCapturedConfig(snapshot)
  }

  /**
   * 身份缺失页面（如 vimeo.com/watch 聚合页）的回退检测。
   *
   * 聚合页没有唯一主角视频，页面身份四路提取皆空；但轮播/预览播放过的视频 config 已被
   * MAIN world 按 videoId 捕获。枚举这些捕获概要（宿主页面可伪造，仅当待查询提示），走既有
   * 校验链路取资源并按视频合并写入 ResourceBuffer 供 popup 展示；页面按钮依赖页面身份，
   * 聚合页不渲染。
   *
   * 加载为有界并发（`FALLBACK_LOAD_CONCURRENCY`）：实测串行约 0.9s/视频，SPA 返回聚合页时
   * MAIN world 仍持有整组捕获，一次全量枚举可达 16 个视频（串行约 14s 起），并发 4 压到
   * 约 4s。逐视频失败隔离——单个视频（已下架/私有）的失败只记日志，不阻塞其余视频。
   * 每个 videoId 每页只编排一次：资源按 id 去重，失败视频的 background 兜底也不会重放，
   * 重试没有增量价值。
   */
  private async loadFallbackCapturedVideos(): Promise<void> {
    // 页面已收敛出身份（含回退轮进行中身份出现的场合）时整条回退路径短路：不枚举捕获、
    // 不向校验链路发起点查，SPA 过渡期身份瞬时缺失也不会把聚合结果混进单视频 buffer。
    // 重扫的停止条件同样是这条守卫：身份出现后定时器自然衰减，不再重新武装。
    if (this.currentVideoId !== null) {
      return
    }

    this.scheduleFallbackResweep()

    const videoIds = await listCapturedVimeoVideoIds()
    if (videoIds.length === 0) {
      return
    }

    const pageHref = window.location.href
    const loadOne = async (videoId: string): Promise<void> => {
      // SPA 路由已切换或身份出现时不再派发新任务，避免旧页面资源写进新页面的缓存、
      // 或对 CDN 重复拉流；仍在途的任务由下方写入守卫丢弃。
      if (window.location.href !== pageHref || this.currentVideoId !== null) {
        return
      }
      if (this.fallbackLoadedVideoIds.has(videoId)) {
        return
      }
      // 先登记再加载：并发的回退轮（扫描与重扫定时器）据此去重，同一 videoId 只编排一次。
      this.fallbackLoadedVideoIds.add(videoId)

      try {
        const snapshot = await this.loadCapturedResources(videoId)
        // 等待期间身份或页面切换的，同一视频也不写入：buffer 已被身份分支重置，混入即串页。
        if (!snapshot || window.location.href !== pageHref || this.currentVideoId !== null) {
          return
        }

        vimeoResourceBuffer.mergeVideoResources(videoId, snapshot.resources)
        logger.info(
          `[VimeoContent] 回退检测写入视频资源: videoId=${videoId}, count=${snapshot.resources.length}, stage=fallback`
        )
      } catch (error) {
        logger.error(
          `[VimeoContent] 回退检测加载视频资源失败: videoId=${videoId}, stage=fallback`,
          error
        )
      }
    }

    await runWithBoundedConcurrency(videoIds, FALLBACK_LOAD_CONCURRENCY, loadOne)
  }

  /** 安排下一轮聚合页回退重扫；轮播持续供给新捕获，由身份守卫决定是否继续。 */
  private scheduleFallbackResweep(): void {
    if (this.fallbackResweepTimer !== null) {
      return
    }

    this.fallbackResweepTimer = window.setTimeout(() => {
      this.fallbackResweepTimer = null
      void this.loadFallbackCapturedVideos()
    }, FALLBACK_RESWEEP_DELAY_MS)
  }

  /** 把同一资源快照同步给页面面板与 popup 缓存。 */
  private renderSnapshot(videoId: string, snapshot: VimeoResourceSnapshot): void {
    vimeoResourceBuffer.replaceSnapshot(videoId, snapshot.resources)
    this.buttonPanel.render(videoId, snapshot.resources, snapshot.config.expiresAt)
  }

  /** 下载某个 Vimeo 资源。 */
  private async downloadResource(resourceId: string): Promise<void> {
    const resource = vimeoResourceBuffer.getResource(resourceId)
    if (!resource) {
      logger.warn(`[VimeoContent] 当前 Vimeo 资源不存在，重扫后重试: ${resourceId}`)
      await this.scanAndRender()
      return
    }

    const videoId = resource.messageId
    if (!this.buttonPanel.beginDownload(videoId, resource.id)) {
      return
    }

    try {
      // U8 改道：页面按钮下载统一发 background 编排（带完整 resource），执行与页面
      // 生命周期解耦；按钮进度由 installQueueSnapshotListener 消费 background 快照驱动。
      const response = await this.backgroundClient.downloadBatch({ resources: [resource] })
      if (!response.accepted) {
        logger.warn(
          `[VimeoContent] 下载请求未被编排器受理: resourceId=${resource.id}, count=${response.count}`
        )
      }
    } catch (error) {
      logger.error(`[VimeoContent] 发起 background 下载失败: resourceId=${resource.id}`, error)
      this.buttonPanel.endDownload(videoId)
    }
  }

  /** 只在 frame identity 仍匹配当前页面 iframe 时使用兜底。 */
  private getAttachedFrameIdentity(): VimeoVideoIdentity | null {
    if (!this.frameIdentity) {
      return null
    }

    return isVimeoFrameIdentityAttachedToDocument(this.frameIdentity) ? this.frameIdentity : null
  }

  /** 校验 frame postMessage 的 origin 与 source。 */
  private isTrustedFrameIdentityEvent(event: MessageEvent): boolean {
    const origin = parseUrl(event.origin)
    if (!origin || !isVimeoPlayerHostname(origin.hostname) || !event.source) {
      return false
    }

    return Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe')).some(iframe => {
      const iframeUrl = iframe.getAttribute('src')
      const parsedIframeUrl = iframeUrl ? parseUrl(iframeUrl, window.location.href) : null
      return (
        parsedIframeUrl &&
        isVimeoPlayerHostname(parsedIframeUrl.hostname) &&
        iframe.contentWindow === event.source
      )
    })
  }
}

/** 判断 DOM 变化是否可能影响 Vimeo 资源。 */
function hasRelevantMutation(mutation: MutationRecord): boolean {
  return Array.from(mutation.addedNodes).some(node => {
    if (!(node instanceof Element)) {
      return false
    }

    return Boolean(
      node.matches('meta[property="og:video:url"], iframe, h1, [data-testid="action-bar"]') ||
      node.querySelector('meta[property="og:video:url"], iframe, h1, [data-testid="action-bar"]')
    )
  })
}

const vimeoContentController = new VimeoContentController()

/** 启动 Vimeo content。 */
export function startVimeoContent(): void {
  vimeoContentController.start().catch(error => {
    logger.error('[VimeoContent] 初始化失败:', error)
  })
}
