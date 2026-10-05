<template>
  <div class="app-container">
    <!-- 顶部标题栏 -->
    <AppHeader @refresh="handleRefresh" />

    <!-- 单视频操作面板 -->
    <VideoPanel @download="handleDownload" @refresh="handleRefresh" @open-site="handleOpenSite" />

    <!-- 底部下载管理区：有任务时常驻，无任务不渲染 -->
    <DownloadQueue />

    <!-- 运营条：远端公告跑马灯 + 评分引导（footer 上方） -->
    <AnnouncementBar />
    <RatingPrompt />

    <!-- 底部联系入口 -->
    <AppFooter />

    <!-- 升级弹窗 -->
    <UpgradeModal
      :show="showUpgradeModal"
      :reset-at="upgradeModalResetAt"
      :use-teleport="false"
      @update:show="showUpgradeModal = $event"
      @upgrade="openPremiumView('upgrade_modal')"
    />

    <!-- 插件本地登录弹窗 -->
    <LoginModal @success="handleLoginSuccess" />

    <!-- 设置弹层 -->
    <SettingsModal />

    <!-- 内嵌购买视图 -->
    <PremiumView />

    <!-- 下载历史视图 -->
    <HistoryView />

    <Toast :show="toastState.show" :message="toastState.message" :type="toastState.type" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useResourceStore } from '@/popup/stores/resourceStore'
import { useDownloadStatusStore } from '@/popup/stores/downloadStatusStore'
import { useAuthStore } from '@/core/stores/authStore'
import { useQuotaStore } from '@/core/stores/quotaStore'
import { openPremiumView } from '@/core/composables/premiumView'
import { ChromeEventSubscriber } from '@/core/rpc/ChromeEventBus'
import type { ExtensionEvents } from '@/core/events/types'
import { ensureSupportedTabOpen, openSiteTab } from '@/popup/utils/tabs'
import { MARK_TYPE, type MarkType } from '@/core/api/mark'
import { BackgroundChannel } from '@/popup/rpc/background.rpc'
import { logger } from '@/core/utils/logger'
import VideoPanel from './components/VideoPanel.vue'
import AppHeader from './components/AppHeader.vue'
import DownloadQueue from './components/DownloadQueue.vue'
import AppFooter from './components/AppFooter.vue'
import AnnouncementBar from './components/AnnouncementBar.vue'
import RatingPrompt from './components/RatingPrompt.vue'
import SettingsModal from './components/SettingsModal.vue'
import UpgradeModal from '@/core/content/components/UpgradeModal.vue'
import LoginModal from './components/LoginModal.vue'
import PremiumView from './components/PremiumView.vue'
import HistoryView from './components/HistoryView.vue'
import Toast from '@/core/components/Toast.vue'
import { useToast } from '@/core/composables/useToast'
import { refreshRatingPrompt } from '@/core/composables/ratingPrompt'
import type { MediaResource } from '@/core/types'

// Stores
const store = useResourceStore()
const downloadStatusStore = useDownloadStatusStore()
const authStore = useAuthStore()
const quotaStore = useQuotaStore()
const { toastState } = useToast()

watch(
  () => authStore.isAuthenticated,
  authenticated => {
    void refreshRatingPrompt(authenticated)
  }
)

// 升级弹窗状态
const showUpgradeModal = ref(false)
/** 当前升级弹窗对应的下一次额度刷新时间。 */
const upgradeModalResetAt = ref<number>()

// 事件订阅器
const eventSubscriber = new ChromeEventSubscriber<ExtensionEvents>()
let upgradeModalUnsubscribe: (() => void) | null = null
let downloadSuccessUnsubscribe: (() => void) | null = null

// 记录打点（异步，不阻塞业务）
function recordMark(markType: MarkType): void {
  new BackgroundChannel().recordMark({ mark_type: markType, mark_msg: '' }).catch(error => {
    logger.error('[Popup] SLS 打点失败:', error)
  })
}

// 生命周期
onMounted(async () => {
  upgradeModalUnsubscribe = eventSubscriber.on('showUpgradeModal', payload => {
    upgradeModalResetAt.value = payload.resetAt
    showUpgradeModal.value = true
  })
  downloadSuccessUnsubscribe = eventSubscriber.on('downloadTaskSucceeded', () => {
    void refreshRatingPrompt(authStore.isAuthenticated)
  })
  eventSubscriber.on('quotaConsumed', () => {
    quotaStore.refreshQuota().catch(error => {
      logger.error('[Popup] 消费后刷新额度失败:', error)
    })
  })

  // 第一时间记录弹窗打开打点（不等待，不阻塞）
  recordMark(MARK_TYPE.POPUP_OPEN)

  // 最终目标 tab 只在 Popup 打开时确定一次，后续刷新和下载始终使用该 tabId。
  const targetTab = await ensureSupportedTabOpen()

  // 资源、下载状态和登录信息彼此独立，并行初始化以缩短 Popup 可用时间。
  await Promise.all([
    store.initialize(targetTab),
    downloadStatusStore.initialize(targetTab),
    authStore.initialize()
  ])
  await refreshRatingPrompt(authStore.isAuthenticated)
})

onUnmounted(() => {
  // 取消订阅
  if (upgradeModalUnsubscribe) {
    upgradeModalUnsubscribe()
    upgradeModalUnsubscribe = null
  }
  if (downloadSuccessUnsubscribe) {
    downloadSuccessUnsubscribe()
    downloadSuccessUnsubscribe = null
  }
  eventSubscriber.destroy()
  downloadStatusStore.destroy()
})

/** 登录弹窗成功后重新校验令牌并刷新配额，无需重开 Popup。 */
async function handleLoginSuccess(): Promise<void> {
  try {
    await authStore.initialize()
  } catch (error) {
    logger.error('[Popup] 登录后刷新登录态失败:', error)
  }
}

// 事件处理
/** 面板发来的单个资源（片段区间已并入身份）直接交给 content 下载。 */
function handleDownload(resource: MediaResource): void {
  store.downloadResource(resource)
}

function handleRefresh(): void {
  store.refresh()
}

/**
 * 面板引导按钮：把用户带到 Vimeo。
 *
 * Popup 打开时不重新绑定目标 tab：跳转后用户会重开 Popup，届时 `onMounted` 会重新固定到
 * Vimeo 标签页，这里无需（也无法可靠地）就地刷新整个面板。
 */
function handleOpenSite(): void {
  openSiteTab()
}
</script>

<style scoped>
.app-container {
  width: 100%;
  min-height: var(--popup-min-height);
  max-height: var(--popup-max-height);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
