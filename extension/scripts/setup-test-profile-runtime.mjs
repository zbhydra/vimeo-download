/**
 * 真实站点 E2E profile 初始化脚本的共享 Chromium runtime。
 *
 * 这里仅统一构建、Manifest 校验、持久化浏览器启动和扩展 service worker 校验；
 * 站点状态由真实页面自身决定，避免把站点 DOM 规则混入公共层。
 */

import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createExtensionChromiumLaunchOptions,
  installE2eBrowserIdentity
} from '../../scripts/playwright-browser-identity.mjs'

/** 当前脚本绝对路径。 */
const scriptPath = fileURLToPath(import.meta.url)

/** extension 包根目录。 */
export const extensionRoot = path.resolve(path.dirname(scriptPath), '..')

/** 当前扩展构建产物目录。 */
export const distPath = path.join(extensionRoot, 'dist')

/** 真实 Vimeo E2E 默认 profile 基目录，setup 与 Playwright fixture 必须共同使用。 */
const defaultVimeoProfileDir = path.join(extensionRoot, 'tests/logs/test-user-data')

/** 一次性运行 profile 的子目录名前缀（与 fixtures 的 testRunId 前缀一致）。 */
const runProfileDirPrefix = 'e2e-'

/** 扩展 service worker 启动超时。 */
const serviceWorkerTimeoutMs = 15_000

/**
 * 解析 setup 与真实 E2E 共用的 Vimeo profile 基目录。
 *
 * 基目录本身不再是浏览器 profile：每次测试运行在它下面生成一次性子目录（见
 * resolveRunProfileDir），由当次启动的同一 Chromium 初始化，杜绝「profile 被外部
 * 浏览器以更新格式打开后 CfT chromium 拒绝启动」的格式漂移（U-H1 事故根因）。
 *
 * @returns {string} Vimeo persistent context 的 user data 基目录。
 */
export function resolveVimeoProfileDir() {
  return defaultVimeoProfileDir
}

/**
 * 解析一次测试运行的一次性 profile 目录。
 *
 * @param {string} baseDir profile 基目录（resolveVimeoProfileDir）。
 * @param {string} runId 本次测试运行 ID（fixtures 的 testRunId）。
 * @returns {string} 本次运行专用的 user data 目录。
 */
export function resolveRunProfileDir(baseDir, runId) {
  return path.join(baseDir, runId)
}

/**
 * 清理历史运行残留的一次性 profile 目录。
 *
 * 只删除带运行 ID 前缀的子目录，不触碰基目录下的人工产物；E2E 固定 `workers=1`
 * 串行执行，清理与后续启动不会并发冲突。
 *
 * @param {string} baseDir profile 基目录。
 * @returns {void}
 */
export function pruneStaleRunProfiles(baseDir) {
  let entries
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(runProfileDirPrefix)) {
      fs.rmSync(path.join(baseDir, entry.name), { recursive: true, force: true })
    }
  }
}

/**
 * 构建当前工作树并准备 profile 目录。
 *
 * @returns {void}
 */
export function prepareExtensionProfile(siteName, profileDir) {
  console.info(`[E2E_PROFILE_SETUP] 开始构建当前扩展: site=${siteName} cwd=${extensionRoot}`)

  try {
    execFileSync('pnpm', ['run', 'build'], {
      cwd: extensionRoot,
      stdio: 'inherit'
    })
  } catch (error) {
    console.error(`[E2E_PROFILE_SETUP] 扩展构建失败: site=${siteName}`, error)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[E2E_PROFILE_SETUP_BUILD_FAILED] site=${siteName} cwd=${extensionRoot} command="pnpm run build" reason=${reason}`,
      { cause: error }
    )
  }

  const manifestPath = path.join(distPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `[E2E_PROFILE_SETUP_DIST_MISSING] site=${siteName} dist=${distPath} manifest=${manifestPath}`
    )
  }
  fs.mkdirSync(profileDir, { recursive: true })
}

/**
 * 关闭 owner 之外的全部 Page，并返回关闭失败数。
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {import('@playwright/test').Page | null} [owner]
 * @returns {Promise<{ closeFailureCount: number }>} owner 外页面的关闭失败数。
 */
export async function closeOtherPages(context, owner = null) {
  const pages = context.pages().filter(page => !page.isClosed())
  const closeResults = await Promise.allSettled(
    pages.filter(page => page !== owner).map(page => page.close())
  )
  return {
    closeFailureCount: closeResults.filter(result => result.status === 'rejected').length
  }
}

/** 等待当前 unpacked extension 的 service worker。 */
async function findExtensionServiceWorker(context) {
  const existingWorker = context
    .serviceWorkers()
    .find(worker => worker.url().startsWith('chrome-extension://'))
  if (existingWorker) return existingWorker

  return context.waitForEvent('serviceworker', {
    timeout: serviceWorkerTimeoutMs,
    predicate: worker => worker.url().startsWith('chrome-extension://')
  })
}

/**
 * 获取当前 unpacked extension 的 service worker。
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<import('@playwright/test').Worker>}
 */
export async function getExtensionServiceWorker(context) {
  try {
    return await findExtensionServiceWorker(context)
  } catch (error) {
    console.error(error)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[E2E_EXTENSION_SERVICE_WORKER_TIMEOUT] workers=${context
        .serviceWorkers()
        .map(worker => worker.url())
        .join(',')} timeoutMs=${serviceWorkerTimeoutMs} reason=${reason}`,
      { cause: error }
    )
  }
}

/**
 * 启动加载当前 unpacked extension 的可视化持久化 Chromium。
 *
 * @param {string} siteName 诊断信息中的站点名称。
 * @param {string} profileDir Chromium user data 目录。
 * @returns {Promise<import('@playwright/test').BrowserContext>} 已加载 unpacked extension 的浏览器上下文。
 */
export async function launchExtensionProfile(siteName, profileDir) {
  console.info(`[E2E_PROFILE_SETUP] 启动登录窗口: site=${siteName} profile=${profileDir}`)
  const launchOptions = createExtensionChromiumLaunchOptions([
    `--disable-extensions-except=${distPath}`,
    `--load-extension=${distPath}`,
    '--disable-dev-shm-usage'
  ])
  const context = await chromium.launchPersistentContext(profileDir, {
    ...launchOptions,
    viewport: { width: 1280, height: 800 }
  })

  try {
    await installE2eBrowserIdentity(context)
    await context.route('https://vimeo-download-logs.ap-northeast-1.log.aliyuncs.com/**', async route => {
      await route.fulfill({ status: 204, body: '' })
    })
    return context
  } catch (error) {
    console.error(`[E2E_PROFILE_SETUP] 浏览器初始化失败: site=${siteName}`, error)
    await context.close().catch(closeError => {
      console.error(`[E2E_PROFILE_SETUP] 初始化失败后关闭浏览器失败: site=${siteName}`, closeError)
    })
    throw error
  }
}

/**
 * 在站点页面完成导航后，等待 unpacked extension 的 service worker 启动。
 *
 * MV3 service worker 按需唤醒，必须由站点 content script 触发后再检查，不能在 about:blank
 * 阶段提前等待。
 */
export async function waitForExtensionServiceWorker(context, siteName, profileDir) {
  try {
    await findExtensionServiceWorker(context)
  } catch (error) {
    console.error(`[E2E_PROFILE_SETUP] 扩展 service worker 启动失败: site=${siteName}`, error)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[E2E_PROFILE_SETUP_EXTENSION_MISSING] site=${siteName} dist=${distPath} profile=${profileDir} reason=${reason}`
    )
  }
}
