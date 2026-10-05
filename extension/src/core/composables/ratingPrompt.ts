/**
 * 评分引导控制器。
 *
 * 登录用户首次下载成功后，popup footer 展示一次五星引导条；任意交互（评分/关闭）写入
 * has_rated 永久消失。成功计数由 background 在下载落盘后写入；popup 初始化与成功事件
 * 都只读取事实，关闭 popup 不会漏记下载。状态是模块级单例。
 */

import { ref } from 'vue'
import { STORAGE_KEYS } from '@/core/api/config'
import { EXTENSION_STORE_URL } from '@/core/constants/deployment'
import { openExternalPage } from '@/core/utils/navigation'
import { storageManager } from '@/core/storage'
import { logger } from '@/core/utils/logger'

/** 引导条状态：prompt 展示星级，thanks 展示低分致谢，hidden 不渲染。 */
export type RatingPromptPhase = 'hidden' | 'prompt' | 'thanks'

/** 引导条当前状态（模块级单例）。 */
export const ratingPromptPhase = ref<RatingPromptPhase>('hidden')

/** 低分致谢的自动收起延时。 */
const THANKS_VISIBLE_MS = 2500

let thanksHideTimer: ReturnType<typeof setTimeout> | null = null

/** 读取评分状态与 background 写入的成功事实。 */
async function readRatingState(): Promise<{ hasRated: boolean; successCount: number }> {
  const [hasRated, successCount] = await Promise.all([
    storageManager.get<boolean>(STORAGE_KEYS.HAS_RATED),
    storageManager.get<number>(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT)
  ])

  return {
    hasRated: hasRated === true,
    successCount:
      typeof successCount === 'number' && Number.isFinite(successCount) && successCount >= 0
        ? successCount
        : 0
  }
}

/** 已下载成功且当前已登录的未评分用户可以看到引导。 */
export function isRatingPromptEligible(
  hasRated: boolean,
  isAuthenticated: boolean,
  successCount: number
): boolean {
  return !hasRated && isAuthenticated && successCount > 0
}

/** 读取已完成下载的事实并更新评分资格，不重复计数。 */
export async function refreshRatingPrompt(isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) {
    clearThanksHideTimer()
    ratingPromptPhase.value = 'hidden'
    return
  }
  try {
    const { hasRated, successCount } = await readRatingState()
    if (ratingPromptPhase.value !== 'thanks') {
      ratingPromptPhase.value = isRatingPromptEligible(hasRated, isAuthenticated, successCount)
        ? 'prompt'
        : 'hidden'
    }
  } catch (error) {
    logger.error('[RatingPrompt] 读取评分资格失败:', error)
  }
}

/** 用户提交星级：1-3 星致谢后收起；4-5 星打开商店详情页。两种情况都记为已评分。 */
export async function submitRating(stars: number): Promise<void> {
  await markRated()

  if (stars >= 4) {
    ratingPromptPhase.value = 'hidden'
    await openExternalPage(EXTENSION_STORE_URL, 'rating_prompt')
    return
  }

  ratingPromptPhase.value = 'thanks'
  clearThanksHideTimer()
  thanksHideTimer = setTimeout(() => {
    ratingPromptPhase.value = 'hidden'
    thanksHideTimer = null
  }, THANKS_VISIBLE_MS)
}

/** 用户点 ×：引导条永久消失。 */
export async function dismissRatingPrompt(): Promise<void> {
  await markRated()
  ratingPromptPhase.value = 'hidden'
}

/** 写入已评分标记；失败只记日志，不阻塞 UI 收起。 */
async function markRated(): Promise<void> {
  try {
    await storageManager.set(STORAGE_KEYS.HAS_RATED, true)
  } catch (error) {
    logger.error('[RatingPrompt] 写入已评分标记失败:', error)
  }
}

function clearThanksHideTimer(): void {
  if (thanksHideTimer !== null) {
    clearTimeout(thanksHideTimer)
    thanksHideTimer = null
  }
}
