import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createI18nInstance } from '@/core/bootstrap'
import { I18nService } from '@/locales'
import { logger } from '@/core/utils/logger'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import PricingApp from './PricingApp.vue'
import './pricing.css'

const backgroundClient = new BackgroundChannel()

async function init(): Promise<void> {
  void backgroundClient
    .getRuntimeConfig()
    .then(config => logger.applyRuntimeConfig(config))
    .catch(error => {
      logger.error('[PricingRuntimeConfig] 从 background 读取运行时配置失败:', error)
    })

  const app = createApp(PricingApp)
  const pinia = createPinia()
  const i18n = await createI18nInstance()

  I18nService.registerVueI18nInstance(i18n)
  document.documentElement.lang = i18n.global.locale.value
  I18nService.onLanguageChange(() => {
    document.documentElement.lang = i18n.global.locale.value
  })

  app.use(pinia)
  app.use(i18n)
  app.mount('#app')
}

init().catch(error => {
  logger.error('[PricingPage] 初始化失败:', error)
})
