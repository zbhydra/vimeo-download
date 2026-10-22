<template>
  <div>
    <div class="login-panel-heading">
      <h1 class="login-panel-title">
        {{ t(I18N_KEYS.AUTH.MODAL_TITLE) }}
      </h1>
      <p class="login-panel-description">{{ t(I18N_KEYS.AUTH.MODAL_DESCRIPTION) }}</p>
    </div>

    <button type="button" class="login-google-button" :disabled="busy" @click="handleGoogleLogin">
      <svg class="login-google-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M21.35 12.27c0-.71-.06-1.39-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.22Z"
        />
        <path
          fill="#34A853"
          d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.29v2.53A9.74 9.74 0 0 0 12 21.6Z"
        />
        <path
          fill="#FBBC05"
          d="M6.53 13.68A5.85 5.85 0 0 1 6.22 12c0-.58.1-1.14.31-1.68V7.79H3.29A9.6 9.6 0 0 0 2.25 12c0 1.52.36 2.96 1.04 4.21l3.24-2.53Z"
        />
        <path
          fill="#EA4335"
          d="M12 6.29c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.39 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.71 5.39l3.24 2.53c.77-2.31 2.93-4.03 5.47-4.03Z"
        />
      </svg>
      <span>{{ t(I18N_KEYS.AUTH.MODAL_CONTINUE_WITH_GOOGLE) }}</span>
    </button>
    <div class="login-panel-divider">{{ t(I18N_KEYS.AUTH.MODAL_OR) }}</div>

    <form class="login-panel-form" @submit.prevent="handleSubmit">
      <label class="login-field">
        <span class="login-field-label">{{ t(I18N_KEYS.AUTH.MODAL_EMAIL_LABEL) }}</span>
        <input
          v-model.trim="email"
          type="email"
          autocomplete="email"
          class="login-input"
          :placeholder="t(I18N_KEYS.AUTH.MODAL_EMAIL_PLACEHOLDER)"
          :disabled="busy"
        />
      </label>

      <button
        v-if="step === 'email'"
        type="button"
        class="login-primary-button"
        :disabled="busy"
        @click="handleSendCode"
      >
        {{ t(I18N_KEYS.AUTH.MODAL_CONTINUE_WITH_EMAIL) }}
      </button>

      <div v-else class="login-code-area">
        <label class="login-field">
          <span class="login-field-label">{{ t(I18N_KEYS.AUTH.MODAL_CODE_LABEL) }}</span>
          <div class="login-code-row">
            <input
              v-model.trim="code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              class="login-input login-code-input"
              :placeholder="t(I18N_KEYS.AUTH.MODAL_CODE_PLACEHOLDER)"
              :disabled="busy"
            />
            <button
              type="button"
              class="login-secondary-button"
              :disabled="busy"
              @click="handleSendCode"
            >
              {{ t(I18N_KEYS.AUTH.MODAL_RESEND) }}
            </button>
          </div>
        </label>

        <button type="submit" class="login-primary-button" :disabled="busy">
          {{ t(I18N_KEYS.AUTH.MODAL_SIGN_IN) }}
        </button>
      </div>
    </form>

    <p v-if="statusMessage" class="login-panel-status" role="status" aria-live="polite">
      {{ statusMessage }}
    </p>
    <p v-if="errorMessage" class="login-panel-error" role="alert">{{ errorMessage }}</p>

    <p class="login-panel-terms">
      {{ t(I18N_KEYS.AUTH.MODAL_TERMS_NOTICE) }}
      {{ ' ' }}
      <button type="button" class="login-terms-link" @click="openTerms">
        {{ t(I18N_KEYS.AUTH.MODAL_TERMS_LINK) }}
      </button>
      <span aria-hidden="true"> · </span>
      <button type="button" class="login-terms-link" @click="openPrivacy">
        {{ t(I18N_KEYS.AUTH.MODAL_PRIVACY_LINK) }}
      </button>
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * 插件登录页表单：Google 与邮箱入口常驻，邮箱发码后原地展示验证码步骤。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { I18N_KEYS } from '@/core/constants/i18n'
import { logger } from '@/core/utils/logger'
import { WEBSITE } from '@/core/api/config'
import { ApiError } from '@/core/api/client/types'
import { authApi } from '@/core/api/auth/api'
import { openExternalPage } from '@/core/utils/navigation'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import { recordLoginFailed, recordLoginSucceeded } from '@/core/composables/loginPage'
import type { LoginSource } from '@/core/api/mark/types'

/** 登录步骤：先填邮箱，验证码发出后再填验证码。 */
type LoginStep = 'email' | 'code'

/** 邮箱格式的本地校验，避免明显非法值消耗后端发送频率限制。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** 邮箱验证码固定 6 位数字。 */
const CODE_PATTERN = /^\d{6}$/
/**
 * Google 授权调用的 RPC 超时。
 *
 * 授权窗口里选账号、输密码、二次认证都算在这次调用内，普通 RPC 的 30 秒远不够；超时后
 * 标签页宿主收不到二次确认与成功结果。取后端 OAuth state 有效期 600 秒再留 60 秒余量。
 */
const GOOGLE_LOGIN_RPC_TIMEOUT_MS = 660_000

const props = defineProps<{
  source: LoginSource
}>()

const emit = defineEmits<{
  /** 登录态已写入存储。 */
  success: []
}>()

const { t } = useI18n()

const step = ref<LoginStep>('email')
const email = ref('')
const code = ref('')
const busy = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')

/** 发送验证码并展开验证码区。 */
async function handleSendCode(): Promise<void> {
  if (busy.value) {
    return
  }
  if (!EMAIL_PATTERN.test(email.value)) {
    errorMessage.value = t(I18N_KEYS.AUTH.MODAL_EMAIL_REQUIRED)
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    await authApi.sendEmailCode(email.value)
    step.value = 'code'
    statusMessage.value = t(I18N_KEYS.AUTH.MODAL_CODE_SENT)
  } catch (error) {
    logger.error('[LoginPanel] 发送邮箱验证码失败:', error)
    errorMessage.value =
      (error instanceof ApiError && error.getDisplayMessage()) ||
      t(I18N_KEYS.AUTH.MODAL_SEND_FAILED)
  } finally {
    busy.value = false
  }
}

/** 邮箱验证码提交。 */
async function handleSubmit(): Promise<void> {
  if (busy.value) {
    return
  }
  if (!CODE_PATTERN.test(code.value)) {
    errorMessage.value = t(I18N_KEYS.AUTH.MODAL_CODE_REQUIRED)
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    await new BackgroundChannel().loginWithEmailCode({ email: email.value, code: code.value })
    recordLoginSucceeded(props.source)
    emit('success')
  } catch (error) {
    logger.error('[LoginPanel] 邮箱验证码登录失败:', error)
    recordLoginFailed(
      props.source,
      'email_verify',
      error instanceof Error ? error.message : 'unknown'
    )
    errorMessage.value =
      (error instanceof ApiError && error.getDisplayMessage()) ||
      t(I18N_KEYS.AUTH.MODAL_LOGIN_FAILED)
  } finally {
    busy.value = false
  }
}

/**
 * Google 登录由 background 完成兑换、持久化与终态打点，页面只处理返回结果。
 */
async function handleGoogleLogin(): Promise<void> {
  if (busy.value) {
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const result = await new BackgroundChannel().startGoogleLogin(
      { source: props.source },
      { timeout: GOOGLE_LOGIN_RPC_TIMEOUT_MS }
    )
    if (result.status === 'completed') {
      emit('success')
      return
    }

    if (result.status === 'email_verification') {
      email.value = result.email
      step.value = 'code'
      statusMessage.value = t(I18N_KEYS.AUTH.MODAL_CODE_SENT)
      return
    }

    if (result.status === 'cancelled') {
      return
    }

    logger.error(`[LoginPanel] Google 登录未完成: reason=${result.reason}`)
    errorMessage.value = t(I18N_KEYS.AUTH.MODAL_LOGIN_FAILED)
  } catch (error) {
    logger.error('[LoginPanel] Google 登录调用失败:', error)
    errorMessage.value =
      (error instanceof ApiError && error.getDisplayMessage()) ||
      t(I18N_KEYS.AUTH.MODAL_LOGIN_FAILED)
  } finally {
    busy.value = false
  }
}

/** 在新标签页打开服务条款，保留登录进度。 */
function openTerms(): void {
  void openExternalPage(new URL(WEBSITE.TERMS_PATH, WEBSITE.BASE_URL).toString(), 'terms')
}

/** 在新标签页打开隐私政策，保留登录进度。 */
function openPrivacy(): void {
  void openExternalPage(new URL(WEBSITE.PRIVACY_PATH, WEBSITE.BASE_URL).toString(), 'privacy')
}
</script>

<style scoped>
.login-panel-heading {
  display: grid;
  gap: 6px;
  margin: 16px 0 24px;
  text-align: center;
}

.login-panel-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--login-gray-900);
}

.login-panel-description {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--login-gray-500);
}

.login-google-button {
  width: 100%;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--login-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--login-gray-800);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.login-google-icon {
  width: 18px;
  height: 18px;
  margin-right: 10px;
  flex-shrink: 0;
}

.login-google-button:hover:not(:disabled) {
  border-color: var(--login-primary);
  color: var(--login-primary);
}

.login-google-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-panel-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  font-size: 12px;
  color: var(--login-gray-500);
}

.login-panel-divider::before,
.login-panel-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--login-gray-200);
}

.login-panel-form,
.login-code-area {
  display: grid;
  gap: 12px;
}

.login-field {
  display: grid;
  gap: 6px;
}

.login-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--login-gray-600);
}

.login-input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--login-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--login-gray-900);
  font-size: 14px;
  box-sizing: border-box;
}

.login-input:focus {
  outline: none;
  border-color: var(--login-primary);
  box-shadow: 0 0 0 3px var(--login-primary-ring);
}

.login-input:disabled {
  background: var(--login-gray-50);
  color: var(--login-gray-400);
}

.login-code-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.login-code-input {
  flex: 1;
  min-width: 0;
  letter-spacing: 0.2em;
}

.login-primary-button,
.login-secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.login-primary-button {
  background: var(--login-primary);
  color: #ffffff;
}

.login-primary-button:hover:not(:disabled) {
  background: var(--login-primary-dark);
}

.login-secondary-button {
  flex-shrink: 0;
  border: 1px solid var(--login-gray-300);
  background: #ffffff;
  color: var(--login-gray-600);
}

.login-secondary-button:hover:not(:disabled) {
  border-color: var(--login-primary);
  color: var(--login-primary);
}

.login-primary-button:disabled,
.login-secondary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-panel-status,
.login-panel-error,
.login-panel-terms {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.5;
}

.login-panel-status {
  color: var(--login-gray-500);
}

.login-panel-error {
  color: var(--login-error);
  background: var(--login-error-bg);
  padding: 8px 10px;
  border-radius: 6px;
}

.login-panel-terms {
  margin-top: 24px;
  font-size: 12px;
  text-align: center;
  color: var(--login-gray-500);
}

.login-terms-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--login-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.login-terms-link:hover {
  text-decoration: underline;
}
</style>
