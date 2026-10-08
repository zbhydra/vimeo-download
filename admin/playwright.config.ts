/**
 * Playwright 配置 — Admin 管理后台 e2e
 *
 * 多数 spec 走既有 mock 拦截：webServer 启动 Vite dev server（端口 7920），
 * spec 内 page.route 拦截 /api/admin/* 请求，不依赖真实后端。
 *
 * 例外：responsive.spec.ts 禁止 mock，走 vite proxy → 本地真实后端
 * （localhost:7900，vite.config.ts proxy target）+ 本地 Redis（127.0.0.1:6379，
 * 读验证码文本），并要求 E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD 环境变量
 * ——三者缺任一项该 spec 响亮失败（不猜测真实账号、不回退 mock）。
 */
import { defineConfig, devices } from "@playwright/test";

import {
  createChromiumProjectUse,
  createNativeBrowserProjectUse,
} from "../scripts/playwright-browser-identity.mjs";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:7920",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: createChromiumProjectUse(devices["Desktop Chrome"]),
    },
    {
      name: "firefox",
      use: createNativeBrowserProjectUse(devices["Desktop Firefox"]),
    },
  ],

  webServer: {
    command: "pnpm dev --host 127.0.0.1",
    url: "http://127.0.0.1:7920",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
