/** 下载工作区文案。 */
export interface DownloadWorkspaceContent {
  /** 匿名下载等待窗口。 */
  anonymousQueue: {
    /** 窗口标题。 */
    title: string
    /** 剩余时间，{seconds} 为秒数。 */
    remaining: string
    /** 关闭按钮。 */
    close: string
  }
  /** 解析与结果区文案。 */
  parse: {
    eyebrow: string
    /** H1 第一行：品牌词。 */
    titleBrand: string
    /** H1 第二行：标语，与品牌词之间由组件补一个空格。 */
    titleTagline: string
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
    /** 首屏默认显示的通用插件入口一行文案。 */
    extensionEntryLine: string
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
    /** 后端要求该资源改用插件下载（匿名状态 3）时的提示。 */
    useExtensionForResource: string
    vimeoParseFailed?: string
    rateLimitExceeded: string
  }
  /** 批量下载结果文案。 */
  downloadAll: {
    allSuccess: string
    partialFailed: string
    allFailed: string
  }
}

/** Pricing 登录弹窗文案；站点 i18n schema 与 Pricing 组件共用这一份定义。 */
export interface PricingAuthCopy {
  eyebrow: string
  title: string
  continueWithGoogle: string
  googleLoading: string
  or: string
  emailLabel: string
  emailPlaceholder: string
  continueWithEmail: string
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
  errors: {
    enterEmailFirst: string
    enterEmailAndCode: string
    sendCodeFailed: string
    googleSignInFailed: string
    googleClientMissing: string
    signInFailed: string
  }
}

export interface FAQItemMessage {
  question: string
  answer: string
}

/** 首页「标题 + 描述」卡片，功能与步骤区块共用。 */
export interface HomepageCardMessage {
  title: string
  description: string
}

/** 首页展示段文案：工具首屏之后的 8 个静态区块。区块标题 `heading` 即各区块唯一的 H2。 */
export interface HomepageContent {
  /** 首页 <title> 与 <meta description>。 */
  meta: {
    title: string
    description: string
  }
  /** Hero 信任徽标（恰好 4 个短文本）。 */
  heroTrustPoints: [string, string, string, string]
  /** 下载工作区文案。 */
  workspace: DownloadWorkspaceContent
  /** SoftwareApplication 结构化数据，全站共用。 */
  softwareApplication: {
    /** 插件定位描述（取自商店文案副标题），不得写成「无需插件」。 */
    description: string
    /** 插件能力清单。 */
    featureList: string[]
  }
  /** 区块 1：插件介绍。 */
  intro: {
    heading: string
    lead: string
    /** 主按钮，指向商店。 */
    primaryCta: string
    /** 次按钮，指向 Pricing。 */
    secondaryCta: string
    /** 插件页内面板示意。 */
    panel: {
      ariaLabel: string
      /** 四行标签，取自插件 popup 的 resourceItem.type.*。 */
      rows: {
        video: string
        audio: string
        subtitle: string
        image: string
      }
    }
  }
  /** 区块 2：功能卡片，来自商店文案「CORE FEATURES」。 */
  features: {
    heading: string
    items: HomepageCardMessage[]
  }
  /** 区块 3：使用步骤，按安装 → 固定图标 → 打开视频页 → 选择画质排序。 */
  steps: {
    heading: string
    items: HomepageCardMessage[]
  }
  /** 区块 4：网页版与插件对比。 */
  comparison: {
    heading: string
    columns: {
      dimension: string
      web: string
      extension: string
    }
    rows: Array<{
      dimension: string
      web: string
      extension: string
    }>
  }
  /** 区块 5：适用范围与边界。 */
  scope: {
    heading: string
    worksFor: { heading: string; items: string[] }
    doesNot: { heading: string; items: string[] }
    compliance: { heading: string; items: string[] }
  }
  /** 区块 6：方案概览，不写额度数字与价格（两者都来自后端配置）。 */
  plans: {
    heading: string
    free: { name: string; description: string; cta: string }
    unlimited: { name: string; description: string; cta: string }
  }
  /** 区块 7：FAQ，同时生成 FAQPage JSON-LD。 */
  faq: {
    heading: string
    items: FAQItemMessage[]
  }
  /** 区块 8：结尾 CTA。 */
  finalCta: {
    heading: string
    description: string
    primaryCta: string
  }
}

/** Pricing 页面内容。 */
export interface PricingPageContent {
  /** 主推订阅卡的徽章文案。 */
  popularLabel: string
  /** 用户状态卡片。 */
  account: {
    title: string
    loading: string
    signedOutTitle: string
    signedOutDescription: string
    signInCta: string
    signedInLabel: string
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
  /** 账户菜单无障碍文案。 */
  accountMenu: {
    accountButtonLabel: string
    accountMenuLabel: string
  }
  /** Pricing 登录弹窗文案。 */
  auth: PricingAuthCopy
  /** 订单结算弹窗中订阅文案之外的专属键（其余键复用 subscription）。 */
  checkout: {
    paymentMethodLabel: string
    paymentTitle: string
    selectedPackageLabel: string
    clinkMethods: string
    confirmPurchase: string
    backToProducts: string
    agreementText: string
    failed: string
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
  /** 页底购买答疑。 */
  faq: {
    /** 区块标题。 */
    title: string
    /** 区块描述。 */
    description?: string
    /** 订阅购买答疑。 */
    items: FAQItemMessage[]
  }
}

export interface SiteContent {
  site: {
    /** 站点级默认 meta description：在线工具 + 插件，与首页 meta.description 同一措辞。 */
    description: string
  }
  layout: {
    nav: {
      brand: string
      home: string
      pricing: string
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
  pages: {
    homepage: HomepageContent
    /** Pricing 页面内容。 */
    pricing: PricingPageContent
  }
}
