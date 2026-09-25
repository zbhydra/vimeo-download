/**
 * 创建或刷新真实 Vimeo E2E 使用的浏览器 profile。
 *
 * Vimeo 固定样本是公开视频，不依赖登录态；这里只保证当前工作树已完成构建、profile
 * 目录已就绪，随后即可直接运行真实套件。
 */

import {
  prepareExtensionProfile,
  resolveVimeoProfileDir
} from './setup-test-profile-runtime.mjs'

/** setup 与 Vimeo Playwright project 共用的唯一 profile。 */
const profileDir = resolveVimeoProfileDir()

prepareExtensionProfile('vimeo', profileDir)

console.info(`[VIMEO_PROFILE_SETUP] profile 已就绪: ${profileDir}`)
console.info('[VIMEO_PROFILE_SETUP] 下一步: pnpm run test:e2e:vimeo')
