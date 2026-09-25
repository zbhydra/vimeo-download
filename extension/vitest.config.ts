import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vitest 配置
 *
 * 功能:
 * - 单元测试和集成测试
 * - Chrome Extension API Mock
 * - 覆盖率报告
 */
export default defineConfig({
  plugins: [vue()],

  // 别名配置（与主项目保持一致）
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },

  test: {
    // 测试环境
    environment: 'happy-dom',

    // 全局 setup 文件
    setupFiles: ['./tests/setup.ts'],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'scripts/**',
        'eslint.config.js',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.d.ts',
        '**/types.ts',
        // 生成客户端与声明式 register 由 rpc-generate:check 覆盖，不是手写业务实现。
        'src/**/rpc/*.rpc.ts',
        'src/**/*-register.ts',
        // 浏览器启动入口只负责装配；行为由加载 unpacked extension 的 E2E 覆盖。
        'src/**/entry.ts',
        'src/background/index.ts',
        'src/popup/main.ts',
        'src/core/bootstrap.ts',
        // 纯类型协议与纯 re-export barrel 不产生独立业务行为。
        'src/core/protocol/**',
        'src/core/index.ts',
        'src/core/api/client/index.ts',
        'src/core/api/counter/index.ts',
        'src/core/api/mark/index.ts',
        'src/core/api/quota/index.ts',
        'src/core/api/subscription/index.ts',
        'src/core/components/icons/index.ts',
        'src/core/components/quota/index.ts',
        'src/core/constants/index.ts',
        'src/core/content/download/index.ts',
        'src/core/rpc/index.ts',
        'src/core/content/services/UpgradeModalManager.ts',
        'src/background/services/BadgeManager.ts',
        // API facade 只转发给已测试的 httpClient；不重复计算每个一行 wrapper。
        'src/core/api/index.ts',
        'src/core/api/counter/api.ts',
        'src/core/api/quota/api.ts',
        'src/core/api/subscription/api.ts',
        'src/injected/',
        'vite.config.ts',
        'vitest.config.ts',
        'playwright.config.ts'
      ],
      // 覆盖率目标
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },

    // 全局变量
    globals: true,

    // 测试超时
    testTimeout: 10000,
    hookTimeout: 10000,

    // 包配置
    include: ['tests/unit/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/']
  }
})
