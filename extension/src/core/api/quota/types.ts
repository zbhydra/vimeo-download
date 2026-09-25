/**
 * 配额相关类型定义
 */

/** 订阅周期 */
export type QuotaPeriod = 'free' | 'month' | 'unavailable'

/** 配额状态响应 */
export interface QuotaStatus {
  /** 订阅周期 */
  period: QuotaPeriod
  /** 每日下载限制（-1 表示无限制） */
  daily_limit: number
  /** 今日已用次数 */
  used: number
  /** 剩余次数（-1 表示无限制） */
  remaining: number
  /** 重置日期（YYYY-MM-DD） */
  reset_date: string
}

/** 配额检查请求 */
export interface QuotaCheckRequest {
  /** 需要消耗的配额数量 */
  count?: number
}

/** 配额检查响应 */
export interface QuotaCheckResponse {
  /** 是否允许 */
  allowed: boolean
  /** 实际消耗数量 */
  count: number
  /** 当日已用次数 */
  used: number
  /** 剩余配额（-1 表示无限制） */
  remaining: number
  /** 业务状态：1-OK，0-配额不足 */
  status: 1 | 0
  /** 下次额度刷新时间（毫秒时间戳）；旧版服务端可能不返回，仅用于界面展示。 */
  reset_at?: number
}
