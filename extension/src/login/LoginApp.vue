<template>
  <main class="login-page">
    <section class="login-page-card" :style="LOGIN_COLOR_VARS">
      <div class="login-page-brand">
        <img src="/icons/48.png" width="40" height="40" alt="" />
        <p>{{ t(I18N_KEYS.APP.TITLE) }}</p>
      </div>
      <div v-if="succeeded" class="login-page-success" role="status" aria-live="polite">
        <div class="login-page-success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m5 12 4 4L19 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h1 class="login-page-success-title">{{ t(I18N_KEYS.AUTH.PAGE_SUCCESS_TITLE) }}</h1>
        <p class="login-page-success-description">
          {{ t(I18N_KEYS.AUTH.PAGE_SUCCESS_DESCRIPTION) }}
        </p>
      </div>
      <LoginPanel v-else :source="params.source" @success="handleSuccess" />
    </section>
  </main>
</template>

<script setup lang="ts">
/**
 * 插件登录页：统一承载 Google 与邮箱验证码登录。
 *
 * popup 失焦即被 Chrome 销毁；标签页保留授权与取码进度。登录点击只在发起入口打点。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { I18N_KEYS } from '@/core/constants/i18n'
import { STORAGE_KEYS } from '@/core/api/config'
import { storageManager } from '@/core/storage'
import { parseLoginPageParams } from '@/core/utils/loginUrl'
import { buildExtensionPricingUrl } from '@/core/utils/pricingUrl'
import LoginPanel from './LoginPanel.vue'
import { LOGIN_COLOR_VARS } from './loginTheme'

const { t } = useI18n()

const params = parseLoginPageParams(window.location.search)

const succeeded = ref(false)

/**
 * 购买入口回订阅页继续购买；顶栏登录清理旧待购，避免后续购买误用旧意图。
 */
async function handleSuccess(): Promise<void> {
  if (params.source !== 'popup') {
    window.location.replace(buildExtensionPricingUrl(params.source))
    return
  }
  await storageManager.remove(STORAGE_KEYS.PENDING_PREMIUM_PURCHASE)
  succeeded.value = true
}
</script>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  padding: max(48px, 12vh) 0 32px;
  box-sizing: border-box;
}

.login-page-card {
  width: min(400px, calc(100% - 32px));
  padding: 32px 28px 24px;
  border: 1px solid var(--login-gray-100);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
  box-sizing: border-box;
}

.login-page-brand {
  text-align: center;
}

.login-page-brand img {
  display: block;
  margin: 0 auto;
}

.login-page-brand p {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--login-gray-500);
}

.login-page-success {
  margin-top: 16px;
  text-align: center;
}

.login-page-success-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: var(--login-success-bg);
  color: var(--login-success);
}

.login-page-success-icon svg {
  width: 20px;
  height: 20px;
}

.login-page-success-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--login-gray-900);
}

.login-page-success-description {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--login-gray-500);
}

@media (max-width: 399px) {
  .login-page-card {
    padding: 24px 20px 20px;
  }
}
</style>
