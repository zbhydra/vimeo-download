/**
 * Vimeo content config 捕获降级与聚合页回退编排测试。
 *
 * 只替换捕获 RPC 与配置同步边界，不请求项目后端；控制器、资源缓存的 URL 轮询、
 * 按钮面板与 config 解析链均用真实实现。资源操作的 spy 保留原行为。
 * 每个用例独立推进定时器，结束时停止缓存并释放 observer，避免旧控制器跨用例重扫。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JsonValue } from '@/core/rpc/types'

const BASE_HREF = window.location.href

let activeResourceBuffer:
  | typeof import('@/sites/vimeo/content/resourceBuffer').vimeoResourceBuffer
  | null = null

/** 原生 MutationObserver；每个用例前后用它安装/还原追踪构造器。 */
const NativeMutationObserver = MutationObserver

/** 当前用例期间创建的全部 MutationObserver。 */
let trackedObservers: MutationObserver[] = []

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  trackedObservers = []
  vi.stubGlobal(
    'MutationObserver',
    class extends NativeMutationObserver {
      constructor(callback: MutationCallback) {
        super(callback)
        trackedObservers.push(this)
      }
    }
  )
})

afterEach(() => {
  activeResourceBuffer?.stop()
  activeResourceBuffer = null
  for (const observer of trackedObservers.splice(0)) {
    observer.disconnect()
  }
  vi.stubGlobal('MutationObserver', NativeMutationObserver)
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (window.location.href !== BASE_HREF) {
    history.replaceState(null, '', BASE_HREF)
  }
})

const mocks = vi.hoisted(() => ({
  requestCapturedVimeoConfig: vi.fn(),
  listCapturedVimeoVideoIds: vi.fn(),
  resetVimeoConfigFallback: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('@/sites/vimeo/content/configCaptureClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/sites/vimeo/content/configCaptureClient')>()),
  requestCapturedVimeoConfig: mocks.requestCapturedVimeoConfig,
  listCapturedVimeoVideoIds: mocks.listCapturedVimeoVideoIds,
  resetVimeoConfigFallback: mocks.resetVimeoConfigFallback
}))

vi.mock('@/sites/vimeo/content/siteConfig', () => ({
  synchronizeVimeoConfig: vi.fn(() => Promise.resolve())
}))

vi.mock('@/content/runtimeConfig', () => ({
  synchronizeRuntimeConfig: vi.fn(() => Promise.resolve())
}))

vi.mock('@/core/rpc/injectedReady', () => ({
  waitForInjectedReady: vi.fn(() => Promise.resolve())
}))

vi.mock('@/sites/vimeo/content/messageHandler', () => ({
  vimeoMessageHandler: { start: vi.fn() }
}))

vi.mock('@/core/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn()
  }
}))

/** 测试视频 ID。 */
const VIDEO_ID = '1196869805'

describe('Vimeo content config 捕获降级', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    preparePlayerPage()
  })

  it('两个通道都拿不到快照时渲染既有的空面板降级', async () => {
    mocks.requestCapturedVimeoConfig.mockResolvedValue(null)
    await startContent()

    await vi.waitFor(() => {
      expect(mocks.loggerWarn).toHaveBeenCalledWith(expect.stringContaining('原生 config 捕获超时'))
    })

    const panel = queryPanel()
    expect(panel?.getAttribute('data-vdl-video-id')).toBe(VIDEO_ID)
    expect(panel?.querySelectorAll('[data-testid="vdl-vimeo-option"]:not(:disabled)').length).toBe(
      0
    )
    expect(panel?.querySelectorAll('[data-vdl-choice="unavailable"]').length).toBe(4)
  })

  it('兜底快照经同一解析链渲染出真实选项', async () => {
    mocks.requestCapturedVimeoConfig.mockResolvedValue(capturedFixture(VIDEO_ID))
    await startContent()

    await vi.waitFor(() => {
      expect(enabledOptions().length).toBeGreaterThan(0)
    })

    const videoRow = document.querySelector('[data-testid="vdl-vimeo-row-video"]')
    expect(
      Array.from(videoRow?.querySelectorAll('[data-testid="vdl-vimeo-option"]') ?? []).some(
        node => node.getAttribute('data-vdl-choice') === 'progressive:720p:30'
      )
    ).toBe(true)
    expect(
      videoRow?.querySelectorAll('[data-vdl-choice="unavailable"]').length,
      'video 行有资源时不应再出现占位按钮'
    ).toBe(0)
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledWith(VIDEO_ID)
  })

  it('设置语言变化重绘当前快照，同时保留活动下载忙碌态且不重取资源', async () => {
    const { VimeoButtonPanel } = await import('@/sites/vimeo/content/buttons')
    const renderSpy = vi.spyOn(VimeoButtonPanel.prototype, 'render')
    mocks.requestCapturedVimeoConfig.mockResolvedValue(capturedFixture(VIDEO_ID))
    await startContent()
    await vi.waitFor(() => expect(enabledOptions().length).toBeGreaterThan(0))
    const { I18nService } = await import('@/locales')
    const { I18N_KEYS } = await import('@/core/constants/i18n')
    const { vimeoResourceBuffer } = await import('@/sites/vimeo/content/resourceBuffer')
    const resource = vimeoResourceBuffer.getAllResources()[0]
    const panelOwner = renderSpy.mock.contexts[0] as InstanceType<typeof VimeoButtonPanel>
    panelOwner.beginDownload(VIDEO_ID, resource.id)
    expect(queryPanel()?.getAttribute('aria-busy')).toBe('true')
    vi.mocked(vimeoResourceBuffer.replaceSnapshot).mockClear()

    for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
      listener({ settings: { newValue: { language: 'zh-CN' } } }, 'local')
    }
    await vi.waitFor(() => expect(I18nService.getCurrentLanguage()).toBe('zh-CN'))

    expect(document.querySelector('[data-testid="vdl-vimeo-row-label"]')?.textContent).toBe(
      I18nService.t(I18N_KEYS.RESOURCE_ITEM.TYPE_VIDEO)
    )
    expect(queryPanel()?.getAttribute('aria-busy')).toBe('true')
    expect(enabledOptions()).toHaveLength(0)
    expect(queryPanel()?.querySelector('[aria-busy="true"]')?.textContent).toBe(
      I18nService.t(I18N_KEYS.RESOURCE_ITEM.DOWNLOADING)
    )
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledTimes(1)
    expect(vimeoResourceBuffer.replaceSnapshot).not.toHaveBeenCalled()
  })

  it('身份瞬时缺失不混入聚合资源，URL 切到聚合页后清理旧身份并恢复回退', async () => {
    const { vimeoResourceBuffer } = await import('@/sites/vimeo/content/resourceBuffer')
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      Promise.resolve(capturedFixture(videoId))
    )
    await startContent()
    await vi.waitFor(() => {
      expect(enabledOptions().length).toBeGreaterThan(0)
    })

    // SPA 过渡期身份会瞬时缺失：移除 og meta 并触发重扫，扫描落入身份缺失分支。
    document.querySelector('meta[property="og:video:url"]')?.remove()
    document.body.appendChild(document.createElement('h1'))
    // 等一次完整 debounce 扫描（300ms）落定，再断言回退路径整条短路。
    await advanceTimers(SCAN_DEBOUNCE_WAIT_MS)

    expect(mocks.listCapturedVimeoVideoIds).not.toHaveBeenCalled()
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledTimes(1)
    expect(vimeoResourceBuffer.mergeVideoResources).not.toHaveBeenCalled()

    mocks.listCapturedVimeoVideoIds.mockResolvedValue(['222'])
    history.pushState(null, '', '/watch#aggregate')
    await advanceTimers(900)

    expect(mocks.listCapturedVimeoVideoIds).toHaveBeenCalled()
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledWith('222', expect.anything())
    expect(vimeoResourceBuffer.getVideoGroups().map(group => group.videoId)).toEqual(['222'])
    expect(queryPanel()).toBeNull()
  })
})

describe('Vimeo content 聚合页回退编排', () => {
  /** 真实资源缓存；资源写入 spy 仅记录调用。 */
  let vimeoResourceBuffer: typeof import('@/sites/vimeo/content/resourceBuffer').vimeoResourceBuffer

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    prepareAggregatePage()
    ;({ vimeoResourceBuffer } = await import('@/sites/vimeo/content/resourceBuffer'))
  })

  it('身份缺失时逐视频合并写入，每个视频只编排一次', async () => {
    mocks.listCapturedVimeoVideoIds.mockResolvedValue(['111', '222'])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      Promise.resolve(capturedFixture(videoId))
    )
    await startContent()
    await advanceTimers(0)

    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(2)
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledTimes(2)
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledWith(
      '111',
      expect.arrayContaining([expect.objectContaining({ messageId: '111' })])
    )
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledWith(
      '222',
      expect.arrayContaining([expect.objectContaining({ messageId: '222' })])
    )
  })

  it('重扫定时器拾取后到的捕获，已编排视频不重复点查', async () => {
    mocks.listCapturedVimeoVideoIds.mockResolvedValueOnce(['111']).mockResolvedValue(['111', '333'])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      Promise.resolve(capturedFixture(videoId))
    )
    await startContent()
    await advanceTimers(0)
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(1)

    await advanceTimers(3100)

    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(2)
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledWith(
      '333',
      expect.arrayContaining([expect.objectContaining({ messageId: '333' })])
    )
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledTimes(2)
  })

  it('身份收敛后丢弃在途回退结果，不混入其他视频', async () => {
    const pendingFirst = createDeferred()
    const pendingSecond = createDeferred()
    mocks.listCapturedVimeoVideoIds.mockResolvedValueOnce(['111', '222']).mockResolvedValue([])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) => {
      if (videoId === '111') {
        return pendingFirst.promise
      }
      if (videoId === '222') {
        return pendingSecond.promise
      }
      return Promise.resolve(capturedFixture(videoId))
    })
    await startContent()
    await advanceTimers(0)
    // 并发池一次性派发整轮枚举结果，'111' 与 '222' 同时在途。
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledWith('111')
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledWith('222')

    // URL 变化经缓存的 500ms 轮询通知 controller，再由 debounce 扫描收敛到单视频。
    attachIdentity('333')
    history.replaceState(null, '', '/route-identity')
    await advanceTimers(900)
    expect(vimeoResourceBuffer.replaceSnapshot).toHaveBeenCalledWith('333', expect.anything())
    expect(vimeoResourceBuffer.resetForPageChange).toHaveBeenCalled()

    // 此刻两路在途加载才完成：写入守卫丢弃，不得并入刚收敛的单视频 buffer。
    pendingFirst.resolve(capturedFixture('111'))
    pendingSecond.resolve(capturedFixture('222'))
    await advanceTimers(0)

    expect(vimeoResourceBuffer.mergeVideoResources).not.toHaveBeenCalled()
  })

  it('SPA 路由切换时丢弃在途回退轮，旧页面资源不写进新页面', async () => {
    const pendingFirst = createDeferred()
    const pendingSecond = createDeferred()
    mocks.listCapturedVimeoVideoIds.mockResolvedValueOnce(['111', '222']).mockResolvedValue([])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      videoId === '111' ? pendingFirst.promise : pendingSecond.promise
    )
    await startContent()
    await advanceTimers(0)
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledWith('111')
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledWith('222')

    history.replaceState(null, '', '/route-discard')
    // 500ms 页面轮询与 debounce 300ms 扫描均在窗口内落定。
    await advanceTimers(900)
    expect(vimeoResourceBuffer.resetForPageChange).toHaveBeenCalled()

    pendingFirst.resolve(capturedFixture('111'))
    pendingSecond.resolve(capturedFixture('222'))
    await advanceTimers(0)

    expect(vimeoResourceBuffer.mergeVideoResources).not.toHaveBeenCalled()
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledTimes(2)
  })

  it('路由切换配对清空已编排记录，新页面重新逐视频编排', async () => {
    mocks.listCapturedVimeoVideoIds.mockResolvedValue(['111', '222'])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      Promise.resolve(capturedFixture(videoId))
    )
    await startContent()
    await advanceTimers(0)
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(2)

    history.replaceState(null, '', '/route-reattach')
    await advanceTimers(900)
    expect(mocks.resetVimeoConfigFallback).toHaveBeenCalled()
    expect(vimeoResourceBuffer.resetForPageChange).toHaveBeenCalled()
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(4)

    // 并发池的完成顺序不保证与捕获顺序一致，只断言每个视频在新页面恰好再编排一次。
    const mergeCalls = vi.mocked(vimeoResourceBuffer.mergeVideoResources).mock.calls
    for (const videoId of ['111', '222']) {
      expect(mergeCalls.filter(([mergedVideoId]) => mergedVideoId === videoId)).toHaveLength(2)
    }
  })
})

/** 播放页文档：og meta 提供页面身份，样式占位避免 happy-dom 加载扩展样式。 */
function preparePlayerPage(): void {
  document.head.innerHTML =
    `<meta property="og:video:url" content="https://player.vimeo.com/video/${VIDEO_ID}?h=6f9e1c2a3b" />` +
    '<link rel="stylesheet" data-vdl-vimeo-style="1" />'
  document.body.innerHTML = '<h1>Sample</h1>'
}

/** 聚合页文档：无任何页面身份，扫描落到回退检测路径。 */
function prepareAggregatePage(): void {
  document.head.innerHTML = '<link rel="stylesheet" data-vdl-vimeo-style="1" />'
  document.body.innerHTML = ''
}

/** 在文档里注入 og:video:url 身份并追加一个会被 observer 关注的节点，触发重扫。 */
function attachIdentity(videoId: string): void {
  const meta = document.createElement('meta')
  meta.setAttribute('property', 'og:video:url')
  meta.setAttribute('content', `https://player.vimeo.com/video/${videoId}?h=6f9e1c2a3b`)
  document.head.appendChild(meta)
  document.body.appendChild(document.createElement('h1'))
}

/** 启动真实 content 控制器；控制器自管异步扫描，测试只等结果。 */
async function startContent(): Promise<void> {
  const { vimeoResourceBuffer } = await import('@/sites/vimeo/content/resourceBuffer')
  activeResourceBuffer = vimeoResourceBuffer
  vi.spyOn(vimeoResourceBuffer, 'resetForPageChange')
  vi.spyOn(vimeoResourceBuffer, 'replaceSnapshot')
  vi.spyOn(vimeoResourceBuffer, 'mergeVideoResources')
  const { startVimeoContent } = await import('@/sites/vimeo/content/index')
  startVimeoContent()
  await Promise.resolve()
}

/** 推进 fake 定时器并冲掉微任务：覆盖 debounce 扫描、重扫定时与在途 Promise 的后续编排。 */
async function advanceTimers(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

/** 当前面板元素。 */
function queryPanel(): Element | null {
  return document.querySelector('[data-testid="vdl-vimeo-panel"]')
}

/** 当前面板里可点击的选项。 */
function enabledOptions(): Element[] {
  return Array.from(document.querySelectorAll('[data-testid="vdl-vimeo-option"]:not(:disabled)'))
}

/** 手动控制一条在途捕获，模拟身份/路由切换发生在加载等待窗口内。 */
function createDeferred(): {
  promise: Promise<{ videoId: string; configUrl: string; config: JsonValue }>
  resolve: (value: { videoId: string; configUrl: string; config: JsonValue }) => void
} {
  let resolve!: (value: { videoId: string; configUrl: string; config: JsonValue }) => void
  const promise = new Promise<{ videoId: string; configUrl: string; config: JsonValue }>(fulfil => {
    resolve = fulfil
  })
  return { promise, resolve }
}

/** 覆盖一次完整 debounce 扫描（默认 300ms）的等待时长。 */
const SCAN_DEBOUNCE_WAIT_MS = 450

/** 指定 videoId 的最小但结构合法的捕获快照；config URL 内嵌同一 videoId 以通过校验链。 */
function capturedFixture(videoId: string): {
  videoId: string
  configUrl: string
  config: JsonValue
} {
  const configUrl = `https://player.vimeo.com/video/${videoId}/config/request?expires=1999999999&signature=refresh_signature`
  return {
    videoId,
    configUrl,
    config: {
      request: {
        timestamp: 1_999_996_399,
        expires: 3600,
        config_refresh_url: configUrl,
        files: {
          progressive: [
            {
              url: `https://vod-progressive-ak.vimeocdn.com/video/${videoId}/720p.mp4?token=signed`,
              quality: '720p',
              width: 1280,
              height: 720,
              fps: 30,
              mime: 'video/mp4'
            }
          ]
        }
      },
      video: {
        id: Number(videoId),
        title: `Fallback fixture ${videoId}`,
        thumbs: {}
      }
    }
  }
}
