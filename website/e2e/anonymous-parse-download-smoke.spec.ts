/** 匿名下载真实后端回归；设备计次只通过真实业务服务准备，不替换 API。 */
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { enUS } from '../src/i18n/lang/en-US'
import { registerE2eBrowserIdentity } from '../../scripts/playwright-browser-identity.mjs'

registerE2eBrowserIdentity(test)

/**
 * 真实回归固定样本：公开 Vimeo 视频，与后端 contract / 站点 e2e 使用同一支视频。
 *
 * `E2E_MEDIA_URL` 只是换样本的逃生口，样本仍必须是后端唯一支持的 Vimeo 平台链接。
 */
const VIMEO_MEDIA_URL = process.env.E2E_MEDIA_URL || 'https://vimeo.com/1194296700'

test.beforeEach(async ({ page }) => {
  const api = new URL(process.env.E2E_REAL_API_BASE_URL || '')
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(api.hostname)
  await page.route('**/api/**', async route => {
    if (new URL(route.request().url()).origin !== api.origin) return route.abort('blockedbyclient')
    await route.continue()
  })
})

test('anonymous: 真实解析、匿名授权与文件落盘', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const api = new URL(process.env.E2E_REAL_API_BASE_URL || '')
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(api.hostname)
  const deviceId = randomUUID()
  await page.addInitScript(id => localStorage.setItem('homepage_device_id_v2', id), deviceId)
  const apiResults: { path: string; code?: number; status?: number; sources?: { mode?: string; size?: number | null }[] }[] = []
  page.on('response', async response => {
    const path = new URL(response.url()).pathname
    if (!path.includes('/media/') || !response.headers()['content-type']?.includes('application/json')) return
    const body = await response.json() as { code?: number; data?: { status?: number; resources?: { download_mode?: string; size?: number | null }[]; messages?: { sources?: { download_mode?: string; size?: number | null }[] }[] } }
    const sources = body.data?.resources ?? body.data?.messages?.flatMap(message => message.sources ?? [])
    apiResults.push({ path, code: body.code, status: body.data?.status, sources: sources?.map(source => ({ mode: source.download_mode, size: source.size })) })
  })
  try {
    const logo = page.waitForResponse(response => response.url().includes('/assets/icons/logo.svg') && response.ok())
    await page.goto('/')
    await logo
    await page.locator('[data-download-parse-input]').fill(VIMEO_MEDIA_URL)
    await page.locator('[data-download-parse-submit]').click()
    const button = page.locator('[data-download-resource-button]').first()
    await expect(button).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.download-resource-credits-badge')).toHaveCount(0)
    if (process.env.E2E_PARSE_ONLY === '1') return
    const authorization = page.waitForResponse(response => response.url().endsWith('/download-anonymous-pre-v2'))
    const download = page.waitForEvent('download', { timeout: 90_000 })
    await button.click()
    const response = await authorization
    const body = await response.json() as { code: number; data: { status: number } }
    expect(body.code).toBe(10000)
    expect(body.data.status).toBe(1)
    const file = await download
    await file.saveAs(testInfo.outputPath(file.suggestedFilename()))
    expect(await file.failure()).toBeNull()
    await expect(button).toBeEnabled()
  } finally {
    writeFileSync(testInfo.outputPath('api-results.json'), JSON.stringify(apiResults))
    await testInfo.attach('anonymous-api-results', { body: JSON.stringify(apiResults), contentType: 'application/json' })
  }
})

test('anonymous: 节点网络中止后会话重新匿名授权', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.addInitScript(id => localStorage.setItem('homepage_device_id_v2', id), randomUUID())
  let authorizations = 0
  let nodes = 0
  page.on('request', request => {
    if (request.url().endsWith('/download-anonymous-pre-v2')) authorizations += 1
  })
  const base = process.env.E2E_REAL_API_BASE_URL!
  await page.route(`${base}/api/client/media/download-v2`, async route => {
    nodes += 1
    if (nodes === 1) {
      // 请求真实后端后中止浏览器接收，不生成替代响应。
      await route.fetch()
      await route.abort('connectionreset')
    } else await route.continue()
  })
  await page.goto('/')
  await page.locator('[data-download-parse-input]').fill(VIMEO_MEDIA_URL)
  await page.locator('[data-download-parse-submit]').click()
  await expect(page.locator('[data-download-resource-button]').first()).toBeVisible({ timeout: 60_000 })
  const download = page.waitForEvent('download')
  await page.locator('[data-download-resource-button]').first().click()
  const file = await download
  await file.saveAs(testInfo.outputPath(file.suggestedFilename()))
  expect(authorizations).toBe(2)
  expect(nodes).toBe(2)
  await testInfo.attach('reauthorization-result', { body: JSON.stringify({ authorizations, nodes }), contentType: 'application/json' })
})

test('anonymous: 状态 3 提示插件下载、不触发下载、不记失败', async ({ page }) => {
  test.setTimeout(120_000)
  const deviceId = randomUUID()
  // 通过真实业务服务把设备计数直接加到次数墙，触发后端状态 3。
  execFileSync('../backend/.venv/bin/python', ['-c', `
import asyncio, sys
sys.path.insert(0, 'src')
from app.services.counter_device_service import counter_device_service
from app.core.database import close_engine
async def main():
 await counter_device_service.add(sys.argv[1], 2001, 2147483647)
 await close_engine()
asyncio.run(main())
`, deviceId], { cwd: '../backend' })
  await page.addInitScript(id => localStorage.setItem('homepage_device_id_v2', id), deviceId)
  let authorizations = 0
  let fileRequests = 0
  let failedMarks = 0
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/download-anonymous-pre-v2')) authorizations += 1
    if (url.pathname.endsWith('/download-v2')) fileRequests += 1
    if (url.pathname.endsWith('/mark/record') && (request.postData() ?? '').includes('web_download_failed')) failedMarks += 1
  })
  await page.goto('/')
  await page.locator('[data-download-parse-input]').fill(VIMEO_MEDIA_URL)
  await page.locator('[data-download-parse-submit]').click()
  const button = page.locator('[data-download-resource-button]').first()
  await expect(button).toBeVisible({ timeout: 90_000 })

  const useExtensionMessage = enUS.pages.homepage.workspace.errors.useExtensionForResource
  const parseError = page.locator('[data-download-parse-error]')
  await expect(parseError).toBeHidden()

  // 单个下载：状态 3 → 完整提示 + 插件引导卡，不弹窗、不记失败。
  // 引导卡默认隐藏、一行入口默认可见：先断言这个前置状态并滚离视口，才能证明引导卡的显示、滚动与入口隐藏都是状态 3 带出来的。
  const guide = page.locator('[data-download-large-file-extension-inline]')
  const entryLine = page.locator('[data-download-extension-entry]')
  await expect(guide).toBeHidden()
  await expect(entryLine).toBeVisible()
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await expect(entryLine).not.toBeInViewport()
  const authorization = page.waitForResponse(response => response.url().endsWith('/download-anonymous-pre-v2'))
  // dispatchEvent 不触发 Playwright 的自动滚动，避免点击动作本身把引导卡带回视口。
  await button.dispatchEvent('click')
  const body = await (await authorization).json() as { code: number; data: { status: number } }
  expect(body.code).toBe(10000)
  expect(body.data.status).toBe(3)
  await expect(parseError).toHaveText(useExtensionMessage)
  await expect(guide).toBeVisible()
  await expect(guide).toBeInViewport()
  await expect(entryLine).toBeHidden()
  await expect(page.locator('[data-download-anonymous-modal]')).toBeHidden()
  await expect(page.locator('[data-download-auth-modal]')).toHaveCount(0)
  await expect(button).toBeEnabled()
  expect(authorizations).toBe(1)

  // 等待可能迟到的文件请求与失败打点，确认状态 3 没有走下载或失败分支。
  await page.waitForTimeout(1_000)
  expect(fileRequests).toBe(0)
  expect(downloads).toBe(0)
  expect(failedMarks).toBe(0)
})
