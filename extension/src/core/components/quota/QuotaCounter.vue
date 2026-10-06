<template>
  <div class="quota-counter-wrapper">
    <div
      v-if="quotaStore.showCounter"
      class="quota-counter"
      :class="{ 'quota-exhausted': quotaStore.isExhausted }"
      :title="titleText"
      @click="handleClick"
    >
      <span class="quota-text">{{ counterText }}</span>
    </div>

    <!-- 免费用户是升级 CTA，用醒目配色 + 光晕吸引点击；已订阅的 Unlimited 保持低调，避免误导继续付费 -->
    <button
      v-if="quotaStore.showSubscriptionAction"
      class="upgrade-button"
      :class="{ 'upgrade-cta': !quotaStore.hasActiveSubscription }"
      :title="actionButtonText"
      @click="handleUpgrade"
    >
      {{ actionButtonText }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuotaStore } from '@/core/stores/quotaStore'
import { useAuthStore } from '@/core/stores/authStore'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import { logger } from '@/core/utils/logger'
import { openExtensionPricingPage } from '@/core/utils/navigation'

// Props
interface Props {
  /** 点击时是否跳转到 options（默认 true） */
  enableClick?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  enableClick: true
})

// I18n
const { t } = useI18n()

// Store
const quotaStore = useQuotaStore()
const authStore = useAuthStore()

// 计数器显示文本
const counterText = computed(() => {
  return `${quotaStore.remaining}/${quotaStore.dailyLimit}`
})

// 提示文本
const titleText = computed(() => {
  if (quotaStore.isExhausted) {
    if (!authStore.isAuthenticated) return t(I18N_KEYS.AUTH.LOGIN)
    return t(I18N_KEYS.QUOTA.TOOLTIP_EXHAUSTED)
  }
  return t(I18N_KEYS.QUOTA.TOOLTIP_NORMAL, {
    remaining: quotaStore.remaining.toString(),
    total: quotaStore.dailyLimit.toString()
  })
})

// 已订阅用户仍保留入口，但文案展示为 Unlimited，统一进入独立订阅页。
const actionButtonText = computed(() => {
  if (quotaStore.hasActiveSubscription) {
    return t(I18N_KEYS.SUBSCRIPTION.UNLIMITED)
  }

  return t(I18N_KEYS.QUOTA.UPGRADE_BUTTON)
})

/**
 * 处理点击事件
 */
async function handleClick(): Promise<void> {
  if (!props.enableClick) {
    return
  }

  if (quotaStore.isExhausted) {
    if (!authStore.isAuthenticated) {
      void openExtensionPricingPage('popup_quota_counter')
      return
    }
    logger.info('[QuotaCounter] Quota exhausted, opening extension pricing page')
    void openExtensionPricingPage('popup_quota_counter')
  }
}

/**
 * 处理升级按钮点击
 */
async function handleUpgrade(): Promise<void> {
  logger.info('[QuotaCounter] Subscription action clicked, opening extension pricing page')
  void openExtensionPricingPage('popup_upgrade_now')
}
</script>

<style scoped>
.quota-counter-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.quota-counter {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 6px;
  background: transparent;
  cursor: default;
  transition: all 0.2s ease;
  user-select: none;
}

.quota-counter.quota-exhausted {
  cursor: pointer;
}

.quota-counter.quota-exhausted:hover {
  background: v-bind('COMMON_COLORS.ERROR_BG');
}

.quota-text {
  font-size: 12px;
  font-weight: 500;
  color: v-bind('COMMON_COLORS.GRAY_600');
  white-space: nowrap;
}

.quota-counter.quota-exhausted .quota-text {
  color: v-bind('COMMON_COLORS.ERROR');
}

.upgrade-button {
  padding: 4px 8px;
  border: 1px solid v-bind('COMMON_COLORS.GRAY_300');
  border-radius: 6px;
  background: white;
  color: v-bind('COMMON_COLORS.GRAY_600');
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.upgrade-button:hover {
  background: v-bind('COMMON_COLORS.PRIMARY');
  color: white;
  border-color: v-bind('COMMON_COLORS.PRIMARY');
}

/* 琥珀色与头部的蓝色 Login 形成互补对比，在灰白底上最先被看到 */
.upgrade-button.upgrade-cta {
  padding: 4px 10px;
  border-color: transparent;
  background: linear-gradient(
    135deg,
    v-bind('COMMON_COLORS.WARNING') 0%,
    v-bind('COMMON_COLORS.WARNING_HOVER') 100%
  );
  color: white;
  font-weight: 600;
  animation: upgrade-cta-pulse 2.2s ease-out infinite;
}

.upgrade-button.upgrade-cta:hover {
  border-color: transparent;
  background: linear-gradient(
    135deg,
    v-bind('COMMON_COLORS.WARNING_HOVER') 0%,
    v-bind('COMMON_COLORS.WARNING') 100%
  );
  transform: translateY(-1px);
  animation-play-state: paused;
}

/* 光晕色取 WARNING(#f59e0b) 加透明度，rgba 字面量与其他阴影写法一致 */
@keyframes upgrade-cta-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.55);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .upgrade-button {
    transition: none;
  }

  .upgrade-button.upgrade-cta {
    animation: none;
  }

  .upgrade-button.upgrade-cta:hover {
    transform: none;
  }
}
</style>
