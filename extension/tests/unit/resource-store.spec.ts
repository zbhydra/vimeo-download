/**
 * Popup resource store 的当前 tab request-response 契约。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { RESOURCE_SOURCE_KINDS, RESOURCE_TYPES } from '@/core/constants/resource'
import { I18N_KEYS } from '@/core/constants/i18n'
import type { MediaResource } from '@/core/types'
import { I18nService } from '@/locales'
import { useResourceStore } from '@/popup/stores/resourceStore'

const mocks = vi.hoisted(() => ({
  getResources: vi.fn(() => Promise.resolve({ resources: [] as MediaResource[], count: 0 })),
  downloadBatch: vi.fn(() => Promise.resolve({ accepted: true, count: 1 }))
}))

vi.mock('@/popup/rpc/content.rpc', () => ({
  ContentChannel: vi.fn(() => ({
    getResources: mocks.getResources,
    downloadBatch: mocks.downloadBatch
  }))
}))

/** 构造只包含 store 所需字段的浏览器 tab。 */
function tabFixture(id: number, url: string): chrome.tabs.Tab {
  return { id, url, active: true } as chrome.tabs.Tab
}

/** 构造可区分顺序的媒体资源。 */
function resourceFixture(id: string, index: number): MediaResource {
  return {
    id,
    messageId: id,
    index,
    url: `https://vod-adaptive-ak.vimeocdn.com/${id}.m4s`,
    type: RESOURCE_TYPES.VIDEO,
    sourceKind: RESOURCE_SOURCE_KINDS.VIMEO_DASH_VIDEO,
    mimeType: 'video/mp4',
    filename: `${id}.mp4`,
    metadata: { messageId: id }
  }
}

describe('resourceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.getResources.mockReset()
    mocks.getResources.mockResolvedValue({ resources: [], count: 0 })
    mocks.downloadBatch.mockReset()
    mocks.downloadBatch.mockResolvedValue({ accepted: true, count: 1 })
  })

  it('固定打开时的 tab，并在刷新时按响应顺序整体替换', async () => {
    const first = resourceFixture('vimeo:1196869805:video:dash:1080p', 2)
    const second = resourceFixture('vimeo:1196869805:audio:dash:best', 1)
    const refreshed = resourceFixture('vimeo:1201819515:video:dash:720p', 1)
    mocks.getResources
      .mockResolvedValueOnce({ resources: [first, second], count: 2 })
      .mockResolvedValueOnce({ resources: [refreshed], count: 1 })
    const store = useResourceStore()

    await store.initialize(tabFixture(41, 'https://vimeo.com/1196869805'))
    await store.refresh()

    expect(mocks.getResources).toHaveBeenNthCalledWith(1, { tabId: 41 })
    expect(mocks.getResources).toHaveBeenNthCalledWith(2, { tabId: 41 })
    expect(store.resources.map(resource => resource.id)).toEqual([refreshed.id])
    expect(store.hasResources).toBe(true)
  })

  it('每次下载只发送面板选中的那一个资源 ID', async () => {
    const first = resourceFixture('vimeo:1196869805:video:dash:1080p', 1)
    const second = resourceFixture('vimeo:1196869805:audio:dash:best', 2)
    mocks.getResources.mockResolvedValue({ resources: [first, second], count: 2 })
    const store = useResourceStore()
    await store.initialize(tabFixture(42, 'https://vimeo.com/1196869805'))

    await store.downloadResource(second)
    await store.downloadResource(second)

    expect(mocks.downloadBatch).toHaveBeenCalledTimes(2)
    expect(mocks.downloadBatch).toHaveBeenNthCalledWith(
      1,
      { resourceIds: [second.id] },
      { tabId: 42 }
    )
    expect(mocks.downloadBatch).toHaveBeenNthCalledWith(
      2,
      { resourceIds: [second.id] },
      { tabId: 42 }
    )
  })

  it('面板传下来的片段资源原样作为下载身份发送', async () => {
    const clip = resourceFixture('vimeo:1196869805:video:dash:1080p:clip:12.5-30', 1)
    mocks.getResources.mockResolvedValue({ resources: [clip], count: 1 })
    const store = useResourceStore()
    await store.initialize(tabFixture(43, 'https://vimeo.com/1196869805'))

    await store.downloadResource(clip)

    expect(mocks.downloadBatch).toHaveBeenCalledWith({ resourceIds: [clip.id] }, { tabId: 43 })
  })

  it('下载请求未被受理时给出反馈，不静默丢弃', async () => {
    const resource = resourceFixture('vimeo:1196869805:video:dash:1080p', 1)
    mocks.getResources.mockResolvedValue({ resources: [resource], count: 1 })
    mocks.downloadBatch.mockResolvedValueOnce({ accepted: false, count: 0 })
    const store = useResourceStore()
    await store.initialize(tabFixture(44, 'https://vimeo.com/1196869805'))

    await store.downloadResource(resource)

    expect(store.error).toBe(I18nService.t(I18N_KEYS.STORE_ERROR.DOWNLOAD_FAILED))
  })

  it('一般 RPC Error 只显示对应 i18n 文案，不泄露底层 message', async () => {
    const resource = resourceFixture('vimeo:1196869805:video:dash:1080p', 1)
    mocks.getResources.mockRejectedValueOnce(new Error('sensitive fetch implementation detail'))
    const store = useResourceStore()

    await store.initialize(tabFixture(45, 'https://vimeo.com/1196869805'))
    expect(store.error).toBe(I18nService.t(I18N_KEYS.STORE_ERROR.FETCH_FAILED))
    expect(store.error).not.toContain('sensitive')

    mocks.getResources.mockResolvedValueOnce({ resources: [resource], count: 1 })
    await store.refresh()
    mocks.downloadBatch.mockRejectedValueOnce(new Error('sensitive download detail'))
    await store.downloadResource(resource)
    expect(store.error).toBe(I18nService.t(I18N_KEYS.STORE_ERROR.DOWNLOAD_FAILED))
    expect(store.error).not.toContain('sensitive')
  })

  it('content 未连接使用专用中性文案', async () => {
    mocks.getResources.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.')
    )
    const store = useResourceStore()

    await store.initialize(tabFixture(46, 'https://vimeo.com/1196869805'))

    expect(store.error).toBe(I18nService.t(I18N_KEYS.STORE_ERROR.CONTENT_SCRIPT_NOT_CONNECTED))
  })

  it('没有站点标签页时呈现未连接提示，且不请求 content', async () => {
    const store = useResourceStore()

    await store.initialize(null)

    expect(store.error).toBe(I18nService.t(I18N_KEYS.STORE_ERROR.TAB_NOT_FOUND))
    expect(store.loading).toBe(false)
    expect(mocks.getResources).not.toHaveBeenCalled()
  })

  it('hasTargetTab 跟随 initialize 传入的 tab，是面板判断引导态的唯一依据', async () => {
    const store = useResourceStore()

    // 初始化之前还没有任何结论，此时面板必须仍按处理中呈现，不能提前判定为非站点页面。
    expect(store.hasTargetTab).toBe(false)
    expect(store.loading).toBe(true)

    await store.initialize(tabFixture(47, 'https://vimeo.com/1196869805'))
    expect(store.hasTargetTab).toBe(true)

    await store.initialize(null)
    expect(store.hasTargetTab).toBe(false)
  })
})
