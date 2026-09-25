export interface HomepageWorkspaceContent {
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
  quota: {
    eyebrow: string
    title: string
    planLabel: string
    remainingLabel: string
    dailyLimitLabel: string
    unlimited: string
  }
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
    largeFileExtensionInlineChromeTitle?: string
    largeFileExtensionInlineChromeDescription?: string
    largeFileExtensionInlineChromeCta?: string
    largeFileExtensionInlineEdgeTitle?: string
    largeFileExtensionInlineEdgeDescription?: string
    largeFileExtensionInlineEdgeCta?: string
  }
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
  downloadAll: {
    allSuccess: string
    partialFailed: string
    allFailed: string
  }
}

export type DownloadWorkspaceContent = HomepageWorkspaceContent

export interface FeatureMessage {
  title: string
  description: string
  details: string[]
}

export interface StepMessage {
  title: string
  description: string
}

export interface HomepageHowToMessage {
  title: string
  subtitle: string
  steps: StepMessage[]
}

export interface TechSpecsMessage {
  title: string
  browsersLabel: string
  browsers: string
  /** 支持的链接来源标签。 */
  sourceHostsLabel: string
  /** 支持的链接来源，例如 vimeo.com。 */
  sourceHosts: string
  permissionsLabel: string
  permissions: string
  updatesLabel: string
  updates: string
}

export interface FAQItemMessage {
  question: string
  answer: string
}

export interface ChangelogEntryMessage {
  version: string
  date: string
  title: string
  description: string
  features: string[]
  fixes?: string[]
}

/** 平台落地页特性卡片 */
export interface PlatformFeatureMessage {
  /** 特性标题 */
  title: string
  /** 特性描述 */
  description: string
}

/** 通用信息表格的一行数据 */
export interface InfoTableRowMessage {
  /** 一行的单元格文本，顺序与 headers 对应；长度应等于 headers 列数 */
  cells: string[]
}

/** 通用信息表格区块（首页情景匹配表 / 方法对比表共用） */
export interface InfoTableMessage {
  /** 区块标题 */
  title: string
  /** 引导句（表格上方说明）。situation 有；comparison 无，故可选 */
  intro?: string
  /** 表头文本，列数应等于每行 cells 长度 */
  headers: string[]
  /** 数据行 */
  rows: InfoTableRowMessage[]
}

/** 文章页目录链接 */
export interface GuideLinkMessage {
  /** 显示文案 */
  label: string
  /** 页面内锚点，不含 # */
  anchor: string
}

/** 文章页普通段落 */
export interface GuideParagraphMessage {
  /** 段落文本 */
  text: string
}

/** 文章页列表 */
export interface GuideListMessage {
  /** 列表条目 */
  items: string[]
}

/** 文章页正文区块 */
export interface GuideSectionMessage {
  /** section id，用于锚点和 JSON-LD step url */
  id: string
  /** H2 标题 */
  title: string
  /** 普通段落 */
  paragraphs: GuideParagraphMessage[]
  /** 可选 bullet 或 numbered list */
  list?: GuideListMessage
  /** 可选提示段 */
  note?: string
}

/** 文章页快速答案 */
export interface GuideQuickAnswerMessage {
  /** Quick answer 标题 */
  title: string
  /** 快速处理步骤 */
  items: string[]
  /** 风险提示 */
  warning: string
}

/** 文章页方法对比表 */
export interface GuideComparisonTableMessage {
  /** H2 标题 */
  title: string
  /** 表头 */
  headers: string[]
  /** 表格行 */
  rows: InfoTableRowMessage[]
}

/** HowTo 单个步骤 */
export interface GuideHowToStepMessage {
  /** HowTo step 名称 */
  name: string
  /** 对应页面锚点 */
  anchor: string
  /** HowTo step 文本 */
  text: string
}

/** HowTo 结构化数据和可见步骤 */
export interface GuideHowToMessage {
  /** HowTo 名称 */
  name: string
  /** HowTo 描述 */
  description: string
  /** ISO 8601 duration，例如 PT5M */
  totalTime: string
  /** HowTo 工具名称列表 */
  tools: string[]
  /** HowTo 步骤 */
  steps: GuideHowToStepMessage[]
}

/** 首页 Solutions 方案卡（标题 + 描述 + "use when" 条件列表） */
export interface HomepageSolutionMessage {
  /** 方案标题 */
  title: string
  /** 方案说明 */
  description: string
  /** "Use this method when:" 标签文案 */
  useWhenLabel: string
  /** 适用条件 bullet 列表 */
  useWhen: string[]
}

/** 首页排错清单区块（独立 H2） */
export interface HomepageTroubleMessage {
  /** 排错区块标题 */
  title: string
  /** 引导段 */
  intro: string
  /** 排错清单条目 */
  items: string[]
}

/** 首页合规声明区块（独立 H2） */
export interface HomepagePermissionMessage {
  /** 合规声明标题 */
  title: string
  /** 合规声明正文 */
  note: string
}

/** 平台互链卡片 */
export interface PlatformCrossLinkMessage {
  /** 显示标题 */
  label: string
  /** 相对路径，如 '/vimeo-downloader/' — 不含 locale prefix */
  href: string
  /** 简短描述 */
  description: string
}

/** 单个平台落地页的完整内容 */
export interface PlatformDownloaderPageContent {
  /** SEO 元信息 */
  seo: {
    /** 页面标题 */
    title: string
    /** meta description */
    description: string
    /** meta keywords */
    keywords: string
  }
  /** 覆盖 DownloadWorkspace 的 parse 区域字段 */
  workspace: {
    /** workspace 标题 */
    title: string
    /** 辅助说明 */
    helperText: string
    /** 输入框 placeholder */
    linkPlaceholder: string
  }
  /** 平台特性区块 */
  features: {
    /** 区块标题 */
    title: string
    /** 区块副标题 */
    subtitle: string
    /** 3 个特性卡片 */
    items: PlatformFeatureMessage[]
  }
  /** HowTo 步骤区块 */
  howTo: HomepageHowToMessage
  /** FAQ 区块 */
  faq: {
    /** 区块标题 */
    title: string
    /** 区块描述 */
    description?: string
    /** FAQ 问答列表 */
    items: FAQItemMessage[]
  }
}

/** Pricing 页面内容。 */
export interface PricingPageContent {
  /** 主推商品的徽章文案（普通入口标记 Credits 中间档，插件入口标记订阅卡）。 */
  popularLabel: string
  /** 用户状态卡片。 */
  account: {
    title: string
    loading: string
    signedOutTitle: string
    signedOutDescription: string
    signInCta: string
    signedInLabel: string
    creditsLabel: string
    subscriptionLabel: string
    expiresLabel: string
    statusLabel: string
    dailyUsageLabel: string
    resetLabel: string
    autoRenewLabel: string
    active: string
    expired: string
    noExpiry: string
    freePlan: string
    unlimited: string
    loadFailed: string
  }
  /** 账号订阅行的管理入口（后端返回渠道管理页 URL）。 */
  subscriptionManagement: {
    /** 账号订阅行的管理入口文案。 */
    buttonLabel: string
    /** 创建订阅管理入口失败时的用户提示。 */
    loadFailed: string
  }
  /** Unlimited 商品卡。 */
  subscription: {
    /** 订阅页首屏与 SEO 共用的说明。 */
    pageDescription: string
    title: string
    eyebrow: string
    /** 订阅卡的卖点清单，逐条 SSR 渲染。 */
    benefits: readonly string[]
    /** 购买按钮下的支付保障说明。 */
    trustNote: string
    /** 订阅卡价格旁的月付周期标签。 */
    monthlyLabel: string
    /** 订阅卡价格旁的年付周期标签。 */
    yearlyLabel: string
    /** 订阅卡价格旁的终生周期标签，也用于账户区终生权益的到期栏。 */
    lifetimeLabel: string
    /** 订阅季卡价格下方的省钱标注，如 Save 33%。 */
    quarterlySavingsLabel: string
    dailyLimitLabel: string
    autoRenewOn: string
    autoRenewOff: string
    /** 订阅商品在支付选择弹窗中的使用范围提示。 */
    usageNotice: string
    loading: string
    loadFailed: string
    noPlan: string
    noChannels: string
    buyNow: string
    loginToBuy: string
    /** 已有有效订阅时重复购买按钮提示。 */
    alreadyActive: string
    creatingOrder: string
    pendingPaymentTitle: string
    pendingPayment: string
    successTitle: string
    successDescription: string
    failedTitle: string
    close: string
    cancelPayment: string
    supportMailPrefix: string
    createFailed: string
    invalidPaymentData: string
    priceUpdated: string
    gatewayFailed: string
    orderNotFound: string
    orderExpired: string
    paymentCanceled: string
    fulfillmentFailed: string
    pollFailed: string
    pollTimeout: string
    authExpired: string
    /** 订阅购买前的插件安装确认标题。 */
    installConfirmTitle: string
    /** 订阅购买前的插件安装确认正文，{link} 会替换成安装链接。 */
    installConfirmMessage: string
    /** 订阅购买前的插件安装链接文案。 */
    installConfirmLinkLabel: string
    /** 订阅购买前确认框取消按钮。 */
    installConfirmCancel: string
    /** 订阅购买前确认框继续按钮。 */
    installConfirmContinue: string
    /** 仅向好评赠送资格状态位为 0（可领）的账号展示的好评赠送流程。 */
    reviewReward: {
      /** 初始确认中的赠送说明。 */
      offerMessage: string
      /** 打开 Chrome Web Store 评价页的按钮。 */
      reviewButton: string
      /** 倒计时视图标题。 */
      checkingTitle: string
      /** 倒计时视图说明。 */
      checkingMessage: string
      /** 包含 {seconds} 的剩余时间模板。 */
      countdown: string
      /** 领取请求中的标题。 */
      claimingTitle: string
      /** 领取请求中的说明。 */
      claimingMessage: string
      /** 领取成功标题。 */
      successTitle: string
      /** 领取成功说明。 */
      successMessage: string
      /** 已领取结果标题。 */
      alreadyClaimedTitle: string
      /** 已领取结果说明。 */
      alreadyClaimedMessage: string
      /** 领取失败标题。 */
      failedTitle: string
      /** 普通领取失败说明。 */
      failedMessage: string
      /** 服务器繁忙说明。 */
      busyMessage: string
      /** 直接重试领取按钮。 */
      retry: string
      /** 关闭弹窗按钮。 */
      close: string
    }
  }
  /** Credits 一次性购买区。 */
  credits: {
    title: string
    description: string
    loading: string
    loadFailed: string
    noConfigs: string
    packageEyebrow: string
    creditsAmount: string
    /** Credits 卡价格旁的一次性标注（如 one-time）。 */
    oneTimeLabel: string
    buyNow: string
    loginToBuy: string
    noChannels: string
    /** Credits 卡片价格下方的使用范围提示。 */
    webOnlyNotice: string
  }
  /** 从插件额度入口进入 Pricing 页时的专属强化文案。 */
  extensionSource: {
    /** 已登录或普通升级按钮文案。 */
    primaryCta: string
    /** 未登录升级按钮文案。 */
    signedOutCta: string
    /** 符合资格账号在插件来源页看到的好评赠送标题。 */
    reviewRewardTitle: string
    /** 好评赠送入口的操作说明。 */
    reviewRewardDescription: string
  }
  /** 页底购买答疑（仅围绕积分购买和订阅）。 */
  faq: {
    /** 区块标题。 */
    title: string
    /** 区块描述。 */
    description?: string
    /** 问答列表。 */
    creditsItems: FAQItemMessage[]
    /** 订阅购买答疑。 */
    subscriptionItems: FAQItemMessage[]
  }
}

export interface SiteContent {
  site: {
    name: string
    description: string
    keywords: string
  }
  layout: {
    nav: {
      brand: string
      home: string
      pricing: string
      solutions: string
      changelog: string
    }
    footer: {
      /** Footer heading for legal and product-reference links. */
      resources: string
      rights: string
    }
  }
  common: {
    installCta: string
  }
  sections: {
    features: {
      title: string
      subtitle: string
      metaDescription?: string
      items: FeatureMessage[]
    }
    steps: {
      title: string
      subtitle: string
      metaDescription?: string
      items: StepMessage[]
    }
    cta: {
      title: string
      description: string
    }
    techSpecs: TechSpecsMessage
  }
  pages: {
    homepage: {
      hero: {
        title: string
        description: string
      }
      stats: {
        users: string
        downloads: string
      }
      /** 首页独立 SEO meta（不复用全站 site.*） */
      seo: {
        /** <title>：首页独立 SEO 标题 */
        title: string
        /** <meta description> */
        description: string
        /** <meta keywords>：逗号分隔，private 口径关键词 */
        keywords: string
      }
      /** Hero 信任徽标（恰好 4 个短文本） */
      heroTrustPoints: [string, string, string, string]
      /** 情景匹配表（有 intro 引导段） */
      situation: InfoTableMessage
      /** Solutions 四方案区块 */
      solutions: {
        /** 区块标题 */
        title: string
        /** 定义段 */
        intro: string
        /** Quick answer 强调段（与 intro 分列） */
        quickAnswer: string
        /** 方案卡 */
        items: HomepageSolutionMessage[]
      }
      /** Why Use 卖点区块（标题后有引导段） */
      benefits: {
        /** 区块标题 */
        title: string
        /** 引导段 */
        intro: string
        /** 卖点卡，复用 PlatformFeatureMessage 的 {title, description} */
        items: PlatformFeatureMessage[]
      }
      /** 排错清单（独立 H2） */
      troubleshooting: HomepageTroubleMessage
      /** 合规声明（独立 H2） */
      permission: HomepagePermissionMessage
      /** 方法对比表（标题后直接表格，无 intro） */
      comparison: InfoTableMessage
      howTo?: HomepageHowToMessage
      faq: {
        title: string
        description?: string
        items: FAQItemMessage[]
      }
      workspace: HomepageWorkspaceContent
      /** 首页底部平台互链区块 */
      crossLinks?: {
        /** 区块标题 */
        title: string
        /** 互链卡片列表 */
        items: PlatformCrossLinkMessage[]
      }
    }
    changelog: {
      title: string
      description: string
      seoTitle?: string
      seoDescription?: string
      entries: ChangelogEntryMessage[]
      labels: {
        features: string
        fixes: string
      }
    }
    /** 平台 SEO 落地页内容 */
    platformDownloaders: {
      vimeo: PlatformDownloaderPageContent
    }
    /** Pricing 页面内容。 */
    pricing: PricingPageContent
  }
}
