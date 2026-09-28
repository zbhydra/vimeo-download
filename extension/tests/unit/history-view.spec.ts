/**
 * Popup 下载历史视图测试。
 *
 * 列表渲染与状态标记、搜索过滤、分页、单删/清空的内联确认、空态与 CSV 导出触发。
 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TRANSLATIONS from '@/locales/messages'

const mocks = vi.hoisted(() => ({
  getDownloadHistory: vi.fn(),
  removeDownloadHistoryEntry: vi.fn(),
  clearDownloadHistory: vi.fn(),
  download: vi.fn()
}))

vi.mock('@/core/storage/downloadHistory', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/storage/downloadHistory')>(
    '../../src/core/storage/downloadHistory'
  )
  return {
    ...actual,
    getDownloadHistory: mocks.getDownloadHistory,
    removeDownloadHistoryEntry: mocks.removeDownloadHistoryEntry,
    clearDownloadHistory: mocks.clearDownloadHistory
  }
})

import { RESOURCE_TYPES } from '@/core/constants/resource'
import {
  buildHistoryKey,
  type DownloadHistoryEntry
} from '@/core/storage/downloadHistory'
import { openHistoryView, historyViewVisible } from '@/core/composables/historyView'
import HistoryView from '@/popup/components/HistoryView.vue'

function makeEntry(overrides: Partial<DownloadHistoryEntry> = {}): DownloadHistoryEntry {
  return {
    videoId: '1',
    title: 'My Video',
    type: RESOURCE_TYPES.VIDEO,
    quality: '1080p',
    status: 'success',
    pageUrl: 'https://vimeo.com/1',
    filename: 'my-video-1080p.mp4',
    downloadedAt: Date.UTC(2026, 8, 28, 12, 0, 0),
    ...overrides
  }
}

/** 挂载视图并打开；visible 由真实 historyView composable 驱动。 */
async function mountOpened(): Promise<VueWrapper> {
  const wrapper = mount(HistoryView, {
    attachTo: document.body,
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': TRANSLATIONS['en-US'] } })],
      stubs: { Icon: true, Teleport: true, Transition: false }
    }
  })
  openHistoryView()
  await flushPromises()
  return wrapper
}

describe('HistoryView', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.download.mockResolvedValue(1)
    vi.spyOn(chrome.downloads, 'download').mockImplementation(mocks.download)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    historyViewVisible.value = false
  })

  it('渲染记录：类型图标、状态标记、作者/档位/相对时间与打开原页入口', async () => {
    mocks.getDownloadHistory.mockResolvedValue([
      makeEntry({ status: 'success' }),
      makeEntry({ videoId: '2', title: 'Broken', status: 'failed', pageUrl: undefined })
    ])
    wrapper = await mountOpened()

    const items = wrapper.findAll('.history-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('My Video')
    expect(items[0].text()).toContain('Completed')
    expect(items[0].text()).toContain('1080p')
    expect(items[0].findAll('.history-item-action')).toHaveLength(2)
    expect(items[1].text()).toContain('Failed')
    // 无 pageUrl 的失败记录不渲染打开原页入口。
    expect(items[1].findAll('.history-item-action')).toHaveLength(1)
  })

  it('搜索过滤标题；无结果展示搜索空态', async () => {
    mocks.getDownloadHistory.mockResolvedValue([makeEntry(), makeEntry({ videoId: '2', title: 'Other' })])
    wrapper = await mountOpened()

    await wrapper.get('.history-search').setValue('other')
    expect(wrapper.findAll('.history-item')).toHaveLength(1)

    await wrapper.get('.history-search').setValue('missing')
    expect(wrapper.findAll('.history-item')).toHaveLength(0)
    expect(wrapper.text()).toContain('No records match your search.')
  })

  it('单条删除：先出确认条，确认后调用删除并刷新', async () => {
    const entry = makeEntry()
    mocks.getDownloadHistory
      .mockResolvedValueOnce([entry])
      .mockResolvedValueOnce([])

    wrapper = await mountOpened()
    await wrapper.get('.history-item .is-danger').trigger('click')
    expect(wrapper.find('.history-confirm').exists()).toBe(true)
    expect(wrapper.find('.history-confirm-message').text()).toContain('Delete this record?')

    await wrapper.get('.history-confirm-danger').trigger('click')
    await flushPromises()

    expect(mocks.removeDownloadHistoryEntry).toHaveBeenCalledWith(buildHistoryKey(entry))
    expect(mocks.clearDownloadHistory).not.toHaveBeenCalled()
    expect(wrapper.find('.history-confirm').exists()).toBe(false)
  })

  it('清空：确认后调用清空；取消不做任何事', async () => {
    mocks.getDownloadHistory
      .mockResolvedValueOnce([makeEntry(), makeEntry({ videoId: '2' })])
      .mockResolvedValueOnce([])

    wrapper = await mountOpened()
    await wrapper.get('.history-footer .is-danger').trigger('click')
    expect(wrapper.find('.history-confirm-message').text()).toContain('Clear all 2 records?')

    await wrapper.get('.history-confirm-cancel').trigger('click')
    expect(mocks.clearDownloadHistory).not.toHaveBeenCalled()
    expect(wrapper.find('.history-confirm').exists()).toBe(false)

    await wrapper.get('.history-footer .is-danger').trigger('click')
    await wrapper.get('.history-confirm-danger').trigger('click')
    await flushPromises()

    expect(mocks.clearDownloadHistory).toHaveBeenCalledTimes(1)
  })

  it('超过一页时显示分页，翻页切换条目', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      makeEntry({ videoId: String(i), title: `Video ${i}` })
    )
    mocks.getDownloadHistory.mockResolvedValue(many)
    wrapper = await mountOpened()

    expect(wrapper.findAll('.history-item')).toHaveLength(20)
    expect(wrapper.text()).toContain('1 / 2')

    const paginationButtons = wrapper.findAll('.history-pagination .history-item-action')
    await paginationButtons[1].trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.history-item')).toHaveLength(5)
    expect(wrapper.text()).toContain('2 / 2')
  })

  it('空历史展示引导空态', async () => {
    mocks.getDownloadHistory.mockResolvedValue([])
    wrapper = await mountOpened()

    expect(wrapper.find('.history-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('No downloads yet.')
  })

  it('导出 CSV：把当前可见记录交给 Chrome 下载管理器', async () => {
    mocks.getDownloadHistory.mockResolvedValue([
      makeEntry(),
      makeEntry({ videoId: '2', title: 'Hidden' })
    ])
    wrapper = await mountOpened()

    await wrapper.get('.history-search').setValue('Hidden')
    await wrapper.get('.history-footer-button').trigger('click')
    await flushPromises()

    expect(mocks.download).toHaveBeenCalledTimes(1)
    const options = mocks.download.mock.calls[0][0] as { filename: string; url: string }
    expect(options.filename).toMatch(/^vimeo-history-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(options.url).toContain('blob:')
  })
})
