/**
 * 打点类型定义
 */

/**
 * 打点类型
 */
export const MARK_TYPE = {
  /** 点击下载按钮 */
  DOWNLOAD_CLICK: 'download_click',
  /** 单个下载任务成功 */
  DOWNLOAD_SUCCESS: 'download_success',
  /** 单个下载任务失败 */
  DOWNLOAD_FAILED: 'download_failed',
  /** 单个下载任务因额度不足未开始 */
  DOWNLOAD_QUOTA_INSUFFICIENT: 'download_quota_insufficient',
  /** 打开扩展弹窗 */
  POPUP_OPEN: 'popup_open',
  /** 游客在额度或升级流程中看到登录提示 */
  LOGIN_MODAL_OPEN: 'login_modal_open',
  /** 用户点击按钮发起插件登录 */
  LOGIN_CLICK: 'login_click',
  /** 凭据兑换并持久化完成 */
  LOGIN_SUCCESS: 'login_success',
  /** 用户主动关闭插件登录弹窗 */
  LOGIN_CANCELLED: 'login_cancelled',
  /** 登录未完成，阶段与原因放在 mark_msg */
  LOGIN_FAILED: 'login_failed',
  /** 打开升级订阅弹窗 */
  UPGRADE_MODAL_OPEN: 'upgrade_modal_open',
  /** 打开独立插件定价页 */
  PRICING_VIEW: 'pricing_view',
  /** 插件定价页支付成功 */
  CHECKOUT_SUCCESS: 'checkout_success',
  /** Vimeo content script 初始化 */
  CONTENT_OPEN: 'content_open'
} as const

export type MarkType = (typeof MARK_TYPE)[keyof typeof MARK_TYPE]

/** 登录按钮的业务入口取值，不依赖 RPC 运行上下文；跨上下文参数校验也用它。 */
export const LOGIN_SOURCES = [
  'popup',
  'popup_upgrade_now',
  'popup_quota_counter',
  'upgrade_modal'
] as const

/** 登录按钮的业务入口。 */
export type LoginSource = (typeof LOGIN_SOURCES)[number]

/**
 * 打点响应
 */
export interface MarkResponse {
  /** 是否记录成功 */
  recorded: boolean
}
