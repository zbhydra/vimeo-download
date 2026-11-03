/**
 * 真实额度用完后，Vimeo 页面内的升级弹窗打开插件自己的订阅页，不跳官网。
 *
 * 用 player 页面的原因见 `vimeo-real-subtitle.spec.ts`。额度由本地真实后端判定，
 * 每条用例是全新 profile，游客额度按新设备从头计。
 */
import type { QuotaCheckResponse } from '../../src/core/api/quota/types'
import { test, expect } from '../fixtures'

const SAMPLE_URL = 'https://player.vimeo.com/video/1226740492'
const API_BASE_URL =
  process.env.EXTENSION_API_BASE_URL?.trim().replace(/\/+$/, '') || 'http://localhost:7900'
const QUOTA_CHECK_URL = `${API_BASE_URL}/api/client/quota/check`
/** 免费额度是每天 3 次；多留几次，超过仍没弹窗就算失败。 */
const MAX_CLICKS = 8

test('额度用完后页面弹窗打开插件订阅页', async ({ context, extensionId }) => {
  const quotaStatuses: number[] = []
  context.on('response', response => {
    if (response.request().serviceWorker() && response.url() === QUOTA_CHECK_URL) {
      void response.json().then((body: { data: QuotaCheckResponse }) => {
        quotaStatuses.push(body.data.status)
      })
    }
  })

  const page = await context.newPage()
  await page.goto(SAMPLE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const thumbnail = page
    .locator('[data-testid="vdl-vimeo-row-image"] [data-vdl-source-id]:not([data-vdl-source-id=""])')
    .first()
  await expect(thumbnail).toBeVisible({ timeout: 60_000 })

  // 弹窗由被拒绝的那次响应触发，按响应判断，不用 isVisible 去抢弹窗渲染的时机。
  for (let click = 1; click <= MAX_CLICKS && quotaStatuses.at(-1) !== 0; click += 1) {
    await thumbnail.click()
    await expect.poll(() => quotaStatuses.length, { timeout: 30_000 }).toBe(click)
    await expect(thumbnail).toBeEnabled({ timeout: 60_000 })
  }
  expect(quotaStatuses.at(-1)).toBe(0)
  const upgrade = page.locator('#vdl-upgrade-modal-container .vdl-upgrade-modal-btn')
  await expect(upgrade).toBeVisible({ timeout: 10_000 })

  const pagesBefore = context.pages().length
  const [pricing] = await Promise.all([context.waitForEvent('page'), upgrade.click()])
  await pricing.waitForLoadState('domcontentloaded')
  expect(context.pages()).toHaveLength(pagesBefore + 1)

  // Node 的 URL 不计算 chrome-extension 的 origin（恒为 "null"），分开比较协议和扩展 ID。
  const url = new URL(pricing.url())
  expect(url.protocol).toBe('chrome-extension:')
  expect(url.host).toBe(extensionId)
  expect(url.pathname).toBe('/ext-pricing.html')
  expect(url.searchParams.get('source')).toBe('upgrade_modal')
  await expect(pricing.locator('#vdl-premium-title')).toBeVisible({ timeout: 30_000 })
  await expect(upgrade).toBeHidden()

  await pricing.close()
  await page.close()
})
