/**
 * 插件打点 API。
 *
 * 只写阿里云 SLS WebTracking，不再请求后端 mark_logs。
 */

import type { MarkResponse, MarkType } from './types'
import { sendExtensionMarkToSls, type ExtensionMarkRecordOptions } from './sls'

/**
 * 打点 API 函数集合。
 */
export const markApi = {
  /**
   * 记录插件端 mark-log。
   */
  record: async (
    markType: MarkType,
    markMsg = '',
    options: ExtensionMarkRecordOptions = {}
  ): Promise<MarkResponse> => {
    return { recorded: await sendExtensionMarkToSls(markType, markMsg, options) }
  }
}
