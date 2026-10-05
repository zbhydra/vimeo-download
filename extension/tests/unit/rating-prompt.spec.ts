/**
 * 评分引导控制器测试。
 *
 * 覆盖 background 成功事实持久化、重开读取、登录态与已评分门控、星级提交，以及
 * 关闭后的永久消失（has_rated）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openExternalPage: vi.fn()
}))

vi.mock('@/core/utils/navigation', () => ({
  openExternalPage: mocks.openExternalPage
}))

import { EXTENSION_STORE_URL } from '@/core/constants/deployment'
import { STORAGE_KEYS } from '@/core/api/config'
import type { StorageValue } from '@/core/storage'

/** 模块级单例状态，每个用例重新动态导入。 */
type RatingPromptModule = typeof import('@/core/composables/ratingPrompt')

let rating: RatingPromptModule

/** chrome.storage.local 的测试后备存储。 */
const storageData = new Map<string, StorageValue>()

async function importFresh(): Promise<void> {
  vi.resetModules()
  ;({ ...rating } = await import('@/core/composables/ratingPrompt'))
}

describe('评分引导控制器', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    storageData.clear()
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(async keys => {
      const result: Record<string, StorageValue> = {}
      const keyList = typeof keys === 'string' ? [keys] : []
      for (const key of keyList) {
        if (storageData.has(key)) {
          result[key] = storageData.get(key)!
        }
      }
      return result
    })
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(async items => {
      for (const [key, value] of Object.entries(items)) {
        storageData.set(key, value as StorageValue)
      }
    })

    await importFresh()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('popup 关闭期间 background 完成下载：重开读取展示且不重复计数', async () => {
    const { recordDownloadSuccess } = await import('@/core/storage/downloadSuccess')
    await recordDownloadSuccess()
    await importFresh()
    await rating.refreshRatingPrompt(true)
    await rating.refreshRatingPrompt(true)

    expect(rating.ratingPromptPhase.value).toBe('prompt')
    expect(storageData.get(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)).toBe(1)
  })

  it('已有成功事实的游客登录后显示，退出后隐藏', async () => {
    storageData.set(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT, 1)
    await rating.refreshRatingPrompt(false)

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(storageData.get(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)).toBe(1)
    await rating.refreshRatingPrompt(true)
    expect(rating.ratingPromptPhase.value).toBe('prompt')
    await rating.refreshRatingPrompt(false)
    expect(rating.ratingPromptPhase.value).toBe('hidden')
  })

  it('已评分用户不展示，读取不增加计数', async () => {
    storageData.set(STORAGE_KEYS.HAS_RATED, true)
    storageData.set(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT, 4)

    await rating.refreshRatingPrompt(true)

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(storageData.get(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)).toBe(4)
  })

  it('退出后迟到的成功读取不能让评分条重新显示', async () => {
    const { mount, flushPromises } = await import('@vue/test-utils')
    const { createPinia } = await import('pinia')
    const { createI18n } = await import('vue-i18n')
    const { useAuthStore } = await import('@/core/stores/authStore')
    const { default: RatingPrompt } = await import('@/popup/components/RatingPrompt.vue')
    const pinia = createPinia()
    const auth = useAuthStore(pinia)
    auth.user = {
      user_id: 1,
      email: 'user@example.com',
      full_name: '',
      avatar_url: '',
      created_at: 0
    }
    auth.token = 'local-ui-state'
    const wrapper = mount(RatingPrompt, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en-US' })] }
    })
    try {
      let releaseRead = () => {}
      const pendingRead = new Promise<void>(resolve => {
        releaseRead = resolve
      })
      vi.mocked(chrome.storage.local.get).mockImplementation(async keys => {
        await pendingRead
        return typeof keys === 'string'
          ? { [keys]: keys === STORAGE_KEYS.HAS_RATED ? false : 1 }
          : {}
      })
      const refresh = rating.refreshRatingPrompt(true)
      auth.user = null
      auth.token = null
      await rating.refreshRatingPrompt(false)
      releaseRead()
      await refresh
      await flushPromises()
      expect(rating.ratingPromptPhase.value).toBe('prompt')
      expect(wrapper.find('.rating-prompt').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('评分资格只由登录、成功事实与永久关闭标记决定', () => {
    expect(rating.isRatingPromptEligible(false, true, 1)).toBe(true)
    expect(rating.isRatingPromptEligible(false, true, 0)).toBe(false)
    expect(rating.isRatingPromptEligible(false, false, 1)).toBe(false)
    expect(rating.isRatingPromptEligible(true, true, 1)).toBe(false)
  })

  it('计数存储失败不会抛给媒体完成路径', async () => {
    const { recordDownloadSuccess } = await import('@/core/storage/downloadSuccess')
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('storage write failed'))
    await expect(recordDownloadSuccess()).resolves.toBeUndefined()
  })

  it('低分（1-3 星）：致谢后自动收起，并写 has_rated 永久消失', async () => {
    vi.useFakeTimers()

    await rating.refreshRatingPrompt(true)
    await rating.submitRating(2)

    expect(rating.ratingPromptPhase.value).toBe('thanks')
    expect(storageData.get(STORAGE_KEYS.HAS_RATED)).toBe(true)
    expect(mocks.openExternalPage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)
    expect(rating.ratingPromptPhase.value).toBe('hidden')
  })

  it('高分（4-5 星）：打开商店页并写 has_rated', async () => {
    await rating.refreshRatingPrompt(true)
    await rating.submitRating(5)

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(mocks.openExternalPage).toHaveBeenCalledTimes(1)
    expect(mocks.openExternalPage).toHaveBeenCalledWith(EXTENSION_STORE_URL, 'rating_prompt')
    expect(storageData.get(STORAGE_KEYS.HAS_RATED)).toBe(true)
  })

  it('点 × 永久关闭且不跳转商店', async () => {
    await rating.refreshRatingPrompt(true)
    await rating.dismissRatingPrompt()

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(storageData.get(STORAGE_KEYS.HAS_RATED)).toBe(true)
    expect(mocks.openExternalPage).not.toHaveBeenCalled()
    storageData.set(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT, 2)
    await importFresh()
    await rating.refreshRatingPrompt(true)
    expect(rating.ratingPromptPhase.value).toBe('hidden')
  })
})
