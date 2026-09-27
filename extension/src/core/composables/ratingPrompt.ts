/**
 * 评分引导控制器。
 *
 * 登录用户首次下载成功后，popup footer 展示一次五星引导条；任意交互（评分/关闭）写入
 * has_rated 永久消失。成功计数来自 background 编排器的 downloadTaskSucceeded 事件，由
 * popup 根组件转调 registerDownloadSuccess。状态是模块级单例，与 LoginModal/PremiumView
 * 控制器同构。
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

/** 读取评分状态持久化值；存储异常按「未评分、零计数」兜底。 */
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

/**
 * 记录一次下载成功并按需展开引导条。
 *
 * 成功次数只增不减；已评分用户与未登录用户不展示。此前未登录、登录后再次成功时同样
 * 触发展示——「登录用户首次成功」的判定以登录态为准，而不是把首次成功永久让给未登录态。
 */
export async function registerDownloadSuccess(isAuthenticated: boolean): Promise<void> {
  try {
    const { hasRated, successCount } = await readRatingState()
    const nextCount = successCount + 1
    await storageManager.set(STORAGE_KEYS.DOWNLOAD_SUCCESS_COUNT, nextCount)

    if (hasRated || !isAuthenticated) {
      return
    }

    clearThanksHideTimer()
    ratingPromptPhase.value = 'prompt'
    logger.info(
      `[RatingPrompt] 展示评分引导: successCount=${nextCount}, isFirst=${nextCount === 1}`
    )
  } catch (error) {
    logger.error('[RatingPrompt] 记录下载成功失败，跳过评分引导:', error)
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
