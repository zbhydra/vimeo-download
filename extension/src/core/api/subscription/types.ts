/**
 * 订阅相关类型定义
 */

/** 订阅周期（包含免费版）；year 已停售但存量权益仍会返回，lifetime 为终生一次性购买。 */
export type SubscriptionPeriod = 'free' | 'month' | 'quarter' | 'year' | 'lifetime' | 'unavailable'

/** 单类每日额度状态。 */
export interface DailyQuotaStatus {
  /** 今日已用次数。 */
  use: number
  /** 剩余额度，-1 表示无限制。 */
  remaining: number
  /** 每日额度上限，-1 表示无限制。 */
  limit: number
}

/** 订阅状态 */
export interface SubscriptionStatus {
  /** 状态；unavailable 表示订阅配置异常，仅影响展示。 */
  status?: 'active' | 'unavailable'
  /** 订阅周期。 */
  period: SubscriptionPeriod
  /** 展示名称。 */
  display_name: string
  /** 过期时间戳，null 表示无过期时间。 */
  expires_at: number | null
  /** 每日下载限制，旧版兼容字段，-1 表示无限制。 */
  daily_limit: number
  /** 今日已用次数，旧版兼容字段。 */
  used: number
  /** 剩余配额，旧版兼容字段，-1 表示无限制。 */
  remaining: number
  /** 插件下载额度，新版结构化字段。 */
  extension_download: DailyQuotaStatus
  /** 是否自动续费。 */
  auto_renew: boolean
  /** 重置日期（YYYY-MM-DD）。 */
  reset_date: string
}
