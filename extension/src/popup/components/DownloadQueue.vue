<!--
  Popup 底部下载管理区（对齐竞品形态：任务队列平铺在 popup 底部，不再做顶部入口 + 浮层）。

  有未完成任务时常驻渲染，无任务时不渲染任何节点（footer 直接回归底部）。
  布局取舍：App.vue 的 app-container 是 max-height 600px 的纵向 flex，VideoPanel 主内容
  flex:1 内部滚动，本组件 flex-shrink:0 固定可见；任务列表自身再限制 max-height 内部滚动，
  任务很多时挤压主内容而不是把 footer 顶出 popup。
  下载统一由 background 编排器驱动：下载中任务经 background 取消执行通道（Chrome
  downloads.cancel / offscreen cancelTask）可中途停止，等待任务直接出队；「全部停止」
  遍历等待 + 下载中全部可停任务，失败行只有重试能力。
-->
<template>
  <section v-if="store.hasTasks" class="download-queue" role="region" :aria-label="queueTitle">
    <header class="queue-header">
      <h2 class="queue-title">{{ queueTitle }}</h2>
      <button v-if="hasStoppableTasks" type="button" class="stop-all-button" @click="stopAllTasks">
        {{ t(I18N_KEYS.DOWNLOAD_STATUS.STOP_ALL) }}
      </button>
    </header>

    <div class="queue-scroll">
      <section v-if="store.activeTasks.length > 0" class="task-group">
        <h3 class="group-title">
          {{
            t(I18N_KEYS.DOWNLOAD_STATUS.DOWNLOADING_COUNT, {
              count: store.activeCount
            })
          }}
        </h3>
        <ul class="task-list">
          <li v-for="task in store.activeTasks" :key="task.taskId" class="task-card">
            <Icon
              :name="typePresentation(task).icon"
              :size="IconSize.SM"
              :color="typePresentation(task).color"
            />
            <div class="task-body">
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
            <button
              type="button"
              class="task-action"
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

      <section v-if="store.waitingTasks.length > 0" class="task-group">
        <h3 class="group-title">
          {{
            t(I18N_KEYS.DOWNLOAD_STATUS.WAITING_COUNT, {
              count: store.waitingCount
            })
          }}
        </h3>
        <ul class="task-list">
          <li v-for="task in store.waitingTasks" :key="task.taskId" class="task-card">
            <Icon
              :name="typePresentation(task).icon"
              :size="IconSize.SM"
              :color="typePresentation(task).color"
            />
            <div class="task-body">
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
              class="task-action"
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

      <section v-if="store.failedTasks.length > 0" class="task-group">
        <h3 class="group-title">
          {{ t(I18N_KEYS.DOWNLOAD_STATUS.FAILED_COUNT, { count: store.failedCount }) }}
        </h3>
        <ul class="task-list">
          <li v-for="task in store.failedTasks" :key="task.taskId" class="task-card">
            <Icon
              :name="typePresentation(task).icon"
              :size="IconSize.SM"
              :color="typePresentation(task).color"
            />
            <div class="task-body">
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
              class="task-action"
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
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { DESIGN_TOKENS } from '@/core/constants/design'
import type { DownloadTaskSnapshot } from '@/core/types'
import { formatDownloadBytes, formatDownloadSpeed } from '@/core/utils/downloadStatus'
import { useDownloadStatusStore } from '@/popup/stores/downloadStatusStore'
import {
  getResourceTypePresentation,
  type ResourceTypePresentation
} from '@/popup/utils/resourcePresentation'

/** 当前目标页面下载状态。 */
const store = useDownloadStatusStore()

/** 当前界面翻译函数。 */
const { t } = useI18n()

/** 底部队列标题与区域可访问名称共用同一个「队列 (N)」文案。 */
const queueTitle = computed(() => t(I18N_KEYS.DOWNLOAD_STATUS.TITLE, { count: store.totalCount }))

/** 存在等待或下载中任务时才提供「全部停止」。 */
const hasStoppableTasks = computed(() => store.waitingCount + store.activeCount > 0)

/** 全部停止：逐个取消全部等待与下载中任务；cancelTask 内部自带去重与失败日志。 */
function stopAllTasks(): void {
  for (const task of [...store.waitingTasks, ...store.activeTasks]) {
    void store.cancelTask(task.taskId)
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
</script>

<style scoped>
/* 底部常驻区：固定在 footer 之上，主内容（VideoPanel）负责滚动 */
.download-queue {
  flex-shrink: 0;
  border-top: 1px solid v-bind('DESIGN_TOKENS.GRAY_ALPHA_400');
  background: v-bind('DESIGN_TOKENS.BG_100');
}

.queue-header {
  height: 36px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.queue-title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
  font-size: v-bind('DESIGN_TOKENS.FS_13');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-weight: v-bind('DESIGN_TOKENS.FW_600');
}

/* 破坏性操作按 design.md button-error：red-800 实底白字，hover 沿色阶走到 red-900 */
.stop-all-button {
  flex-shrink: 0;
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: v-bind('DESIGN_TOKENS.RED_800');
  color: v-bind('DESIGN_TOKENS.BG_100');
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-weight: v-bind('DESIGN_TOKENS.FW_500');
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.stop-all-button:hover {
  background: v-bind('DESIGN_TOKENS.RED_900');
}

.stop-all-button:focus-visible {
  outline: none;
  box-shadow: v-bind('DESIGN_TOKENS.FOCUS_RING');
}

/*
 * 任务列表滚动上限：约三张卡片的高度；更多任务在列表内滚动，
 * 保证主内容区不被底部区挤没。
 */
.queue-scroll {
  max-height: 180px;
  overflow-y: auto;
}

.queue-scroll::-webkit-scrollbar {
  width: 6px;
}

.queue-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.queue-scroll::-webkit-scrollbar-thumb {
  background: v-bind('DESIGN_TOKENS.GRAY_500');
  border-radius: 3px;
}

.queue-scroll::-webkit-scrollbar-thumb:hover {
  background: v-bind('DESIGN_TOKENS.GRAY_600');
}

.group-title {
  margin: 0;
  padding: 8px 16px 4px;
  color: v-bind('DESIGN_TOKENS.GRAY_900');
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-weight: v-bind('DESIGN_TOKENS.FW_500');
}

.task-list {
  margin: 0;
  padding: 0 0 4px;
  list-style: none;
}

.task-card {
  padding: 6px 16px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.task-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-progress-text,
.task-state {
  flex-shrink: 0;
  color: v-bind('DESIGN_TOKENS.GRAY_900');
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-variant-numeric: tabular-nums;
}

.task-metrics {
  color: v-bind('DESIGN_TOKENS.GRAY_700');
  font-size: v-bind('DESIGN_TOKENS.FS_12');
  line-height: v-bind('DESIGN_TOKENS.LH_16');
  font-variant-numeric: tabular-nums;
}

.failed-state {
  color: v-bind('DESIGN_TOKENS.RED_900');
  font-weight: v-bind('DESIGN_TOKENS.FW_600');
}

.task-progress {
  width: 100%;
  height: 4px;
  border: 0;
  border-radius: 2px;
  overflow: hidden;
  background: v-bind('DESIGN_TOKENS.GRAY_200');
}

.task-progress::-webkit-progress-bar {
  background: v-bind('DESIGN_TOKENS.GRAY_200');
}

.task-progress::-webkit-progress-value {
  background: v-bind('DESIGN_TOKENS.BLUE_700');
}

.task-progress::-moz-progress-bar {
  background: v-bind('DESIGN_TOKENS.BLUE_700');
}

.task-action {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: v-bind('DESIGN_TOKENS.RADIUS_SM');
  background: transparent;
  color: v-bind('DESIGN_TOKENS.GRAY_900');
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.task-action:hover:not(:disabled) {
  background: v-bind('DESIGN_TOKENS.GRAY_100');
  color: v-bind('DESIGN_TOKENS.GRAY_1000');
}

.task-action:focus-visible {
  outline: none;
  box-shadow: v-bind('DESIGN_TOKENS.FOCUS_RING');
}

.task-action:disabled {
  color: v-bind('DESIGN_TOKENS.GRAY_700');
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .stop-all-button,
  .task-action {
    transition: none;
  }
}
</style>
