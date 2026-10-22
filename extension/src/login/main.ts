import { createApp } from 'vue'
import { createI18nInstance } from '@/core/bootstrap'
import { I18nService } from '@/locales'
import { logger } from '@/core/utils/logger'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import LoginApp from './LoginApp.vue'
import '../style.css'
import '../extension-page.css'

const backgroundClient = new BackgroundChannel()

async function init(): Promise<void> {
  void backgroundClient
    .getRuntimeConfig()
    .then(config => logger.applyRuntimeConfig(config))
    .catch(error => {
      logger.error('[LoginRuntimeConfig] 从 background 读取运行时配置失败:', error)
    })

  const app = createApp(LoginApp)
  const i18n = await createI18nInstance()

  I18nService.registerVueI18nInstance(i18n)
  document.documentElement.lang = i18n.global.locale.value
  I18nService.onLanguageChange(() => {
    document.documentElement.lang = i18n.global.locale.value
  })

  app.use(i18n)
  app.mount('#app')
}

init().catch(error => {
  logger.error('[LoginPage] 初始化失败:', error)
})
