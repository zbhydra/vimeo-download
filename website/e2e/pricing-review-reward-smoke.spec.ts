/**
 * Pricing 好评赠送真实后端 smoke。
 *
 * 不 mock 项目 API、鉴权或业务 service；该流程会永久消费 seed 账号的一次赠送资格。
 */

import { expect, test } from '@playwright/test'

import { registerE2eBrowserIdentity } from '../../scripts/playwright-browser-identity.mjs'
import { CHROME_WEB_STORE_URL } from '../src/lib/site.mjs'

registerE2eBrowserIdentity(test)
test.setTimeout(60_000)

// 好评页跟随站点配置的商店地址；上架前是占位 ID，上架后随 site.mjs 自动变化。
const REVIEW_EXTENSION_ID = new URL(CHROME_WEB_STORE_URL).pathname.split('/').filter(Boolean).at(-1)
const REVIEW_REWARD_DURATION_MS = 7 * 24 * 60 * 60 * 1000

interface ReviewRewardClaimEnvelope {
  /** 后端业务成功码。 */
  code: number
  /** 好评赠送领取结果。 */
  data: {
    /** 首次领取必须实际发放。 */
    result: string
    /** 好评赠送资格状态位：领取请求成功返回时恒为 1。 */
    review_reward_claimed_count: number
  }
}

interface CurrentUserEnvelope {
  /** 后端业务成功码。 */
  code: number
  /** 刷新后的账号数据。 */
  data: {
    /** 当前订阅权益。 */
    subscription: {
      /** 订阅到期毫秒时间戳。 */
      expires_at: number | null
    }
  }
}

test('真实账号完成桌面与移动端 30 秒好评赠送领取', async ({ page }) => {
  const accessToken = process.env.E2E_ACCESS_TOKEN
  const deviceId = process.env.E2E_DEVICE_ID
  if (!accessToken || !deviceId) {
    throw new Error(
      '[pricing-review-reward-smoke] 缺少 globalSetup 注入的 E2E_ACCESS_TOKEN 或 E2E_DEVICE_ID。'
    )
  }

  await page.addInitScript(([token, device]) => {
    window.localStorage.setItem('homepage_access_token', token)
    window.localStorage.setItem('homepage_device_id_v2', device)
  }, [accessToken, deviceId])

  const claimRequestTimes: number[] = []
  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/client/subscription/review-reward/claim'
    ) {
      claimRequestTimes.push(Date.now())
    }
  })

  await page.setViewportSize({ width: 1440, height: 900 })
  const response = await page.goto('/zh-cn/ext-pricing/')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('[data-pricing-account-signed-in]')).toBeVisible()

  // 商品库有多张订阅卡，每张卡一个购买按钮；取列表首张主推卡。
  const buyButton = page
    .locator('[data-pricing-subscription-card]')
    .first()
    .locator('[data-pricing-subscription-buy]')
  await expect(buyButton).toBeEnabled()
  await buyButton.click()

  const dialog = page.locator('[data-pricing-subscription-confirm]')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('如果您能给插件一个好评，我会给你赠送 7 天的插件订阅')
  await expect(dialog.locator('[data-pricing-review-button]')).toHaveText('去好评')
  await expect(dialog).toContainText('立刻安装')

  const desktopBox = await dialog.boundingBox()
  expect(desktopBox).not.toBeNull()
  expect(desktopBox?.width).toBeLessThanOrEqual(520)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileBox = await dialog.boundingBox()
  expect(mobileBox).not.toBeNull()
  expect(mobileBox?.x).toBeGreaterThanOrEqual(0)
  expect((mobileBox?.x ?? 0) + (mobileBox?.width ?? 0)).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  const popupPromise = page.waitForEvent('popup')
  const countdownStartedAt = Date.now()
  await dialog.locator('[data-pricing-review-button]').click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(url => {
    const pathSegments = url.pathname.split('/').filter(Boolean)
    return (
      url.origin === 'https://chromewebstore.google.com' &&
      pathSegments.at(-2) === REVIEW_EXTENSION_ID &&
      pathSegments.at(-1) === 'reviews'
    )
  })
  await popup.close()

  await expect(dialog.locator('[data-pricing-subscription-confirm-view="countdown"]')).toBeVisible()
  await expect(dialog.locator('[data-pricing-subscription-confirm-continue]')).toBeHidden()
  await expect(dialog.locator('#pricing-subscription-confirm-description-countdown')).toHaveText(
    '完成好评后返回此页面，我们会自动检测并领取赠送。检测期间请不要关闭或刷新窗口。如果您已经评论，不要着急，请等待我们的检测。'
  )
  await expect(dialog.locator('[data-pricing-review-countdown]')).toContainText('秒后检测')

  const claimResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/client/subscription/review-reward/claim'
  )
  const accountRefreshResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === '/api/client/auth/me'
  )
  await expect(dialog.locator('[data-pricing-subscription-confirm-view="success"]')).toBeVisible({
    timeout: 45_000
  })
  const claimResponse = await claimResponsePromise
  const claimCompletedAt = Date.now()
  const claimPayload = JSON.parse(await claimResponse.text()) as ReviewRewardClaimEnvelope
  expect(claimResponse.ok()).toBe(true)
  expect(claimPayload.code).toBe(10000)
  expect(claimPayload.data).toEqual({ result: 'granted', review_reward_claimed_count: 1 })

  const accountRefreshResponse = await accountRefreshResponsePromise
  const accountPayload = JSON.parse(await accountRefreshResponse.text()) as CurrentUserEnvelope
  const expiresAt = accountPayload.data.subscription.expires_at
  expect(accountRefreshResponse.ok()).toBe(true)
  expect(accountPayload.code).toBe(10000)
  expect(expiresAt).not.toBeNull()
  expect(expiresAt ?? 0).toBeGreaterThanOrEqual(claimCompletedAt + REVIEW_REWARD_DURATION_MS - 5_000)
  expect(expiresAt ?? 0).toBeLessThanOrEqual(claimCompletedAt + REVIEW_REWARD_DURATION_MS + 5_000)
  await expect(page.locator('[data-pricing-user-subscription]')).toHaveText('无限下载')
  await expect(page.locator('[data-pricing-user-expires]')).not.toHaveText('无到期时间')

  expect(claimRequestTimes).toHaveLength(1)
  expect(claimRequestTimes[0] - countdownStartedAt).toBeGreaterThanOrEqual(29_500)
  await expect(dialog).toContainText('已赠送 7 天')
  await expect(page.locator('[data-order-checkout-payment-dialog]')).toBeHidden()
})
