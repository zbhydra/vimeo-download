import type { SiteContent } from '../schema'
import { zhCNPricingContent } from '../pricing'

export const zhCN: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — 下载 Vimeo 高清视频',
    description:
      '粘贴公开的 Vimeo 链接，用你需要的清晰度保存视频。普通下载无需安装应用、无需账号，也不用装浏览器插件。',
    keywords: 'Vimeo 视频下载, Vimeo 下载器, 下载 Vimeo 视频, Vimeo 高清下载, Vimeo 转 MP4, 在线 Vimeo 下载'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: '首页',
      pricing: '价格',
      solutions: '下载指南',
      changelog: '更新日志'
    },
    footer: {
      resources: '资源',
      rights: '© 2026 Vimeo Video Downloader. 保留所有权利.'
    }
  },
  common: {
    installCta: '立即安装'
  },
  sections: {
    features: {
      title: 'Vimeo 下载功能',
      subtitle:
        '针对公开的 Vimeo 链接，下载器会解析页面、列出 Vimeo 提供的清晰度，并保存你选择的那一档。',
      metaDescription:
        'Vimeo Video Downloader 功能：高清下载、清晰度自选、MP4 输出、无需账号，并明确界定私密或加密视频的处理边界。',
      items: [
        {
          title: '清晰度自选',
          description: '直接选你需要的清晰度，而不是被迫接受 Vimeo 提供的最小文件',
          details: [
            '在视频提供的多个清晰度中选择',
            '下载可用的最高画质用于离线观看',
            '保留原始画面比例与音轨',
            'MP4 输出，任何设备与播放器都能播放'
          ]
        },
        {
          title: '链接解析',
          description: '粘贴 Vimeo 视频页面链接，下载器读取可用的清晰度',
          details: [
            '支持 vimeo.com、www.vimeo.com 与 player.vimeo.com 链接',
            '无需 Vimeo 账号或登录',
            '视频私密或无法解析时给出明确提示',
            '普通下载无需安装任何东西'
          ]
        },
        {
          title: '大文件支持',
          description: '较长的 Vimeo 视频也能下载，带进度显示；文件过大时可交给浏览器插件',
          details: [
            '下载过程中可以看到进度',
            '中断的下载可以在工作区继续',
            '浏览器单独无法完成的文件交给插件处理',
            '大文件开始前先检查本地存储'
          ]
        },
        {
          title: '全设备可用',
          description: '手机、平板或电脑都能打开同一个页面，下载在浏览器里完成',
          details: [
            '支持 Windows、macOS、Android、iPhone 与平板',
            '不需要安装桌面应用',
            '小屏幕下自适应布局',
            '文件保存在浏览器默认的下载目录'
          ]
        },
        {
          title: '明确的访问边界',
          description: '私密、加密或需要付费的 Vimeo 视频不在支持范围内，并会如实提示',
          details: [
            '不会尝试绕过隐私或访问限制',
            '绝不索要 Vimeo 密码、验证码或会话文件',
            '只解析公开的视频页面',
            '下载前请确认自己有权保留该视频'
          ]
        },
        {
          title: '快速、免注册流程',
          description: '复制、粘贴、选择、下载；只有需要积分时才需要账号',
          details: [
            '解析公开链接无需注册',
            '只有需要积分时才用 Google 或邮箱验证码登录',
            '积分永不过期',
            '链接无法处理时会给出明确的错误提示'
          ]
        }
      ]
    },
    steps: {
      title: '如何保存 Vimeo 视频',
      subtitle:
        '整个流程只有三步：复制 Vimeo 视频页面链接，粘贴到上方，然后选择清晰度并下载。',
      metaDescription:
        '保存 Vimeo 视频的分步指南：复制视频页面链接、粘贴到 Vimeo Video Downloader、选择清晰度并下载 MP4。',
      items: [
        {
          title: '复制 Vimeo 链接',
          description: '在 vimeo.com 打开视频，从地址栏或分享菜单复制链接'
        },
        {
          title: '粘贴到上方',
          description: '把链接放进输入框并开始解析，下载器会列出 Vimeo 提供的清晰度'
        },
        {
          title: '选择清晰度',
          description: '在可用清晰度中挑选你想要的那一档'
        },
        {
          title: '下载 MP4',
          description: '把文件保存到本地；文件很大时可能需要浏览器插件'
        }
      ]
    },
    cta: {
      title: '准备下载 Vimeo 视频了吗？',
      description: '把公开的 Vimeo 链接粘贴到上方，用你需要的清晰度保存下来。'
    },
    techSpecs: {
      title: '技术规格',
      browsersLabel: '浏览器',
      browsers: 'Chrome、Edge、Brave 及所有基于 Chromium 的浏览器',
      sourceHostsLabel: '支持的链接',
      sourceHosts: 'vimeo.com、www.vimeo.com、player.vimeo.com',
      permissionsLabel: '权限',
      permissions: '仅需最低权限',
      updatesLabel: '更新',
      updates: '从扩展商店自动更新'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: '用你需要的清晰度下载 Vimeo 视频',
        description: '粘贴公开的 Vimeo 链接，选一档清晰度，直接在浏览器里保存 MP4。'
      },
      stats: {
        users: '全球用户',
        downloads: '累计下载'
      },
      seo: {
        title: 'Vimeo 视频下载器：在线下载 Vimeo 高清视频',
        description:
          '保存公开的 Vimeo 视频并自选清晰度。粘贴链接、解析清晰度、下载 MP4，无需安装任何软件。',
        keywords:
          'Vimeo 视频下载, Vimeo 下载器, 下载 Vimeo 视频, Vimeo 高清下载, Vimeo 转 MP4, 在线 Vimeo 下载'
      },
      heroTrustPoints: [
        '高清下载',
        '无需注册',
        '移动端友好',
        '支持 Windows、Mac、Android 和 iPhone'
      ],
      situation: {
        title: '从这里开始：你手上是哪种 Vimeo 链接？',
        intro: '大多数找 Vimeo 下载器的人，手上都是下面这几种链接之一。看看你属于哪种：',
        headers: ['你的情况', '优先尝试'],
        rows: [
          {
            cells: [
              '你手上是公开 Vimeo 视频页面的链接',
              '把它粘贴到上方的下载器，并选择清晰度'
            ]
          },
          {
            cells: [
              '视频页面上没有下载按钮',
              '用这个下载器——只有上传者允许时 Vimeo 才会显示自己的下载按钮'
            ]
          },
          {
            cells: [
              '视频是私密的或需要密码',
              '需要所有者给你访问权限，下载器无法替你打开'
            ]
          },
          {
            cells: [
              '下载器提示视频私密或无法解析',
              '确认链接是视频页面地址，并且视频是公开的'
            ]
          }
        ]
      },
      solutions: {
        title: 'Vimeo 视频到底有哪些可行方法？',
        intro:
          'Vimeo 上视频的访问规则差别很大。公开的视频页面可以被下载器解析；私密、加密或付费墙后的视频，从外部无法访问，换任何工具都一样。',
        quickAnswer:
          '快速回答：如果 Vimeo 页面是公开的，把链接粘贴到上方并下载你需要的清晰度；如果 Vimeo 自己显示了下载按钮，那是更干净的路径；如果视频私密或需要密码，请向所有者索取访问权限或导出文件——没有下载器能绕过这一点。',
        items: [
          {
            title: '方案一：在线 Vimeo 下载器',
            description:
              '最适合公开的 Vimeo 视频页面。粘贴链接，让下载器列出 Vimeo 提供的清晰度，再保存你想要的那一档。',
            useWhenLabel: '适用场景：',
            useWhen: [
              '视频页面公开，无需登录即可打开。',
              '你想要指定清晰度或可用的最高画质。',
              '你不想安装浏览器插件或桌面应用。'
            ]
          },
          {
            title: '方案二：Vimeo 自带的下载按钮',
            description:
              '有些创作者会允许下载自己的视频。该选项开启后，Vimeo 播放器会显示下载按钮，这是最直接的路径。',
            useWhenLabel: '适用场景：',
            useWhen: [
              'Vimeo 播放器显示了下载入口。',
              '你想要创作者发布时的原始文件。',
              '你已经获得保留副本的许可。'
            ]
          },
          {
            title: '方案三：大文件用浏览器插件',
            description:
              '长视频可能超出浏览器标签页一次能流畅传输和存储的极限，插件会接管传输并支持续传。',
            useWhenLabel: '适用场景：',
            useWhen: [
              '文件非常大，或下载总是中断。',
              '工作区提示浏览器本地存储不足。',
              '你经常从 Vimeo 下载。'
            ]
          },
          {
            title: '方案四：屏幕录制（最后手段）',
            description:
              '如果视频你能播放、但没有任何合法的下载路径，可以用录屏工具录下来。这是兜底方案而不是首选，因为画质与音质取决于播放效果。',
            useWhenLabel: '适用场景：',
            useWhen: [
              '你有权观看并保留该视频。',
              '视频无法通过链接解析。',
              '你只是需要一个私人的离线参考副本。'
            ]
          }
        ]
      },
      benefits: {
        title: '为什么要用在线 Vimeo 下载器？',
        intro:
          '好的下载器要能快速回答一个问题：手上这个链接的 Vimeo 视频能不能保存？体验应该直接、如实说明限制，并在私密视频无法处理时讲清楚原因。',
        items: [
          {
            title: '保存高清画质',
            description: '保留 Vimeo 提供的最高清晰度，离线副本依然是创作者发布时的样子。'
          },
          {
            title: '跨设备可用',
            description:
              'Android、iPhone、Windows、Mac 或平板的浏览器都能用，文件由你手上已有的浏览器保存。'
          },
          {
            title: '无需登录 Vimeo',
            description: '公开视频页面不需要 Vimeo 账号，也绝不会索要密码、验证码或会话文件。'
          },
          {
            title: '离线播放方便',
            description: '下载结果是 MP4，几乎所有设备和播放器都能直接播放，无需额外解码器。'
          },
          {
            title: '基于链接的快速流程',
            description:
              '复制、粘贴、选择、下载。链接失败时，页面会说明视频是私密、已删除还是不受支持。'
          },
          {
            title: '明确的权限边界',
            description:
              '只下载你有权保留的视频，尊重创作者权益、Vimeo 条款以及视频本身的访问规则。'
          },
          {
            title: '清晰度可控',
            description: '在视频提供的多个清晰度之间选择，而不是被锁定在单一画质。'
          },
          {
            title: '大文件处理',
            description:
              '较长的视频在开始前会检查浏览器存储；超出标签页能力时，可通过浏览器插件继续。'
          },
          {
            title: '价格可预期',
            description:
              '解析公开链接无需账号。只有经过工作区的下载才需要积分，积分一次性购买且永不过期。'
          }
        ]
      },
      troubleshooting: {
        title: '如果 Vimeo 链接不可用',
        intro:
          '并不是每次失败都说明下载器坏了。Vimeo 视频失败通常是因为页面不公开。按这份清单排查：',
        items: [
          '在浏览器里打开链接，确认不登录也能播放视频。',
          '确认链接是视频页面，而不是个人主页、展示页或搜索页。',
          '检查视频是否需要密码或被设为私密。',
          '确认视频仍然存在——已删除的视频无法解析。',
          '如果页面访问不了 Vimeo，换个浏览器或网络再试。',
          '远离任何索要 Vimeo 或 Google 密码的工具。'
        ]
      },
      permission: {
        title: '重要权限提示',
        note:
          'Vimeo 视频下载器不应用于绕过隐私、版权或访问限制。请仅在你已获得权利人许可，或你的使用方式符合法律与 Vimeo 条款时保存视频。'
      },
      comparison: {
        title: '选择合适的 Vimeo 下载方式',
        headers: ['情况', '推荐方案', '最适合', '需要确认'],
        rows: [
          {
            cells: [
              '公开的 Vimeo 视频页面',
              '在线 Vimeo 下载器',
              '无需应用即可快速下载高清视频',
              '页面无需登录即可打开，且视频是公开的'
            ]
          },
          {
            cells: [
              '创作者已开启下载',
              'Vimeo 自带的下载按钮',
              '拿到发布时的原始文件',
              '播放器显示了下载入口'
            ]
          },
          {
            cells: [
              '文件很大或下载中断',
              '浏览器插件',
              '超出标签页限制的断点续传',
              '本地可用存储与网络稳定性'
            ]
          },
          {
            cells: [
              '私密或需要密码的视频',
              '向所有者索取访问权限或导出文件',
              '遵守 Vimeo 的访问规则',
              '你无法访问的视频，任何下载器也访问不到'
            ]
          }
        ]
      },
      howTo: {
        title: '3 步下载 Vimeo 视频',
        subtitle:
          '最快的路径是上方的链接下载器，只要 Vimeo 视频页面是公开且浏览器能访问即可。',
        steps: [
          {
            title: '复制视频链接',
            description: '在 Vimeo 打开视频，从地址栏或分享菜单复制页面链接。'
          },
          {
            title: '粘贴并解析',
            description:
              '把链接粘贴到上方的下载器，工具会检查 Vimeo 为该视频提供了哪些清晰度。'
          },
          {
            title: '选择画质并下载',
            description:
              '选择清晰度后把 MP4 保存到本地。如果没有出现任何结果，通常说明视频是私密或不可用，而不是工具坏了。'
          }
        ]
      },
      faq: {
        title: '常见问题',
        description: '下载 Vimeo 视频之前，大家最常问的问题。',
        items: [
          {
            question: '怎样下载 Vimeo 视频？',
            answer:
              '在 Vimeo 打开视频页面，复制链接，粘贴到上方的下载器，选择可用的清晰度之一，然后下载 MP4。'
          },
          {
            question: '可以下载私密或需要密码的 Vimeo 视频吗？',
            answer:
              '不可以。私密、加密和付费墙后的视频无法从你的 Vimeo 会话之外访问，下载器无法解析。请向所有者索取访问权限或导出文件。'
          },
          {
            question: '为什么下载器提示这个 Vimeo 视频是私密的？',
            answer:
              'Vimeo 没有为该链接返回公开的清晰度。常见原因是隐私设置、需要密码、视频已删除，或者链接指向的是个人主页或展示页而不是视频页。'
          },
          {
            question: '需要 Vimeo 账号或安装插件吗？',
            answer:
              '普通的公开下载不需要账号，也不需要插件。只有在文件非常大、或你希望传输在标签页之外继续时，浏览器插件才有用。'
          },
          {
            question: '下载下来是什么格式和画质？',
            answer:
              '下载是基于 Vimeo 提供的清晰度生成的 MP4 文件。你可以在可用清晰度中选择，最高一档通常就是创作者上传的画质。'
          },
          {
            question: '是免费的吗？',
            answer:
              '解析公开的 Vimeo 链接是免费的。经过工作区的下载会消耗积分，积分一次性购买且永不过期；插件另有独立的 Unlimited 订阅。'
          },
          {
            question: '把 Vimeo 链接粘贴到这里安全吗？',
            answer:
              '安全。只会用你粘贴的链接去查询该视频。下载器绝不会索要 Vimeo 密码、验证码或会话文件，遇到索要这些信息的页面请直接离开。'
          },
          {
            question: '下载 Vimeo 视频合法吗？',
            answer:
              '这取决于视频内容、你的权限和使用目的。请只下载你有权保留的内容，未经授权不要传播受版权保护或私密的素材。'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: '网页登录',
          title: '登录后同步积分',
          trigger: '登录',
          modalTitle: '登录后继续',
          closeLabel: '关闭',
          signedInAs: '当前登录账号',
          continueWithGoogle: '使用 Google 继续',
          googleLoading: '正在打开 Google...',
          or: '或',
          emailLabel: '邮箱',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: '使用邮箱继续',
          sendCode: '发送验证码',
          sendingCode: '发送中...',
          sendCodeSuccess: '验证码已发送。',
          sendAgain: '重新发送',
          codeLabel: '验证码',
          codePlaceholder: '123456',
          signIn: '登录',
          termsNotice: '登录即表示你同意',
          termsLink: '服务条款',
          privacyLink: '隐私政策',
          logout: '退出登录',
          creditsLabel: '积分'
        },
                quota: {
          eyebrow: '积分',
          title: '当前积分余额',
          planLabel: '套餐',
          remainingLabel: '剩余',
          dailyLimitLabel: '每日限额',
          unlimited: '不限'
        },
                checkin: {
          creditsLoading: '积分',
          creditsButtonLabel: '打开每日签到',
          accountButtonLabel: '打开账户菜单',
          accountMenuLabel: '账户菜单',
          title: '今日免费积分已准备好',
          todayRewardText: '今日奖励：{credits} 积分',
          claimedRewardText: '你今天已领取 {credits} 积分。',
          nextCountdown: '距离下次可领取还有 {time}',
          nextAt: '（下次刷新：{time} EST）',
          claimButton: '领取 {credits} 积分',
          claimingButton: '领取中...',
          notNow: '稍后再说',
          close: '关闭',
          loadFailed: '加载签到状态失败。',
          claimFailed: '领取积分失败。'
        },
                creditPurchase: {
          installGuide: '也可以使用浏览器插件下载。',
          installExtension: '安装插件',
          title: '购买积分',
          description: '补充积分后即可继续在当前下载工作区下载。',
          successTitle: '积分已到账',
          successDescription: '余额已刷新。关闭弹窗后，请重新点击下载。',
          packageEyebrow: '按需购买',
          cardNote: '积分可用于网站下载，永久有效。',
          creditsAmount: '{credits} 积分',
          buyNow: '立即购买',
          selectPackage: '选择',
          paymentMethodLabel: '选择支付方式',
          paymentTitle: '选择支付方式',
          selectedPackageLabel: '已选商品',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: '继续支付',
          backToProducts: '返回',
          close: '关闭',
          agreementText: '我已阅读并同意购买条款、服务条款和隐私政策。',
          loadingConfigs: '正在加载积分套餐...',
          loadFailed: '加载积分套餐失败，请重试。',
          noConfigs: '当前没有可购买的积分套餐，请稍后重试。',
          ready: '请选择积分套餐。页面只展示美元价格。',
          creatingOrder: '正在创建订单...',
          pendingPayment: '请在新打开的标签页中完成支付。我们会自动检查结果。',
          pendingPaymentTitle: '等待支付',
          cancelPayment: '取消支付',
          supportMailPrefix: '反馈问题：',
          success: '支付完成，积分已可使用。',
          failed: '支付尚未完成，你可以重试或关闭弹窗。',
          successCredits: '+{credits} 积分已到账',
          successBalance: '当前余额：{balance} 积分',
          createFailed: '创建订单失败，请重试。',
          invalidPaymentData: '支付链接异常，请稍后重试。',
          priceUpdated: '价格已更新，请确认最新价格后重新购买。',
          gatewayFailed: '支付入口暂不可用，请稍后重试。',
          paymentCanceled: '支付已取消，请重新选择支付方式。',
          pollFailed: '刷新支付状态失败，请重试。',
          pollTimeout: '自动刷新已超时。支付后请手动刷新结果。',
          orderNotFound: '订单已不可用，请重新下单。',
          orderExpired: '订单已过期，请重新购买。',
          fulfillmentFailed: '支付已收到，但积分暂未到账，请稍后重试。',
          authExpired: '登录已失效，请重新登录后继续。'
        },
        parse: {
          eyebrow: '快速链接检查',
          title: 'Vimeo 视频下载器：保存任意公开的 Vimeo 视频',
          helperText: '粘贴公开的 Vimeo 视频链接，查看 Vimeo 提供的清晰度，并下载你需要的分辨率。',
          linkLabel: 'Vimeo 链接',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: '清除输入',
          submit: '粘贴 Vimeo 视频链接',
          submitting: '解析中...',
          noResults: '没有找到这个视频可下载的文件。',
          download: '下载',
          downloading: '下载中...',
          checkingStorage: '正在检查浏览器存储...',
          unknownSize: '大小未知',
          preparingMp4: '正在生成 MP4...',
          downloadAll: '一键下载全部',
          downloadingAll: '正在下载全部...',
          resumeNotice: '检测到未完成下载：{filename}（{progress}），是否继续？',
          resumeAction: '继续',
          pendingRestartText: '上次下载记录可重新开始：{filename}',
          pendingRestartButton: '重新下载',
          resumeUnavailableText: '本地恢复记录已失效。',
          resumeDismiss: '忽略',
          resuming: '继续下载中...',
          largeFileExtensionInlineChromeTitle: 'Chrome 插件',
          largeFileExtensionInlineChromeDescription:
            'Chrome 专用插件，让大文件 Vimeo 下载在标签页之外继续运行。',
          largeFileExtensionInlineChromeCta: '下载插件',
          largeFileExtensionInlineEdgeTitle: 'Edge 插件',
          largeFileExtensionInlineEdgeDescription:
            'Microsoft Edge 专用插件，对 Vimeo 大文件下载提供同样的处理。',
          largeFileExtensionInlineEdgeCta: '下载插件'
        },
                errors: {
          enterEmailFirst: '请先输入邮箱地址。',
          enterEmailAndCode: '请输入邮箱和验证码。',
          sendCodeFailed: '发送验证码失败。',
          googleSignInFailed: 'Google 登录失败。',
          googleClientMissing: 'Google 登录尚未配置。',
          restoreSessionFailed: '恢复登录状态失败。',
          signInFailed: '登录失败。',
          logoutFailed: '退出登录失败。',
          loadQuotaFailed: '加载积分失败。',
          enterLink: '请输入媒体链接。',
          invalidLink: '这不是一个合法的 URL。',
          parseFailed: '解析链接失败。',
          downloadFailed: '下载失败。',
          unsafeFileTypeUseExtension:
            '安装包、脚本等文件存在未知风险。出于安全原因，网页端暂时无法提供此类文件的下载服务。你仍可以使用浏览器扩展下载。',
          unsafeFileTypeConfirmTitle: '使用浏览器扩展下载',
          unsafeFileTypeConfirmViewExtension: '查看扩展下载',
          unsafeFileTypeConfirmCancel: '取消',
          browserStorageInsufficientUseExtension:
            '当前浏览器没有足够可靠的本地存储来下载这个文件（{file_size}）。可用空间约为 {available_space}。建议安装 Vimeo Video Downloader 插件后继续下载。',
          browserStorageInsufficientConfirmTitle: '浏览器存储空间不足',
          browserStorageInsufficientConfirmViewExtension: '查看插件下载',
          browserStorageInsufficientConfirmCancel: '取消',
          downloadNetworkInterrupted: '网络异常，下载已暂停。请点击继续。',
          unsupportedDownloadMode: '暂不支持这种下载方式，请稍后重试。',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: '此视频超过浏览器下载大小限制。',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: '暂不支持这个链接平台。',
          vimeoParseFailed: '这个 Vimeo 视频为私有内容或暂时无法解析。',
          quotaExceeded: '积分不足，无法下载这个文件。',
          rateLimitExceeded: '请求过于频繁，请稍后再试。'
        },
                anonymousQueue: {
          title: '下载排队中',
          remaining: '下载将在 {seconds} 秒后开始。',
          hint: '登录后无需等待。',
          login: '登录',
          close: '关闭弹窗'
        },
                downloadAll: {
          allSuccess: '全部文件已下载。',
          partialFailed: '部分文件已下载，部分文件失败。',
          allFailed: '全部下载失败。'
        }
      }
    },
    changelog: {
      title: 'Vimeo 下载器更新日志',
      description:
        '跟踪 Vimeo 下载更新、解析变化、更大的文件支持，以及 Vimeo Video Downloader 的发版说明。',
      seoTitle: 'Vimeo 下载器更新日志 | Vimeo Video Downloader',
      seoDescription:
        '阅读 Vimeo Video Downloader 更新日志：解析更新、清晰度处理、更大的文件支持，以及每个版本的发版说明。',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: '性能提升',
          description: '大幅优化性能，整体体验更流畅。',
          features: ['解析速度提升 50%', '优化大文件下载稳定性', '提升界面响应速度']
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: '多语言支持',
          description: '新增 14 种语言支持。',
          features: ['新增日语、韩语等语言', '提升翻译准确度', '新增自动语言识别']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: '清晰度选择',
          description: '下载开始前可以先选择想要的 Vimeo 清晰度。',
          features: ['可选视频提供的任意清晰度', '保留可用的最高画质', '改进下载队列管理']
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: '安全与隐私',
          description: '安全能力与隐私保护改进。',
          features: ['下载流程不再包含任何分析埋点', '新增纯本地处理模式', '改进数据加密']
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: '首次发布',
          description: 'Vimeo 链接下载器的首个版本。',
          features: ['支持 Vimeo 链接解析与 MP4 输出', '支持 vimeo.com 与 player.vimeo.com 链接', '基础清晰度处理']
        }
      ],
      labels: {
        features: '新功能',
        fixes: '问题修复'
      }
    },
    pricing: zhCNPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Vimeo 视频下载器高清 - 多清晰度 | Vimeo Video Downloader',
          description:
            '免费下载高清 Vimeo 视频，支持多种清晰度选择。无需安装应用，随时保存任意公开的 Vimeo 视频。',
          keywords:
            'Vimeo 下载器, Vimeo 视频下载, 下载 Vimeo 高清视频, Vimeo 免费下载, 保存 Vimeo 视频, Vimeo 高清下载'
        },
        workspace: {
          title: 'Vimeo 视频下载器高清',
          helperText: '粘贴任意公开的 Vimeo 视频链接，选择清晰度后即可下载高清版本。',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: '为什么选择我们的 Vimeo 下载器',
          subtitle: '完全免费，以高清画质保存 Vimeo 视频，并自由选择清晰度。',
          items: [
            {
              title: '原始高清画质',
              description: '以完整的全高清分辨率下载 Vimeo 视频，画质与创作者上传时一致。'
            },
            {
              title: '多种清晰度',
              description: '在可用清晰度（360p、720p、1080p 等）中选择，挑最适合你的画质。'
            },
            {
              title: '快速且免费',
              description: '无需安装应用、无需账号。粘贴 Vimeo 链接、选择清晰度、立即下载。'
            }
          ]
        },
        howTo: {
          title: '如何下载高清 Vimeo 视频',
          subtitle: '三步保存任意公开的 Vimeo 视频，并使用你想要的清晰度。',
          steps: [
            {
              title: '复制 Vimeo 视频链接',
              description: '打开 Vimeo 视频页面，从浏览器地址栏复制链接。'
            },
            {
              title: '粘贴到上方输入框',
              description: '把复制的 Vimeo 链接粘贴到输入框，然后点击解析。'
            },
            {
              title: '选择清晰度并下载',
              description: '选择你需要的清晰度，点击下载即可保存高清视频。'
            }
          ]
        },
        faq: {
          title: 'Vimeo 下载器常见问题',
          items: [
            {
              question: '怎样从 Vimeo 下载视频？',
              answer:
                '复制 Vimeo 视频页面链接，粘贴到上方输入框，点击解析，然后选择清晰度并下载。'
            },
            {
              question: '可以选择视频清晰度吗？',
              answer:
                '可以。解析完成后，你可以在所有可用清晰度中选择，包括 360p、720p、1080p，以及更高（如果提供）。'
            },
            {
              question: '这个 Vimeo 下载器免费吗？',
              answer:
                '解析公开的 Vimeo 链接免费，也不需要注册。经过工作区的下载会消耗积分。'
            },
            {
              question: '下载需要 Vimeo 账号吗？',
              answer: '不需要账号。无需登录即可下载任意公开的 Vimeo 视频。'
            },
            {
              question: '下载的视频是什么格式？',
              answer: 'Vimeo 视频以 MP4 格式下载，几乎兼容所有设备和播放器。'
            }
          ]
        }
      }
    }
  }
}
