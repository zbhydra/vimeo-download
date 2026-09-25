/** 匿名下载真实后端回归；设备计次只通过真实业务服务准备，不替换 API。 */
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
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
  await page.addInitScript(id => {
    localStorage.removeItem('homepage_access_token')
    localStorage.setItem('homepage_device_id_v2', id)
  }, deviceId)
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


test('anonymous: 等待持久化、取消和到期重试', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const deviceId = randomUUID()
  execFileSync('../backend/.venv/bin/python', ['-c', `
import asyncio, sys
sys.path.insert(0, 'src')
from app.services.counter_device_service import counter_device_service
from app.core.database import close_engine
async def main():
 await counter_device_service.add(sys.argv[1], 2001, 2)
 await close_engine()
asyncio.run(main())
`, deviceId], { cwd: '../backend' })
  await page.addInitScript(id => {
    localStorage.removeItem('homepage_access_token')
    localStorage.setItem('homepage_device_id_v2', id)
  }, deviceId)
  let fileRequests = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/download-v2')) fileRequests += 1
  })
  await page.goto('/')
  await page.locator('[data-download-parse-input]').fill(VIMEO_MEDIA_URL)
  await page.locator('[data-download-parse-submit]').click()
  const button = page.locator('[data-download-resource-button]').first()
  await expect(button).toBeVisible({ timeout: 90_000 })
  await button.click()
  const modal = page.locator('[data-download-anonymous-modal]')
  await expect(modal).toBeVisible()
  await expect(page.locator('[data-download-anonymous-login]')).toBeEnabled()
  await expect(page.locator('[data-download-anonymous-login]')).toBeFocused()
  expect(fileRequests).toBe(0)
  const deadline = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('download:anonymous-wait:'))?.[1])
  await page.screenshot({ path: testInfo.outputPath('wait-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('wait-mobile.png') })
  await page.locator('[data-download-anonymous-login]').click()
  await expect(modal).toBeHidden()
  const auth = page.locator('[data-download-auth-modal]')
  await expect(auth).toBeVisible()
  await auth.locator('.download-auth-close').click()
  await expect(modal).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(button).toBeEnabled()
  await expect(button).toBeFocused()
  await page.reload()
  await expect(button).toBeVisible({ timeout: 15_000 })
  await button.click()
  await expect(modal).toBeVisible()
  expect(await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('download:anonymous-wait:'))?.[1])).toBe(deadline)
  await page.locator('[data-download-anonymous-close]').click()
  await expect(button).toBeEnabled()
  await page.clock.install()
  await page.clock.fastForward(301_000)
  expect(fileRequests).toBe(0)
  const downloaded = page.waitForEvent('download')
  await button.click()
  const file = await downloaded
  await file.saveAs(testInfo.outputPath(file.suggestedFilename()))
  await expect(button).toBeEnabled()
})

test('anonymous: 等待中真实登录后使用账号授权及余额', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const deviceId = randomUUID()
  const email = `e2e-anonymous-${deviceId}@example.com`
  const code = '946281'
  const seedScript = `
import asyncio, sys
sys.path.extend(['src', 'scripts'])
from dataclasses import replace
import e2e_seed_user as seed
from app.services.counter_device_service import counter_device_service
from app.services.email_verification_service import email_verification_service
from app.core.redis import redis_client
from app.core.database import close_engine
scenario = seed.SeedScenario.PARSE_DOWNLOAD
seed.SEED_SCENARIO_CONFIGS[scenario] = replace(seed.SEED_SCENARIO_CONFIGS[scenario], email=sys.argv[2])
async def main():
 if sys.argv[4] == 'cleanup':
  await seed._cleanup(scenario)
 else:
  await seed._seed(scenario)
  await counter_device_service.add(sys.argv[1], 2001, 2)
  redis = await redis_client.get_client()
  await redis.set(email_verification_service._build_key(sys.argv[2]), sys.argv[3], ex=300)
 await close_engine()
asyncio.run(main())
`
  execFileSync('../backend/.venv/bin/python', ['-c', seedScript, deviceId, email, code, 'seed'], { cwd: '../backend' })
  try {
  await page.addInitScript(id => {
    if (!localStorage.getItem('homepage_device_id_v2')) localStorage.setItem('homepage_device_id_v2', id)
  }, deviceId)
  await page.goto('/')
  await page.locator('[data-download-parse-input]').fill(VIMEO_MEDIA_URL)
  await page.locator('[data-download-parse-submit]').click()
  await expect(page.locator('[data-download-resource-button]').first()).toBeVisible({ timeout: 90_000 })
  await page.locator('[data-download-resource-button]').first().click()
  await expect(page.locator('[data-download-anonymous-modal]')).toBeVisible()
  await page.locator('[data-download-anonymous-login]').click()
  await page.locator('[data-download-email-entry-button]').click()
  await page.locator('[data-download-login-email]').fill(email)
  const emailResponse = page.waitForResponse(response => response.url().endsWith('/email-verify-login'))
  const accountAuthorization = page.waitForResponse(response => response.url().endsWith('/download-pre-v2'), { timeout: 20_000 })
  const download = page.waitForEvent('download')
  // 验证码在真实 Redis 中准备；提交现有表单，避免向测试邮箱发送邮件。
  await page.evaluate(value => {
    document.querySelector<HTMLInputElement>('[data-download-login-code]')!.value = value
    document.querySelector<HTMLFormElement>('[data-download-auth-form]')!.requestSubmit()
  }, code)
  const loginResult = await (await emailResponse).json() as { code: number }
  expect(loginResult.code).toBe(10000)
  const response = await accountAuthorization
  const body = await response.json() as { code: number; data: { credits_balance: number; token: string } }
  expect(body.code).toBe(10000)
  expect(Number.isFinite(body.data.credits_balance)).toBe(true)
  const claims = JSON.parse(Buffer.from(body.data.token.split('.')[1], 'base64url').toString()) as { uid: number }
  expect(claims.uid).toBeGreaterThan(0)
  const file = await download
  await file.saveAs(testInfo.outputPath(file.suggestedFilename()))
  await expect(page.locator('[data-download-anonymous-modal]')).toBeHidden()
  await expect(page.locator('.download-resource-credits-badge').first()).toBeVisible()
  await testInfo.attach('login-result', { body: JSON.stringify({ userId: claims.uid, creditsBalance: body.data.credits_balance }), contentType: 'application/json' })
  } finally {
    execFileSync('../backend/.venv/bin/python', ['-c', seedScript, deviceId, email, code, 'cleanup'], { cwd: '../backend' })
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

test('anonymous: 等待期间浏览器时间超过凭证有效期后重新授权', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const deviceId = randomUUID()
  execFileSync('../backend/.venv/bin/python', ['-c', `
import asyncio, sys
sys.path.insert(0, 'src')
from app.services.counter_device_service import counter_device_service
from app.core.database import close_engine
async def main():
 await counter_device_service.add(sys.argv[1], 2001, 2)
 await close_engine()
asyncio.run(main())
`, deviceId], { cwd: '../backend' })
  await page.addInitScript(id => localStorage.setItem('homepage_device_id_v2', id), deviceId)
  let authorizations = 0
  await page.route(`${process.env.E2E_REAL_API_BASE_URL}/api/client/media/download-anonymous-pre-v2`, async route => {
    authorizations += 1
    // 首张凭证在浏览器时钟中到期后，回到等待已结束且新凭证有效的浏览器时间。
    if (authorizations === 2) await page.clock.setSystemTime(new Date(Date.now() + 301_000))
    await route.continue()
  })
  await page.goto('/')
  await page.locator('[data-download-parse-input]').fill(VIMEO_MEDIA_URL)
  await page.locator('[data-download-parse-submit]').click()
  await expect(page.locator('[data-download-resource-button]').first()).toBeVisible({ timeout: 60_000 })
  const authorization = page.waitForResponse(response => response.url().endsWith('/download-anonymous-pre-v2'))
  await page.locator('[data-download-resource-button]').first().click()
  const body = await (await authorization).json() as { data: { expires_at: number; status: number } }
  expect(body.data.status).toBe(2)
  await expect(page.locator('[data-download-anonymous-modal]')).toBeVisible()
  await page.clock.install()
  const download = page.waitForEvent('download')
  await page.clock.setSystemTime(new Date(body.data.expires_at * 1000 + 1000))
  const file = await download
  await file.saveAs(testInfo.outputPath(file.suggestedFilename()))
  expect(authorizations).toBe(2)
  await testInfo.attach('expiry-result', { body: JSON.stringify({ authorizations, browserTimeAdvancedPastExpiry: true }), contentType: 'application/json' })
})
