<template>
  <Teleport to="body">
    <Transition name="history-fade">
      <div
        v-if="historyViewVisible"
        class="history-overlay"
        role="dialog"
        aria-modal="true"
        :style="colorVars"
      >
        <header class="history-header">
          <h2 class="history-title">{{ t(I18N_KEYS.HISTORY.TITLE) }}</h2>
          <button
            type="button"
            class="history-close"
            :aria-label="t(I18N_KEYS.APP_ERROR.DISMISS)"
            @click="handleClose"
          >
            <Icon :name="IconName.X_MARK" :size="IconSize.SM" />
          </button>
        </header>

        <div class="history-toolbar">
          <input
            v-model="searchQuery"
            class="history-search"
            type="search"
            :placeholder="t(I18N_KEYS.HISTORY.SEARCH_PLACEHOLDER)"
          />
          <select v-model="sortMode" class="history-sort" :aria-label="t(I18N_KEYS.HISTORY.TITLE)">
            <option value="newest">{{ t(I18N_KEYS.HISTORY.SORT_NEWEST) }}</option>
            <option value="oldest">{{ t(I18N_KEYS.HISTORY.SORT_OLDEST) }}</option>
            <option value="titleAsc">{{ t(I18N_KEYS.HISTORY.SORT_TITLE_ASC) }}</option>
            <option value="titleDesc">{{ t(I18N_KEYS.HISTORY.SORT_TITLE_DESC) }}</option>
          </select>
        </div>

        <!-- 危险操作确认条：单条删除与清空共用 -->
        <div v-if="pendingConfirm" class="history-confirm" role="alert">
          <span class="history-confirm-message">{{ confirmMessage }}</span>
          <div class="history-confirm-actions">
            <button type="button" class="history-confirm-cancel" @click="cancelConfirm">
              {{ t(I18N_KEYS.HISTORY.CONFIRM_CANCEL) }}
            </button>
            <button type="button" class="history-confirm-danger" @click="confirmPending">
              {{ confirmActionLabel }}
            </button>
          </div>
        </div>

        <main class="history-body">
          <ul v-if="pageItems.length > 0" class="history-list">
            <li v-for="entry in pageItems" :key="historyEntryKey(entry)" class="history-item">
              <span class="history-item-type" :style="{ color: presentationOf(entry).color }">
                <Icon :name="presentationOf(entry).icon" :size="IconSize.SM" />
              </span>
              <div class="history-item-body">
                <div class="history-item-top">
                  <span class="history-item-name" :title="entry.title">{{ entry.title }}</span>
                  <span
                    class="history-item-status"
                    :class="entry.status === 'success' ? 'is-success' : 'is-failed'"
                  >
                    <Icon
                      :name="entry.status === 'success' ? IconName.CHECK : IconName.X_MARK"
                      :size="IconSize.XS"
                    />
                    {{
                      t(
                        entry.status === 'success'
                          ? I18N_KEYS.HISTORY.STATUS_SUCCESS
                          : I18N_KEYS.HISTORY.STATUS_FAILED
                      )
                    }}
                  </span>
                </div>
                <div class="history-item-meta">
                  <span v-if="entry.author">{{ entry.author }}</span>
                  <span v-if="entry.quality">{{ entry.quality }}</span>
                  <span>{{ relativeTime(entry.downloadedAt) }}</span>
                </div>
              </div>
              <div class="history-item-actions">
                <button
                  v-if="entry.pageUrl"
                  type="button"
                  class="history-item-action"
                  :aria-label="t(I18N_KEYS.HISTORY.OPEN_PAGE)"
                  :title="t(I18N_KEYS.HISTORY.OPEN_PAGE)"
                  @click="openEntryPage(entry)"
                >
                  <Icon
                    class="history-icon-right"
                    :name="IconName.CHEVRON_DOWN"
                    :size="IconSize.XS"
                  />
                </button>
                <button
                  type="button"
                  class="history-item-action is-danger"
                  :aria-label="t(I18N_KEYS.HISTORY.DELETE_ENTRY)"
                  :title="t(I18N_KEYS.HISTORY.DELETE_ENTRY)"
                  @click="askDeleteEntry(entry)"
                >
                  <Icon :name="IconName.TRASH" :size="IconSize.XS" />
                </button>
              </div>
            </li>
          </ul>
          <div v-else class="history-empty">
            <Icon :name="IconName.INBOX" :size="IconSize.XL" />
            <p class="history-empty-message">
              {{ t(entries.length > 0 ? I18N_KEYS.HISTORY.EMPTY_SEARCH : I18N_KEYS.HISTORY.EMPTY) }}
            </p>
          </div>
        </main>

        <footer class="history-footer">
          <div class="history-footer-actions">
            <button
              type="button"
              class="history-footer-button"
              :disabled="visibleEntries.length === 0"
              @click="exportCsv"
            >
              {{ t(I18N_KEYS.HISTORY.EXPORT_CSV) }}
            </button>
            <button
              type="button"
              class="history-footer-button is-danger"
              :disabled="entries.length === 0"
              @click="askClearAll"
            >
              {{ t(I18N_KEYS.HISTORY.CLEAR_ALL) }}
            </button>
          </div>
          <div v-if="totalPages > 1" class="history-pagination">
            <button
              type="button"
              class="history-item-action"
              :disabled="currentPage <= 1"
              :aria-label="t(I18N_KEYS.HISTORY.PREV_PAGE)"
              @click="currentPage -= 1"
            >
              <Icon class="history-icon-prev" :name="IconName.CHEVRON_DOWN" :size="IconSize.XS" />
            </button>
            <span class="history-page-indicator">
              {{ t(I18N_KEYS.HISTORY.PAGE_INDICATOR, { page: currentPage, total: totalPages }) }}
            </span>
            <button
              type="button"
              class="history-item-action"
              :disabled="currentPage >= totalPages"
              :aria-label="t(I18N_KEYS.HISTORY.NEXT_PAGE)"
              @click="currentPage += 1"
            >
              <Icon class="history-icon-next" :name="IconName.CHEVRON_DOWN" :size="IconSize.XS" />
            </button>
          </div>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Popup 内下载历史视图。
 *
 * 数据来自 background 编排器的任务终态回写（成功/失败各一条语义），本视图只消费存储：
 * 搜索（标题/作者）、排序（四种）、分页（20/页）、单删/清空（内联确认）、CSV 导出
 * （导出当前过滤+排序后的可见记录）。组件根节点是 Teleport，Vue 的 style v-bind()
 * （useCssVars）会把变量挂到 Teleport 锚点而非真实 DOM（PremiumView 同坑），因此颜色
 * 用 COMMON_COLORS 显式声明成覆盖层根节点上的 CSS 变量向下级联。
 */

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon, IconName, IconSize } from '@/core/components/icons'
import { I18N_KEYS } from '@/core/constants/i18n'
import { COMMON_COLORS } from '@/core/constants/style'
import { logger } from '@/core/utils/logger'
import { openExternalPage } from '@/core/utils/navigation'
import {
  buildHistoryKey,
  clearDownloadHistory,
  getDownloadHistory,
  removeDownloadHistoryEntry,
  type DownloadHistoryEntry
} from '@/core/storage/downloadHistory'
import { closeHistoryView, historyViewVisible } from '@/core/composables/historyView'
import {
  countHistoryPages,
  filterHistoryEntries,
  formatRelativeTime,
  paginateHistoryEntries,
  sortHistoryEntries,
  type HistorySortMode
} from '@/popup/utils/historyPresentation'
import {
  buildHistoryCsv,
  buildHistoryCsvFilename,
  type HistoryCsvHeaders
} from '@/popup/utils/historyCsv'
import { getResourceTypePresentation } from '@/popup/utils/resourcePresentation'

const { t, locale } = useI18n()

/** 覆盖层根节点显式级联的颜色变量（Teleport 子树拿不到 useCssVars 变量）。 */
const colorVars = {
  '--history-primary': COMMON_COLORS.PRIMARY,
  '--history-gray-50': COMMON_COLORS.GRAY_50,
  '--history-gray-100': COMMON_COLORS.GRAY_100,
  '--history-gray-200': COMMON_COLORS.GRAY_200,
  '--history-gray-300': COMMON_COLORS.GRAY_300,
  '--history-gray-400': COMMON_COLORS.GRAY_400,
  '--history-gray-500': COMMON_COLORS.GRAY_500,
  '--history-gray-800': COMMON_COLORS.GRAY_800,
  '--history-gray-900': COMMON_COLORS.GRAY_900,
  '--history-error': COMMON_COLORS.ERROR,
  '--history-error-bg': COMMON_COLORS.ERROR_BG,
  '--history-success': COMMON_COLORS.SUCCESS,
  '--history-success-bg': COMMON_COLORS.SUCCESS_BG
}

/** 全部历史记录；null 表示尚未加载完成。 */
const entries = ref<DownloadHistoryEntry[]>([])
const searchQuery = ref('')
const sortMode = ref<HistorySortMode>('newest')
const currentPage = ref(1)
/** 待确认的单条删除记录键；与清空互斥。 */
const pendingDeleteKey = ref<string | null>(null)
const pendingClear = ref(false)

const visibleEntries = computed(() =>
  sortHistoryEntries(filterHistoryEntries(entries.value, searchQuery.value), sortMode.value)
)

const totalPages = computed(() => countHistoryPages(visibleEntries.value.length))

const pageItems = computed(
  () => paginateHistoryEntries(visibleEntries.value, currentPage.value).items
)

/** 当前是否有待确认的危险操作。 */
const pendingConfirm = computed(() => pendingDeleteKey.value !== null || pendingClear.value)

const confirmMessage = computed(() => {
  if (pendingDeleteKey.value !== null) {
    return t(I18N_KEYS.HISTORY.CONFIRM_DELETE_MESSAGE)
  }
  return t(I18N_KEYS.HISTORY.CONFIRM_CLEAR_MESSAGE, { count: entries.value.length })
})

const confirmActionLabel = computed(() =>
  pendingDeleteKey.value !== null
    ? t(I18N_KEYS.HISTORY.CONFIRM_DELETE)
    : t(I18N_KEYS.HISTORY.CONFIRM_CLEAR)
)

// 每次打开都重置视图状态并从存储回读，保证与最近终态回写一致。
watch(historyViewVisible, async visible => {
  if (!visible) {
    return
  }

  searchQuery.value = ''
  sortMode.value = 'newest'
  currentPage.value = 1
  cancelConfirm()
  entries.value = await getDownloadHistory()
})

// 搜索与排序变化回到第一页；记录减少导致页码越界时收敛到最后一页。
watch([searchQuery, sortMode], () => {
  currentPage.value = 1
})
watch(totalPages, total => {
  if (currentPage.value > total) {
    currentPage.value = total
  }
})

/** 类型展示属性（图标 + 徽章色）。 */
function presentationOf(entry: DownloadHistoryEntry) {
  return getResourceTypePresentation(entry.type)
}

/** 单条记录唯一标识（同键去重保证键即身份）。 */
function historyEntryKey(entry: DownloadHistoryEntry): string {
  return buildHistoryKey(entry)
}

/** 相对时间文案，按当前界面语言本地化。 */
function relativeTime(timestamp: number): string {
  return formatRelativeTime(timestamp, locale.value, Date.now())
}

/** 在新标签页打开下载发起页。 */
function openEntryPage(entry: DownloadHistoryEntry): void {
  if (entry.pageUrl) {
    void openExternalPage(entry.pageUrl, 'history')
  }
}

function askDeleteEntry(entry: DownloadHistoryEntry): void {
  pendingClear.value = false
  pendingDeleteKey.value = buildHistoryKey(entry)
}

function askClearAll(): void {
  pendingDeleteKey.value = null
  pendingClear.value = true
}

function cancelConfirm(): void {
  pendingDeleteKey.value = null
  pendingClear.value = false
}

/** 执行待确认操作后回读存储刷新列表。 */
async function confirmPending(): Promise<void> {
  try {
    if (pendingDeleteKey.value !== null) {
      await removeDownloadHistoryEntry(pendingDeleteKey.value)
    } else if (pendingClear.value) {
      await clearDownloadHistory()
    }
  } finally {
    cancelConfirm()
    entries.value = await getDownloadHistory()
  }
}

/** 导出当前可见（已过滤排序）记录为 CSV，交给 Chrome 下载管理器保存。 */
async function exportCsv(): Promise<void> {
  if (visibleEntries.value.length === 0) {
    return
  }

  const headers: HistoryCsvHeaders = [
    t(I18N_KEYS.HISTORY.COLUMN_DATE),
    t(I18N_KEYS.HISTORY.COLUMN_TITLE),
    t(I18N_KEYS.HISTORY.COLUMN_AUTHOR),
    t(I18N_KEYS.HISTORY.COLUMN_TYPE),
    t(I18N_KEYS.HISTORY.COLUMN_QUALITY),
    t(I18N_KEYS.HISTORY.COLUMN_STATUS),
    t(I18N_KEYS.HISTORY.COLUMN_FILENAME),
    t(I18N_KEYS.HISTORY.COLUMN_PAGE_URL)
  ]
  const csv = buildHistoryCsv(visibleEntries.value, headers)
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))

  try {
    await chrome.downloads.download({
      url: blobUrl,
      filename: buildHistoryCsvFilename(new Date()),
      conflictAction: 'uniquify',
      saveAs: false
    })
  } catch (error) {
    logger.error('[HistoryView] 导出 CSV 失败', error)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

function handleClose(): void {
  closeHistoryView()
}
</script>

<style scoped>
.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  box-sizing: border-box;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--history-gray-200);
  background: var(--history-gray-50);
}

.history-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--history-gray-900);
}

.history-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--history-gray-500);
  cursor: pointer;
}

.history-close:hover {
  background: var(--history-gray-200);
  color: var(--history-gray-800);
}

.history-toolbar {
  display: flex;
  gap: 8px;
  padding: 10px 12px 0;
}

.history-search {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--history-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--history-gray-900);
  font-size: 12px;
  box-sizing: border-box;
}

.history-search:focus {
  outline: 2px solid rgba(37, 99, 235, 0.2);
  border-color: var(--history-primary);
}

.history-sort {
  min-height: 32px;
  padding: 0 6px;
  border: 1px solid var(--history-gray-300);
  border-radius: 8px;
  background: #ffffff;
  color: var(--history-gray-900);
  font-size: 12px;
  cursor: pointer;
}

.history-sort:focus {
  outline: 2px solid rgba(37, 99, 235, 0.2);
  border-color: var(--history-primary);
}

.history-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 12px 0;
  padding: 8px 10px;
  border: 1px solid var(--history-error);
  border-radius: 8px;
  background: var(--history-error-bg);
}

.history-confirm-message {
  font-size: 12px;
  color: var(--history-gray-900);
}

.history-confirm-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.history-confirm-cancel,
.history-confirm-danger {
  min-height: 26px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.history-confirm-cancel {
  border: 1px solid var(--history-gray-300);
  background: #ffffff;
  color: var(--history-gray-800);
}

.history-confirm-danger {
  border: none;
  background: var(--history-error);
  color: #ffffff;
}

.history-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
}

.history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--history-gray-200);
  border-radius: 8px;
  background: #ffffff;
}

.history-item-type {
  display: flex;
  align-items: center;
  padding-top: 1px;
}

.history-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.history-item-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--history-gray-900);
}

.history-item-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}

.history-item-status.is-success {
  background: var(--history-success-bg);
  color: var(--history-success);
}

.history-item-status.is-failed {
  background: var(--history-error-bg);
  color: var(--history-error);
}

.history-item-meta {
  display: flex;
  gap: 6px;
  overflow: hidden;
  font-size: 11px;
  color: var(--history-gray-500);
}

.history-item-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.history-item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--history-gray-500);
  cursor: pointer;
}

.history-item-action:hover:not(:disabled) {
  background: var(--history-gray-100);
  color: var(--history-gray-800);
}

.history-item-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.history-item-action.is-danger:hover:not(:disabled) {
  background: var(--history-error-bg);
  color: var(--history-error);
}

.history-icon-right {
  transform: rotate(-90deg);
}

.history-icon-prev {
  transform: rotate(90deg);
}

.history-icon-next {
  transform: rotate(-90deg);
}

.history-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--history-gray-400);
  text-align: center;
}

.history-empty-message {
  margin: 0;
  max-width: 220px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--history-gray-500);
}

.history-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--history-gray-200);
  background: var(--history-gray-50);
}

.history-footer-actions {
  display: flex;
  gap: 6px;
}

.history-footer-button {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--history-gray-300);
  border-radius: 6px;
  background: #ffffff;
  font-size: 12px;
  font-weight: 600;
  color: var(--history-gray-800);
  cursor: pointer;
}

.history-footer-button:hover:not(:disabled) {
  border-color: var(--history-primary);
  color: var(--history-primary);
}

.history-footer-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history-footer-button.is-danger:hover:not(:disabled) {
  border-color: var(--history-error);
  color: var(--history-error);
}

.history-pagination {
  display: flex;
  align-items: center;
  gap: 4px;
}

.history-page-indicator {
  min-width: 42px;
  text-align: center;
  font-size: 11px;
  color: var(--history-gray-500);
}

.history-fade-enter-active,
.history-fade-leave-active {
  transition: opacity 0.18s ease;
}

.history-fade-enter-from,
.history-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .history-fade-enter-active,
  .history-fade-leave-active {
    transition: none;
  }
}
</style>
