import type { SiteContent } from '../schema'
import { zhCNPricingContent } from '../pricing'

export const zhCN: SiteContent = {
  site: {
    description: '粘贴 Vimeo 链接即可在浏览器中保存视频，免费且无需登录。需要音频、字幕、封面图或下载队列？安装 Chrome 扩展。'
  },
  layout: {
    nav: {
      brand: 'Vimeo Downloader',
      home: '首页',
      pricing: '价格',
    },
    footer: {
      resources: '资源',
      rights: '© 2026 Vimeo Downloader. 保留所有权利.'
    }
  },
  common: {
    installCta: '立即安装'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo 视频下载器：免费在线工具与 Chrome 扩展',
        description: '粘贴 Vimeo 链接即可在浏览器中保存视频，免费且无需登录。需要音频、字幕、封面图或下载队列？安装 Chrome 扩展。'
      },
      heroTrustPoints: [
        '高清下载',
        '无需注册'
      ],
      workspace: {
        parse: {
          eyebrow: '快速链接检查',
          titleBrand: 'Vimeo 视频下载器',
          titleTagline: '保存任意公开的 Vimeo 视频',
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
          extensionEntryLine: '用插件直接在 Vimeo 页面下载',
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
            '当前浏览器没有足够可靠的本地存储来下载这个文件（{file_size}）。可用空间约为 {available_space}。建议安装 Vimeo Downloader 插件后继续下载。',
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
          rateLimitExceeded: '请求过于频繁，请稍后再试。',
          useExtensionForResource: '该资源需使用插件下载，请安装插件后继续。'
        },
                anonymousQueue: {
          title: '下载排队中',
          remaining: '下载将在 {seconds} 秒后开始。',
          close: '关闭弹窗'
        },
                downloadAll: {
          allSuccess: '全部文件已下载。',
          partialFailed: '部分文件已下载，部分文件失败。',
          allFailed: '全部下载失败。'
        }
      }
    ,
      softwareApplication: {
        description: '一款面向 Vimeo 观看者的 Chrome 扩展：把你正在观看的视频保存到本地，并在页面上提供视频、音频、字幕、封面图四行下载面板。',
        featureList: [
          '页面内下载面板，固定 Video、Audio、Subtitle、Image 四行',
          '自选视频画质，或一键选择 Best',
          '音频保存为 M4A，或转码为 MP3',
          '字幕保存为 VTT，自适应视频与音频可裁剪',
          '封面图保存为 JPEG',
          '弹窗资源列表，实时显示进度与速度',
          '跨标签页共享的全局下载队列',
          '本地历史、文件名模板与保存子目录设置'
        ]
      },
      intro: {
        heading: '用 Chrome 扩展做得更多',
        lead: '上方的在线工具通过链接保存 Vimeo 视频。扩展则直接作用于你正在观看的 Vimeo 页面，并额外提供音频、字幕、封面图和下载队列。',
        primaryCta: '添加到 Chrome',
        secondaryCta: '查看方案',
        panel: {
          ariaLabel: '页面内下载面板示意图',
          rows: {
            video: '视频',
            audio: '音频',
            subtitle: '字幕',
            image: '图片'
          }
        }
      },
      features: {
        heading: '扩展多出来的能力',
        items: [
          {
            title: '页面内下载面板',
            description: '视频旁的小面板，固定 Video、Audio、Subtitle、Image 四行。切换到另一个视频时会自动重建。'
          },
          {
            title: '画质选择与 Best',
            description: '选 720p、1080p 或视频提供的其他画质，也可以让 Best 自动选最高的一档。'
          },
          {
            title: '音频保存为 M4A 或 MP3',
            description: '把音频轨单独保存为 M4A，或在弹窗中选择 MP3 转码输出。'
          },
          {
            title: '字幕与裁剪',
            description: '把可用字幕保存为 VTT。自适应视频与音频可裁剪，视频不转码。'
          },
          {
            title: '封面图',
            description: '把视频封面图单独保存为 JPEG 文件。'
          },
          {
            title: '弹窗列表与队列',
            description: '在弹窗中查看已解析的全部资源和实时进度，并把任务加入跨标签页的队列，按顺序逐个下载。'
          },
          {
            title: '大文件',
            description: 'Chrome 能自行抓取的文件交给 Chrome 下载管理器；自适应流在后台合成，受内存预算约束。'
          },
          {
            title: '设置与历史',
            description: '可设置保存子目录、文件名模板和界面语言。成功与失败的下载记录保存在本地历史中，可导出 CSV。'
          }
        ]
      },
      steps: {
        heading: '扩展怎么用',
        items: [
          {
            title: '安装',
            description: '从 Chrome 应用商店添加扩展。'
          },
          {
            title: '固定图标',
            description: '把图标固定到工具栏，方便随时打开弹窗。'
          },
          {
            title: '打开 Vimeo 视频',
            description: '进入 vimeo.com 或 player.vimeo.com 上支持的视频页并开始播放。'
          },
          {
            title: '选择画质',
            description: '在面板中点击想要的画质，或打开扩展图标查看完整列表。文件由浏览器写入本地磁盘。'
          }
        ]
      },
      comparison: {
        heading: '在线工具还是扩展',
        columns: {
          dimension: '对比项',
          web: '在线工具',
          extension: 'Chrome 扩展'
        },
        rows: [
          {
            dimension: '运行位置',
            web: '在本页的任意浏览器标签页中粘贴 Vimeo 链接即可。',
            extension: '在 Chrome 及其他 Chromium 浏览器中，直接作用于你正在观看的 Vimeo 页面。'
          },
          {
            dimension: '可保存的资源',
            web: 'MP4 格式的视频。',
            extension: 'MP4 视频、M4A 或 MP3 音频、VTT 字幕，以及 JPEG 封面图。'
          },
          {
            dimension: '批量与队列',
            web: '可粘贴多条链接，用「一键下载全部」逐个依次下载。',
            extension: '在弹窗中逐项加入跨标签页共享的同一个队列，按顺序下载。'
          },
          {
            dimension: '大文件',
            web: '体积很大或大小未知的文件，会引导你改用扩展。',
            extension: '直连文件走 Chrome 下载管理器；自适应流在内存预算内合成。'
          },
          {
            dimension: '是否需要登录',
            web: '不需要。',
            extension: '不需要。登录是可选的，只影响每日额度和订阅状态。'
          },
          {
            dimension: '费用',
            web: '免费。',
            extension: '提供每日免费额度，另有付费的 Unlimited 计划。'
          }
        ]
      },
      scope: {
        heading: '能用在哪里，以及它不做什么',
        worksFor: {
          heading: '适用于',
          items: [
            'vimeo.com、www.vimeo.com、player.vimeo.com 上支持的顶层视频页；能播放不代表一定能解析出下载资源',
            '指定画质或音频轨，而不是默认串流',
            '保存封面图',
            '在同一个页面上排队下载多项'
          ]
        },
        doesNot: {
          heading: '不做',
          items: [
            '绕过访问控制：私密、密码保护或付费视频即使能播放，也不保证支持下载',
            '移除或绕过 DRM',
            '支持所有 HLS 格式、完整直播录制，或 Vimeo 以外的网站',
            '在 Vimeo 桌面端或移动端应用中使用'
          ]
        },
        compliance: {
          heading: '法律与合规',
          items: [
            '独立开发的第三方工具，与 Vimeo, Inc. 无隶属关系，也未获其认可或授权。Vimeo 是 Vimeo, Inc. 的商标。',
            '仅用于保存你本就有合法访问权限的内容。你有责任遵守著作权法，以及 Vimeo 和内容原作者的服务条款。',
            '请勿用它传播受著作权保护的材料，或绕过你无权访问内容的访问控制。'
          ]
        }
      },
      plans: {
        heading: '方案概览',
        free: {
          name: 'Free',
          description: '每日免费下载额度。新账号或新设备的第一天不限次数。',
          cta: '查看方案'
        },
        unlimited: {
          name: 'Unlimited',
          description: '付费订阅，解除扩展的每日下载上限。',
          cta: '获取 Unlimited'
        }
      },
      faq: {
        heading: '常见问题',
        items: [
          {
            question: '下载需要账号吗？',
            answer: '不需要。在线工具无需登录，扩展同样不需要。在扩展中登录是可选的，只影响每日额度和订阅状态。'
          },
          {
            question: '免费吗？',
            answer: '在线工具免费。扩展提供每日免费额度，另有付费的 Unlimited 计划。当前详情请见定价页。'
          },
          {
            question: '该用在线工具还是扩展？',
            answer: '想通过链接快速拿到 MP4，用在线工具；需要音频、字幕、封面图、指定画质或多项排队时，用扩展。'
          },
          {
            question: '能下载私密、密码保护或付费的 Vimeo 视频吗？',
            answer: '不保证支持。两者都不会解锁或绕过 Vimeo 的访问控制，也都不会移除 DRM。'
          },
          {
            question: '能得到哪些格式？',
            answer: '在线工具保存 MP4 视频。扩展可保存 MP4 视频、M4A 或 MP3 音频、VTT 字幕和 JPEG 封面图。'
          },
          {
            question: '遇到特别大的文件怎么办？',
            answer: '在线工具会把体积很大或大小未知的文件引导到扩展。在扩展中，自适应流在内存预算内合成，已知超限的条目不提供下载。'
          },
          {
            question: '我的视频会经过你们的服务器吗？',
            answer: '媒体文件本身从 Vimeo 服务器直接到你的浏览器和磁盘。扩展还会访问开发者服务，用于账号功能、下载额度、订阅、远端设置以及使用情况与错误上报。'
          },
          {
            question: '支持哪些浏览器和网站？',
            answer: '扩展运行在 Chrome 及 Edge、Brave 等 Chromium 浏览器上，且只在 Vimeo 页面生效。不支持其他视频网站。'
          }
        ]
      },
      finalCta: {
        heading: '用扩展从 Vimeo 保存更多内容',
        description: '安装一次，就能在你正在观看的 Vimeo 页面上直接下载。',
        primaryCta: '添加到 Chrome'
      }
    },
    pricing: zhCNPricingContent,
  }
}
