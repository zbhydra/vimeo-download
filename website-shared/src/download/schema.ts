/**
 * 下载工作区宿主无关文案类型。
 *
 * 两个 Astro 站点各自维护 i18n 内容，传入共享下载组件；共享层只关心字段合同，
 * 不反向依赖任一站点的语言文件。
 */

/** 下载工作区文案。 */
export interface DownloadWorkspaceContent {
  /** 匿名下载等待窗口。 */
  anonymousQueue: {
    /** 窗口标题。 */
    title: string
    /** 剩余时间，{seconds} 为秒数。 */
    remaining: string
    /** 登录提示。 */
    hint: string
    /** 登录按钮。 */
    login: string
    /** 关闭按钮。 */
    close: string
  }
  /** 登录弹窗与登录态文案。 */
  auth: {
    eyebrow: string
    title: string
    trigger?: string
    modalTitle?: string
    modalDescription?: string
    closeLabel?: string
    signedInAs: string
    continueWithGoogle: string
    googleLoading: string
    or: string
    emailLabel: string
    emailPlaceholder: string
    continueWithEmail: string
    sendCode: string
    sendingCode: string
    sendCodeSuccess: string
    sendAgain: string
    codeLabel: string
    codePlaceholder: string
    signIn: string
    termsNotice: string
    termsLink: string
    privacyLink: string
    logout: string
    /** website 积分单位文案。 */
    creditsLabel: string
  }
  /** 配额展示文案。 */
  quota: {
    eyebrow: string
    title: string
    planLabel: string
    remainingLabel: string
    dailyLimitLabel: string
    unlimited: string
  }
  /** 首页 Credits 签到入口与弹窗文案。 */
  checkin: {
    /** Credits 胶囊无余额时的占位文案。 */
    creditsLoading: string
    /** Credits 胶囊按钮无障碍文案。 */
    creditsButtonLabel: string
    /** 账户按钮无障碍文案。 */
    accountButtonLabel: string
    /** 账户菜单无障碍文案。 */
    accountMenuLabel: string
    /** 签到弹窗标题。 */
    title: string
    /** 今日可领取奖励说明，支持 {credits} 占位符。 */
    todayRewardText: string
    /** 已领取结果说明，支持 {credits} 占位符。 */
    claimedRewardText: string
    /** 距离下次可领取倒计时，支持 {time} 占位符。 */
    nextCountdown: string
    /** 下次可领取绝对时间，支持 {time} 占位符。 */
    nextAt: string
    /** 主领取按钮文案，支持 {credits} 占位符。 */
    claimButton: string
    /** 领取中的按钮文案。 */
    claimingButton: string
    /** 暂不领取按钮文案。 */
    notNow: string
    /** 关闭弹窗按钮文案。 */
    close: string
    /** 签到状态加载失败文案。 */
    loadFailed: string
    /** 签到领取失败文案。 */
    claimFailed: string
  }
  /** Credits 不足时打开的购买弹窗文案。 */
  creditPurchase: {
    /** Credits 弹窗内的插件引导说明。 */
    installGuide: string
    /** Credits 弹窗内的插件安装按钮文字。 */
    installExtension: string
    /** 弹窗标题。 */
    title: string
    /** 弹窗描述。 */
    description: string
    /** success 态标题。 */
    successTitle: string
    /** success 态描述。 */
    successDescription: string
    /** 商品卡片 eyebrow。 */
    packageEyebrow: string
    /** 商品卡片说明。 */
    cardNote: string
    /** Credits 数量文案，支持 {credits}。 */
    creditsAmount: string
    /** 主购买按钮。 */
    buyNow: string
    /** 未选中商品卡片按钮。 */
    selectPackage?: string
    /** 支付渠道选择标题。 */
    paymentMethodLabel?: string
    /** 支付方式确认弹窗标题。 */
    paymentTitle?: string
    /** 已选商品摘要标签。 */
    selectedPackageLabel?: string
    clinkMethods?: string
    /** 确认购买按钮。 */
    confirmPurchase?: string
    /** 返回商品列表按钮。 */
    backToProducts?: string
    /** 关闭按钮无障碍文案。 */
    close: string
    /** 协议勾选文案。 */
    agreementText: string
    /** 配置加载中文案。 */
    loadingConfigs: string
    /** 配置加载失败文案。 */
    loadFailed: string
    /** 无可售商品文案。 */
    noConfigs: string
    /** 可购买状态文案。 */
    ready: string
    /** 创建订单中文案。 */
    creatingOrder: string
    /** 支付中默认文案。 */
    pendingPayment: string
    /** 订单等待弹窗标题。 */
    pendingPaymentTitle?: string
    /** 取消支付按钮文案。 */
    cancelPayment?: string
    /** 支付等待页支持邮箱前缀。 */
    supportMailPrefix?: string
    /** 成功状态文案。 */
    success: string
    /** 失败状态文案。 */
    failed: string
    /** success 态到账文案，支持 {credits}。 */
    successCredits: string
    /** success 态余额文案，支持 {balance}。 */
    successBalance: string
    /** 创建订单失败文案。 */
    createFailed: string
    /** 支付数据不合法文案。 */
    invalidPaymentData: string
    /** 价格更新文案。 */
    priceUpdated: string
    /** 支付网关失败文案。 */
    gatewayFailed: string
    /** 用户主动取消外部支付后的文案。 */
    paymentCanceled?: string
    /** 轮询失败文案。 */
    pollFailed: string
    /** 轮询超时文案。 */
    pollTimeout: string
    /** 订单不存在文案。 */
    orderNotFound: string
    /** 订单过期文案。 */
    orderExpired: string
    /** 履约失败文案。 */
    fulfillmentFailed: string
    /** 登录失效文案。 */
    authExpired: string
  }
  /** 解析与结果区文案。 */
  parse: {
    eyebrow: string
    title: string
    helperText?: string
    linkLabel: string
    linkPlaceholder: string
    clearInput?: string
    submit: string
    submitting: string
    noResults: string
    download: string
    downloading: string
    /** 下载前浏览器存储检测中文案。 */
    checkingStorage?: string
    preparingMp4?: string
    downloadAll: string
    downloadingAll?: string
    unknownSize: string
    resumeNotice?: string
    resumeAction?: string
    pendingRestartText?: string
    pendingRestartButton?: string
    resumeUnavailableText?: string
    resumeDismiss?: string
    resuming?: string
    /** 大文件插件引导的 Chrome 卡片标题。 */
    largeFileExtensionInlineChromeTitle?: string
    /** 大文件插件引导的 Chrome 卡片说明。 */
    largeFileExtensionInlineChromeDescription?: string
    /** 大文件插件引导的 Chrome 安装入口文案。 */
    largeFileExtensionInlineChromeCta?: string
    /** 大文件插件引导的 Edge 卡片标题。 */
    largeFileExtensionInlineEdgeTitle?: string
    /** 大文件插件引导的 Edge 卡片说明。 */
    largeFileExtensionInlineEdgeDescription?: string
    /** 大文件插件引导的 Edge 安装入口文案。 */
    largeFileExtensionInlineEdgeCta?: string
  }
  /** 错误文案。 */
  errors: {
    enterEmailFirst: string
    enterEmailAndCode: string
    sendCodeFailed: string
    googleSignInFailed: string
    googleClientMissing: string
    restoreSessionFailed: string
    signInFailed: string
    logoutFailed: string
    loadQuotaFailed: string
    enterLink: string
    /** 用户输入不是合法 URL 时的本地校验提示。 */
    invalidLink?: string
    parseFailed: string
    downloadFailed: string
    /** 网站端出于安全策略不允许直接下载该文件类型时的插件引导文案。 */
    unsafeFileTypeUseExtension?: string
    /** 网站端不允许直接下载文件类型时的确认弹窗标题。 */
    unsafeFileTypeConfirmTitle?: string
    /** 网站端不允许直接下载文件类型时确认查看插件卡片的按钮文案。 */
    unsafeFileTypeConfirmViewExtension?: string
    /** 网站端不允许直接下载文件类型时取消查看插件卡片的按钮文案。 */
    unsafeFileTypeConfirmCancel?: string
    /** 浏览器本地存储不足时的插件引导文案，支持 {file_size}/{available_space}/{required_space}。 */
    browserStorageInsufficientUseExtension?: string
    /** 浏览器本地存储不足时的确认弹窗标题。 */
    browserStorageInsufficientConfirmTitle?: string
    /** 浏览器本地存储不足时确认查看插件卡片的按钮文案。 */
    browserStorageInsufficientConfirmViewExtension?: string
    /** 浏览器本地存储不足时取消查看插件卡片的按钮文案。 */
    browserStorageInsufficientConfirmCancel?: string
    downloadNetworkInterrupted?: string
    unsupportedDownloadMode?: string
    clientMuxFailed?: string
    clientMuxTooLarge?: string
    trackFetchFailed?: string
    unsupportedPlatform: string
    vimeoParseFailed?: string
    quotaExceeded: string
    rateLimitExceeded: string
  }
  /** 批量下载结果文案。 */
  downloadAll: {
    allSuccess: string
    partialFailed: string
    allFailed: string
  }
}
