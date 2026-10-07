<template>
  <!--
    额度与订阅入口合成一个按钮：两者点击去向相同（订阅页），合并后 header 少一个控件，
    448px 宽的 popup 才能单行放下。不限次时只剩入口文案。
    免费用户是升级 CTA，用醒目配色 + 光晕吸引点击；已订阅的 Unlimited 保持低调，避免误导继续付费。
  -->
  <button
    v-if="quotaStore.showSubscriptionAction"
    type="button"
    class="quota-action"
    :class="{
      'quota-action-cta': !quotaStore.hasActiveSubscription,
      'quota-exhausted': quotaStore.isExhausted
    }"
    :title="titleText"
    @click="handleClick"
  >
    <span v-if="quotaStore.showCounter" class="quota-count">{{ counterText }}</span>
    <span>{{ actionButtonText }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuotaStore } from '@/core/stores/quotaStore'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import { logger } from '@/core/utils/logger'
import { openExtensionPricingPage } from '@/core/utils/navigation'

// I18n
const { t } = useI18n()

// Store
const quotaStore = useQuotaStore()

// 计数器显示文本
const counterText = computed(() => {
  return `${quotaStore.remaining}/${quotaStore.dailyLimit}`
})

// 已订阅用户仍保留入口，但文案展示为 Unlimited，统一进入独立订阅页。
const actionButtonText = computed(() => {
  if (quotaStore.hasActiveSubscription) {
    return t(I18N_KEYS.SUBSCRIPTION.UNLIMITED)
  }

  return t(I18N_KEYS.QUOTA.UPGRADE_BUTTON)
})

// 有计数时提示额度明细，否则提示入口文案
const titleText = computed(() => {
  if (!quotaStore.showCounter) return actionButtonText.value
  if (quotaStore.isExhausted) return t(I18N_KEYS.QUOTA.TOOLTIP_EXHAUSTED)
  return t(I18N_KEYS.QUOTA.TOOLTIP_NORMAL, {
    remaining: quotaStore.remaining.toString(),
    total: quotaStore.dailyLimit.toString()
  })
})

/** 打开独立订阅页。 */
function handleClick(): void {
  logger.info('[QuotaCounter] Subscription action clicked, opening extension pricing page')
  void openExtensionPricingPage('popup_upgrade_now')
}
</script>

<style scoped>
.quota-action {
  display: flex;
  align-items: center;
  gap: 6px;
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

.quota-action:hover {
  background: v-bind('COMMON_COLORS.PRIMARY');
  color: white;
  border-color: v-bind('COMMON_COLORS.PRIMARY');
}

/* 计数做成按钮内的浅色徽标，与入口文案区分开 */
.quota-count {
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.25);
  font-variant-numeric: tabular-nums;
}

.quota-exhausted .quota-count {
  background: v-bind('COMMON_COLORS.ERROR');
}

/* 琥珀色与头部的蓝色 Login 形成互补对比，在灰白底上最先被看到 */
.quota-action.quota-action-cta {
  padding: 4px 10px 4px 6px;
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

.quota-action.quota-action-cta:hover {
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
  .quota-action {
    transition: none;
  }

  .quota-action.quota-action-cta {
    animation: none;
  }

  .quota-action.quota-action-cta:hover {
    transform: none;
  }
}
</style>
