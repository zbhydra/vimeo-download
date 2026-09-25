<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div
        v-if="show"
        class="toast-container"
        :class="`toast-${type}`"
        :role="type === 'error' ? 'alert' : 'status'"
        :aria-live="type === 'error' ? 'assertive' : 'polite'"
        aria-atomic="true"
      >
        <Icon v-if="type === 'error'" :name="IconName.X_MARK" :size="IconSize.SM" />
        <Icon v-if="type === 'success'" :name="IconName.CHECK" :size="IconSize.SM" />
        <span>{{ message }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Icon, IconName, IconSize } from '@/core/components/icons'
import type { ToastType } from '@/core/composables/useToast'

interface Props {
  show?: boolean
  message?: string
  type?: ToastType
}

withDefaults(defineProps<Props>(), {
  show: false,
  message: '',
  type: 'success'
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 20px;
  box-sizing: border-box;
  max-width: calc(100vw - 24px);
  overflow-wrap: anywhere;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

.toast-success {
  background: #ecfdec;
  color: #107d32;
  border: 1px solid #b9f5bc;
}

.toast-error {
  background: #ffeeef;
  color: #d8001b;
  border: 1px solid #ffd7d6;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-fade-enter-active,
  .toast-fade-leave-active {
    transition: none;
  }
}
</style>
