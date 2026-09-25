/**
 * Vimeo content config 捕获降级与聚合页回退编排测试。
 *
 * 只替换 RPC 与配置同步边界：控制器、按钮面板与 config 解析链都是真实实现。覆盖四类——
 * 两个通道都拿不到快照时回到既有的空面板降级；兜底拿到快照时经同一解析链渲染出真实选项；
 * 聚合页回退按捕获顺序逐视频合并写入；身份/路由在回退轮进行中接管时的编排守卫与配对清空。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JsonValue } from '@/core/rpc/types'

/**
 * happy-dom 的 window/history 跨用例共享，而控制器的 start 会包装 pushState/replaceState：
 * 在任何用例启动前记录原生方法与初始地址，afterEach 统一还原，避免包装层层嵌套后
 * 一次 replaceState 触发所有旧控制器继续扫描、路由状态串进后续用例。
 */
const pristineReplaceState = history.replaceState.bind(history)
const pristinePushState = history.pushState.bind(history)
const BASE_HREF = window.location.href

afterEach(() => {
  history.replaceState = pristineReplaceState
  history.pushState = pristinePushState
  if (window.location.href !== BASE_HREF) {
    pristineReplaceState(null, '', BASE_HREF)
  }
})

const mocks = vi.hoisted(() => ({
  requestCapturedVimeoConfig: vi.fn(),
  listCapturedVimeoVideoIds: vi.fn(),
  resetVimeoConfigFallback: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}))

vi.mock('@/sites/vimeo/content/configCaptureClient', () => ({
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

vi.mock('@/sites/vimeo/content/resourceBuffer', () => ({
  vimeoResourceBuffer: {
    start: vi.fn(),
    resetForPageChange: vi.fn(),
    replaceSnapshot: vi.fn(),
    mergeVideoResources: vi.fn(),
    getResource: vi.fn()
  }
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
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('原生 config 捕获超时')
      )
    })

    const panel = queryPanel()
    expect(panel?.getAttribute('data-vdl-video-id')).toBe(VIDEO_ID)
    expect(panel?.querySelectorAll('[data-testid="vdl-vimeo-option"]:not(:disabled)').length).toBe(0)
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

  it('已收敛身份的页面在身份瞬时缺失时不枚举捕获，聚合结果不混入单视频缓存', async () => {
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
    await settle(SCAN_DEBOUNCE_WAIT_MS)

    expect(mocks.listCapturedVimeoVideoIds).not.toHaveBeenCalled()
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledTimes(1)
    expect(vimeoResourceBuffer.mergeVideoResources).not.toHaveBeenCalled()
  })
})

describe('Vimeo content 聚合页回退编排', () => {
  /** 资源缓存 mock；静态类型沿用真实模块，运行时是 vi.mock 的替身。 */
  let vimeoResourceBuffer: typeof import('@/sites/vimeo/content/resourceBuffer').vimeoResourceBuffer

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    prepareAggregatePage()
    ;({ vimeoResourceBuffer } = await import('@/sites/vimeo/content/resourceBuffer'))
  })

  it('身份缺失时按捕获顺序逐视频合并写入，每个视频只编排一次', async () => {
    mocks.listCapturedVimeoVideoIds.mockResolvedValue(['111', '222'])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      Promise.resolve(capturedFixture(videoId))
    )
    await startContent()

    await vi.waitFor(() => {
      expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(2)
    })

    expect(mocks.requestCapturedVimeoConfig).toHaveBeenNthCalledWith(1, '111')
    expect(mocks.requestCapturedVimeoConfig).toHaveBeenNthCalledWith(2, '222')
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenNthCalledWith(
      1,
      '111',
      expect.arrayContaining([expect.objectContaining({ messageId: '111' })])
    )
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenNthCalledWith(
      2,
      '222',
      expect.arrayContaining([expect.objectContaining({ messageId: '222' })])
    )
  })

  it('身份在回退轮进行中出现时停止在途循环，不混入其他视频', async () => {
    const pendingFirst = createDeferred()
    mocks.listCapturedVimeoVideoIds
      .mockResolvedValueOnce(['111', '222'])
      .mockResolvedValue([])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      videoId === '111' ? pendingFirst.promise : Promise.resolve(capturedFixture(videoId))
    )
    await startContent()
    await vi.waitFor(() => {
      expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledWith('111')
    })

    // 身份出现触发重扫：页面收敛为单视频快照，buffer 被重置。
    attachIdentity('333')
    await vi.waitFor(() => {
      expect(vimeoResourceBuffer.replaceSnapshot).toHaveBeenCalledWith('333', expect.anything())
    })
    expect(vimeoResourceBuffer.resetForPageChange).toHaveBeenCalled()

    // 此刻 '111' 的在途加载才完成：不得并入刚收敛的单视频 buffer，循环也不得起 '222'。
    pendingFirst.resolve(capturedFixture('111'))
    await settle()

    expect(vimeoResourceBuffer.mergeVideoResources).not.toHaveBeenCalled()
    expect(mocks.requestCapturedVimeoConfig).not.toHaveBeenCalledWith('222')
  })

  it('SPA 路由切换时丢弃在途回退轮，旧页面资源不写进新页面', async () => {
    const pendingFirst = createDeferred()
    mocks.listCapturedVimeoVideoIds
      .mockResolvedValueOnce(['111', '222'])
      .mockResolvedValue([])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      videoId === '111' ? pendingFirst.promise : Promise.resolve(capturedFixture(videoId))
    )
    await startContent()
    await vi.waitFor(() => {
      expect(mocks.requestCapturedVimeoConfig).toHaveBeenCalledWith('111')
    })

    history.replaceState(null, '', '/route-discard')
    // 路由切换处理先落定（重置 buffer），再让在途加载完成。
    await vi.waitFor(() => {
      expect(vimeoResourceBuffer.resetForPageChange).toHaveBeenCalled()
    })
    pendingFirst.resolve(capturedFixture('111'))
    // 冲掉在途编排与新页面的下一轮回退检测（枚举结果为空，直接结束）。
    await settle()

    expect(vimeoResourceBuffer.mergeVideoResources).not.toHaveBeenCalled()
    expect(mocks.requestCapturedVimeoConfig).not.toHaveBeenCalledWith('222')
  })

  it('路由切换配对清空已编排记录，新页面重新逐视频编排', async () => {
    mocks.listCapturedVimeoVideoIds.mockResolvedValue(['111', '222'])
    mocks.requestCapturedVimeoConfig.mockImplementation((videoId: string) =>
      Promise.resolve(capturedFixture(videoId))
    )
    await startContent()
    await vi.waitFor(() => {
      expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(2)
    })

    history.replaceState(null, '', '/route-reattach')
    await vi.waitFor(() => {
      expect(mocks.resetVimeoConfigFallback).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenCalledTimes(4)
    })

    expect(vimeoResourceBuffer.resetForPageChange).toHaveBeenCalled()
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenNthCalledWith(
      3,
      '111',
      expect.anything()
    )
    expect(vimeoResourceBuffer.mergeVideoResources).toHaveBeenNthCalledWith(
      4,
      '222',
      expect.anything()
    )
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
  const { startVimeoContent } = await import('@/sites/vimeo/content/index')
  startVimeoContent()
  await Promise.resolve()
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

/** 冲掉指定时长的定时器/微任务：debounce 扫描与在途 Promise 的后续编排都在其中完成。 */
async function settle(waitMs = 0): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, waitMs))
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
