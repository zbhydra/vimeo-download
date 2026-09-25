/**
 * 徽章管理器
 * 管理扩展图标的徽章显示
 */
import { logger } from '@/core/utils/logger'

export class BadgeManager {
  /**
   * 徽章背景色
   * 使用蓝色作为默认徽章颜色
   */
  private static readonly BADGE_COLOR = '#4A90E2'

  /**
   * 徽章显示的最大数字
   * 超过此数字将显示 "999+"
   */
  private static readonly MAX_BADGE_NUMBER = 999

  /**
   * 更新徽章显示
   * @param count - 要显示的计数
   */
  static updateBadge(count: number): void {
    try {
      // 处理无效数字和边界情况：NaN、Infinity、负数或零
      if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
        this.clearBadge()
        return
      }

      // 格式化数字并设置徽章文本
      const badgeText = this.formatCount(count)
      chrome.action.setBadgeText({ text: badgeText })

      // 设置徽章背景色
      chrome.action.setBadgeBackgroundColor({ color: this.BADGE_COLOR })

      logger.info('Badge updated:', { count, displayText: badgeText })
    } catch (error) {
      logger.error('Failed to update badge:', error)
    }
  }

  /**
   * 清除徽章显示
   */
  static clearBadge(): void {
    try {
      chrome.action.setBadgeText({ text: '' })
      logger.info('Badge cleared')
    } catch (error) {
      logger.error('Failed to clear badge:', error)
    }
  }

  /**
   * 格式化数字为徽章显示文本
   * 超过 MAX_BADGE_NUMBER 时显示 "999+"
   * @param count - 要格式化的数字
   * @returns 格式化后的文本
   */
  private static formatCount(count: number): string {
    if (count > this.MAX_BADGE_NUMBER) {
      return '999+'
    }
    return String(count)
  }
}
