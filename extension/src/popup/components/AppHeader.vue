<template>
  <header class="app-header">
    <!-- 品牌即官网入口：Logo + 名称一体，点击在新标签打开官网首页 -->
    <h1 class="app-title">
      <button
        type="button"
        class="brand-link"
        :title="t(I18N_KEYS.APP.OPEN_OFFICIAL_WEBSITE)"
        :aria-label="t(I18N_KEYS.APP.OPEN_OFFICIAL_WEBSITE)"
        @click="handleOpenOfficialWebsite"
      >
        <img class="brand-logo" src="/icons/32.png" alt="" aria-hidden="true" />
        <span class="brand-name">{{ t(I18N_KEYS.APP.TITLE) }}</span>
      </button>
    </h1>

    <div class="header-actions">
      <!-- 配额计数器 -->
      <QuotaCounter />

      <!-- 设置：语言与保存位置集中在此弹层 -->
      <button
        type="button"
        class="icon-button"
        :title="t(I18N_KEYS.SETTINGS.TITLE)"
        :aria-label="t(I18N_KEYS.SETTINGS.TITLE)"
        @click="openSettingsModal"
      >
        <Icon :name="IconName.COG_6_TOOTH" :size="IconSize.MD" />
      </button>

      <!-- 刷新按钮 -->
      <button
        v-if="!resourceStore.loading && resourceStore.hasResources"
        type="button"
        class="icon-button refresh"
        :title="t(I18N_KEYS.APP.REFRESH)"
        :aria-label="t(I18N_KEYS.APP.REFRESH)"
        @click="$emit('refresh')"
      >
        <Icon :name="IconName.ARROW_PATH" :size="IconSize.MD" />
      </button>

      <!-- 登录按钮/用户菜单 -->
      <LoginButton
        @click="handleOpenLogin"
        @logout="handleLogout"
        @manage="handleManageSubscription"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { I18N_KEYS } from '@/core/constants/i18n'
import { useResourceStore } from '@/popup/stores/resourceStore'
import { useAuthStore } from '@/core/stores/authStore'
import { logger } from '@/core/utils/logger'
import { COMMON_COLORS } from '@/core/constants/style'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { QuotaCounter } from '@/core/components/quota'
import LoginButton from '@/core/components/auth/LoginButton.vue'
import { buildHomeUrl, openExternalPage } from '@/core/utils/navigation'
import { openLoginModal } from '@/core/composables/loginModal'
import { openSettingsModal } from '@/core/composables/settingsModal'
import { subscriptionApi } from '@/core/api/subscription'
import { useToast } from '@/core/composables/useToast'

// Emits
defineEmits<{
  refresh: []
}>()

// I18n
const { t } = useI18n()

// Stores
const resourceStore = useResourceStore()
const authStore = useAuthStore()
const { showSuccess } = useToast()

/** 头部品牌入口打开官网首页；打开失败已由 openExternalPage 记录日志。 */
async function handleOpenOfficialWebsite(): Promise<void> {
  await openExternalPage(buildHomeUrl('header_brand'), 'home:header_brand')
}

/** 打开 popup 内登录弹窗；登录结果由根组件在成功事件里刷新。 */
function handleOpenLogin(): void {
  openLoginModal('popup')
}

/**
 * 处理退出登录
 */
async function handleLogout(): Promise<void> {
  try {
    await authStore.logout()
    logger.info('[AppHeader] Logout successful')
  } catch (error) {
    logger.error('[AppHeader] Logout failed:', error)
  }
}

/**
 * 请求订阅渠道管理入口并在新标签页打开；请求失败已由 HTTP 拦截器统一提示。
 */
async function handleManageSubscription(): Promise<void> {
  try {
    const { url } = await subscriptionApi.createManagement()
    if (!url) {
      // 一次性买断等非自动续费订阅没有渠道管理页，明确告知而非静默失败。
      showSuccess(t(I18N_KEYS.SUBSCRIPTION.MANAGE_UNAVAILABLE))
      return
    }
    await openExternalPage(url, 'subscription_management')
  } catch (error) {
    logger.error('[AppHeader] 打开订阅管理入口失败:', error)
  }
}
</script>

<style scoped>
/*
 * 品牌 + 功能控件并排放不下时，控件整体折到第二行（popup 是固定宽度，被裁掉的部分
 * 无法滚动到，折行是这个方向上唯一不丢内容的退让方式）。折行判定用各元素的完整宽度，
 * 所以品牌名永远不会被压缩或省略，功能控件也不会被压扁。
 */
.app-header {
  padding: 4px;
  border-bottom: 1px solid v-bind('COMMON_COLORS.GRAY_200');
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  background: v-bind('COMMON_COLORS.GRAY_50');
  gap: 12px;
  row-gap: 4px;
}

.app-title {
  flex-shrink: 0;
  margin: 0;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}

.brand-link:hover {
  background: v-bind('COMMON_COLORS.GRAY_200');
}

.brand-link:focus-visible {
  outline: 2px solid #ffffff;
  box-shadow: 0 0 0 4px v-bind('COMMON_COLORS.PRIMARY');
}

.brand-logo {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  color: v-bind('COMMON_COLORS.GRAY_900');
  white-space: nowrap;
}

/* 控件不参与收缩（宁可折行也不压扁按钮）；折到第二行时靠 margin-left 保持右对齐。 */
.header-actions {
  flex-shrink: 0;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: v-bind('COMMON_COLORS.GRAY_600');
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-button:hover {
  background: v-bind('COMMON_COLORS.GRAY_200');
  color: v-bind('COMMON_COLORS.GRAY_900');
}

.icon-button:focus-visible {
  outline: 2px solid #ffffff;
  box-shadow: 0 0 0 4px v-bind('COMMON_COLORS.PRIMARY');
}

@media (prefers-reduced-motion: reduce) {
  .brand-link,
  .icon-button {
    transition: none;
  }
}
</style>
