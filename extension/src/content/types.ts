/**
 * Content RPC 请求与响应类型。
 *
 * 这些类型描述 Popup/background 可调用的 content 能力，站点 provider 负责具体资源。
 */

import type { MediaResource, VideoGroupSummary } from '@/core/types'

/** content 获取资源响应。 */
export interface ContentGetResourcesResponse {
  /** 当前缓存资源列表。 */
  resources: MediaResource[]
  /** 当前缓存资源数量。 */
  count: number
  /** 每个视频组的展示元数据（标题/作者/时长/封面），顺序与资源分组序一致。 */
  videoGroups: VideoGroupSummary[]
}
