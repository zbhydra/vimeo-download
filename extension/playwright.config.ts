import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

/** 当前配置文件路径，用于解析 dist 与报告目录。 */
const __filename = fileURLToPath(import.meta.url)

/** extension 包根目录。 */
const __dirname = path.dirname(__filename)

/** 默认忽略目录，避免 unit/integration/构建产物进入 Playwright E2E。 */
const testIgnore = ['**/node_modules/**', '**/dist/**', '**/unit/**', '**/integration/**']

/** 自动化项目只包含 Vimeo 真实站点。 */
const projects = [
  {
    name: 'extension-e2e-vimeo-real',
    testMatch: ['**/e2e/vimeo-real-download.spec.ts'],
    timeout: 240_000
  }
]

export default defineConfig({
  testDir: './tests',
  testIgnore,
  outputDir: './tests/logs/test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: './tests/logs/playwright-report', open: 'never' }], ['list']],

  use: {
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects,

  globalSetup: path.join(__dirname, 'tests/global-setup.ts')
})
