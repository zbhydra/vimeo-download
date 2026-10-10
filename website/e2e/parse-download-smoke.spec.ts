/** 真实 Website -> business -> parse node 合同 smoke；不拦截或伪造项目 API。 */
import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'

import { registerE2eBrowserIdentity } from '../../scripts/playwright-browser-identity.mjs'

registerE2eBrowserIdentity(test)

interface ApiEnvelope {
  code: number
  data?: {
    node?: { node_id: number; url: string }
    token?: string
    resources?: Array<{ resource_token?: string; download_mode?: string }>
    status?: number
    material?: {
      download_mode?: string
      download_url?: string
      video_track?: object
      audio_track?: object
    }
  }
}

const mediaUrl = process.env.E2E_MEDIA_URL ?? 'https://vimeo.com/1194296700'

test('真实解析与预授权只消费一次材料合同', async ({ page }) => {
  test.setTimeout(180_000)
  const apiBase = new URL(process.env.E2E_REAL_API_BASE_URL ?? '')
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(apiBase.hostname)
  await page.addInitScript(id => localStorage.setItem('homepage_device_id_v2', id), randomUUID())

  const requests: { path: string; body: string }[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.origin !== apiBase.origin || !url.pathname.startsWith('/api/client/media/')) return
    requests.push({ path: url.pathname, body: request.postData() ?? '' })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-download-parse-input]').fill(mediaUrl)
  const parsePreResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/client/media/parse-pre-v2'
  )
  const parseResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/client/media/parse-v2'
  )
  await page.locator('[data-download-parse-submit]').click()
  const parsePreBody = (await (await parsePreResponse).json()) as ApiEnvelope
  const parseBody = (await (await parseResponse).json()) as ApiEnvelope
  expect(parseBody.code).toBe(10000)
  expect(parsePreBody.code).toBe(10000)
  expect(parsePreBody.data?.node?.node_id).toBeGreaterThan(0)
  expect(parsePreBody.data?.node?.url).toContain('/api/client/media/parse-v2')
  expect(parsePreBody.data?.token).toBeTruthy()

  const parseRequests = requests.filter(request => request.path.endsWith('/parse-v2'))
  expect(parseRequests).toHaveLength(1)
  expect(Object.keys(JSON.parse(parseRequests[0].body) as { token: string }).sort()).toEqual(['token'])
  expect(parseBody.data?.resources?.[0]?.resource_token).toBeTruthy()

  const button = page.locator('[data-download-resource-button]').first()
  await expect(button).toBeVisible({ timeout: 90_000 })
  const authorizationResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname.endsWith('/download-anonymous-pre-v2')
  )
  const download = page.waitForEvent('download', { timeout: 90_000 })
  await button.click()
  const authorizationBody = (await (await authorizationResponse).json()) as ApiEnvelope
  expect(authorizationBody.code).toBe(10000)
  expect([1, 2]).toContain(authorizationBody.data?.status)
  expect(authorizationBody.data?.material?.download_mode).toBeTruthy()
  expect(
    authorizationBody.data?.material?.download_url ||
      (authorizationBody.data?.material?.video_track && authorizationBody.data?.material?.audio_track)
  ).toBeTruthy()
  await download

  expect(requests.some(request => request.path.endsWith('/download-v2'))).toBe(false)
  expect(requests.filter(request => request.path.endsWith('/download-anonymous-pre-v2'))).toHaveLength(1)
})
