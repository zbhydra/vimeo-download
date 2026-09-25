/**
 * Playwright 配置。
 *
 * 两类 e2e 互相隔离，不能混跑：
 * 1. mock/UI 跑（download-workspace.spec.ts / website.spec.ts）：
 *    webServer 把 PUBLIC_API_BASE_URL 指向假地址 http://homepage-api.test，
 *    spec 内 page.route 拦截后端请求，验证的是前端 UI 行为。
 * 2. 真实回归 smoke（parse-download-smoke.spec.ts）：
 *    真实网络，dev server 指向本地真实后端，globalSetup 注入 seed token。
 *    仅在显式 --project=parse-download-smoke 且设了 E2E_REAL_API_BASE_URL 时跑。
 *
 * 隔离手段：
 * - smoke 用独立 project（testMatch 只匹配 smoke spec）；
 * - 现有 4 个浏览器 project 用 testIgnore 排除 smoke spec；
 * - webServer.command 按 E2E_REAL_API_BASE_URL 切 base：设了就指真实后端，
 *   不设维持假地址（保护 mock 跑不受影响）；
 * - webServer 用本仓测试保留端口（E2E_WEB_PORT 可覆盖）且不复用已有监听，
 *   避免与其它 checkout 的 dev/preview 串台；
 * - globalSetup 内部用同一 env 做守卫，未设时直接 no-op。
 */
import { defineConfig, devices } from '@playwright/test';

import {
  createChromiumProjectUse,
  createHeadlessChromiumProjectUse,
  createNativeBrowserProjectUse,
} from '../scripts/playwright-browser-identity.mjs';

// smoke spec 文件匹配模式：新增 project 用它做 testMatch，现有 project 用它做 testIgnore。
const PARSE_SMOKE_SPEC = /parse-download-smoke\.spec\.ts$/;
// Pricing 好评赠送真实账号 smoke，与默认 mock project 完全隔离。
const PRICING_REVIEW_REWARD_SMOKE_SPEC = /pricing-review-reward-smoke\.spec\.ts$/;
const VIMEO_MUX_SMOKE_SPEC = /vimeo-client-mux-real\.spec\.ts$/;
const REAL_SMOKE_SPECS = [PARSE_SMOKE_SPEC, PRICING_REVIEW_REWARD_SMOKE_SPEC, VIMEO_MUX_SMOKE_SPEC];

// 真实后端 base；设了才跑真实 smoke，否则 webServer 退回假地址、globalSetup no-op。
const realApiBaseUrl = process.env.E2E_REAL_API_BASE_URL;
// 默认端口用本仓测试保留端口（见 docs/feat/000.架构/overview.md 本地端口表），不能用主站 dev 端口
// 7910：其它 checkout 的 dev/preview 也监听 7910，e2e 会静默打到别人的站点。并行工作区用
// E2E_WEB_PORT 指定各自的空闲端口。
const webPort = process.env.E2E_WEB_PORT ?? '7930';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  outputDir: './tmp/test-results',
  reporter: [['html', { open: 'never', outputFolder: './tmp/playwright-report' }]],
  // 真实 smoke 的 seed 注入：仅当 E2E_REAL_API_BASE_URL 存在时生效（见 global-setup.ts）。
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'vimeo-client-mux-real',
      testMatch: VIMEO_MUX_SMOKE_SPEC,
      use: {
        ...createChromiumProjectUse(devices['Desktop Chrome']),
        proxy: process.env.E2E_CDN_PROXY ? {
          server: process.env.E2E_CDN_PROXY,
          bypass: 'localhost,127.0.0.1,[::1]',
        } : undefined,
        trace: 'off',
      },
    },
    {
      name: 'chromium',
      metadata: { browserIdentityHeadlessChromium: true },
      use: createHeadlessChromiumProjectUse(devices['Desktop Chrome']),
      testIgnore: REAL_SMOKE_SPECS,
    },
    {
      name: 'firefox',
      use: createNativeBrowserProjectUse(devices['Desktop Firefox']),
      testIgnore: REAL_SMOKE_SPECS,
    },
    {
      name: 'webkit',
      use: createNativeBrowserProjectUse(devices['Desktop Safari']),
      testIgnore: REAL_SMOKE_SPECS,
    },
    {
      name: 'Mobile Chrome',
      metadata: { browserIdentityMobile: true },
      use: createChromiumProjectUse(devices['Pixel 5'], { mobile: true }),
      testIgnore: REAL_SMOKE_SPECS,
    },
    {
      // 真实解析+下载回归，仅在显式 --project=parse-download-smoke 时执行。
      name: 'parse-download-smoke',
      metadata: { browserIdentityHeadlessChromium: true },
      testMatch: PARSE_SMOKE_SPEC,
      use: createHeadlessChromiumProjectUse(devices['Desktop Chrome']),
    },
    {
      // 真实 Pricing 好评赠送，仅在显式指定该 project 时执行。
      name: 'pricing-review-reward-smoke',
      metadata: { browserIdentityHeadlessChromium: true },
      testMatch: PRICING_REVIEW_REWARD_SMOKE_SPEC,
      use: createHeadlessChromiumProjectUse(devices['Desktop Chrome']),
    },
  ],

  webServer: {
    // 设了 E2E_REAL_API_BASE_URL 则 dev server 指真实后端（跑 smoke）；
    // 否则维持假地址，mock 跑行为与改动前一致。
    command:
      `PUBLIC_API_BASE_URL=${realApiBaseUrl ?? 'http://homepage-api.test'} ` +
      `pnpm dev --host 127.0.0.1 --port ${webPort}`,
    url: `http://127.0.0.1:${webPort}`,
    // 永不复用已有监听：复用的服务可能来自其它 checkout 或另一轮构建，端口被占用必须直接报错，
    // 不能静默把 e2e 打到别人的站上。
    reuseExistingServer: false,
    timeout: 300000,
  },
});
