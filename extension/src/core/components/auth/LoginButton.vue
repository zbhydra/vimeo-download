<template>
  <div class="login-button-container">
    <!-- 未登录状态：显示 Login 按钮 -->
    <button v-if="!authStore.isAuthenticated" class="login-btn" @click="emit('click')">
      {{ t(I18N_KEYS.AUTH.LOGIN) }}
    </button>

    <!-- 已登录状态：显示用户头像和下拉菜单 -->
    <div v-else class="user-menu-wrapper">
      <button class="user-avatar-btn" :title="authStore.displayName" @click="toggleMenu">
        <Icon :name="IconName.USER" :size="IconSize.MD" />
        <span v-if="authStore.displayName" class="user-name">
          {{ truncateName(authStore.displayName) }}
        </span>
      </button>

      <!-- 下拉菜单 -->
      <div v-if="showMenu" class="user-dropdown">
        <div class="user-info">
          <div class="user-icon-large">
            <Icon :name="IconName.USER" :size="IconSize.XL" />
          </div>
          <div class="user-details">
            <div class="user-name-full">{{ authStore.displayName }}</div>
            <div v-if="authStore.user?.email" class="user-email">
              {{ authStore.user.email }}
            </div>
          </div>
        </div>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item logout" @click="handleLogout">
          <Icon :name="IconName.ARROW_RIGHT_ON_RECTANGLE" :size="IconSize.MD" />
          <span>{{ t(I18N_KEYS.AUTH.LOGOUT) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/core/stores/authStore'
import { I18N_KEYS } from '@/core/constants/i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'

// Emits
const emit = defineEmits<{
  click: []
  logout: []
}>()

// I18n
const { t } = useI18n()

// Store
const authStore = useAuthStore()

// 下拉菜单显示状态
const showMenu = ref(false)

/**
 * 切换下拉菜单
 */
function toggleMenu(): void {
  showMenu.value = !showMenu.value
}

/**
 * 关闭下拉菜单
 */
function closeMenu(): void {
  showMenu.value = false
}

/**
 * 处理退出登录
 */
function handleLogout(): void {
  closeMenu()
  // 使用 nextTick 确保在 emit 前菜单已关闭
  setTimeout(() => {
    emit('logout')
  }, 0)
}

/**
 * 截断过长的用户名
 */
function truncateName(name: string): string {
  if (name.length > 10) {
    return name.substring(0, 10) + '...'
  }
  return name
}

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent): void {
  const target = event.target as Node
  const container = document.querySelector('.user-menu-wrapper')
  if (container && !container.contains(target)) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.login-button-container {
  display: flex;
  align-items: center;
}

/* 未登录按钮 */
.login-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  background: var(--login-primary);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.login-btn:hover {
  background: var(--login-primary-dark);
}

/* 已登录容器 */
.user-menu-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.user-avatar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease;
}

.user-avatar-btn:hover {
  background: var(--login-gray-200);
}

.user-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--login-gray-600);
}

.user-name {
  font-size: 13px;
  color: var(--login-gray-800);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 下拉菜单 */
.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  animation: dropdownFadeIn 0.2s ease;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.user-icon-large {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--login-gray-100);
  color: var(--login-gray-600);
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name-full {
  font-size: 14px;
  font-weight: 600;
  color: var(--login-gray-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-email {
  font-size: 12px;
  color: var(--login-gray-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.dropdown-divider {
  height: 1px;
  background: var(--login-gray-200);
  margin: 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--login-gray-800);
  cursor: pointer;
  transition: background 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: var(--login-gray-100);
}

.dropdown-item.logout {
  color: var(--login-error);
}

.dropdown-item.logout:hover {
  background: var(--login-error-bg);
}
</style>
