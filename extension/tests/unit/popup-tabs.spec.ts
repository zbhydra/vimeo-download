import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SITE_REGISTRATION } from '@/platforms/registry'
import { ensureSupportedTabOpen, isSitePageUrl, openSiteTab } from '@/popup/utils/tabs'

/** 构造测试用 tab，避免每个用例重复关心 Chrome Tab 的非核心字段。 */
function tabFixture(id: number, url: string, active = false): chrome.tabs.Tab {
  return { id, url, active } as chrome.tabs.Tab
}

/** 配置 popup 当前活动 tab 与全窗口 tab 查询结果。 */
function mockTabs(currentTab: chrome.tabs.Tab, allTabs: chrome.tabs.Tab[]): void {
  chrome.tabs.query = vi.fn((queryInfo: chrome.tabs.QueryInfo) => {
    if (queryInfo.active && queryInfo.currentWindow) {
      return Promise.resolve([currentTab])
    }

    return Promise.resolve(allTabs)
  }) as typeof chrome.tabs.query
}

describe('popup tabs utils', () => {
  beforeEach(() => {
    vi.spyOn(chrome.tabs, 'update').mockImplementation(() =>
      Promise.resolve(tabFixture(2, 'https://vimeo.com/1201819515', true))
    )
    chrome.tabs.create = vi.fn((createProperties: chrome.tabs.CreateProperties) =>
      Promise.resolve(tabFixture(30, createProperties.url ?? ''))
    ) as typeof chrome.tabs.create
  })

  it('只把 Vimeo 页面识别为站点页面', () => {
    expect(isSitePageUrl('https://vimeo.com/1201819515')).toBe(true)
    expect(isSitePageUrl('https://www.vimeo.com/1201819515')).toBe(true)
    expect(isSitePageUrl('https://player.vimeo.com/video/1201819515')).toBe(true)
    expect(isSitePageUrl('https://web.telegram.org/a/')).toBe(false)
    expect(isSitePageUrl('https://x.com/hydra/status/123')).toBe(false)
    expect(isSitePageUrl('https://www.instagram.com/p/ABC123/')).toBe(false)
    expect(isSitePageUrl('https://example.com/')).toBe(false)
    expect(isSitePageUrl(undefined)).toBe(false)
  })

  it('当前标签页就是站点页面时直接使用，不查询其它标签页', async () => {
    const current = tabFixture(1, 'https://vimeo.com/1201819515', true)
    mockTabs(current, [current])

    const targetTab = await ensureSupportedTabOpen()

    expect(targetTab?.id).toBe(1)
    expect(chrome.tabs.query).toHaveBeenCalledTimes(1)
    expect(chrome.tabs.update).not.toHaveBeenCalled()
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })

  it('当前标签页不是站点页面时切到已打开的站点标签页', async () => {
    mockTabs(tabFixture(1, 'https://example.com/', true), [
      tabFixture(1, 'https://example.com/', true),
      tabFixture(2, 'https://vimeo.com/1201819515')
    ])

    const targetTab = await ensureSupportedTabOpen()

    expect(targetTab?.id).toBe(2)
    expect(chrome.tabs.update).toHaveBeenCalledWith(2, { active: true })
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })

  it('没有任何站点标签页时返回 null 且不自动打开新标签页', async () => {
    mockTabs(tabFixture(1, 'https://example.com/', true), [tabFixture(1, 'https://example.com/', true)])

    const targetTab = await ensureSupportedTabOpen()

    expect(targetTab).toBeNull()
    expect(chrome.tabs.update).not.toHaveBeenCalled()
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })
})

describe('openSiteTab', () => {
  beforeEach(() => {
    vi.spyOn(chrome.tabs, 'update').mockImplementation(() =>
      Promise.resolve(tabFixture(2, 'https://vimeo.com/1201819515', true))
    )
    chrome.tabs.create = vi.fn((createProperties: chrome.tabs.CreateProperties) =>
      Promise.resolve(tabFixture(30, createProperties.url ?? ''))
    ) as typeof chrome.tabs.create
  })

  it('已有站点标签页时切过去，不新建', async () => {
    mockTabs(tabFixture(1, 'https://example.com/', true), [
      tabFixture(1, 'https://example.com/', true),
      tabFixture(2, 'https://vimeo.com/1201819515')
    ])

    const targetTab = await openSiteTab()

    expect(targetTab?.id).toBe(2)
    expect(chrome.tabs.update).toHaveBeenCalledWith(2, { active: true })
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })

  it('一个站点标签页都没有时新建站点入口页', async () => {
    mockTabs(tabFixture(1, 'https://example.com/', true), [tabFixture(1, 'https://example.com/', true)])

    const targetTab = await openSiteTab()

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: SITE_REGISTRATION.homeUrl,
      active: true
    })
    expect(targetTab?.id).toBe(30)
    expect(chrome.tabs.update).not.toHaveBeenCalled()
  })

  it('新建失败时返回 null，不抛出到调用方', async () => {
    mockTabs(tabFixture(1, 'https://example.com/', true), [tabFixture(1, 'https://example.com/', true)])
    chrome.tabs.create = vi.fn(() =>
      Promise.reject(new Error('Unable to create tab'))
    ) as typeof chrome.tabs.create

    await expect(openSiteTab()).resolves.toBeNull()
  })
})
