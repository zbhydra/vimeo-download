<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="settings-overlay"
      aria-labelledby="vdl-settings-modal-title"
      :style="colorVars"
      @click.self="handleClose"
      @close="handleClose"
    >
      <div class="settings-dialog" @click.stop>
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
          <select class="settings-control" :value="languageSetting" @change="handleLanguageChange">
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

        <!--
            文件名规则：默认/自定义模板 + 变量 chips + 实时预览。存储只落模板字符串
            （settings.filenamePattern），background 在命名边界统一渲染。
          -->
        <div class="settings-field">
          <span class="settings-field-label">
            {{ t(I18N_KEYS.SETTINGS.FILENAME_PATTERN_LABEL) }}
          </span>
          <div
            class="pattern-mode"
            role="group"
            :aria-label="t(I18N_KEYS.SETTINGS.FILENAME_PATTERN_LABEL)"
          >
            <button
              type="button"
              class="pattern-mode-button"
              :class="{ 'pattern-mode-active': !customMode }"
              @click="useDefaultPattern"
            >
              {{ t(I18N_KEYS.SETTINGS.FILENAME_PATTERN_MODE_DEFAULT) }}
            </button>
            <button
              type="button"
              class="pattern-mode-button"
              :class="{ 'pattern-mode-active': customMode }"
              @click="enableCustomPattern"
            >
              {{ t(I18N_KEYS.SETTINGS.FILENAME_PATTERN_MODE_CUSTOM) }}
            </button>
          </div>
          <template v-if="customMode">
            <input
              ref="patternInput"
              v-model="filenamePattern"
              class="settings-control pattern-input"
              type="text"
              spellcheck="false"
              autocomplete="off"
              :placeholder="FILENAME_PATTERN_DEFAULT"
              @change="persistFilenamePattern"
            />
            <div
              class="pattern-variables"
              role="group"
              :aria-label="t(I18N_KEYS.SETTINGS.FILENAME_PATTERN_VARIABLES_LABEL)"
            >
              <button
                v-for="variable in FILENAME_VARIABLES"
                :key="variable"
                type="button"
                class="pattern-variable-chip"
                @click="insertVariable(variable)"
              >
                {{ variableToken(variable) }}
              </button>
            </div>
            <button type="button" class="pattern-reset" @click="resetPattern">
              {{ t(I18N_KEYS.SETTINGS.FILENAME_PATTERN_RESET) }}
            </button>
          </template>
          <div class="pattern-preview">
            <span class="pattern-preview-label">
              {{ t(I18N_KEYS.SETTINGS.FILENAME_PATTERN_PREVIEW_LABEL) }}
            </span>
            <span class="pattern-preview-value">{{ previewFilename }}</span>
          </div>
        </div>

        <div class="settings-field">
          <span class="settings-field-label">{{ t(I18N_KEYS.SETTINGS.SPLIT_MODE_LABEL) }}</span>
          <label class="settings-choice">
            <input
              type="radio"
              name="settings-split-mode"
              value="auto"
              :checked="splitMode === 'auto'"
              @change="handleSplitModeChange"
            />
            <span>
              <strong>{{ t(I18N_KEYS.SETTINGS.SPLIT_MODE_AUTO) }}</strong>
              <small>{{ t(I18N_KEYS.SETTINGS.SPLIT_MODE_AUTO_DESCRIPTION) }}</small>
            </span>
          </label>
          <div v-if="splitMode === 'auto'" class="settings-threshold">
            <label class="settings-threshold-label" for="settings-auto-split-threshold">
              {{ t(I18N_KEYS.SETTINGS.SPLIT_MODE_THRESHOLD) }}
            </label>
            <input
              id="settings-auto-split-threshold"
              class="settings-control settings-number-control"
              type="number"
              :min="AUTO_SPLIT_THRESHOLD_MIN_GB"
              :max="AUTO_SPLIT_THRESHOLD_MAX_GB"
              :step="AUTO_SPLIT_THRESHOLD_STEP_GB"
              :value="autoSplitThresholdGB"
              :aria-label="t(I18N_KEYS.SETTINGS.SPLIT_MODE_THRESHOLD)"
              @change="persistAutoSplitThreshold"
            />
            <span class="settings-threshold-unit">{{
              t(I18N_KEYS.SETTINGS.SPLIT_MODE_THRESHOLD_UNIT)
            }}</span>
          </div>
          <label class="settings-choice">
            <input
              type="radio"
              name="settings-split-mode"
              value="never"
              :checked="splitMode === 'never'"
              @change="handleSplitModeChange"
            />
            <span>
              <strong>{{ t(I18N_KEYS.SETTINGS.SPLIT_MODE_NEVER) }}</strong>
              <small>{{ t(I18N_KEYS.SETTINGS.SPLIT_MODE_NEVER_DESCRIPTION) }}</small>
            </span>
          </label>
        </div>

        <label class="settings-toggle">
          <input
            type="checkbox"
            :checked="useBackgroundBlobDownload"
            @change="handleBackgroundBlobDownloadChange"
          />
          <span>
            <strong>{{ t(I18N_KEYS.SETTINGS.BACKGROUND_BLOB_LABEL) }}</strong>
            <small>{{ t(I18N_KEYS.SETTINGS.BACKGROUND_BLOB_DESCRIPTION) }}</small>
          </span>
        </label>

        <!-- 下载历史：唯一入口，进入全屏历史视图并收起本弹层 -->
        <button type="button" class="settings-history-row" @click="handleOpenHistory">
          <span class="settings-history-label">{{ t(I18N_KEYS.HISTORY.TITLE) }}</span>
          <Icon
            class="settings-history-chevron"
            :name="IconName.CHEVRON_DOWN"
            :size="IconSize.XS"
          />
        </button>
      </div>
    </dialog>
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

import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { I18nService } from '@/locales'
import { LANGUAGES, LanguageService } from '@/core/services/languageService'
import {
  AUTO_SPLIT_THRESHOLD_MAX_GB,
  AUTO_SPLIT_THRESHOLD_MIN_GB,
  AUTO_SPLIT_THRESHOLD_STEP_GB,
  DEFAULT_DOWNLOAD_PATH,
  normalizeAutoSplitThresholdGB,
  SettingsManager,
  type SplitMode
} from '@/core/storage/settings'
import { LANGUAGE_AUTO, I18N_KEYS, type LanguageSetting } from '@/core/constants/i18n'
import { closeSettingsModal, settingsModalVisible } from '@/core/composables/settingsModal'
import { openHistoryView } from '@/core/composables/historyView'
import { useNativeDialog } from '@/core/composables/nativeDialog'
import {
  FILENAME_PATTERN_DEFAULT,
  FILENAME_VARIABLES,
  renderFilenameBase,
  type FilenameTemplateContext,
  type FilenameVariable
} from '@/core/utils/filenameTemplate'
import { logger } from '@/core/utils/logger'
import { normalizeFilename } from '@/core/utils/downloadFilename'
import { COMMON_COLORS } from '@/core/constants/style'
import { Icon, IconName, IconSize } from '@/core/components/icons'

const { t } = useI18n()
const dialog = useNativeDialog(settingsModalVisible)

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

/** 大文件下载设置；值来自 SettingsManager 的统一归一化结果。 */
const splitMode = ref<SplitMode>('auto')
const autoSplitThresholdGB = ref(1.5)
const useBackgroundBlobDownload = ref(false)

/**
 * 文件名模板与编辑模式。
 *
 * 存储只落模板字符串：等于默认模板即「默认」模式，否则「自定义」。`customMode` 是本地
 * 交互态（避免输入过程中恰好等于默认模板时编辑器消失），打开弹层时从存储值推导。
 */
const filenamePattern = ref(FILENAME_PATTERN_DEFAULT)
const customMode = ref(false)
const patternInput = ref<HTMLInputElement | null>(null)

/** 预览固定示例数据；与真实下载无关，只让模板结构可见。 */
const PATTERN_PREVIEW_CONTEXT: FilenameTemplateContext = {
  title: 'Big Buck Bunny',
  quality: '1080p HD',
  type: 'video',
  author: 'Blender Foundation',
  date: '2026-01-31',
  videoId: '1234567'
}

/** 预览固定追加的扩展名；真实扩展名由 background 按资源类型与目标格式决定。 */
const PATTERN_PREVIEW_EXTENSION = '.mp4'

/**
 * 实时预览：输入即渲染，空模板按默认模板展示。
 *
 * 渲染结果过与 background 落盘同一道 `normalizeFilename` 净化（非法字符替换、空白收敛、
 * 长度截断），保证「预览 = 落盘」：模板含 `/` 等非法字符时预览的就是真实保存名。
 */
const previewFilename = computed(() =>
  normalizeFilename(
    renderFilenameBase(
      filenamePattern.value.trim() || FILENAME_PATTERN_DEFAULT,
      PATTERN_PREVIEW_CONTEXT
    ) + PATTERN_PREVIEW_EXTENSION
  )
)

// 每次打开都从存储回读，保证与上次会话（或 background 侧写入）一致。
watch(settingsModalVisible, async visible => {
  if (!visible) {
    return
  }

  try {
    const settings = await SettingsManager.getSettings()
    languageSetting.value = settings.language ?? LANGUAGE_AUTO
    downloadPath.value = settings.downloadPath ?? DEFAULT_DOWNLOAD_PATH
    filenamePattern.value = settings.filenamePattern ?? FILENAME_PATTERN_DEFAULT
    splitMode.value = settings.splitMode
    autoSplitThresholdGB.value = settings.autoSplitThresholdGB
    useBackgroundBlobDownload.value = settings.useBackgroundBlobDownload
    // 存储值非默认模板即说明用户在自定义模式；等号场景落回默认，与存储单一真相一致。
    customMode.value = filenamePattern.value !== FILENAME_PATTERN_DEFAULT
  } catch (error) {
    logger.error('[SettingsModal] 读取设置失败，沿用当前显示值:', error)
  }
})

/** 判断下拉值是否为合法的语言设置（Auto 或受支持的 locale）。 */
function isLanguageSetting(value: string): value is LanguageSetting {
  return value === LANGUAGE_AUTO || LANGUAGES.some(lang => lang.value === value)
}

async function handleSplitModeChange(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).value
  if (value !== 'auto' && value !== 'never') {
    return
  }

  splitMode.value = value
  try {
    await SettingsManager.updateSettings({ splitMode: value })
  } catch (error) {
    logger.error(`[SettingsModal] 分割模式写入失败: splitMode=${value}`, error)
  }
}

async function persistAutoSplitThreshold(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).value
  const normalized = normalizeAutoSplitThresholdGB(value)
  autoSplitThresholdGB.value = normalized
  if (event.target instanceof HTMLInputElement) {
    event.target.value = String(normalized)
  }
  try {
    await SettingsManager.updateSettings({ autoSplitThresholdGB: normalized })
  } catch (error) {
    logger.error(`[SettingsModal] 自动分割阈值写入失败: threshold=${normalized}`, error)
  }
}

async function handleBackgroundBlobDownloadChange(event: Event): Promise<void> {
  const value = (event.target as HTMLInputElement).checked
  useBackgroundBlobDownload.value = value
  try {
    await SettingsManager.updateSettings({ useBackgroundBlobDownload: value })
  } catch (error) {
    logger.error(`[SettingsModal] 备用下载方式写入失败: enabled=${value}`, error)
  }
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
async function persistSavePath(event?: Event): Promise<void> {
  const normalized = downloadPath.value.trim() || DEFAULT_DOWNLOAD_PATH
  downloadPath.value = normalized
  if (event?.target instanceof HTMLInputElement) {
    event.target.value = normalized
  }
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

/** 切回默认模板：写入默认值并收起自定义编辑器。 */
async function useDefaultPattern(): Promise<void> {
  customMode.value = false
  filenamePattern.value = FILENAME_PATTERN_DEFAULT
  await persistPattern()
}

/** 进入自定义模式：以当前模板为编辑种子（默认模式则从默认模板起改），并聚焦输入框。 */
async function enableCustomPattern(): Promise<void> {
  customMode.value = true
  await nextTick()
  patternInput.value?.focus()
}

/** 自定义输入提交（change 事件）：空值视为回到默认模板。 */
async function persistFilenamePattern(): Promise<void> {
  const normalized = filenamePattern.value.trim() || FILENAME_PATTERN_DEFAULT
  filenamePattern.value = normalized
  await persistPattern()
}

/** 重置：回到默认模板并收起编辑器。 */
async function resetPattern(): Promise<void> {
  await useDefaultPattern()
}

/** 变量 chips 的展示文本（`{title}` 等）；模板插值里不直接写花括号嵌套。 */
function variableToken(variable: FilenameVariable): string {
  return `{${variable}}`
}

/** 把变量占位插入输入框光标处（无光标信息时追加到末尾），插入后聚焦回输入框。 */
async function insertVariable(variable: FilenameVariable): Promise<void> {
  const input = patternInput.value
  const token = `{${variable}}`
  const value = filenamePattern.value
  const start = input?.selectionStart ?? value.length
  const end = input?.selectionEnd ?? start
  filenamePattern.value = value.slice(0, start) + token + value.slice(end)
  await nextTick()
  const caret = start + token.length
  input?.setSelectionRange(caret, caret)
  input?.focus()
  await persistPattern()
}

/** 模板写入设置；失败只记日志，界面保留当前输入。 */
async function persistPattern(): Promise<void> {
  try {
    await SettingsManager.updateSettings({ filenamePattern: filenamePattern.value })
  } catch (error) {
    logger.error(`[SettingsModal] 文件名模板写入失败: pattern=${filenamePattern.value}`, error)
  }
}

/** 进入下载历史：收起本弹层，打开全屏历史视图。 */
function handleOpenHistory(): void {
  closeSettingsModal()
  openHistoryView()
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  border: 0;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(15, 23, 42, 0.42);
  box-sizing: border-box;
}

.settings-overlay[open] {
  display: flex;
}

.settings-overlay::backdrop {
  background: transparent;
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

.settings-choice,
.settings-toggle {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--settings-gray-900);
  font-size: 13px;
  cursor: pointer;
}

.settings-choice input,
.settings-toggle input {
  flex: 0 0 auto;
  margin: 2px 0 0;
  accent-color: var(--settings-primary);
}

.settings-choice span,
.settings-toggle span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-choice small,
.settings-toggle small {
  color: var(--settings-gray-500);
  font-size: 11px;
  line-height: 1.35;
}

.settings-threshold {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 2px 24px;
}

.settings-threshold-label {
  color: var(--settings-gray-500);
  font-size: 11px;
}

.settings-number-control {
  width: 88px;
  min-height: 30px;
  padding: 0 8px;
}

.settings-threshold-unit {
  color: var(--settings-gray-500);
  font-size: 11px;
}

.settings-history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--settings-gray-300);
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
}

.settings-history-row:hover {
  border-color: var(--settings-primary);
}

.settings-history-row:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.2);
  border-color: var(--settings-primary);
}

.settings-history-label {
  font-size: 13px;
  color: var(--settings-gray-900);
}

.settings-history-chevron {
  transform: rotate(-90deg);
  color: var(--settings-gray-500);
}

/* 文件名规则：模式切换、模板输入、变量 chips 与预览 */
.pattern-mode {
  display: flex;
  gap: 6px;
}

.pattern-mode-button {
  flex: 1;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--settings-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--settings-gray-800);
  font-size: 12px;
  cursor: pointer;
}

.pattern-mode-button:hover {
  border-color: var(--settings-gray-400);
}

.pattern-mode-button.pattern-mode-active {
  border-color: var(--settings-gray-900);
  background: var(--settings-gray-900);
  color: #ffffff;
}

.pattern-variables {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pattern-variable-chip {
  padding: 3px 9px;
  border: 1px solid var(--settings-gray-300);
  border-radius: 999px;
  background: #ffffff;
  color: var(--settings-gray-800);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}

.pattern-variable-chip:hover {
  border-color: var(--settings-primary);
  color: var(--settings-gray-900);
}

.pattern-reset {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--settings-gray-500);
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}

.pattern-reset:hover {
  color: var(--settings-gray-800);
}

.pattern-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--settings-gray-50);
}

.pattern-preview-label {
  font-size: 11px;
  color: var(--settings-gray-500);
}

.pattern-preview-value {
  font-size: 12px;
  color: var(--settings-gray-900);
  word-break: break-all;
}
</style>
