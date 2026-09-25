/**
 * Playwright 全局准备。
 *
 * 每次实际 E2E 都重新构建当前源码，并验证测试将加载的 manifest 入口，避免旧 dist
 * 让测试错误地通过。
 */

import type { FullConfig } from '@playwright/test'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { SITE_REGISTRATION, type SiteContentScriptRegistration } from '../src/platforms/registry'

/** 当前文件路径。 */
const __filename = fileURLToPath(import.meta.url)

/** tests 目录。 */
const testsDir = path.dirname(__filename)

/** extension 包根目录。 */
const extensionRoot = path.resolve(testsDir, '..')

/** 当前构建输出目录。 */
const distPath = path.join(extensionRoot, 'dist')

/** 构建后 manifest 中使用的 content script 结构。 */
interface BuiltContentScript {
  /** URL 匹配规则。 */
  matches?: string[]
  /** 构建后的 JavaScript 入口。 */
  js?: string[]
  /** 注入时机。 */
  run_at?: string
  /** MAIN world 入口标记。 */
  world?: string
}

/** 本轮只需验证的构建后 manifest 字段。 */
interface BuiltManifest {
  /** Manifest 版本。 */
  manifest_version?: number
  /** Popup 配置。 */
  action?: { default_popup?: string }
  /** Background 配置。 */
  background?: { service_worker?: string }
  /** 构建后的 content scripts。 */
  content_scripts?: BuiltContentScript[]
}

/** Playwright global setup。 */
export default function globalSetup(_config: FullConfig): void {
  buildCurrentSource()
  verifyBuildArtifacts()
}

/** 无条件构建当前工作树。 */
function buildCurrentSource(): void {
  console.info(`[E2E_GLOBAL_SETUP] fresh build 开始: cwd=${extensionRoot}`)

  try {
    execFileSync('pnpm', ['run', 'build:dev'], {
      cwd: extensionRoot,
      stdio: 'inherit'
    })
  } catch (error) {
    console.error('[E2E_GLOBAL_SETUP] 当前源码构建失败:', error)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `[E2E_BUILD_FAILED] cwd=${extensionRoot} command="pnpm run build:dev" reason=${reason}`
    )
  }
}

/** 校验测试实际加载的是完整且包含当前站点入口的 MV3 构建。 */
function verifyBuildArtifacts(): void {
  const contentScripts: readonly SiteContentScriptRegistration[] = SITE_REGISTRATION.contentScripts
  const requiredFiles = [
    'manifest.json',
    'src/popup.html',
    'src/background/index.js',
    ...contentScripts.map(contentScript => toBuiltEntry(contentScript.entry))
  ]
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(distPath, file)))

  if (missingFiles.length > 0) {
    throw new Error(
      `[E2E_BUILD_INCOMPLETE] dist=${distPath} missing=${missingFiles.join(',')}`
    )
  }

  const manifestPath = path.join(distPath, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BuiltManifest
  assertManifestValue(
    manifest.manifest_version === 3,
    `manifest_version=${String(manifest.manifest_version)}`
  )
  assertManifestValue(
    manifest.action?.default_popup === 'src/popup.html',
    `default_popup=${manifest.action?.default_popup ?? 'missing'}`
  )
  assertManifestValue(
    manifest.background?.service_worker === 'src/background/index.js',
    `service_worker=${manifest.background?.service_worker ?? 'missing'}`
  )

  const scripts = manifest.content_scripts ?? []
  for (const contentScript of contentScripts) {
    const entry = toBuiltEntry(contentScript.entry)
    const matches = contentScript.matches ?? SITE_REGISTRATION.matches
    assertManifestValue(
      hasSiteScript(scripts, entry, matches, contentScript.runAt, contentScript.world),
      `站点入口缺失: entry=${entry}`
    )
  }

  console.info(`[E2E_GLOBAL_SETUP] fresh build 验证通过: manifest=${manifestPath}`)
}

/** 把注册表源码入口转换为 Vite 构建后的 JavaScript 路径。 */
function toBuiltEntry(entry: string): string {
  return entry.replace(/\.ts$/, '.js')
}

/** 判断 manifest 是否包含注册表声明的入口。 */
function hasSiteScript(
  scripts: BuiltContentScript[],
  entry: string,
  matches: readonly string[],
  runAt: string,
  world?: string
): boolean {
  return scripts.some(script => {
    return (
      matches.every(match => script.matches?.includes(match) === true) &&
      script.js?.includes(entry) === true &&
      script.run_at === runAt &&
      (world === undefined || script.world === world)
    )
  })
}

/** 抛出可定位的 manifest 验证错误。 */
function assertManifestValue(condition: boolean, detail: string): void {
  if (!condition) {
    throw new Error(`[E2E_MANIFEST_INVALID] manifest=${path.join(distPath, 'manifest.json')} ${detail}`)
  }
}
