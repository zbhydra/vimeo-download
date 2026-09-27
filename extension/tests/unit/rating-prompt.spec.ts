/**
 * 评分引导控制器测试。
 *
 * 覆盖成功计数持久化、登录态与已评分门控、1-3 星致谢收起、4-5 星跳商店占位页，以及
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

/** 模块级单例状态，每个用例重新动态导入。 */
type RatingPromptModule = typeof import('@/core/composables/ratingPrompt')

let rating: RatingPromptModule

/** chrome.storage.local 的测试后备存储。 */
const storageData = new Map<string, unknown>()

async function importFresh(): Promise<void> {
  vi.resetModules()
  ;({ ...rating } = await import('@/core/composables/ratingPrompt'))
}

describe('评分引导控制器', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    storageData.clear()
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(async keys => {
      const result: Record<string, unknown> = {}
      const keyList = typeof keys === 'string' ? [keys] : []
      for (const key of keyList) {
        if (storageData.has(key)) {
          result[key] = storageData.get(key)
        }
      }
      return result
    })
    vi.spyOn(chrome.storage.local, 'set').mockImplementation(async items => {
      for (const [key, value] of Object.entries(items)) {
        storageData.set(key, value)
      }
    })

    await importFresh()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('登录用户下载成功：计数落盘并展开引导条', async () => {
    await rating.registerDownloadSuccess(true)

    expect(rating.ratingPromptPhase.value).toBe('prompt')
    expect(storageData.get(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)).toBe(1)
  })

  it('未登录用户的成功只计数，不展开引导条', async () => {
    await rating.registerDownloadSuccess(false)

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(storageData.get(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)).toBe(1)
  })

  it('已评分（has_rated）用户再次成功只累计计数', async () => {
    storageData.set(STORAGE_KEYS.HAS_RATED, true)
    storageData.set(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT, 4)

    await rating.registerDownloadSuccess(true)

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(storageData.get(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)).toBe(5)
  })

  it('低分（1-3 星）：致谢后自动收起，并写 has_rated 永久消失', async () => {
    vi.useFakeTimers()

    await rating.registerDownloadSuccess(true)
    await rating.submitRating(2)

    expect(rating.ratingPromptPhase.value).toBe('thanks')
    expect(storageData.get(STORAGE_KEYS.HAS_RATED)).toBe(true)
    expect(mocks.openExternalPage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)
    expect(rating.ratingPromptPhase.value).toBe('hidden')
  })

  it('高分（4-5 星）：打开商店占位页并写 has_rated', async () => {
    await rating.registerDownloadSuccess(true)
    await rating.submitRating(5)

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(mocks.openExternalPage).toHaveBeenCalledTimes(1)
    expect(mocks.openExternalPage).toHaveBeenCalledWith(EXTENSION_STORE_URL, 'rating_prompt')
    expect(storageData.get(STORAGE_KEYS.HAS_RATED)).toBe(true)
  })

  it('点 × 永久关闭且不跳转商店', async () => {
    await rating.registerDownloadSuccess(true)
    await rating.dismissRatingPrompt()

    expect(rating.ratingPromptPhase.value).toBe('hidden')
    expect(storageData.get(STORAGE_KEYS.HAS_RATED)).toBe(true)
    expect(mocks.openExternalPage).not.toHaveBeenCalled()
  })
})
