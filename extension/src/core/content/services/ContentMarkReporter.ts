/**
 * Content script 统一打点上报器。
 *
 * 各站点 content 只提交业务事件，background 负责实际写入 SLS，避免页面上下文分别维护
 * 跨域权限。上报失败只记录日志，不影响下载主流程。
 */

import { BackgroundChannel } from '@/content/rpc/background.rpc'
import type { MarkType } from '@/core/api/mark/types'
import { logger } from '@/core/utils/logger'

/** Content 到 background 的共享 RPC 客户端。 */
const backgroundClient = new BackgroundChannel()

/** 异步记录 content 业务事件。 */
export function recordContentMark(markType: MarkType, markMsg = ''): void {
  backgroundClient.recordMark({ mark_type: markType, mark_msg: markMsg }).catch(error => {
    logger.error(`[ContentMarkReporter] SLS 打点请求 background 失败: markType=${markType}`, error)
  })
}
