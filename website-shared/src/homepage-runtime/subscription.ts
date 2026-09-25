import { getJson, type RequestContext } from './api'

/** 订阅状态兼容字段 period 的合法运行时值。 */
export type HomepageSubscriptionPeriod = 'free' | 'month' | 'unavailable'

export interface HomepageSubscriptionStatus {
  status?: 'active' | 'unavailable'
  period: HomepageSubscriptionPeriod
  display_name: string
  expires_at: number | null
  daily_limit: number
  used: number
  remaining: number
  reset_date: string
}

export async function getSubscriptionStatus(
  context: RequestContext
): Promise<HomepageSubscriptionStatus> {
  return getJson<HomepageSubscriptionStatus>('/api/client/subscription/status', context)
}
