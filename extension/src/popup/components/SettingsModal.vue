<template>
  <Teleport to="body">
    <Transition name="settings-modal-fade">
      <div
        v-if="settingsModalVisible"
        class="settings-overlay"
        :style="colorVars"
        @click.self="handleClose"
      >
        <div
          class="settings-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vdl-settings-modal-title"
          @click.stop
        >
          <button
            type="button"
            class="settings-close"
            :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
            @click="handleClose"
          >
            <Icon :name="IconName.X_MARK" :size="IconSize.SM" />
          </button>

          <h2 id="vdl-settings-modal-title" class="settings-title">
            {{ t(I18N_KEYS.SETTINGS.TITLE) }}
          </h2>

          <!-- 界面语言：Auto 跟随浏览器，具体 locale 即改即生效 -->
          <label class="settings-field">
            <span class="settings-field-label">{{ t(I18N_KEYS.SETTINGS.LANGUAGE_LABEL) }}</span>
            <select
              class="settings-control"
              :value="languageSetting"
              @change="handleLanguageChange"
            >
              <option :value="LANGUAGE_AUTO">{{ t(I18N_KEYS.SETTINGS.LANGUAGE_AUTO) }}</option>
              <option v-for="lang in languageOptions" :key="lang.value" :value="lang.value">
                {{ lang.label }}
              </option>
            </select>
          </label>

          <!-- 保存位置：下载目录下的相对子目录，弹层是唯一编辑入口 -->
          <label class="settings-field">
            <span class="settings-field-label">{{ t(I18N_KEYS.SETTINGS.SAVE_PATH_LABEL) }}</span>
            <input
              v-model="downloadPath"
              class="settings-control"
              type="text"
              spellcheck="false"
              autocomplete="off"
              :placeholder="t(I18N_KEYS.SETTINGS.SAVE_PATH_PLACEHOLDER)"
              @change="persistSavePath"
            />
          </label>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Popup 设置弹层。
 *
 * 本期两项：界面语言（Auto + 14 locale，写入 settings.language 并即时生效）与保存位置
 * （settings.downloadPath，background 在下载边界做归一化与净化）。组件根节点是 Teleport，
 * Vue 的 style v-bind()（useCssVars）会把变量挂到 Teleport 锚点而非真实 DOM（PremiumView
 * 同坑），因此颜色用 COMMON_COLORS 显式声明成覆盖层根节点上的 CSS 变量向下级联。
 */

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { I18nService } from '@/locales'
import { LANGUAGES, LanguageService } from '@/core/services/languageService'
import { DEFAULT_DOWNLOAD_PATH, SettingsManager } from '@/core/storage/settings'
import { LANGUAGE_AUTO, I18N_KEYS, type LanguageSetting } from '@/core/constants/i18n'
import { closeSettingsModal, settingsModalVisible } from '@/core/composables/settingsModal'
import { logger } from '@/core/utils/logger'
import { COMMON_COLORS } from '@/core/constants/style'
import { Icon, IconName, IconSize } from '@/core/components/icons'

const { t } = useI18n()

/** 覆盖层根节点显式级联的颜色变量（Teleport 子树拿不到 useCssVars 变量）。 */
const colorVars = {
  '--settings-primary': COMMON_COLORS.PRIMARY,
  '--settings-gray-50': COMMON_COLORS.GRAY_50,
  '--settings-gray-100': COMMON_COLORS.GRAY_100,
  '--settings-gray-300': COMMON_COLORS.GRAY_300,
  '--settings-gray-400': COMMON_COLORS.GRAY_400,
  '--settings-gray-500': COMMON_COLORS.GRAY_500,
  '--settings-gray-800': COMMON_COLORS.GRAY_800,
  '--settings-gray-900': COMMON_COLORS.GRAY_900
}

/** 语言下拉选项：14 种界面语言，Auto 单列在最前。 */
const languageOptions = computed(() => LanguageService.getLanguageOptions())

/** 当前语言设置；含 Auto。 */
const languageSetting = ref<LanguageSetting>(LANGUAGE_AUTO)

/** 保存位置输入框；空串表示回退默认子目录。 */
const downloadPath = ref(DEFAULT_DOWNLOAD_PATH)

// 每次打开都从存储回读，保证与上次会话（或 background 侧写入）一致。
watch(settingsModalVisible, async visible => {
  if (!visible) {
    return
  }

  try {
    const settings = await SettingsManager.getSettings()
    languageSetting.value = settings.language ?? LANGUAGE_AUTO
    downloadPath.value = settings.downloadPath ?? DEFAULT_DOWNLOAD_PATH
  } catch (error) {
    logger.error('[SettingsModal] 读取设置失败，沿用当前显示值:', error)
  }
})

/** 判断下拉值是否为合法的语言设置（Auto 或受支持的 locale）。 */
function isLanguageSetting(value: string): value is LanguageSetting {
  return value === LANGUAGE_AUTO || LANGUAGES.some(lang => lang.value === value)
}

/** 语言即改即生效：写 settings.language，I18nService 监听设置变化后同步全部 vue-i18n 实例。 */
async function handleLanguageChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value
  if (!isLanguageSetting(value)) {
    return
  }

  try {
    await I18nService.setLanguage(value)
    languageSetting.value = value
  } catch (error) {
    logger.error(`[SettingsModal] 语言切换失败: language=${value}`, error)
  }
}

/**
 * 保存位置写入设置；`change` 只在值真的变了时触发。
 *
 * 这里只把空值回填成默认子目录（与 background 兜底同源、共用常量），非法段（`..`、
 * `C:\x`、`~/x`）的判定与丢弃全在 background 侧，输入框会原样保留用户填的这类值。
 */
async function persistSavePath(): Promise<void> {
  const normalized = downloadPath.value.trim() || DEFAULT_DOWNLOAD_PATH
  downloadPath.value = normalized
  try {
    await SettingsManager.updateSettings({ downloadPath: normalized })
  } catch (error) {
    logger.error(`[SettingsModal] 保存位置写入失败: downloadPath=${normalized}`, error)
  }
}

/** 关闭弹层。 */
function handleClose(): void {
  closeSettingsModal()
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(15, 23, 42, 0.42);
  box-sizing: border-box;
}

.settings-dialog {
  position: relative;
  width: min(340px, 100%);
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 16px 16px;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);
  box-sizing: border-box;
}

.settings-close {
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
  color: var(--settings-gray-500);
  cursor: pointer;
}

.settings-close:hover {
  background: var(--settings-gray-100);
  color: var(--settings-gray-800);
}

.settings-title {
  margin: 0;
  padding-right: 28px;
  font-size: 17px;
  font-weight: 600;
  color: var(--settings-gray-900);
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.settings-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--settings-gray-500);
}

.settings-control {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--settings-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--settings-gray-900);
  font-size: 13px;
  box-sizing: border-box;
}

select.settings-control {
  cursor: pointer;
}

.settings-control:focus {
  outline: 2px solid rgba(37, 99, 235, 0.2);
  border-color: var(--settings-primary);
}

.settings-control:hover {
  border-color: var(--settings-gray-400);
}

.settings-modal-fade-enter-active,
.settings-modal-fade-leave-active {
  transition: opacity 0.18s ease;
}

.settings-modal-fade-enter-from,
.settings-modal-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .settings-modal-fade-enter-active,
  .settings-modal-fade-leave-active {
    transition: none;
  }
}
</style>
