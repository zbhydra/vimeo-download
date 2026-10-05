import type { SiteContent } from '../schema'
import { zhTWPricingContent } from '../pricing'

export const zhTW: SiteContent = {
  site: {
    description: '貼上 Vimeo 連結即可在瀏覽器中儲存影片，免費且無需登入。需要音訊、字幕、封面圖或下載佇列？加入 Chrome 擴充功能。'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: '首頁',
      pricing: '價格',
    },
    footer: {
      resources: '資源',
      rights: '© 2026 Vimeo Video Downloader. 保留所有權利.'
    }
  },
  common: {
    installCta: '立即安裝'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Video Downloader – 免費線上工具與 Chrome 擴充功能',
        description: '貼上 Vimeo 連結即可在瀏覽器中儲存影片，免費且無需登入。需要音訊、字幕、封面圖或下載佇列？加入 Chrome 擴充功能。'
      },
      heroTrustPoints: [
        '高清下載',
        '不需註冊',
        '行動裝置友善',
        '支援 Windows、Mac、Android 和 iPhone'
      ],
      workspace: {
        parse: {
          eyebrow: '快速連結檢查',
          title: 'Vimeo 影片下載器：儲存任意公開的 Vimeo 影片',
          helperText: '貼上公開的 Vimeo 影片連結，查看 Vimeo 提供的畫質，並下載你需要的解析度。',
          linkLabel: 'Vimeo 連結',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: '清除輸入',
          submit: '貼上 Vimeo 影片連結',
          submitting: '解析中...',
          noResults: '沒有找到這部影片可下載的檔案。',
          download: '下載',
          downloading: '下載中...',
          checkingStorage: '正在檢查瀏覽器儲存空間...',
          unknownSize: '大小未知',
          preparingMp4: '正在產生 MP4...',
          downloadAll: '一鍵下載全部',
          downloadingAll: '正在下載全部...',
          resumeNotice: '偵測到未完成下載：{filename}（{progress}），是否繼續？',
          resumeAction: '繼續',
          pendingRestartText: '上次下載記錄可重新開始：{filename}',
          pendingRestartButton: '重新下載',
          resumeUnavailableText: '本機恢復記錄已失效。',
          resumeDismiss: '忽略',
          resuming: '繼續下載中...',
          largeFileExtensionInlineChromeTitle: 'Chrome 擴充功能',
          largeFileExtensionInlineChromeDescription:
            'Chrome 專用擴充功能，讓大檔案 Vimeo 下載在分頁之外繼續運作。',
          largeFileExtensionInlineChromeCta: '安裝擴充功能',
          largeFileExtensionInlineEdgeTitle: 'Edge 擴充功能',
          largeFileExtensionInlineEdgeDescription:
            'Microsoft Edge 專用擴充功能，對 Vimeo 大檔案下載提供同樣的處理。',
          largeFileExtensionInlineEdgeCta: '安裝擴充功能'
        },
                errors: {
          enterLink: '請輸入媒體連結。',
          invalidLink: '這不是一個合法的 URL。',
          parseFailed: '解析連結失敗。',
          downloadFailed: '下載失敗。',
          unsafeFileTypeUseExtension:
            '安裝包、腳本等檔案存在未知風險。出於安全原因，網頁端暫時無法提供此類檔案的下載服務。你仍可以使用瀏覽器擴充功能下載。',
          unsafeFileTypeConfirmTitle: '使用瀏覽器擴充功能下載',
          unsafeFileTypeConfirmViewExtension: '查看擴充功能下載',
          unsafeFileTypeConfirmCancel: '取消',
          downloadNetworkInterrupted: '網路異常，下載已暫停。請點擊繼續。',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: '此影片超過瀏覽器下載大小限制。',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: '暫不支援這個連結平台。',
          vimeoParseFailed: '這個 Vimeo 影片為私有內容或暫時無法解析。',
          rateLimitExceeded: '請求過於頻繁，請稍後再試。',
          useExtensionForResource: '此資源需使用擴充功能下載，請安裝擴充功能後繼續。'
        },
                anonymousQueue: {
          title: '下載排隊中',
          remaining: '下載將在 {seconds} 秒後開始。',
          close: '關閉彈窗'
        },
                downloadAll: {
          allSuccess: '全部檔案已下載。',
          partialFailed: '部分檔案已下載，部分檔案失敗。',
          allFailed: '全部下載失敗。'
        }
      }
    ,
      softwareApplication: {
        description: '一款面向 Vimeo 觀眾的 Chrome 擴充功能：把你正在觀看的影片存到本機，並在頁面上提供影片、音訊、字幕、封面圖四列下載面板。',
        featureList: [
          '頁面內下載面板，含影片、音訊、字幕、圖片四行',
          '選擇影片畫質或直接選 Best',
          '音訊儲存為 M4A，或轉碼為 MP3',
          '字幕儲存為 VTT，並可裁剪自適應影片與音訊',
          '封面圖儲存為 JPEG',
          '彈窗資源清單，即時顯示進度與速度',
          '跨分頁共用的全域下載佇列',
          '本機歷史、檔名範本與儲存子資料夾設定'
        ]
      },
      intro: {
        heading: '用 Chrome 擴充功能做得更多',
        lead: '上方的線上工具可依連結儲存 Vimeo 影片。擴充功能則直接作用於你正在觀看的 Vimeo 頁面，並額外支援音訊、字幕、封面圖與下載佇列。',
        primaryCta: '新增至 Chrome',
        secondaryCta: '查看方案',
        panel: {
          ariaLabel: '頁面內下載面板示意圖',
          rows: {
            video: '影片',
            audio: '音訊',
            subtitle: '字幕',
            image: '圖片'
          }
        }
      },
      features: {
        heading: '擴充功能帶來什麼',
        items: [
          {
            title: '頁面內下載面板',
            description: '影片旁的小面板，提供影片、音訊、字幕、圖片四行。切換到其他影片時會自動重建。'
          },
          {
            title: '畫質選擇與 Best',
            description: '選擇 720p、1080p 或影片提供的其他畫質，也可讓 Best 挑選最高畫質。'
          },
          {
            title: '音訊 M4A 或 MP3',
            description: '單獨儲存音訊軌為 M4A，或在彈窗中選擇 MP3 取得轉碼輸出。'
          },
          {
            title: '字幕與裁剪',
            description: '將可用字幕儲存為 VTT。自適應影片與音訊可在不轉碼影片的情況下裁剪。'
          },
          {
            title: '封面圖',
            description: '將影片封面圖另存為獨立的 JPEG 檔案。'
          },
          {
            title: '彈窗清單與佇列',
            description: '在彈窗中查看所有已解析的項目與即時進度，並將項目加入佇列，跨分頁依序下載。'
          },
          {
            title: '大檔案',
            description: 'Chrome 能自行取得的檔案交給 Chrome 下載管理員。自適應串流在背景中合成，並受記憶體預算限制。'
          },
          {
            title: '設定與歷史',
            description: '可設定儲存子資料夾、檔名範本與介面語言。已完成與失敗的下載會留在本機歷史中，可匯出為 CSV。'
          }
        ]
      },
      steps: {
        heading: '擴充功能如何使用',
        items: [
          {
            title: '安裝',
            description: '從 Chrome 線上應用程式商店新增擴充功能。'
          },
          {
            title: '固定圖示',
            description: '將圖示固定到工具列，方便開啟彈窗。'
          },
          {
            title: '開啟 Vimeo 影片',
            description: '前往 vimeo.com 或 player.vimeo.com 上受支援的影片頁並開始播放。'
          },
          {
            title: '選擇畫質',
            description: '在面板中點選想要的畫質，或點擊擴充功能圖示查看完整清單。檔案由瀏覽器寫入本機磁碟。'
          }
        ]
      },
      comparison: {
        heading: '線上工具還是擴充功能',
        columns: {
          dimension: '比較項目',
          web: '線上工具',
          extension: 'Chrome 擴充功能'
        },
        rows: [
          {
            dimension: '執行位置',
            web: '在本頁的任何瀏覽器分頁中，貼上 Vimeo 連結即可。',
            extension: '在 Chrome 與其他 Chromium 瀏覽器中，作用於你正在觀看的 Vimeo 頁面。'
          },
          {
            dimension: '可儲存的內容',
            web: '影片，輸出為 MP4 檔案。',
            extension: '影片為 MP4、音訊為 M4A 或 MP3、字幕為 VTT、封面圖為 JPEG。'
          },
          {
            dimension: '批次與佇列',
            web: '貼上多個連結，用「一鍵下載全部」逐一執行。',
            extension: '從彈窗把項目加入跨分頁共用的同一個佇列，依序下載。'
          },
          {
            dimension: '大檔案',
            web: '過大或大小未知的檔案會引導你改用擴充功能。',
            extension: '直連檔案使用 Chrome 下載管理員；自適應串流在記憶體預算內合成。'
          },
          {
            dimension: '登入',
            web: '無需登入。',
            extension: '無需登入。登入是選用的，只影響每日額度與訂閱狀態。'
          },
          {
            dimension: '費用',
            web: '免費。',
            extension: '有每日免費額度，另有付費的 Unlimited 方案可獲得更多。'
          }
        ]
      },
      scope: {
        heading: '適用範圍與不做的事',
        worksFor: {
          heading: '適用於',
          items: [
            'vimeo.com、www.vimeo.com 和 player.vimeo.com 上受支援的頂層影片頁；能播放不代表一定有可下載的資源',
            '選擇特定畫質或音訊軌，而不是預設串流',
            '儲存封面圖',
            '將同一頁面的多個項目加入佇列'
          ]
        },
        doesNot: {
          heading: '不做的事',
          items: [
            '繞過存取控制：私密、密碼保護或付費影片即使你能播放，也不保證可用',
            '移除或繞過 DRM',
            '支援所有 HLS 格式、完整直播擷取，或 Vimeo 以外的網站',
            '在 Vimeo 桌面或行動應用程式中使用'
          ]
        },
        compliance: {
          heading: '法律與合規',
          items: [
            '獨立開發的第三方工具，與 Vimeo, Inc. 無任何隸屬、背書或關聯。Vimeo 是 Vimeo, Inc. 的商標。',
            '僅用於你已合法取得存取權的內容。你需自行遵守著作權法，以及 Vimeo 與原作者的服務條款。',
            '請勿用於散布受著作權保護的內容，或繞過你無權存取的存取控制。'
          ]
        }
      },
      plans: {
        heading: '方案',
        free: {
          name: 'Free',
          description: '有每日免費下載額度。新帳號或新裝置的第一天不限次數。',
          cta: '查看方案'
        },
        unlimited: {
          name: 'Unlimited',
          description: '付費訂閱，解除擴充功能的每日限制。',
          cta: '取得 Unlimited'
        }
      },
      faq: {
        heading: '常見問題',
        items: [
          {
            question: '下載需要帳號嗎？',
            answer: '不需要。線上工具無需登入，擴充功能也不需要。擴充功能的登入是選用的，只影響每日額度與訂閱狀態。'
          },
          {
            question: '免費嗎？',
            answer: '線上工具免費。擴充功能有每日免費額度，另有付費的 Unlimited 方案。最新詳情請見定價頁。'
          },
          {
            question: '該用線上工具還是擴充功能？',
            answer: '只想依連結快速取得 MP4，用線上工具。需要音訊、字幕、封面圖、指定畫質或多個項目的佇列，用擴充功能。'
          },
          {
            question: '能下載私密、密碼保護或付費的 Vimeo 影片嗎？',
            answer: '不保證支援。兩者都不會解鎖或繞過 Vimeo 的存取控制，也都不會移除 DRM。'
          },
          {
            question: '能拿到哪些格式？',
            answer: '線上工具儲存 MP4 影片。擴充功能儲存 MP4 影片、M4A 或 MP3 音訊、VTT 字幕與 JPEG 封面圖。'
          },
          {
            question: '遇到非常大的檔案會怎樣？',
            answer: '線上工具會把過大或大小未知的檔案引導到擴充功能。在擴充功能中，自適應串流在記憶體預算內合成，已知超出的項目不會提供。'
          },
          {
            question: '我的影片會經過你們的伺服器嗎？',
            answer: '媒體檔案本身從 Vimeo 伺服器直接到你的瀏覽器與磁碟。擴充功能還會存取開發者服務，用於帳號功能、下載額度、訂閱、遠端設定及使用情況或錯誤回報。'
          },
          {
            question: '支援哪些瀏覽器與網站？',
            answer: '擴充功能可在 Chrome 以及 Edge、Brave 等 Chromium 核心瀏覽器上執行，且僅作用於 Vimeo 頁面。不支援其他影片網站。'
          }
        ]
      },
      finalCta: {
        heading: '用擴充功能從 Vimeo 儲存更多',
        description: '只需安裝一次，就能在你正在觀看的 Vimeo 頁面直接下載。',
        primaryCta: '新增至 Chrome'
      }
    },
    pricing: zhTWPricingContent,
  }
}
