/**
 * QuotaService - 配额检查服务
 *
 * 职责：
 * - 统一的配额检查和消耗逻辑
 * - 配额不足时的升级弹窗处理
 * - Fail-open 策略：配额服务异常时允许下载
 */

import { BackgroundChannel } from '@/content/rpc/background.rpc'
import type { QuotaCheckResponse } from '@/core/api/quota/types'
import { upgradeModalManager } from './UpgradeModalManager'
import { logger } from '@/core/utils/logger'

const backgroundClient = new BackgroundChannel()

// ============================================================================
// QuotaService 类
// ============================================================================

export class QuotaService {
  private static instance: QuotaService

  private constructor() {}

  static getInstance(): QuotaService {
    if (!QuotaService.instance) {
      QuotaService.instance = new QuotaService()
    }
    return QuotaService.instance
  }

  /**
   * 检查配额并消耗
   *
   * @param count 需要检查的配额数量
   * @returns 是否允许下载（true: 允许, false: 不允许）
   */
  async checkAndConsume(count: number): Promise<boolean> {
    let result: QuotaCheckResponse
    try {
      result = await backgroundClient.checkQuota({ count })
    } catch (error) {
      // 只有额度 API 本身失败才 fail-open；响应后的 UI 错误不得改变额度结论。
      logger.error('[QuotaService] 配额 API 请求失败，允许下载:', error)
      return true
    }

    if (result.status === 1) {
      logger.info('[QuotaService] 配额检查通过')
      return true
    }

    logger.warn('[QuotaService] 配额不足，显示升级弹窗')
    try {
      upgradeModalManager.showWithFallback(result.reset_at)
    } catch (error) {
      logger.error('[QuotaService] 配额不足，但显示升级弹窗失败:', error)
    }

    return false
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const quotaService = QuotaService.getInstance()
