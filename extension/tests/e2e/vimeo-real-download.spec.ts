/**
 * 固定公网 Vimeo 样本的真实下载 smoke。
 *
 * U8 起下载统一由 background 编排：offscreen document 执行 DASH/HLS 分片与 remux，产物
 * blob 由 background 经 `chrome.downloads` 落盘——页面不再派发 download 事件，断言改走
 * 落盘产物：background 只会把文件写进下载目录的 `vimeo-video-downloader/` 子目录，等待
 * 该子目录出现新的可播放 MP4 即是 background 链路的端到端证据。注：fixtures 已把下载
 * 行为恢复为 Chrome 原生 `default`，`chrome.downloads.download` 会正常 resolve；但
 * Playwright 自身的 download 事件/产物 API 对扩展 SW 发起的下载不可靠，文件系统断言
 * 仍是唯一可信的端到端锚点。
 *
 * 面板选项由样本当前 config 决定，用例不预设 delivery：取样本实际提供的 DASH/HLS 选项；
 * 样本不再提供该交付时带原因 skip。
 *
 * Cloudflare 拦截页按次随机下发、出网偶发导航超时，两者都由 openVimeoPanel 重开页面重试，
 * 预算用尽才带证据 skip。面板缺失或始终给不出选项都是真实回归，按失败处理，不做跳过。
 */

import fs from 'fs'
import path from 'path'

import type { BrowserContext, Locator, Page } from '@playwright/test'

import { test, expect } from '../fixtures'

/** 只提供 DASH 交付的固定样本，覆盖 offscreen 分片 + remux 链路。 */
const DASH_SAMPLE_URL = 'https://vimeo.com/1196869805?fl=ip&fe=ec'
const DASH_SAMPLE_VIDEO_ID = '1196869805'

/** 面板给出可用选项的等待上限。 */
const PANEL_TIMEOUT_MS = 60_000

/** 面板选项轮询间隔。 */
const PANEL_POLL_INTERVAL_MS = 500

/**
 * Cloudflare 拦截页的文案标记。
 *
 * 这些只出现在拦截页，与样本页自身文案不重叠，用于区分「被拦截」与「样本页给不出选项」。
 */
const CHALLENGE_TEXT_MARKERS = [
  'Verify to continue',
  'Checking if the site connection is secure',
  'needs to review the security of your connection'
] as const

/** 拦截页的 DOM 标记，不受页面语言影响。 */
const CHALLENGE_DOM_SELECTOR = '#challenge-running, #challenge-stage, .cf-challenge, .ctp-checkbox-label'

/** 真实媒体落盘上限；offscreen 需要先下载全部分段再等 background 落盘回执。 */
const MEDIA_TIMEOUT_MS = 180_000

/** 落盘产物的文件系统轮询间隔。 */
const DOWNLOAD_POLL_INTERVAL_MS = 1_000

/** background 落盘子目录（settings.downloadPath 默认值，见 core/storage/settings.ts）。 */
const DOWNLOAD_SUBDIR = 'vimeo-video-downloader'

/** 单次样本页导航超时。 */
const NAVIGATION_TIMEOUT_MS = 30_000

/**
 * 拿到真实样本页的导航预算（次数含首次，时长与次数谁先到就用尽）。
 *
 * 实测同一 profile 连续导航同一 URL：曾连续 3 次被 Cloudflare 拦截后第 4 次放行，也出现过
 * 连续 8 次全被拦截，可见拦截按次下发而非持续封禁；出网也会偶发导航超时（同一 URL 复查
 * 2.1s 即正常）。两种失败共用这份预算，用尽后才交给用例带证据 skip。
 */
const NAVIGATION_ATTEMPTS = 12

/** 样本页准备阶段的总时长上限。 */
const NAVIGATION_BUDGET_MS = 150_000

/** 两次样本页导航之间的间隔。 */
const NAVIGATION_RETRY_INTERVAL_MS = 10_000

/**
 * Vimeo Premium 推广弹窗的关闭按钮名称。
 *
 * 匿名访问时页面会自行弹出该 Chakra dialog 并拦截全部指针事件，面板按钮因此点不到；
 * Escape 关不掉，只能点它的次要按钮。profile 语言可能是中英任一种，故两种都匹配。
 */
const UPSELL_DISMISS_NAME = /^(Not now|现在不行)$/i

/** 推广弹窗关闭按钮的等待上限；弹窗随页面立即出现，没有就不必等。 */
const UPSELL_TIMEOUT_MS = 5_000

/** 面板按钮点击上限；被页面弹窗拦截时快速失败，而不是耗尽整条用例的超时。 */
const OPTION_CLICK_TIMEOUT_MS = 30_000

/** 面板单个选项的可观测字段。 */
interface PanelOption {
  /** 所属行：video / audio / image。 */
  kind: string
  /** 页面按钮 choice，例如 `best` / `dash:<uuid>` / `progressive:360p:24`。 */
  choice: string
  /** 页面按钮标签，例如 `360p HD` / `720p MP4`。 */
  label: string
}

test.describe('真实 Vimeo 固定样本', () => {
  test('DASH 视频经 offscreen + background 编排合成 MP4 并真实落盘', async ({
    context: _context,
    downloadDir
  }) => {
    // 拦截页重试 + 分片下载 + 落盘回执串行发生，超时必须覆盖三者之和。
    test.setTimeout(420_000)

    // 点击前先记录既有落盘文件：profile 是复用的，下载目录可能残留历史产物，只认新出现的文件。
    const baselineFiles = new Set(listMediaFiles(downloadDir))

    const { page, panel, state, options, evidence } = await openVimeoPanel(
      _context,
      DASH_SAMPLE_URL,
      DASH_SAMPLE_VIDEO_ID
    )
    test.skip(
      isRetryableState(state),
      `未拿到 Vimeo 真实样本页（导航预算 ${NAVIGATION_ATTEMPTS} 次 / ${NAVIGATION_BUDGET_MS}ms 用尽）: state=${state} evidence=${evidence}`
    )
    // 面板缺失或始终给不出选项都不是「跳过」：那是本单元端到端能力的真实回归。
    expect(
      state,
      `[VIMEO_REAL_PANEL_UNAVAILABLE] ${PANEL_TIMEOUT_MS}ms 内面板未给出可用选项 url=${DASH_SAMPLE_URL}`
    ).toBe('ready')
    await pauseVimeoPlayback(page)

    const videoOptions = options.filter(option => option.kind === 'video')
    expect(
      videoOptions.length,
      `[VIMEO_REAL_NO_VIDEO_OPTION] 面板未给出可下载视频选项: ${JSON.stringify(options)}`
    ).toBeGreaterThan(0)

    const selected = pickLowestHeightOption(videoOptions, ['dash:', 'hls:'])
    if (!selected) {
      test.skip(
        true,
        `样本当前不含 DASH/HLS 交付，offscreen mux 无法覆盖: ${JSON.stringify(videoOptions)}`
      )
      return
    }

    await dismissVimeoUpsell(page)

    const button = optionButton(panel, selected.choice)
    await button.click({ timeout: OPTION_CLICK_TIMEOUT_MS })
    await expect(button).toHaveAttribute('aria-busy', 'true')
    await expect(button).toHaveText(/^(Downloading\.\.\.|\d+%)$/)

    // 下载在 background/offscreen 进行：轮询下载目录等待 background 落盘的新 MP4。
    const savedPath = await waitForNewCompletedVideoDownload(downloadDir, baselineFiles)

    // 产物必须是落盘后的可播放 MP4：保存位置子目录、真实字节与 ISO BMFF 头三者都要成立。
    expect(savedPath).toContain(`${path.resolve(downloadDir)}${path.sep}${DOWNLOAD_SUBDIR}`)
    expect(fs.statSync(savedPath).size).toBeGreaterThan(0)
    expect(readIsoBmffHeader(savedPath)).toBe('ftyp')
    // 落盘回执收敛后任务移除，页面按钮退出下载态。
    await expect(button).not.toHaveAttribute('aria-busy', 'true', { timeout: 30_000 })
  })
})

/** 样本页准备结果。 */
interface PanelProbe {
  page: Page
  panel: Locator
  /** 就绪（附选项）、被拦截、导航失败、或面板未给出选项。 */
  state: PanelState
  /** state 为 ready 时的可用选项。 */
  options: PanelOption[]
  /** 未拿到样本页的原因（拦截标记或导航报错），写进 skip 原因便于复盘。 */
  evidence: string
}

/** 样本页准备状态；重试后仍非 ready 时，前两者 skip，后两者按真实回归失败。 */
type PanelState = 'ready' | 'challenge' | 'navigation-failed' | 'unavailable'

/** 值得重开页面重试的状态：拦截按次下发，导航失败是出网瞬时抖动。 */
function isRetryableState(state: PanelState): boolean {
  return state === 'challenge' || state === 'navigation-failed'
}

/** 递归收集目录下全部 MP4 文件的绝对路径。 */
function listMediaFiles(rootDir: string): string[] {
  const found: string[] = []
  const visit = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
      } else if (entry.isFile() && /\.mp4$/i.test(entry.name)) {
        found.push(fullPath)
      }
    }
  }
  visit(rootDir)
  return found
}

/**
 * 轮询等待 background 落盘的新 MP4 产物。
 *
 * 只认点击后新出现（不在基线集合里）的非空文件；`.crdownload` 中间态天然不满足 `.mp4`
 * 后缀，写完整前 Chrome 不会暴露最终名，等价于等到落盘完成。
 */
async function waitForNewCompletedVideoDownload(
  downloadDir: string,
  baselineFiles: ReadonlySet<string>
): Promise<string> {
  const deadline = Date.now() + MEDIA_TIMEOUT_MS
  let lastSeen: string[] = []

  while (Date.now() < deadline) {
    lastSeen = listMediaFiles(downloadDir)
    const candidate = lastSeen.find(
      filePath => !baselineFiles.has(filePath) && fs.statSync(filePath).size > 0
    )
    if (candidate) {
      return candidate
    }
    await sleep(DOWNLOAD_POLL_INTERVAL_MS)
  }

  throw new Error(
    `[VIMEO_REAL_DOWNLOAD_TIMEOUT] ${MEDIA_TIMEOUT_MS}ms 内未等到新 MP4 落盘: ${JSON.stringify(lastSeen)}`
  )
}

/** 等待指定毫秒。 */
async function sleep(ms: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

/**
 * 打开固定样本，等到面板给出可用选项为止。
 *
 * 命中拦截页或导航失败都重开页面，直到拿到真实样本页或预算（次数 / 时长）用尽；用尽后如实
 * 返回当前状态交给用例带证据 skip，不伪装成通过。
 */
async function openVimeoPanel(
  context: BrowserContext,
  url: string,
  videoId: string
): Promise<PanelProbe> {
  const deadline = Date.now() + NAVIGATION_BUDGET_MS
  let probe = await openSamplePage(context, url, videoId)

  for (
    let navigation = 2;
    isRetryableState(probe.state) &&
    navigation <= NAVIGATION_ATTEMPTS &&
    Date.now() < deadline;
    navigation += 1
  ) {
    console.warn(
      `[VIMEO_REAL_NAVIGATION_RETRY] navigation=${navigation}/${NAVIGATION_ATTEMPTS} state=${probe.state} evidence=${probe.evidence}`
    )
    await probe.page.close()
    await sleep(NAVIGATION_RETRY_INTERVAL_MS)
    probe = await openSamplePage(context, url, videoId)
  }

  return probe
}

/**
 * 打开一次样本页并等待面板选项。
 *
 * 就绪判据是「面板有可用选项」而不是「面板出现」：面板在 config 捕获完成前会先渲染全
 * disabled 的空行，而拦截页上根本不会注入面板（实测 domcontentloaded 后 2s 仍无面板元素），
 * 两种症状下「先看选项」都成立。因此每轮先看选项，再看拦截页标记，最后才判定不可用。
 * 导航自身抛错（出网抖动）同样返回可重试状态，由 openVimeoPanel 统一重试。
 */
async function openSamplePage(
  context: BrowserContext,
  url: string,
  videoId: string
): Promise<PanelProbe> {
  const page = await context.newPage()
  const panel = page.locator(`[data-testid="vdl-vimeo-panel"][data-vdl-video-id="${videoId}"]`)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    return { page, panel, state: 'navigation-failed', options: [], evidence: `goto:${reason}` }
  }

  const deadline = Date.now() + PANEL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const options = await readEnabledOptions(panel)
    if (options.length > 0) {
      return { page, panel, state: 'ready', options, evidence: '' }
    }
    const evidence = await readChallengeEvidence(page)
    if (evidence) {
      return { page, panel, state: 'challenge', options, evidence }
    }
    await page.waitForTimeout(PANEL_POLL_INTERVAL_MS)
  }

  return { page, panel, state: 'unavailable', options: [], evidence: '' }
}

/** 返回当前页面命中 Cloudflare 拦截页的依据；不是拦截页时返回空串。 */
async function readChallengeEvidence(page: Page): Promise<string> {
  const domMarkerCount = await page.locator(CHALLENGE_DOM_SELECTOR).count()
  if (domMarkerCount > 0) {
    return `dom:${CHALLENGE_DOM_SELECTOR}`
  }

  const bodyText = await page.locator('body').innerText()
  const marker = CHALLENGE_TEXT_MARKERS.find(candidate => bodyText.includes(candidate))
  return marker ? `text:${marker}` : ''
}

/**
 * 关掉 Vimeo 自己的 Premium 推广弹窗。
 *
 * 弹窗由页面自身弹出（与本插件无关），却会拦截指针事件让面板按钮点不到；没有弹窗时直接返回。
 */
async function dismissVimeoUpsell(page: Page): Promise<void> {
  const dismissButton = page.getByRole('dialog').getByRole('button', { name: UPSELL_DISMISS_NAME })
  const appeared = await dismissButton
    .first()
    .waitFor({ state: 'visible', timeout: UPSELL_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false)
  if (!appeared) {
    return
  }

  await dismissButton.first().click()
  await dismissButton.first().waitFor({ state: 'hidden', timeout: UPSELL_TIMEOUT_MS })
}

/** 读取面板当前全部可用选项。 */
async function readEnabledOptions(panel: Locator): Promise<PanelOption[]> {
  return panel
    .locator('[data-testid="vdl-vimeo-option"]:not(:disabled)')
    .evaluateAll(nodes =>
      nodes.map(node => ({
        kind: node.getAttribute('data-vdl-kind') ?? '',
        choice: node.getAttribute('data-vdl-choice') ?? '',
        label: node.getAttribute('data-vdl-label') ?? ''
      }))
    )
}

/** 面板内某个 choice 的按钮。 */
function optionButton(panel: Locator, choice: string): Locator {
  return panel.locator(`[data-testid="vdl-vimeo-option"][data-vdl-choice="${choice}"]`)
}

/**
 * 从指定 delivery 前缀的选项里取画质最低的一个。
 *
 * 真实下载必须落在有限时间内，因此优先选最小体积；画质标签形如 `360p HD` / `272p MP4`。
 */
function pickLowestHeightOption(
  options: readonly PanelOption[],
  deliveryPrefixes: readonly string[]
): PanelOption | undefined {
  const candidates = options.filter(option =>
    deliveryPrefixes.some(prefix => option.choice.startsWith(prefix))
  )

  return candidates.reduce<PanelOption | undefined>((lowest, option) => {
    if (!lowest) {
      return option
    }
    return readLabelHeight(option.label) < readLabelHeight(lowest.label) ? option : lowest
  }, undefined)
}

/** 从画质标签解析高度；无法解析时按最大处理，避免被误选。 */
function readLabelHeight(label: string): number {
  const height = /(\d+)p/.exec(label)?.[1]
  return height ? Number(height) : Number.MAX_SAFE_INTEGER
}

/** 校验落盘文件是 ISO BMFF：第 4~8 字节必须是 ftyp box 类型。 */
function readIsoBmffHeader(filePath: string): string {
  const descriptor = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(8)
    fs.readSync(descriptor, header, 0, 8, 0)
    return header.subarray(4, 8).toString('latin1')
  } finally {
    fs.closeSync(descriptor)
  }
}

/** 暂停顶层或 player frame 内的视频，避免短样本自动跳到推荐视频。 */
async function pauseVimeoPlayback(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    try {
      await frame.evaluate(() => {
        document.querySelectorAll('video').forEach(video => video.pause())
      })
    } catch (error) {
      console.error(`[VIMEO_REAL_PAUSE_FAILED] frame=${frame.url()}`, error)
    }
  }
}
