<template>
  <div class="language-switcher">
    <button class="language-btn" :title="currentLanguageLabel" @click="toggleDropdown">
      <span class="current-language">{{ currentLanguageLabel }}</span>
    </button>

    <!-- 下拉菜单 -->
    <div v-if="showDropdown" class="language-dropdown">
      <button
        v-for="lang in LANGUAGES"
        :key="lang.value"
        class="language-option"
        :class="{ active: lang.value === currentLanguage }"
        @click="selectLanguage(lang.value)"
      >
        {{ lang.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { I18nService } from '@/locales'
import { LANGUAGES, type Language } from '@/core/services/languageService'
import { SettingsManager } from '@/core/storage/settings'
import { logger } from '@/core/utils/logger'
import { COMMON_COLORS } from '@/core/constants/style'

// 当前语言
const currentLanguage = ref<Language>(I18nService.getCurrentLanguage() as Language)

// 下拉菜单显示状态
const showDropdown = ref(false)

// 当前语言标签
const currentLanguageLabel = computed(() => {
  const config = LANGUAGES.find(l => l.value === currentLanguage.value)
  return config?.label || 'Language'
})

/**
 * 切换下拉菜单
 */
function toggleDropdown(): void {
  showDropdown.value = !showDropdown.value
}

/**
 * 关闭下拉菜单
 */
function closeDropdown(): void {
  showDropdown.value = false
}

/**
 * 选择语言
 */
async function selectLanguage(langValue: Language): Promise<void> {
  if (langValue === currentLanguage.value) {
    closeDropdown()
    return
  }

  try {
    // 更新 I18nService 语言
    I18nService.setLanguage(langValue)

    // 更新设置
    await SettingsManager.updateSettings({ language: langValue })

    // 更新当前语言
    currentLanguage.value = langValue

    logger.info(`[LanguageSwitcher] Language changed to ${langValue}`)
  } catch (error) {
    logger.error('[LanguageSwitcher] Failed to change language:', error)
  }

  closeDropdown()
}

// 点击外部关闭菜单
function handleClickOutside(event: MouseEvent): void {
  const target = event.target as Node
  const container = document.querySelector('.language-switcher')
  if (container && !container.contains(target)) {
    closeDropdown()
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
.language-switcher {
  position: relative;
  display: flex;
  align-items: center;
}

.language-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease;
}

.language-btn:hover {
  background: v-bind('COMMON_COLORS.GRAY_200');
}

.current-language {
  font-size: 12px;
  color: v-bind('COMMON_COLORS.GRAY_600');
}

/* 下拉菜单 */
.language-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 120px;
  background: white;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  animation: dropdownFadeIn 0.2s ease;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.language-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: v-bind('COMMON_COLORS.GRAY_800');
  cursor: pointer;
  transition: background 0.15s ease;
  text-align: left;
}

.language-option:hover {
  background: v-bind('COMMON_COLORS.GRAY_100');
}

.language-option.active {
  background: v-bind('COMMON_COLORS.GRAY_100');
  color: v-bind('COMMON_COLORS.PRIMARY');
  font-weight: 500;
}
</style>
