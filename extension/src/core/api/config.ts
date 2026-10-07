/**
 * API 统一配置
 *
 * 集中管理所有服务的端点，完整路径便于搜索
 */

import { SUPPORT_EMAIL } from '../constants/deployment'

/**
 * API 配置
 */
export const API = {
  /** API 基础 URL */
  BASE_URL: __API_BASE_URL__,
  /** 请求超时时间（毫秒） */
  TIMEOUT: 10000,
  /** 重试次数 */
  RETRY_COUNT: 2,
  /** 重试延迟（毫秒） */
  RETRY_DELAY: 1000,

  /** API 端点（完整路径） */
  ENDPOINTS: {
    // ========== 认证 ==========
    /** 发送邮箱登录验证码（公开端点） */
    AUTH_SEND_EMAIL_CODE: '/api/client/auth/send-email-code',
    /** 邮箱验证码登录/注册（公开端点） */
    AUTH_EMAIL_VERIFY_LOGIN: '/api/client/auth/email-verify-login',
    /** Google OAuth 授权入口：校验 return_to 后跳转 Google（公开端点） */
    AUTH_GOOGLE_OAUTH_AUTHORIZE: '/api/client/auth/google/oauth/authorize',
    /** Google 一次性登录 code 换 token（公开端点） */
    AUTH_GOOGLE_EXCHANGE: '/api/client/auth/google/exchange',
    /** 刷新访问令牌 */
    AUTH_REFRESH: '/api/client/auth/refresh',
    /** 获取当前用户信息 */
    AUTH_ME: '/api/client/auth/me',
    /** 退出登录 */
    AUTH_LOGOUT: '/api/client/auth/logout',

    // ========== 配额 ==========
    /** 检查并消耗配额 */
    QUOTA_CHECK: '/api/client/quota/check',

    // ========== 远端配置 ==========
    /** 获取顶层分组稀疏覆盖 */
    REMOTE_CONFIG: '/api/client/remote-config/config',

    // ========== 订阅 ==========
    /** 获取订阅状态 */
    SUBSCRIPTION_STATUS: '/api/client/subscription/status',
    /** 获取可购买订阅套餐配置（匿名可访问） */
    SUBSCRIPTION_CHECKOUT_CONFIGS: '/api/client/subscription/checkout-configs',
    /** 创建当前账号订阅渠道的管理入口 */
    SUBSCRIPTION_MANAGEMENT: '/api/client/subscription/management',

    // ========== 订单 ==========
    /** 创建订单并发起支付 */
    ORDER_CREATE: '/api/client/order/create',
    /** 查询订单状态（客户端轮询），路径需拼接订单号 */
    ORDER_STATUS: '/api/client/order/status'
  }
} as const

/** 官网配置（域名、外链路径与联系方式；插件不在官网域内做登录） */
export const WEBSITE = {
  /** 官网基础 URL */
  BASE_URL: __WEBSITE_BASE_URL__,
  /** Pricing 页路径 */
  PRICING_PATH: '/ext-pricing/',
  /** 服务条款页路径 */
  TERMS_PATH: '/terms/',
  /** 隐私政策页路径 */
  PRIVACY_PATH: '/privacy/',
  /** 用户支持邮箱；与生产域名占位同源，待替换项见 `core/constants/deployment.ts`。 */
  SUPPORT_EMAIL
} as const

/** 兼容旧代码的导出别名 */
export const API_CONFIG = {
  BASE_URL: API.BASE_URL,
  TIMEOUT: API.TIMEOUT,
  RETRY_COUNT: API.RETRY_COUNT,
  RETRY_DELAY: API.RETRY_DELAY
} as const

/** 插件端阿里云 SLS WebTracking mark-log 配置。 */
export const ALI_SLS_MARK =
  typeof __ALI_SLS_MARK_CONFIG__ !== 'undefined'
    ? __ALI_SLS_MARK_CONFIG__
    : {
        enabled: false,
        endpoint: '',
        logstore: '',
        topic: 'mark-log',
        source: 'extension'
      }

export const API_ENDPOINTS = API.ENDPOINTS
export const API_PATHS = API.ENDPOINTS

/** HTTP Headers 常量 */
export const HTTP_HEADERS = {
  /** Authorization 前缀 */
  AUTH_PREFIX: 'Bearer ',
  /** Content-Type */
  CONTENT_TYPE: 'application/json',
  /** 设备 ID 请求头 */
  DEVICE_ID: 'X-Device-Id',
  /** 客户端产品请求头 */
  CLIENT_PRODUCT: 'X-Client-Product',
  /** Accept-Language 请求头 */
  ACCEPT_LANGUAGE: 'Accept-Language'
} as const

/** Storage 键常量 */
export const STORAGE_KEYS = {
  /** 访问令牌 */
  ACCESS_TOKEN: 'auth_access_token',
  /** 刷新令牌 */
  REFRESH_TOKEN: 'auth_refresh_token',
  /** 用户信息 */
  USER_INFO: 'auth_user_info',
  /** 设备 ID */
  DEVICE_ID: 'counter_device_id',
  /** 首次观测到 background 启动的毫秒时间戳 */
  FIRST_OPENED_AT: 'first_opened_at',
  /** 生产构建 DEBUG 日志开关 */
  DEBUG_LOGGING: 'debug_logging',
  /** 本插件最后一次订单定位；只保存用户 ID 与订单号，状态以服务端为准。 */
  LATEST_ORDER_REFERENCE: 'latest_order_reference',
  /** 定价页匿名用户确认后的待购商品；登录成功后只恢复这一项。 */
  PENDING_PREMIUM_PURCHASE: 'pending_premium_purchase',
  /** 下载历史（任务终态回写），值为 DownloadHistoryEntry 数组 */
  DOWNLOAD_HISTORY: 'download_history'
} as const
