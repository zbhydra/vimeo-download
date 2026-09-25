<template>
  <Teleport to="body" :disabled="!useTeleport">
    <Transition name="modal-fade">
      <div
        v-if="show && isAuthenticated !== null"
        class="vdl-upgrade-modal-overlay"
        @click.self="handleClose"
      >
        <div
          class="vdl-upgrade-modal-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vdl-upgrade-modal-title"
          aria-describedby="vdl-upgrade-modal-message"
          @click.stop
        >
          <button
            type="button"
            class="vdl-upgrade-modal-close-btn"
            :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
            @click="handleClose"
          >
            <Icon :name="IconName.X_MARK" :size="IconSize.SM" />
          </button>

          <div class="vdl-upgrade-modal-content">
            <div class="vdl-upgrade-modal-icon" aria-hidden="true">
              <Icon :name="isAuthenticated ? IconName.CROWN : IconName.USER" :size="IconSize.XL" />
            </div>

            <h2 id="vdl-upgrade-modal-title" class="vdl-upgrade-modal-title">
              {{ t(isAuthenticated ? I18N_KEYS.QUOTA.UPGRADE_TITLE : I18N_KEYS.AUTH.LOGIN) }}
            </h2>
            <p id="vdl-upgrade-modal-message" class="vdl-upgrade-modal-message">
              {{
                t(isAuthenticated ? I18N_KEYS.QUOTA.UPGRADE_MESSAGE : I18N_KEYS.QUOTA.LOGIN_MESSAGE)
              }}
            </p>

            <div v-if="resetAt > 0" class="vdl-upgrade-modal-reset" aria-live="polite">
              <strong class="vdl-upgrade-modal-reset-countdown">{{ resetCountdown }}</strong>
              <span class="vdl-upgrade-modal-reset-time">{{ resetTime }}</span>
            </div>

            <button type="button" class="vdl-upgrade-modal-btn" @click="handleUpgrade">
              {{ t(isAuthenticated ? I18N_KEYS.QUOTA.UPGRADE_BUTTON : I18N_KEYS.AUTH.LOGIN) }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { logger } from '@/core/utils/logger'
import { I18N_KEYS } from '@/core/constants/i18n'
import { openPricingPage } from '@/core/utils/navigation'
import { openLoginModal } from '@/core/composables/loginModal'
import { authApi } from '@/core/api/auth/api'
import { ChromeEventEmitter } from '@/core/rpc/ChromeEventBus'
import type { ExtensionEvents } from '@/core/events/types'

/** 倒计时以分钟展示，30 秒更新可及时跨过舍入边界，又不会频繁重绘宿主页面。 */
const COUNTDOWN_REFRESH_INTERVAL_MS = 30_000

/** 升级弹窗的外部状态。 */
interface Props {
  /** 是否显示弹窗。 */
  show?: boolean
  /** 每日下载额度的下一次刷新时间，使用毫秒时间戳。 */
  resetAt?: number
  /** Popup 使用原地渲染，普通页面入口使用 Teleport。 */
  useTeleport?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  resetAt: 0,
  useTeleport: true
})

/** 只向父级同步弹窗显隐，不在组件内部保存第二份显隐状态。 */
const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const { locale, t } = useI18n()
const isAuthenticated = ref<boolean | null>(null)
const eventEmitter = new ChromeEventEmitter<ExtensionEvents>()
/** 计算倒计时的当前时间，由轻量定时器推进。 */
const currentTime = ref(Date.now())
/** 当前倒计时定时器；弹窗隐藏或卸载时立即释放。 */
let countdownTimer: ReturnType<typeof setInterval> | null = null

/** 本地化的相对刷新时间主文案。 */
const resetCountdown = computed(() => {
  const remainingMinutes = Math.max(0, Math.ceil((props.resetAt - currentTime.value) / 60_000))
  if (remainingMinutes === 0) {
    return t(I18N_KEYS.QUOTA.RESET_READY)
  }

  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  if (hours > 0 && minutes > 0) {
    return t(I18N_KEYS.QUOTA.RESET_IN_HOURS_MINUTES, { hours, minutes })
  }
  if (hours > 0) {
    return t(I18N_KEYS.QUOTA.RESET_IN_HOURS, { hours })
  }
  return t(I18N_KEYS.QUOTA.RESET_IN_MINUTES, { minutes })
})

/** 本地化的绝对刷新时间次文案，时区名由浏览器按用户系统设置生成。 */
const resetTime = computed(() => {
  const formattedTime = new Intl.DateTimeFormat(locale.value, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(props.resetAt))
  return t(I18N_KEYS.QUOTA.RESET_AT, { time: formattedTime })
})

// 埋点以共享组件的可见状态为准，避免各触发入口分别推断弹窗是否真正打开。
watch(
  () => props.show,
  async (show, _previous, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    isAuthenticated.value = null
    if (!show) return
    let authenticated = false
    try {
      authenticated = await authApi.isAuthenticated()
    } catch (error) {
      logger.error('[UpgradeModal] 读取插件登录态失败:', error)
    }
    if (!active) return
    isAuthenticated.value = authenticated
    eventEmitter.emit(authenticated ? 'upgradeModalOpened' : 'loginModalOpened', undefined)
  },
  { immediate: true }
)

// 重开弹窗或收到新的服务端刷新时间时，从真实当前时间重新开始倒计时。
watch(
  [() => props.show, () => props.resetAt],
  ([show, resetAt]) => {
    stopCountdown()
    currentTime.value = Date.now()
    if (show && resetAt > currentTime.value) {
      countdownTimer = setInterval(() => {
        currentTime.value = Date.now()
        if (currentTime.value >= props.resetAt) {
          stopCountdown()
        }
      }, COUNTDOWN_REFRESH_INTERVAL_MS)
    }
  },
  { immediate: true }
)

onBeforeUnmount(stopCountdown)

/** 停止倒计时更新并清空句柄。 */
function stopCountdown(): void {
  if (countdownTimer === null) return
  clearInterval(countdownTimer)
  countdownTimer = null
}

/** 关闭弹窗。 */
function handleClose(): void {
  emit('update:show', false)
}

/**
 * 游客先完成插件登录，已登录用户进入订阅页。
 *
 * popup 是唯一的登录面：弹窗宿主不在时 openLoginModal 会自行退回订阅页，
 * 因此宿主页面（content）里的这个入口不会变成死按钮。
 */
async function handleUpgrade(): Promise<void> {
  if (!(await authApi.isAuthenticated())) {
    openLoginModal('upgrade_modal')
    handleClose()
    return
  }
  logger.info('[UpgradeModal] Open pricing page')
  await openPricingPage('upgrade_modal')
  handleClose()
}
</script>

<style src="./UpgradeModal.css"></style>
