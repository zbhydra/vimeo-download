/** Playwright 浏览器身份回归门禁。 */

import { expect, test } from '@playwright/test'

import {
  expectE2eBrowserIdentity,
  registerE2eBrowserIdentity
} from '../../scripts/playwright-browser-identity.mjs'

registerE2eBrowserIdentity(test)

test('浏览器身份不暴露 Playwright 自动化标识', async ({ page }, testInfo) => {
  await expectE2eBrowserIdentity(page, testInfo, expect)
})
