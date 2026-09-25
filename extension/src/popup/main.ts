/**
 * Popup 入口
 *
 * 功能:
 * - 初始化 Vue 应用实例
 * - 配置 Pinia 状态管理
 * - 配置 Vue I18n 国际化
 * - 挂载应用到 DOM
 *
 * Phase 7: UI 层实现
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18nInstance } from '@/core/bootstrap'
import { I18nService } from '../locales'
import { logger } from '@/core/utils/logger'
import App from './App.vue'
import { BackgroundChannel } from './rpc/background.rpc'

// 引入全局样式
import '../style.css'

const backgroundClient = new BackgroundChannel()

async function init() {
  // 日志配置异步同步，不让 worker 唤醒或 RPC 超时阻塞首屏。
  void backgroundClient
    .getRuntimeConfig()
    .then(config => logger.applyRuntimeConfig(config))
    .catch(error => {
      logger.error('[PopupRuntimeConfig] 从 background 读取运行时配置失败:', error)
    })

  // 创建 Vue 应用实例
  const app = createApp(App)

  // 创建 Pinia 实例
  const pinia = createPinia()

  // 创建 I18n 实例
  const i18n = await createI18nInstance()

  // 注册 Vue I18n 实例到 I18nService，实现语言切换自动同步
  I18nService.registerVueI18nInstance(i18n)

  // `<html lang>` 决定屏幕阅读器发音与断行语言，静态值只是脚本执行前的兜底；
  // popup 支持 14 种语言，这里按实际解析出的语言覆盖，并跟随运行时切换同步。
  document.documentElement.lang = i18n.global.locale.value
  I18nService.onLanguageChange(() => {
    document.documentElement.lang = i18n.global.locale.value
  })

  // 安装插件
  app.use(pinia)
  app.use(i18n)

  // 挂载应用
  app.mount('#app')

  logger.info('扩展弹窗已加载')
}

init().catch(error => {
  logger.error('初始化失败:', error)
})
