/**
 * Popup 当前标签页资源 Store。
 *
 * Popup 生命周期内只记录一个目标 tabId。打开和刷新都通过 request-response 整体替换资源，
 * 不订阅页面资源或下载状态，也不恢复跨 Popup 生命周期的状态。面板每次只下载用户选中的
 * 单个档位，因此这里不保留任何选择集状态。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { I18nService } from '@/locales'
import { logger } from '@/core/utils/logger'
import { I18N_KEYS } from '@/core/constants/i18n'
import type { MediaResource } from '@/core/types'
import { ContentChannel } from '@/popup/rpc/content.rpc'

/** Popup 调用当前 tab content provider 的 RPC 客户端。 */
const contentClient = new ContentChannel()

/** 当前 Popup 的资源状态。 */
export const useResourceStore = defineStore('resource', () => {
  /** content 返回的当前 tab 资源，顺序不做二次排序。 */
  const resources = ref<MediaResource[]>([])

  /**
   * 当前是否正在查询资源。
   *
   * 初值为 true：Popup 挂载后到 `initialize` 落定之前，Store 还没有关于当前标签页的任何
   * 结论，面板必须先按「处理中」呈现。否则这一小段窗口会先渲染出「不是 Vimeo 页面」的
   * 引导态，在 Vimeo 页面上也是错的。
   */
  const loading = ref(true)

  /** 最近一次查询或命令错误。 */
  const error = ref<string | null>(null)

  /**
   * Popup 打开后固定使用的目标 tab，不随活动标签页变化。
   *
   * 用 ref 而不是普通变量：`hasTargetTab` 是它的派生值，普通变量不会触发 computed 失效，
   * 面板会一直停在首次求值的结果上。
   */
  const targetTabId = ref<number | null>(null)

  /** 当前是否有资源。 */
  const hasResources = computed(() => resources.value.length > 0)

  /**
   * 是否已固定到站点标签页。
   *
   * 为 false 即「Popup 打开时当前页不是站点页面且没有其它站点标签页」，面板据此呈现跳转
   * 引导；此时 error 里的未连接文案由引导态取代，不再作为错误条渲染。
   */
  const hasTargetTab = computed(() => targetTabId.value !== null)

  /** 返回 Popup 打开时固定的目标 tabId。 */
  function requireTargetTabId(): number {
    if (targetTabId.value === null) {
      throw new Error(I18nService.t(I18N_KEYS.STORE_ERROR.TAB_NOT_FOUND))
    }
    return targetTabId.value
  }

  /**
   * 记录 Popup 打开时最终选定的 tab，并查询一次资源。
   *
   * @param tab ensureSupportedTabOpen 返回的最终目标 tab
   */
  async function initialize(tab: chrome.tabs.Tab | null): Promise<void> {
    targetTabId.value = tab?.id ?? null
    await fetchResources()
  }

  /** 从固定 tab 查询当前资源并整体替换列表。 */
  async function fetchResources(): Promise<void> {
    loading.value = true
    error.value = null
    resources.value = []

    try {
      // Popup 打开时没有站点标签页属于预期情形（用户在任意非站点页面点开 Popup）：这里只
      // 写入未连接文案，面板按 hasTargetTab 呈现跳转引导态，不把它当错误条渲染。
      if (targetTabId.value === null) {
        error.value = I18nService.t(I18N_KEYS.STORE_ERROR.TAB_NOT_FOUND)
        logger.warn('[resourceStore] 当前没有可用的站点标签页，跳过资源查询')
        return
      }

      const result = await contentClient.getResources({ tabId: targetTabId.value })
      resources.value = [...result.resources]
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error &&
        caughtError.message.includes('Could not establish connection')
          ? I18nService.t(I18N_KEYS.STORE_ERROR.CONTENT_SCRIPT_NOT_CONNECTED)
          : I18nService.t(I18N_KEYS.STORE_ERROR.FETCH_FAILED)
      logger.error('[resourceStore] 查询当前标签页资源失败:', caughtError)
    } finally {
      loading.value = false
    }
  }

  /**
   * 下载面板选中的单个资源；片段区间已由面板并入资源身份。
   *
   * `accepted: false` 表示 content 侧一个资源都没回查到（页面已切换视频等），此时队列里不会
   * 出现任何任务，必须在这里给出反馈，否则用户看到的是「点了没反应」。
   */
  async function downloadResource(resource: MediaResource): Promise<void> {
    error.value = null
    try {
      const response = await contentClient.downloadBatch(
        { resourceIds: [resource.id] },
        { tabId: requireTargetTabId() }
      )
      if (!response.accepted) {
        error.value = I18nService.t(I18N_KEYS.STORE_ERROR.DOWNLOAD_FAILED)
        logger.error(`[resourceStore] 下载请求未被受理: resourceId=${resource.id}`)
      }
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error &&
        caughtError.message.includes('Could not establish connection')
          ? I18nService.t(I18N_KEYS.STORE_ERROR.CONTENT_SCRIPT_NOT_CONNECTED)
          : I18nService.t(I18N_KEYS.STORE_ERROR.DOWNLOAD_FAILED)
      logger.error('[resourceStore] 当前标签页下载请求失败:', caughtError)
    }
  }

  /** 使用固定 tab 重新查询，不读取此时的活动标签页。 */
  async function refresh(): Promise<void> {
    await fetchResources()
  }

  return {
    resources,
    loading,
    error,
    hasResources,
    hasTargetTab,
    initialize,
    fetchResources,
    downloadResource,
    refresh
  }
})
