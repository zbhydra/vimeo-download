<template>
  <div v-if="store.hasTasks" ref="container" class="download-status">
    <button
      ref="trigger"
      type="button"
      class="status-trigger"
      :title="summaryLabel"
      :aria-label="summaryLabel"
      :aria-expanded="showPopover"
      aria-controls="download-status-popover"
      @click="togglePopover"
      @keydown.esc.stop="closePopover(true)"
    >
      <Icon :name="IconName.ARROW_DOWN_TRAY" :size="IconSize.XS" />
      <span class="status-summary" aria-hidden="true">
        <span class="active-count">{{ summaryCurrentCount }}</span>
        <span class="summary-separator">·</span>
        <span class="summary-progress">{{ progressText }}</span>
      </span>
    </button>

    <span class="visually-hidden" aria-live="polite">{{ summaryLabel }}</span>

    <section
      v-if="showPopover"
      id="download-status-popover"
      class="status-popover"
      role="region"
      :aria-label="t(I18N_KEYS.DOWNLOAD_STATUS.TITLE)"
      @keydown.esc.stop="closePopover(true)"
    >
      <header class="popover-header">
        <h2>{{ t(I18N_KEYS.DOWNLOAD_STATUS.TITLE) }}</h2>
        <span class="total-count">{{ store.totalCount }}</span>
      </header>

      <div class="task-scroll-area">
        <section v-if="store.activeTasks.length > 0" class="task-section">
          <h3>
            {{
              t(I18N_KEYS.DOWNLOAD_STATUS.DOWNLOADING_COUNT, {
                count: store.activeCount
              })
            }}
          </h3>
          <ul class="task-list">
            <li v-for="task in store.activeTasks" :key="task.taskId" class="task-row">
              <Icon
                :name="typePresentation(task).icon"
                :size="IconSize.SM"
                :color="typePresentation(task).color"
              />
              <div class="task-content">
                <div class="task-title-row">
                  <span class="task-name" :title="taskName(task)">{{ taskName(task) }}</span>
                  <span class="task-progress-text">{{ taskProgressText(task) }}</span>
                </div>
                <progress
                  v-if="task.progress !== null"
                  class="task-progress"
                  :value="task.progress"
                  max="100"
                  :aria-label="taskProgressLabel(task)"
                ></progress>
                <span v-else class="task-state">
                  {{ t(I18N_KEYS.RESOURCE_ITEM.DOWNLOADING) }}
                </span>
                <span v-if="hasTransferMetrics(task)" class="task-metrics">
                  {{ taskSizeText(task) }} · {{ taskSpeedText(task) }}
                </span>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="store.waitingTasks.length > 0" class="task-section waiting-section">
          <h3>
            {{
              t(I18N_KEYS.DOWNLOAD_STATUS.WAITING_COUNT, {
                count: store.waitingCount
              })
            }}
          </h3>
          <ul class="task-list">
            <li v-for="task in store.waitingTasks" :key="task.taskId" class="task-row">
              <Icon
                :name="typePresentation(task).icon"
                :size="IconSize.SM"
                :color="typePresentation(task).color"
              />
              <div class="task-content waiting-content">
                <div class="task-title-row">
                  <span class="task-name" :title="taskName(task)">{{ taskName(task) }}</span>
                  <span class="task-state">{{ t(I18N_KEYS.RESOURCE_ITEM.WAITING) }}</span>
                </div>
                <span v-if="task.totalBytes !== null" class="task-metrics">
                  {{ taskTotalSizeText(task) }}
                </span>
              </div>
              <button
                type="button"
                class="cancel-button"
                :aria-label="cancelLabel(task)"
                :title="cancelLabel(task)"
                :disabled="isCancelDisabled(task)"
                @click="store.cancelTask(task.taskId)"
              >
                <Icon :name="IconName.X_MARK" :size="IconSize.XS" />
              </button>
            </li>
          </ul>
        </section>

        <section v-if="store.failedTasks.length > 0" class="task-section failed-section">
          <h3>{{ t(I18N_KEYS.DOWNLOAD_STATUS.FAILED_COUNT, { count: store.failedCount }) }}</h3>
          <ul class="task-list">
            <li v-for="task in store.failedTasks" :key="task.taskId" class="task-row">
              <Icon
                :name="typePresentation(task).icon"
                :size="IconSize.SM"
                :color="typePresentation(task).color"
              />
              <div class="task-content">
                <div class="task-title-row">
                  <span class="task-name" :title="taskName(task)">{{ taskName(task) }}</span>
                  <span class="task-state failed-state">
                    {{ t(I18N_KEYS.DOWNLOAD_STATUS.FAILED) }}
                  </span>
                </div>
                <span v-if="task.totalBytes !== null" class="task-metrics">
                  {{ taskTotalSizeText(task) }}
                </span>
              </div>
              <button
                type="button"
                class="retry-button"
                :aria-label="retryLabel(task)"
                :title="retryLabel(task)"
                @click="store.retryTask(task.taskId)"
              >
                <Icon :name="IconName.ARROW_PATH" :size="IconSize.XS" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import type { DownloadTaskSnapshot } from '@/core/types'
import { formatDownloadBytes, formatDownloadSpeed } from '@/core/utils/downloadStatus'
import { useDownloadStatusStore } from '@/popup/stores/downloadStatusStore'
import {
  getResourceTypePresentation,
  type ResourceTypePresentation
} from '@/popup/utils/resourcePresentation'

/** 固定 Popover 根节点，用于点击外部关闭。 */
const container = ref<HTMLElement | null>(null)

/** 关闭后需要恢复焦点的触发按钮。 */
const trigger = ref<HTMLButtonElement | null>(null)

/** 下载列表是否展开。 */
const showPopover = ref(false)

/** 当前目标页面下载状态。 */
const store = useDownloadStatusStore()

/** 当前界面翻译函数。 */
const { t } = useI18n()

/** 顶部未知进度使用统一省略号。 */
const progressText = computed(() =>
  summaryProgress.value === null
    ? t(I18N_KEYS.DOWNLOAD_STATUS.UNKNOWN_PROGRESS)
    : t(I18N_KEYS.DOWNLOAD_STATUS.PROGRESS, { progress: summaryProgress.value })
)

/** 下载中和失败任务共同构成顶部当前数量。 */
const summaryCurrentCount = computed(() => store.currentCount + store.failedCount)

/** 顶部沿用当前活动下载的进度。 */
const summaryProgress = computed(() => store.currentProgress)

/** 顶部按钮和 aria-live 共用的完整状态说明。 */
const summaryLabel = computed(() => {
  const params = {
    downloading: store.activeCount,
    waiting: store.waitingCount,
    failed: store.failedCount,
    progress: progressText.value
  }
  return t(I18N_KEYS.DOWNLOAD_STATUS.SUMMARY, params)
})

/** 展开或收起任务列表。 */
function togglePopover(): void {
  showPopover.value = !showPopover.value
}

/** 收起任务列表，并按需把键盘焦点还给触发按钮。 */
function closePopover(restoreFocus = false): void {
  if (!showPopover.value) {
    return
  }
  showPopover.value = false
  if (restoreFocus) {
    trigger.value?.focus()
  }
}

/** 点击组件外部时收起列表。 */
function handlePointerDown(event: PointerEvent): void {
  const root = container.value
  if (root && !event.composedPath().includes(root)) {
    closePopover()
  }
}

/** Escape 收起列表并恢复焦点。 */
function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closePopover(true)
  }
}

/** 返回任务媒体类型的统一 Popup 展示属性。 */
function typePresentation(task: DownloadTaskSnapshot): ResourceTypePresentation {
  return getResourceTypePresentation(task.type)
}

/** 优先显示真实文件名，缺失时生成可区分的本地化类型名称。 */
function taskName(task: DownloadTaskSnapshot): string {
  if (task.filename) {
    return task.filename
  }
  return t(I18N_KEYS.DOWNLOAD_STATUS.RESOLVING_FILENAME)
}

/** 快照存在任一传输指标时才展示指标行。 */
function hasTransferMetrics(task: DownloadTaskSnapshot): boolean {
  return task.receivedBytes !== null || task.totalBytes !== null || task.bytesPerSecond !== null
}

/** 活动任务的已接收/总大小。 */
function taskSizeText(task: DownloadTaskSnapshot): string {
  const received = task.receivedBytes === null ? '--' : formatDownloadBytes(task.receivedBytes)
  const total = task.totalBytes === null ? '--' : formatDownloadBytes(task.totalBytes)
  return `${received} / ${total}`
}

/** 等待任务只展示已知总大小。 */
function taskTotalSizeText(task: DownloadTaskSnapshot): string {
  return task.totalBytes === null ? '--' : formatDownloadBytes(task.totalBytes)
}

/** 活动任务的精确或估算速度。 */
function taskSpeedText(task: DownloadTaskSnapshot): string {
  return formatDownloadSpeed(task.bytesPerSecond, task.bytesAreEstimated)
}

/** 单任务取消按钮的本地化可访问名称。 */
function cancelLabel(task: DownloadTaskSnapshot): string {
  return t(I18N_KEYS.DOWNLOAD_STATUS.CANCEL_TASK, { filename: taskName(task) })
}

/** 单任务重试按钮的本地化可访问名称。 */
function retryLabel(task: DownloadTaskSnapshot): string {
  return t(I18N_KEYS.DOWNLOAD_STATUS.RETRY_TASK, { filename: taskName(task) })
}

/** 取消 RPC 返回前禁止重复请求。 */
function isCancelDisabled(task: DownloadTaskSnapshot): boolean {
  return store.cancelRequestIds.includes(task.taskId)
}

/** 单行显示的向下取整百分比或未知进度。 */
function taskProgressText(task: DownloadTaskSnapshot): string {
  return task.progress === null
    ? t(I18N_KEYS.DOWNLOAD_STATUS.UNKNOWN_PROGRESS)
    : t(I18N_KEYS.DOWNLOAD_STATUS.PROGRESS, { progress: Math.floor(task.progress) })
}

/** 原生 progress 的可访问名称。 */
function taskProgressLabel(task: DownloadTaskSnapshot): string {
  return t(I18N_KEYS.DOWNLOAD_STATUS.TASK_PROGRESS, {
    filename: taskName(task),
    progress: Math.floor(task.progress ?? 0)
  })
}

watch(
  () => store.hasTasks,
  hasTasks => {
    if (!hasTasks) {
      closePopover()
    }
  }
)

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.download-status {
  position: relative;
  display: flex;
  align-items: center;
}

.status-trigger {
  width: 72px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid v-bind('COMMON_COLORS.GRAY_300');
  border-radius: 6px;
  background: #ffffff;
  color: v-bind('COMMON_COLORS.GRAY_800');
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.status-trigger:hover,
.status-trigger[aria-expanded='true'] {
  background: v-bind('COMMON_COLORS.GRAY_100');
  border-color: v-bind('COMMON_COLORS.GRAY_400');
}

.status-trigger:focus-visible {
  outline: 2px solid #ffffff;
  box-shadow: 0 0 0 4px v-bind('COMMON_COLORS.PRIMARY');
}

.status-summary {
  min-width: 38px;
  display: grid;
  grid-template-columns: minmax(8px, auto) 4px 28px;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.active-count {
  color: v-bind('COMMON_COLORS.GRAY_900');
  font-weight: 600;
  text-align: right;
}

.summary-separator {
  color: v-bind('COMMON_COLORS.GRAY_400');
  text-align: center;
}

.summary-progress {
  color: v-bind('COMMON_COLORS.GRAY_600');
  text-align: right;
}

.status-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 1000;
  box-sizing: border-box;
  width: 320px;
  max-height: min(360px, calc(100vh - 52px));
  overflow: hidden;
  border: 1px solid v-bind('COMMON_COLORS.GRAY_200');
  border-radius: 8px;
  background: #ffffff;
  transform: translateX(-50%);
  box-shadow:
    0 1px 1px rgba(0, 0, 0, 0.02),
    0 4px 8px -4px rgba(0, 0, 0, 0.04),
    0 16px 24px -8px rgba(0, 0, 0, 0.08);
}

.popover-header {
  height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid v-bind('COMMON_COLORS.GRAY_200');
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.popover-header h2 {
  margin: 0;
  color: v-bind('COMMON_COLORS.GRAY_900');
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  letter-spacing: 0;
}

.total-count {
  color: v-bind('COMMON_COLORS.GRAY_600');
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.task-scroll-area {
  max-height: min(315px, calc(100vh - 97px));
  overflow-y: auto;
}

.task-section h3 {
  margin: 0;
  padding: 10px 12px 6px;
  color: v-bind('COMMON_COLORS.GRAY_600');
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0;
}

.waiting-section {
  border-top: 1px solid v-bind('COMMON_COLORS.GRAY_200');
}

.failed-section {
  border-top: 1px solid v-bind('COMMON_COLORS.GRAY_200');
}

.task-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-row {
  min-height: 54px;
  padding: 8px 12px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.task-row + .task-row {
  border-top: 1px solid v-bind('COMMON_COLORS.GRAY_100');
}

.task-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.task-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.task-name {
  min-width: 0;
  overflow: hidden;
  color: v-bind('COMMON_COLORS.GRAY_900');
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-progress-text,
.task-state {
  flex-shrink: 0;
  color: v-bind('COMMON_COLORS.GRAY_600');
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
}

.task-metrics {
  color: v-bind('COMMON_COLORS.GRAY_600');
  font-size: 11px;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
}

.cancel-button,
.retry-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: v-bind('COMMON_COLORS.PRIMARY');
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cancel-button:hover:not(:disabled),
.retry-button:hover:not(:disabled) {
  background: #f0f7ff;
  color: v-bind('COMMON_COLORS.PRIMARY_DARK');
}

.cancel-button:focus-visible,
.retry-button:focus-visible {
  outline: 2px solid #ffffff;
  box-shadow: 0 0 0 4px v-bind('COMMON_COLORS.PRIMARY');
}

.failed-state {
  color: #d8001b;
  font-weight: 600;
}

.cancel-button:disabled {
  color: v-bind('COMMON_COLORS.GRAY_400');
  cursor: not-allowed;
}

.task-progress {
  width: 100%;
  height: 4px;
  border: 0;
  border-radius: 2px;
  overflow: hidden;
  background: v-bind('COMMON_COLORS.GRAY_200');
}

.task-progress::-webkit-progress-bar {
  background: v-bind('COMMON_COLORS.GRAY_200');
}

.task-progress::-webkit-progress-value {
  background: v-bind('COMMON_COLORS.PRIMARY');
}

.task-progress::-moz-progress-bar {
  background: v-bind('COMMON_COLORS.PRIMARY');
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .status-trigger {
    transition: none;
  }
}
</style>
