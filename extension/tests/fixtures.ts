/**
 * Chrome 扩展 E2E fixtures。
 *
 * 职责：
 * - 使用 Playwright 持久化上下文加载 dist 扩展。
 * - 使用真实 Vimeo 站点 profile。
 * - 统一 test run id 与下载目录。
 */

import {
  test as base,
  expect,
  type BrowserContext,
  type PlaywrightWorkerArgs,
  type Worker,
  type WorkerInfo
} from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  createExtensionChromiumLaunchOptions,
  installE2eBrowserIdentity
} from '../../scripts/playwright-browser-identity.mjs'
import {
  closeOtherPages,
  getExtensionServiceWorker,
  resolveVimeoProfileDir
} from '../scripts/setup-test-profile-runtime.mjs'

/** 当前文件路径，用于解析测试目录。 */
const __filename = fileURLToPath(import.meta.url)

/** tests 目录绝对路径。 */
const __dirname = path.dirname(__filename)

/** extension 包根目录。 */
const extensionRoot = path.resolve(__dirname, '..')

/** Playwright 产物根目录。 */
const logsDir = path.join(__dirname, 'logs')

/** 扩展构建产物目录。 */
const distPath = path.join(extensionRoot, 'dist')

/** 自定义 fixture 集合。 */
interface ExtensionFixtures {
  /** 带扩展的持久化浏览器上下文。 */
  context: BrowserContext
  /** 当前构建产物解析出来的扩展 ID。 */
  extensionId: string
  /** 本次测试运行 ID。 */
  testRunId: string
  /** 本次测试下载目录。 */
  downloadDir: string
  /** 当前测试使用的 user data 目录。 */
  profileDir: string
}

/** 创建可定位的一次性测试运行 ID。 */
function createTestRunId(): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `e2e-${Date.now()}-${suffix}`
}

/** 从 extension service worker URL 解析 Chrome extension ID。 */
function readExtensionIdFromServiceWorkerUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'chrome-extension:' || !/^[a-z]{32}$/.test(parsed.hostname)) {
    throw new Error(`[E2E_EXTENSION_ID_INVALID] serviceWorkerUrl=${url}`)
  }
  return parsed.hostname
}

/** 确保目录存在。 */
function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

/** 启动并初始化一个加载扩展的持久化上下文。 */
async function launchExtensionContext(
  playwright: PlaywrightWorkerArgs['playwright'],
  projectName: string,
  profileDir: string,
  downloadDir: string
): Promise<BrowserContext> {
  const manifestPath = path.join(distPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `[E2E_EXTENSION_DIST_MISSING] project=${projectName} stage=manifest profile=${profileDir} dist=${distPath} manifest=${manifestPath} command="pnpm run build"`
    )
  }

  ensureDir(profileDir)
  ensureDir(downloadDir)
  const launchOptions = createExtensionChromiumLaunchOptions([
    `--disable-extensions-except=${distPath}`,
    `--load-extension=${distPath}`,
    '--disable-dev-shm-usage'
  ])
  let context: BrowserContext | null = null
  try {
    context = await playwright.chromium.launchPersistentContext(profileDir, {
      ...launchOptions,
      acceptDownloads: true,
      downloadsPath: downloadDir,
      viewport: { width: 1280, height: 720 }
    })
    await installE2eBrowserIdentity(context)
    await context.route('https://vimeo-download.ap-southeast-1.log.aliyuncs.com/**', async route => {
      await route.fulfill({ status: 204, body: '' })
    })
    return context
  } catch (error) {
    console.error(error)
    if (context) {
      await context.close().catch(closeError => {
        console.error(closeError)
      })
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[E2E_EXTENSION_CONTEXT_START_FAILED] project=${projectName} stage=launch-or-initialize profile=${profileDir} dist=${distPath} reason=${reason}`
    )
  }
}

/** worker 结束前正常关闭持久化上下文，让 Chromium 自行释放 profile lock。 */
async function closeContext(
  context: BrowserContext,
  workerInfo: WorkerInfo,
  profileDir: string
): Promise<void> {
  try {
    await context.close()
  } catch (error) {
    console.error(error)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[E2E_EXTENSION_CONTEXT_CLOSE_FAILED] project=${workerInfo.project.name} stage=worker-teardown profile=${profileDir} worker=${workerInfo.workerIndex} reason=${reason}`
    )
  }
}

export const test = base.extend<ExtensionFixtures>({
  testRunId: async ({ browserName: _browserName }, use) => {
    await use(createTestRunId())
  },

  profileDir: async ({ browserName: _browserName }, use) => {
    const profileDir = resolveVimeoProfileDir()
    ensureDir(profileDir)
    await use(profileDir)
  },

  downloadDir: async ({ testRunId }, use) => {
    const downloadDir = path.resolve(
      process.env.E2E_DOWNLOAD_DIR || path.join(logsDir, 'downloads', testRunId)
    )
    ensureDir(downloadDir)
    await use(downloadDir)
  },

  context: async ({ playwright, profileDir, downloadDir }, use, workerInfo) => {
    let context: BrowserContext | null = null
    try {
      context = await launchExtensionContext(
        playwright,
        workerInfo.project.name,
        profileDir,
        downloadDir
      )
      await use(context)
    } finally {
      if (context) {
        await closeContext(context, workerInfo, profileDir)
      }
    }
  },

  page: async ({ context, profileDir }, use, testInfo) => {
    const page = await context.newPage()
    try {
      await use(page)
    } finally {
      const remainingPages = await closeOtherPages(context)
      if (remainingPages.closeFailureCount > 0) {
        throw new Error(
          `[E2E_EXTENSION_PAGE_CLEANUP_RETRY] project=${testInfo.project.name} phase=test-teardown profile=${profileDir} closeFailures=${remainingPages.closeFailureCount}`
        )
      }
    }
  },

  extensionId: async ({ context, profileDir }, use, testInfo) => {
    let serviceWorker: Worker
    try {
      serviceWorker = await getExtensionServiceWorker(context)
    } catch (error) {
      console.error(error)
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        `[E2E_EXTENSION_SERVICE_WORKER_MISSING] project=${testInfo.project.name} stage=service-worker profile=${profileDir} dist=${distPath} reason=${reason}`
      )
    }

    await use(readExtensionIdFromServiceWorkerUrl(serviceWorker.url()))
  }
})

export { expect }
