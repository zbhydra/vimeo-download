/**
 * 配额 API
 */

import { httpClient } from '../index'
import { API } from '../config'
import type { QuotaCheckRequest, QuotaCheckResponse } from './types'

export const quotaApi = {
  /**
   * 检查并消耗配额
   * @param request 需要消耗的配额数量
   */
  async checkAndConsume(request: QuotaCheckRequest = {}): Promise<QuotaCheckResponse> {
    return httpClient.post(API.ENDPOINTS.QUOTA_CHECK, request)
  }
}
