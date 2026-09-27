/**
 * 国际化翻译 Key 常量
 *
 * 提供类型安全的翻译 key，避免硬编码字符串
 * 遵循项目规范：IDE 友好、静态检测友好
 */

/**
 * 翻译键常量
 */
export const I18N_KEYS = {
  /** App 相关 */
  APP: {
    /** 应用标题 */
    TITLE: 'app.title',
    /** 头部品牌入口：打开官网首页 */
    OPEN_OFFICIAL_WEBSITE: 'app.openOfficialWebsite',
    /** 刷新按钮 */
    REFRESH: 'app.refresh',
    /** 底部支持联系方式 */
    SUPPORT_CONTACT: 'app.supportContact',
    /** 复制支持邮箱按钮 */
    COPY_SUPPORT_EMAIL: 'app.copySupportEmail',
    /** 支持邮箱复制成功 */
    SUPPORT_EMAIL_COPIED: 'app.supportEmailCopied',
    /** 支持邮箱复制失败 */
    SUPPORT_EMAIL_COPY_FAILED: 'app.supportEmailCopyFailed'
  },

  /** Store 错误相关 */
  STORE_ERROR: {
    /** 无法获取标签页 */
    TAB_NOT_FOUND: 'store.error.tabNotFound',
    /** 获取资源失败 */
    FETCH_FAILED: 'store.error.fetchFailed',
    /** 下载失败 */
    DOWNLOAD_FAILED: 'store.error.downloadFailed',
    /** Content script 未连接 */
    CONTENT_SCRIPT_NOT_CONNECTED: 'store.error.contentScriptNotConnected'
  },

  /** 资源项相关 */
  RESOURCE_ITEM: {
    /** 下载 */
    DOWNLOAD: 'resourceItem.download',
    /** 类型 - 图片 */
    TYPE_IMAGE: 'resourceItem.type.image',
    /** 类型 - 视频 */
    TYPE_VIDEO: 'resourceItem.type.video',
    /** 类型 - 音频 */
    TYPE_AUDIO: 'resourceItem.type.audio',
    /** 类型 - 字幕 */
    TYPE_SUBTITLE: 'resourceItem.type.subtitle',
    /** 该行没有可用档位时的占位按钮名，参数 `kind` 为已翻译的行名 */
    NO_OPTION_AVAILABLE: 'resourceItem.noOptionAvailable',
    /** 下载中 */
    DOWNLOADING: 'resourceItem.downloading',
    /** 等待中 */
    WAITING: 'resourceItem.waiting',
    /** 档位 - 最高画质（含音轨） */
    LABEL_BEST: 'resourceItem.label.best',
    /** 档位 - 最佳音轨 */
    LABEL_BEST_AUDIO: 'resourceItem.label.bestAudio',
    /** 档位 - 无音轨视频，参数 `quality` 如 `1080p` */
    LABEL_VIDEO_NO_AUDIO: 'resourceItem.label.videoNoAudio',
    /** 档位 - 封面图 */
    LABEL_THUMBNAIL: 'resourceItem.label.thumbnail'
  },

  /** 单视频面板相关 */
  VIDEO_PANEL: {
    /** 扫描中 */
    SCANNING: 'videoPanel.scanning',
    /** 页面没有可下载视频 */
    EMPTY: 'videoPanel.empty',
    /** 重新扫描 */
    RETRY: 'videoPanel.retry',
    /** 当前页面不是 Vimeo，引导用户跳转 */
    NOT_ON_VIMEO: 'videoPanel.notOnVimeo',
    /** 引导态跳转到 Vimeo 的按钮 */
    OPEN_VIMEO: 'videoPanel.openVimeo',
    /** 该行没有可用档位 */
    UNAVAILABLE: 'videoPanel.unavailable',
    /** 直接下载行：progressive 直链单文件档位，独立于 Video 行的 DASH/HLS 合流档位 */
    DIRECT_ROW_LABEL: 'videoPanel.directRow.label',
    /** 时间裁剪标题 */
    CLIP_TITLE: 'videoPanel.clip.title',
    /** 时间裁剪起点 */
    CLIP_START: 'videoPanel.clip.start',
    /** 时间裁剪终点 */
    CLIP_END: 'videoPanel.clip.end',
    /** 时间裁剪可用时的说明 */
    CLIP_HINT: 'videoPanel.clip.hint',
    /** 当前视频档位不支持时间裁剪 */
    CLIP_UNSUPPORTED: 'videoPanel.clip.unsupported',
    /** 音轨开关的可访问名称 */
    AUDIO_SWITCH_LABEL: 'videoPanel.audioSwitch.label',
    /** 音轨开关 - 交付带音轨 */
    AUDIO_SWITCH_WITH_AUDIO: 'videoPanel.audioSwitch.withAudio',
    /** 音轨开关 - 交付不带音轨 */
    AUDIO_SWITCH_WITHOUT_AUDIO: 'videoPanel.audioSwitch.withoutAudio',
    /** 聚合页检测到多个视频时的数量说明，参数 `count` 为视频数 */
    DETECTED_COUNT: 'videoPanel.detectedCount',
    /** 多视频选择器的可访问名称 */
    VIDEO_SWITCHER_LABEL: 'videoPanel.videoSwitcherLabel'
  },

  /** Popup 下载状态相关 */
  DOWNLOAD_STATUS: {
    /** 底部任务队列标题，参数 `count` 为未完成任务总数 */
    TITLE: 'downloadStatus.title',
    /** 全部停止按钮：取消所有等待中的任务 */
    STOP_ALL: 'downloadStatus.stopAll',
    /** 下载中分组标题 */
    DOWNLOADING_COUNT: 'downloadStatus.downloadingCount',
    /** 等待中分组标题 */
    WAITING_COUNT: 'downloadStatus.waitingCount',
    /** 失败分组标题 */
    FAILED_COUNT: 'downloadStatus.failedCount',
    /** 下载失败状态 */
    FAILED: 'downloadStatus.failed',
    /** 无法计算的进度 */
    UNKNOWN_PROGRESS: 'downloadStatus.unknownProgress',
    /** 百分比进度 */
    PROGRESS: 'downloadStatus.progress',
    /** 队首尚在解析最终文件名 */
    RESOLVING_FILENAME: 'downloadStatus.resolvingFilename',
    /** 单任务 progress 可访问名称 */
    TASK_PROGRESS: 'downloadStatus.taskProgress',
    /** 取消单个任务的可访问名称 */
    CANCEL_TASK: 'downloadStatus.cancelTask',
    /** 重试单个失败任务的可访问名称 */
    RETRY_TASK: 'downloadStatus.retryTask'
  },

  /** 设置弹层相关 */
  SETTINGS: {
    /** 弹层标题 */
    TITLE: 'settings.title',
    /** 界面语言标签 */
    LANGUAGE_LABEL: 'settings.language.label',
    /** 语言选项：跟随浏览器 */
    LANGUAGE_AUTO: 'settings.language.auto',
    /** 保存位置标题 */
    SAVE_PATH_LABEL: 'settings.savePath.label',
    /** 保存位置输入占位，说明填的是下载目录下的子目录 */
    SAVE_PATH_PLACEHOLDER: 'settings.savePath.placeholder'
  },

  /** 系统通知（background 侧经 I18nService 取文案） */
  NOTIFICATION: {
    /** 下载完成标题 */
    COMPLETE_TITLE: 'notification.downloadCompleteTitle',
    /** 下载完成消息，参数 `filename` 为已保存文件名 */
    COMPLETE_MESSAGE: 'notification.downloadCompleteMessage',
    /** 下载失败标题 */
    FAILED_TITLE: 'notification.downloadFailedTitle',
    /** 下载失败消息，参数 `filename` 为目标文件名 */
    FAILED_MESSAGE: 'notification.downloadFailedMessage'
  },

  /** 评分引导（popup footer） */
  RATING: {
    /** 引导文案 */
    PROMPT: 'rating.prompt',
    /** 低分致谢文案 */
    THANKS: 'rating.thanks',
    /** 单星按钮可访问名，参数 `stars` 为星数（1-5） */
    STAR_ARIA: 'rating.starAria'
  },

  /** 应用错误相关 */
  APP_ERROR: {
    /** 关闭按钮 */
    DISMISS: 'app.error.dismiss'
  },

  /** 认证相关 */
  AUTH: {
    /** 登录按钮 */
    LOGIN: 'auth.login',
    /** 退出登录 */
    LOGOUT: 'auth.logout',
    /** 登录弹窗标题 */
    MODAL_TITLE: 'auth.modal.title',
    /** 登录弹窗说明 */
    MODAL_DESCRIPTION: 'auth.modal.description',
    /** 邮箱字段标签 */
    MODAL_EMAIL_LABEL: 'auth.modal.emailLabel',
    /** 邮箱输入占位 */
    MODAL_EMAIL_PLACEHOLDER: 'auth.modal.emailPlaceholder',
    /** 使用邮箱继续 */
    MODAL_CONTINUE_WITH_EMAIL: 'auth.modal.continueWithEmail',
    /** 验证码字段标签 */
    MODAL_CODE_LABEL: 'auth.modal.codeLabel',
    /** 验证码输入占位 */
    MODAL_CODE_PLACEHOLDER: 'auth.modal.codePlaceholder',
    /** 重发验证码 */
    MODAL_RESEND: 'auth.modal.resend',
    /** 提交登录 */
    MODAL_SIGN_IN: 'auth.modal.signIn',
    /** 分隔文案 */
    MODAL_OR: 'auth.modal.or',
    /** 使用 Google 继续 */
    MODAL_CONTINUE_WITH_GOOGLE: 'auth.modal.continueWithGoogle',
    /** 登录弹窗关闭按钮 */
    MODAL_CLOSE: 'auth.modal.close',
    /** 验证码已发送 */
    MODAL_CODE_SENT: 'auth.modal.codeSent',
    /** 邮箱非法 */
    MODAL_EMAIL_REQUIRED: 'auth.modal.emailRequired',
    /** 验证码非法 */
    MODAL_CODE_REQUIRED: 'auth.modal.codeRequired',
    /** 验证码发送失败 */
    MODAL_SEND_FAILED: 'auth.modal.sendFailed',
    /** 登录失败 */
    MODAL_LOGIN_FAILED: 'auth.modal.loginFailed',
    /** 条款声明前缀 */
    MODAL_TERMS_NOTICE: 'auth.modal.termsNotice',
    /** 服务条款 */
    MODAL_TERMS_LINK: 'auth.modal.termsLink',
    /** 隐私政策 */
    MODAL_PRIVACY_LINK: 'auth.modal.privacyLink'
  },

  /** 订阅相关 */
  SUBSCRIPTION: {
    /** 无限制 */
    UNLIMITED: 'subscription.unlimited',
    /** 用户菜单：管理订阅 */
    MANAGE: 'subscription.manage',
    /** 订阅没有可用的渠道管理页时的提示 */
    MANAGE_UNAVAILABLE: 'subscription.manageUnavailable'
  },

  /** 内嵌购买视图相关 */
  PREMIUM: {
    /** 视图标题 */
    TITLE: 'premium.title',
    /** 登录门控文案 */
    GATE_MESSAGE: 'premium.gateMessage',
    /** 卖点：无限下载 */
    SELLING_UNLIMITED: 'premium.selling.unlimited',
    /** 卖点：全画质与音轨字幕 */
    SELLING_QUALITY: 'premium.selling.quality',
    /** 卖点：片段裁剪 */
    SELLING_TRIMMING: 'premium.selling.trimming',
    /** 周期：月付 */
    PERIOD_MONTH: 'premium.period.month',
    /** 周期：季付 */
    PERIOD_QUARTER: 'premium.period.quarter',
    /** 周期：年付 */
    PERIOD_YEAR: 'premium.period.year',
    /** 周期：终生 */
    PERIOD_LIFETIME: 'premium.period.lifetime',
    /** 套餐标记：渠道自动续费 */
    AUTO_RENEW: 'premium.plan.autoRenew',
    /** 套餐标记：一次性购买 */
    ONE_TIME: 'premium.plan.oneTime',
    /** 套餐额度：无限 */
    QUOTA_UNLIMITED: 'premium.plan.quotaUnlimited',
    /** 套餐额度：每日限量，参数 `limit` 为次数 */
    QUOTA_PER_DAY: 'premium.plan.quotaPerDay',
    /** 支付方式选择标题 */
    PAYMENT_METHOD: 'premium.paymentMethod',
    /** 发起支付按钮 */
    BUY: 'premium.buy',
    /** 订单创建中按钮文案 */
    CREATING: 'premium.creating',
    /** 等待支付标题 */
    PENDING_TITLE: 'premium.pending.title',
    /** 等待支付说明 */
    PENDING_MESSAGE: 'premium.pending.message',
    /** 取消等待按钮 */
    PENDING_CANCEL: 'premium.pending.cancel',
    /** 支付成功标题 */
    SUCCESS_TITLE: 'premium.success.title',
    /** 支付成功说明 */
    SUCCESS_MESSAGE: 'premium.success.message',
    /** 支付成功完成按钮 */
    SUCCESS_DONE: 'premium.success.done',
    /** 支付未完成标题 */
    FAILED_TITLE: 'premium.failed.title',
    /** 重试按钮 */
    RETRY: 'premium.retry',
    /** 失败态支持联系方式，参数 `email` 为支持邮箱 */
    SUPPORT: 'premium.support',
    /** 套餐配置加载失败 */
    ERROR_LOAD: 'premium.error.load',
    /** 无可购买套餐 */
    ERROR_EMPTY: 'premium.error.empty',
    /** 通用失败 */
    ERROR_GENERIC: 'premium.error.generic',
    /** 支付网关失败 */
    ERROR_GATEWAY: 'premium.error.gateway',
    /** 订单不存在或已过期 */
    ERROR_ORDER_GONE: 'premium.error.orderGone',
    /** 支付已取消 */
    ERROR_CANCELLED: 'premium.error.cancelled',
    /** 已支付但履约失败 */
    ERROR_FULFILLMENT: 'premium.error.fulfillment',
    /** 等待支付确认超时 */
    ERROR_TIMEOUT: 'premium.error.timeout'
  },

  /** 配额相关 */
  QUOTA: {
    LOGIN_MESSAGE: 'quota.loginMessage',
    /** 升级弹窗标题 */
    UPGRADE_TITLE: 'quota.upgradeTitle',
    /** 升级弹窗消息 */
    UPGRADE_MESSAGE: 'quota.upgradeMessage',
    /** 升级按钮 */
    UPGRADE_BUTTON: 'quota.upgradeButton',
    /** 距离刷新还有小时和分钟 */
    RESET_IN_HOURS_MINUTES: 'quota.resetInHoursMinutes',
    /** 距离刷新还有整小时 */
    RESET_IN_HOURS: 'quota.resetInHours',
    /** 距离刷新还有分钟 */
    RESET_IN_MINUTES: 'quota.resetInMinutes',
    /** 刷新时刻已到 */
    RESET_READY: 'quota.resetReady',
    /** 本地绝对刷新时间 */
    RESET_AT: 'quota.resetAt',
    /** 提示 - 正常状态 */
    TOOLTIP_NORMAL: 'quota.tooltip.normal',
    /** 提示 - 次数用完 */
    TOOLTIP_EXHAUSTED: 'quota.tooltip.exhausted'
  }
} as const

/**
 * 翻译键类型
 */
export type I18nKey = (typeof I18N_KEYS)[keyof typeof I18N_KEYS]
export type I18nKeyWithPath = typeof I18N_KEYS

/**
 * 支持的语言
 */
export const SUPPORTED_LANGUAGES = {
  /** 英文 (默认) */
  EN_US: 'en-US',
  /** 简体中文 */
  ZH_CN: 'zh-CN',
  /** 繁体中文 */
  ZH_TW: 'zh-TW',
  /** 日语 */
  JA_JP: 'ja-JP',
  /** 韩语 */
  KO_KR: 'ko-KR',
  /** 西班牙语 */
  ES_ES: 'es-ES',
  /** 葡萄牙语 (巴西) */
  PT_BR: 'pt-BR',
  /** 德语 */
  DE_DE: 'de-DE',
  /** 法语 */
  FR_FR: 'fr-FR',
  /** 俄语 */
  RU_RU: 'ru-RU',
  /** 意大利语 */
  IT_IT: 'it-IT',
  /** 越南语 */
  VI_VN: 'vi-VN',
  /** 泰语 */
  TH_TH: 'th-TH',
  /** 印度尼西亚语 */
  ID_ID: 'id-ID'
} as const

/**
 * 支持的语言类型
 */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[keyof typeof SUPPORTED_LANGUAGES]

/** 设置里的「跟随浏览器」语言值；读取时即时按浏览器语言解析，不固化成具体 locale。 */
export const LANGUAGE_AUTO = 'auto'

/** 语言设置的持久化取值：具体 locale 或 Auto。 */
export type LanguageSetting = SupportedLanguage | typeof LANGUAGE_AUTO
