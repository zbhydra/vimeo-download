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

/** 订阅商品的单个可购买价格选项。 */
export interface SubscriptionPaymentChannel {
  /** 支付方式，例如 paypal 或 clink。 */
  payment_method: string
  /** 支付渠道展示名。 */
  payment_method_name: string
  /** 购买选项 ID。 */
  product_price_id: number
  /** 渠道币种，例如 USD。 */
  currency: string
  /** 渠道金额，6 位精度。 */
  amount: number
}

/** 单个可购买订阅套餐配置。 */
export interface SubscriptionCheckoutPlan {
  /** 商品类别，订阅为 1。 */
  product_class: number
  /** 商品标识。 */
  product_id: string
  /** 后端配置商品名。 */
  product_name: string
  /** 商业与权益周期。 */
  period: 'month' | 'quarter' | 'year' | 'lifetime'
  /** 是否由渠道自动续费。 */
  auto_renew: boolean
  /** 商品卡默认展示币种。 */
  display_currency: string
  /** 商品卡默认展示金额，6 位精度。 */
  display_amount: number
  /** 每日下载额度；小于 0 表示无限。 */
  daily_limit: number
  /** 当前商品可用支付渠道。 */
  payment_channels: SubscriptionPaymentChannel[]
}

/** 订阅渠道管理入口；url 为空表示该订阅没有可用的渠道管理页。 */
export interface SubscriptionManagementResult {
  /** 渠道 Web 管理入口。 */
  url: string | null
}
