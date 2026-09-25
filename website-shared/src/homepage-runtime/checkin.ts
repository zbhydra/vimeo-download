/**
 * Website 签到活动 API 客户端。
 *
 * 首页下载工作区只通过独立签到接口读取 Credits 余额和签到状态，不依赖订阅模型。
 */

import { postJson, type RequestContext } from './api'

/** 签到入口状态响应。 */
export interface HomepageCheckinEntryStatus {
  /** 活动是否已经结束。 */
  campaign_ended: boolean
  /** 活动开始日，服务器时区 YYYY-MM-DD。 */
  start_date: string
  /** 活动结束日，服务器时区 YYYY-MM-DD。 */
  end_date: string
  /** 服务器今天日期，YYYY-MM-DD。 */
  today: string
  /** 今天对应的活动日，活动结束后保持为第 14 天。 */
  day_index: number
  /** 今天可领取的 Credits，结束后为 0。 */
  today_reward_credits: number
  /** 今天是否已经签到。 */
  today_claimed: boolean
  /** 已成功签到天数。 */
  total_claim_days: number
  /** 当前 Credits 余额。 */
  credits_balance: number
  /** 下次可领取 ISO 时间；今天可领取时为 null。 */
  next_claim_at: string | null
  /** 下次可领取毫秒时间戳；今天可领取时为 null。 */
  next_claim_at_ts: number | null
}

/** 签到领取响应。 */
export interface HomepageCheckinClaimResult {
  /** 本次签到日期，服务器时区 YYYY-MM-DD。 */
  claim_date: string
  /** 本次签到活动日。 */
  day_index: number
  /** 本次领取 Credits。 */
  reward_credits: number
  /** 领取后的 Credits 余额。 */
  credits_balance: number
  /** 领取后固定为 true。 */
  today_claimed: boolean
  /** 领取成功时固定为 false。 */
  campaign_ended: boolean
  /** 下一次可领取 ISO 时间；第 14 天领取后为 null。 */
  next_claim_at: string | null
  /** 下一次可领取毫秒时间戳；第 14 天领取后为 null。 */
  next_claim_at_ts: number | null
}

/** 判断已缓存的签到状态是否跨过了后端给出的下一次可领取时间。 */
export function isHomepageCheckinEntryStale(
  status: Pick<HomepageCheckinEntryStatus, 'today_claimed' | 'next_claim_at_ts'>,
  nowMs = Date.now()
): boolean {
  return (
    status.today_claimed &&
    status.next_claim_at_ts !== null &&
    nowMs >= status.next_claim_at_ts
  )
}

/** 进入签到系统并返回当前状态。 */
export async function enterCheckinCampaign(
  context: RequestContext
): Promise<HomepageCheckinEntryStatus> {
  return postJson<HomepageCheckinEntryStatus>('/api/client/checkin/entry', context, {})
}

/** 领取今日签到 Credits。 */
export async function claimDailyCheckin(
  context: RequestContext
): Promise<HomepageCheckinClaimResult> {
  return postJson<HomepageCheckinClaimResult>('/api/client/checkin/claim', context, {})
}
