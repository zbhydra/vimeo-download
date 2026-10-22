<template>
  <PremiumView page />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/core/stores/authStore'
import { logger } from '@/core/utils/logger'
import { openPremiumView, closePremiumView } from '@/core/composables/premiumView'
import PremiumView from '@/popup/components/PremiumView.vue'

const authStore = useAuthStore()

onMounted(async () => {
  try {
    await authStore.initialize()
  } catch (error) {
    logger.error('[PricingPage] 登录态初始化失败:', error)
  }
  const query = new URLSearchParams(window.location.search)
  const source = query.get('source')?.trim() || query.get('utm_source')?.trim() || 'upgrade_modal'
  openPremiumView('upgrade_modal', source)
})

onUnmounted(() => {
  closePremiumView()
})
</script>
