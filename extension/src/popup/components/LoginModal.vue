<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="login-modal-overlay"
      aria-labelledby="vdl-login-modal-title"
      :style="colorVars"
      @click.self="closeLoginModal"
      @close="closeLoginModal"
    >
      <div class="login-modal-dialog" @click.stop>
        <button
          type="button"
          class="login-modal-close"
          :aria-label="t(I18N_KEYS.AUTH.MODAL_CLOSE)"
          @click="closeLoginModal"
        >
          <Icon :name="IconName.X_MARK" :size="IconSize.SM" />
        </button>

        <div class="login-modal-heading">
          <h2 id="vdl-login-modal-title" class="login-modal-title">
            {{ t(I18N_KEYS.AUTH.MODAL_TITLE) }}
          </h2>
          <p class="login-modal-description">{{ t(I18N_KEYS.AUTH.MODAL_DESCRIPTION) }}</p>
        </div>

        <button
          type="button"
          class="login-google-button"
          :disabled="busy"
          @click="handleGoogleLogin"
        >
          {{ t(I18N_KEYS.AUTH.MODAL_CONTINUE_WITH_GOOGLE) }}
        </button>
        <p class="login-modal-divider">{{ t(I18N_KEYS.AUTH.MODAL_OR) }}</p>

        <form class="login-modal-form" @submit.prevent="handleSubmit">
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

        <p v-if="statusMessage" class="login-modal-status" role="status" aria-live="polite">
          {{ statusMessage }}
        </p>
        <p v-if="errorMessage" class="login-modal-error" role="alert">{{ errorMessage }}</p>

        <p class="login-modal-terms">
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
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import { logger } from '@/core/utils/logger'
import { WEBSITE } from '@/core/api/config'
import { ApiError } from '@/core/api/client/types'
import { authApi } from '@/core/api/auth/api'
import { openExternalPage } from '@/core/utils/navigation'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import { useNativeDialog } from '@/core/composables/nativeDialog'
import {
  closeLoginModal,
  completeLoginModal,
  dismissLoginModal,
  failLoginModal,
  getLoginSource,
  loginModalVisible,
  setLoginModalHostMounted
} from '@/core/composables/loginModal'

/** 登录步骤：先填邮箱，验证码发出后再填验证码。 */
type LoginStep = 'email' | 'code'

/** 邮箱格式的本地校验，避免明显非法值消耗后端发送频率限制。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** 邮箱验证码固定 6 位数字。 */
const CODE_PATTERN = /^\d{6}$/

const emit = defineEmits<{
  /** 令牌已写入存储，由 popup 根组件刷新登录态与配额。 */
  success: []
}>()

const { t } = useI18n()
const dialog = useNativeDialog(loginModalVisible)

/**
 * 覆盖层根节点显式级联的颜色变量。
 *
 * 组件根节点是 Teleport，Vue 的 style v-bind()（useCssVars）会把变量挂到 Teleport 锚点而非
 * 真实 DOM（PremiumView / SettingsModal 同坑），scoped 样式里的 v-bind 颜色在生产中全部失效
 * （回退继承色）。因此这里把用到的 COMMON_COLORS 显式声明成覆盖层根节点上的 CSS 变量向下级联。
 */
const colorVars = {
  '--login-primary': COMMON_COLORS.PRIMARY,
  '--login-primary-dark': COMMON_COLORS.PRIMARY_DARK,
  '--login-gray-50': COMMON_COLORS.GRAY_50,
  '--login-gray-100': COMMON_COLORS.GRAY_100,
  '--login-gray-300': COMMON_COLORS.GRAY_300,
  '--login-gray-400': COMMON_COLORS.GRAY_400,
  '--login-gray-500': COMMON_COLORS.GRAY_500,
  '--login-gray-600': COMMON_COLORS.GRAY_600,
  '--login-gray-800': COMMON_COLORS.GRAY_800,
  '--login-gray-900': COMMON_COLORS.GRAY_900,
  '--login-error': COMMON_COLORS.ERROR
}

const step = ref<LoginStep>('email')
const email = ref('')
const code = ref('')
const busy = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')

onMounted(() => {
  setLoginModalHostMounted(true)
})

onBeforeUnmount(() => {
  setLoginModalHostMounted(false)
})

watch(loginModalVisible, isVisible => {
  if (!isVisible) {
    return
  }

  resetForm()
})

/** 每次打开都从干净的邮箱步骤开始。 */
function resetForm(): void {
  step.value = 'email'
  email.value = ''
  code.value = ''
  busy.value = false
  statusMessage.value = ''
  errorMessage.value = ''
}

/** 邮箱验证码登录：发送验证码并展开验证码区。 */
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
    logger.error('[LoginModal] 发送邮箱验证码失败:', error)
    errorMessage.value = resolveErrorMessage(error, t(I18N_KEYS.AUTH.MODAL_SEND_FAILED))
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
    finishLogin()
  } catch (error) {
    logger.error('[LoginModal] 邮箱验证码登录失败:', error)
    failLoginModal('email_verify', error instanceof Error ? error.message : 'unknown')
    errorMessage.value = resolveErrorMessage(error, t(I18N_KEYS.AUTH.MODAL_LOGIN_FAILED))
  } finally {
    busy.value = false
  }
}

/**
 * Google 登录：由 background 打开 Google 授权窗口并完成兑换与写入登录态。
 *
 * 授权窗口会抢焦点，本弹窗通常在结果返回前就已被 Chrome 销毁，所以这里的处理只是
 * 「弹窗还活着」时的附加优化：取消/失败的打点与失败现场已由 background 记录，用户
 * 重开 popup 由根组件的 authStore.initialize() 从 storage 恢复登录态。
 */
async function handleGoogleLogin(): Promise<void> {
  if (busy.value) {
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const result = await new BackgroundChannel().startGoogleLogin({ source: getLoginSource() })
    if (result.status === 'completed') {
      finishExternalLogin()
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

    logger.error(`[LoginModal] Google 登录未完成: reason=${result.reason}`)
    errorMessage.value = t(I18N_KEYS.AUTH.MODAL_LOGIN_FAILED)
  } catch (error) {
    logger.error('[LoginModal] Google 登录调用失败:', error)
    errorMessage.value = resolveErrorMessage(error, t(I18N_KEYS.AUTH.MODAL_LOGIN_FAILED))
  } finally {
    busy.value = false
  }
}

/** 邮箱验证码登录成功：先通知根组件刷新登录态，再关闭弹窗。 */
function finishLogin(): void {
  completeLoginModal()
  emit('success')
}

/** Google 登录成功：登录态已由 background 写入并打点，这里只关弹窗不重复记成功。 */
function finishExternalLogin(): void {
  dismissLoginModal()
  emit('success')
}

/** 后端业务错误优先使用后端文案，其余退回本地文案。 */
function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.getDisplayMessage() || fallback
  }
  return fallback
}

/** 在新标签页打开服务条款，避免 popup 自身导航。 */
function openTerms(): void {
  void openExternalPage(new URL(WEBSITE.TERMS_PATH, WEBSITE.BASE_URL).toString(), 'terms')
}

/** 在新标签页打开隐私政策。 */
function openPrivacy(): void {
  void openExternalPage(new URL(WEBSITE.PRIVACY_PATH, WEBSITE.BASE_URL).toString(), 'privacy')
}
</script>

<style scoped>
.login-modal-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  border: 0;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(15, 23, 42, 0.42);
  box-sizing: border-box;
}

.login-modal-overlay[open] {
  display: flex;
}

.login-modal-overlay::backdrop {
  background: transparent;
}

.login-modal-dialog {
  position: relative;
  width: min(340px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 18px 16px 16px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);
  box-sizing: border-box;
}

.login-modal-close {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--login-gray-500);
  cursor: pointer;
}

.login-modal-close:hover {
  background: var(--login-gray-100);
  color: var(--login-gray-800);
}

.login-modal-heading {
  display: grid;
  gap: 4px;
  margin-bottom: 14px;
  padding-right: 28px;
}

.login-modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--login-gray-900);
}

.login-modal-description {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--login-gray-500);
}

.login-google-button {
  width: 100%;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--login-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--login-gray-800);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.login-google-button:hover:not(:disabled) {
  border-color: var(--login-primary);
  color: var(--login-primary);
}

.login-google-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-modal-divider {
  margin: 10px 0;
  text-align: center;
  font-size: 11px;
  color: var(--login-gray-400);
}

.login-modal-form,
.login-code-area {
  display: grid;
  gap: 10px;
}

.login-field {
  display: grid;
  gap: 5px;
}

.login-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--login-gray-500);
}

.login-input {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--login-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--login-gray-900);
  font-size: 13px;
  box-sizing: border-box;
}

.login-input:focus {
  outline: 2px solid rgba(51, 144, 236, 0.2);
  border-color: var(--login-primary);
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
  min-width: 0;
}

.login-primary-button,
.login-secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
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

.login-modal-status,
.login-modal-error,
.login-modal-terms {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.5;
}

.login-modal-status {
  color: var(--login-gray-500);
}

.login-modal-error {
  color: var(--login-error);
}

.login-modal-terms {
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
