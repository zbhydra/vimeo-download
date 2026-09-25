import type { SiteContent } from '../schema'
import { zhTWPricingContent } from '../pricing'

export const zhTW: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — 下載 Vimeo 高清影片',
    description:
      '貼上公開的 Vimeo 連結，用你需要的畫質儲存影片。一般下載不需安裝應用程式、不需帳號，也不用裝瀏覽器擴充功能。',
    keywords: 'Vimeo 影片下載, Vimeo 下載器, 下載 Vimeo 影片, Vimeo 高清下載, Vimeo 轉 MP4, 線上 Vimeo 下載'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: '首頁',
      pricing: '價格',
      solutions: '下載指南',
      changelog: '更新日誌'
    },
    footer: {
      resources: '資源',
      rights: '© 2026 Vimeo Video Downloader. 保留所有權利.'
    }
  },
  common: {
    installCta: '立即安裝'
  },
  sections: {
    features: {
      title: 'Vimeo 下載功能',
      subtitle:
        '針對公開的 Vimeo 連結，下載器會解析頁面、列出 Vimeo 提供的畫質，並儲存你選擇的那一檔。',
      metaDescription:
        'Vimeo Video Downloader 功能：高清下載、畫質自選、MP4 輸出、不需帳號，並明確界定私密或加密影片的處理邊界。',
      items: [
        {
          title: '畫質自選',
          description: '直接選你需要的畫質，而不是被迫接受 Vimeo 提供的最小檔案',
          details: [
            '在影片提供的多種畫質中選擇',
            '下載可用的最高畫質供離線觀看',
            '保留原始畫面比例與音訊',
            'MP4 輸出，任何裝置與播放器都能播放'
          ]
        },
        {
          title: '連結解析',
          description: '貼上 Vimeo 影片頁面連結，下載器讀取可用的畫質',
          details: [
            '支援 vimeo.com、www.vimeo.com 與 player.vimeo.com 連結',
            '不需 Vimeo 帳號或登入',
            '影片私密或無法解析時給出明確提示',
            '一般下載不需安裝任何東西'
          ]
        },
        {
          title: '大檔案支援',
          description: '較長的 Vimeo 影片也能下載，附進度顯示；檔案過大時可交給瀏覽器擴充功能',
          details: [
            '下載過程中可以看到進度',
            '中斷的下載可以在工作區繼續',
            '瀏覽器單獨無法完成的檔案交給擴充功能處理',
            '大檔案開始前先檢查本機儲存空間'
          ]
        },
        {
          title: '全裝置可用',
          description: '手機、平板或電腦都能開啟同一個頁面，下載在瀏覽器裡完成',
          details: [
            '支援 Windows、macOS、Android、iPhone 與平板',
            '不需要安裝桌面應用程式',
            '小螢幕下自適應版面',
            '檔案儲存在瀏覽器預設的下載資料夾'
          ]
        },
        {
          title: '明確的存取邊界',
          description: '私密、加密或需要付費的 Vimeo 影片不在支援範圍內，並會如實提示',
          details: [
            '不會嘗試繞過隱私或存取限制',
            '絕不索要 Vimeo 密碼、驗證碼或工作階段檔案',
            '只解析公開的影片頁面',
            '下載前請確認自己有權保留該影片'
          ]
        },
        {
          title: '快速、免註冊流程',
          description: '複製、貼上、選擇、下載；只有需要點數時才需要帳號',
          details: [
            '解析公開連結不需註冊',
            '只有需要點數時才用 Google 或電子郵件驗證碼登入',
            '點數永不過期',
            '連結無法處理時會給出明確的錯誤提示'
          ]
        }
      ]
    },
    steps: {
      title: '如何儲存 Vimeo 影片',
      subtitle:
        '整個流程只有三步：複製 Vimeo 影片頁面連結，貼到上方，然後選擇畫質並下載。',
      metaDescription:
        '儲存 Vimeo 影片的分步指南：複製影片頁面連結、貼到 Vimeo Video Downloader、選擇畫質並下載 MP4。',
      items: [
        {
          title: '複製 Vimeo 連結',
          description: '在 vimeo.com 開啟影片，從網址列或分享選單複製連結'
        },
        {
          title: '貼到上方',
          description: '把連結放進輸入框並開始解析，下載器會列出 Vimeo 提供的畫質'
        },
        {
          title: '選擇畫質',
          description: '在可用畫質中挑選你想要的那一檔'
        },
        {
          title: '下載 MP4',
          description: '把檔案儲存到本機；檔案很大時可能需要瀏覽器擴充功能'
        }
      ]
    },
    cta: {
      title: '準備下載 Vimeo 影片了嗎？',
      description: '把公開的 Vimeo 連結貼到上方，用你需要的畫質儲存下來。'
    },
    techSpecs: {
      title: '技術規格',
      browsersLabel: '瀏覽器',
      browsers: 'Chrome、Edge、Brave 及所有基於 Chromium 的瀏覽器',
      sourceHostsLabel: '支援的連結',
      sourceHosts: 'vimeo.com、www.vimeo.com、player.vimeo.com',
      permissionsLabel: '權限',
      permissions: '僅需最低權限',
      updatesLabel: '更新',
      updates: '從擴充功能商店自動更新'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: '用你需要的畫質下載 Vimeo 影片',
        description: '貼上公開的 Vimeo 連結，選一檔畫質，直接在瀏覽器裡儲存 MP4。'
      },
      stats: {
        users: '全球用戶',
        downloads: '累計下載'
      },
      seo: {
        title: 'Vimeo 影片下載器：線上下載 Vimeo 高清影片',
        description:
          '儲存公開的 Vimeo 影片並自選畫質。貼上連結、解析畫質、下載 MP4，不需安裝任何軟體。',
        keywords:
          'Vimeo 影片下載, Vimeo 下載器, 下載 Vimeo 影片, Vimeo 高清下載, Vimeo 轉 MP4, 線上 Vimeo 下載'
      },
      heroTrustPoints: [
        '高清下載',
        '不需註冊',
        '行動裝置友善',
        '支援 Windows、Mac、Android 和 iPhone'
      ],
      situation: {
        title: '從這裡開始：你手上是哪種 Vimeo 連結？',
        intro: '大多數找 Vimeo 下載器的人，手上都是下面這幾種連結之一。看看你屬於哪一種：',
        headers: ['你的情況', '優先嘗試'],
        rows: [
          {
            cells: [
              '你手上是公開 Vimeo 影片頁面的連結',
              '把它貼到上方的下載器，並選擇畫質'
            ]
          },
          {
            cells: [
              '影片頁面上沒有下載按鈕',
              '用這個下載器——只有上傳者允許時 Vimeo 才會顯示自己的下載按鈕'
            ]
          },
          {
            cells: [
              '影片是私密的或需要密碼',
              '需要擁有者給你存取權限，下載器無法替你開啟'
            ]
          },
          {
            cells: [
              '下載器提示影片私密或無法解析',
              '確認連結是影片頁面網址，並且影片是公開的'
            ]
          }
        ]
      },
      solutions: {
        title: 'Vimeo 影片到底有哪些可行方法？',
        intro:
          'Vimeo 上影片的存取規則差別很大。公開的影片頁面可以被下載器解析；私密、加密或付費牆後的影片，從外部無法存取，換任何工具都一樣。',
        quickAnswer:
          '快速回答：如果 Vimeo 頁面是公開的，把連結貼到上方並下載你需要的畫質；如果 Vimeo 自己顯示了下載按鈕，那是更乾淨的路徑；如果影片私密或需要密碼，請向擁有者索取存取權限或匯出檔案——沒有下載器能繞過這一點。',
        items: [
          {
            title: '方案一：線上 Vimeo 下載器',
            description:
              '最適合公開的 Vimeo 影片頁面。貼上連結，讓下載器列出 Vimeo 提供的畫質，再儲存你想要的那一檔。',
            useWhenLabel: '適用情境：',
            useWhen: [
              '影片頁面公開，不需登入即可開啟。',
              '你想要指定畫質或可用的最高畫質。',
              '你不想安裝瀏覽器擴充功能或桌面應用程式。'
            ]
          },
          {
            title: '方案二：Vimeo 自帶的下載按鈕',
            description:
              '有些創作者會允許下載自己的影片。該選項開啟後，Vimeo 播放器會顯示下載按鈕，這是最直接的路徑。',
            useWhenLabel: '適用情境：',
            useWhen: [
              'Vimeo 播放器顯示了下載入口。',
              '你想要創作者發布時的原始檔案。',
              '你已經取得保留副本的許可。'
            ]
          },
          {
            title: '方案三：大檔案用瀏覽器擴充功能',
            description:
              '長影片可能超出瀏覽器分頁一次能流暢傳輸與儲存的極限，擴充功能會接管傳輸並支援續傳。',
            useWhenLabel: '適用情境：',
            useWhen: [
              '檔案非常大，或下載總是中斷。',
              '工作區提示瀏覽器本機儲存空間不足。',
              '你經常從 Vimeo 下載。'
            ]
          },
          {
            title: '方案四：螢幕錄影（最後手段）',
            description:
              '如果影片你能播放、但沒有任何合法的下載路徑，可以用螢幕錄影錄下來。這是備援方案而不是首選，因為畫質與音質取決於播放效果。',
            useWhenLabel: '適用情境：',
            useWhen: [
              '你有權觀看並保留該影片。',
              '影片無法透過連結解析。',
              '你只是需要一個私人的離線參考副本。'
            ]
          }
        ]
      },
      benefits: {
        title: '為什麼要用線上 Vimeo 下載器？',
        intro:
          '好的下載器要能快速回答一個問題：手上這個連結的 Vimeo 影片能不能儲存？體驗應該直接、如實說明限制，並在私密影片無法處理時講清楚原因。',
        items: [
          {
            title: '儲存高清畫質',
            description: '保留 Vimeo 提供的最高畫質，離線副本依然是創作者發布時的樣子。'
          },
          {
            title: '跨裝置可用',
            description:
              'Android、iPhone、Windows、Mac 或平板的瀏覽器都能用，檔案由你手上已有的瀏覽器儲存。'
          },
          {
            title: '不需登入 Vimeo',
            description: '公開影片頁面不需要 Vimeo 帳號，也絕不會索要密碼、驗證碼或工作階段檔案。'
          },
          {
            title: '離線播放方便',
            description: '下載結果是 MP4，幾乎所有裝置和播放器都能直接播放，不需額外解碼器。'
          },
          {
            title: '基於連結的快速流程',
            description:
              '複製、貼上、選擇、下載。連結失敗時，頁面會說明影片是私密、已刪除還是不受支援。'
          },
          {
            title: '明確的權限邊界',
            description:
              '只下載你有權保留的影片，尊重創作者權益、Vimeo 條款以及影片本身的存取規則。'
          },
          {
            title: '畫質可控',
            description: '在影片提供的多種畫質之間選擇，而不是被鎖定在單一畫質。'
          },
          {
            title: '大檔案處理',
            description:
              '較長的影片在開始前會檢查瀏覽器儲存空間；超出分頁能力時，可透過瀏覽器擴充功能繼續。'
          },
          {
            title: '價格可預期',
            description:
              '解析公開連結不需帳號。只有經過工作區的下載才需要點數，點數一次性購買且永不過期。'
          }
        ]
      },
      troubleshooting: {
        title: '如果 Vimeo 連結無法使用',
        intro:
          '並不是每次失敗都代表下載器壞了。Vimeo 影片失敗通常是因為頁面不公開。按這份清單排查：',
        items: [
          '在瀏覽器裡開啟連結，確認不登入也能播放影片。',
          '確認連結是影片頁面，而不是個人檔案、展示頁或搜尋頁。',
          '檢查影片是否需要密碼或被設為私密。',
          '確認影片仍然存在——已刪除的影片無法解析。',
          '如果頁面連不上 Vimeo，換個瀏覽器或網路再試。',
          '遠離任何索要 Vimeo 或 Google 密碼的工具。'
        ]
      },
      permission: {
        title: '重要權限提示',
        note:
          'Vimeo 影片下載器不應用於繞過隱私、著作權或存取限制。請僅在你已取得權利人許可，或你的使用方式符合法律與 Vimeo 條款時儲存影片。'
      },
      comparison: {
        title: '選擇合適的 Vimeo 下載方式',
        headers: ['情況', '推薦方案', '最適合', '需要確認'],
        rows: [
          {
            cells: [
              '公開的 Vimeo 影片頁面',
              '線上 Vimeo 下載器',
              '不需應用程式即可快速下載高清影片',
              '頁面不需登入即可開啟，且影片是公開的'
            ]
          },
          {
            cells: [
              '創作者已開啟下載',
              'Vimeo 自帶的下載按鈕',
              '拿到發布時的原始檔案',
              '播放器顯示了下載入口'
            ]
          },
          {
            cells: [
              '檔案很大或下載中斷',
              '瀏覽器擴充功能',
              '超出分頁限制的續傳',
              '本機可用儲存空間與網路穩定性'
            ]
          },
          {
            cells: [
              '私密或需要密碼的影片',
              '向擁有者索取存取權限或匯出檔案',
              '遵守 Vimeo 的存取規則',
              '你無法存取的影片，任何下載器也存取不到'
            ]
          }
        ]
      },
      howTo: {
        title: '3 步下載 Vimeo 影片',
        subtitle:
          '最快的路徑是上方的連結下載器，只要 Vimeo 影片頁面是公開且瀏覽器能連上即可。',
        steps: [
          {
            title: '複製影片連結',
            description: '在 Vimeo 開啟影片，從網址列或分享選單複製頁面連結。'
          },
          {
            title: '貼上並解析',
            description:
              '把連結貼到上方的下載器，工具會檢查 Vimeo 為該影片提供了哪些畫質。'
          },
          {
            title: '選擇畫質並下載',
            description:
              '選擇畫質後把 MP4 儲存到本機。如果沒有出現任何結果，通常代表影片是私密或無法使用，而不是工具壞了。'
          }
        ]
      },
      faq: {
        title: '常見問題',
        description: '下載 Vimeo 影片之前，大家最常問的問題。',
        items: [
          {
            question: '如何下載 Vimeo 影片？',
            answer:
              '在 Vimeo 開啟影片頁面，複製連結，貼到上方的下載器，選擇可用的畫質之一，然後下載 MP4。'
          },
          {
            question: '可以下載私密或需要密碼的 Vimeo 影片嗎？',
            answer:
              '不可以。私密、加密和付費牆後的影片無法從你的 Vimeo 工作階段之外存取，下載器無法解析。請向擁有者索取存取權限或匯出檔案。'
          },
          {
            question: '為什麼下載器提示這個 Vimeo 影片是私密的？',
            answer:
              'Vimeo 沒有為該連結回傳公開的畫質。常見原因是隱私設定、需要密碼、影片已刪除，或者連結指向的是個人檔案或展示頁而不是影片頁。'
          },
          {
            question: '需要 Vimeo 帳號或安裝擴充功能嗎？',
            answer:
              '一般公開下載不需要帳號，也不需要擴充功能。只有在檔案非常大、或你希望傳輸在分頁之外繼續時，瀏覽器擴充功能才有用。'
          },
          {
            question: '下載下來是什麼格式和畫質？',
            answer:
              '下載是基於 Vimeo 提供的畫質所產生的 MP4 檔案。你可以在可用畫質中選擇，最高一檔通常就是創作者上傳的畫質。'
          },
          {
            question: '是免費的嗎？',
            answer:
              '解析公開的 Vimeo 連結是免費的。經過工作區的下載會消耗點數，點數一次性購買且永不過期；擴充功能另有獨立的 Unlimited 訂閱。'
          },
          {
            question: '把 Vimeo 連結貼到這裡安全嗎？',
            answer:
              '安全。只會用你貼上的連結去查詢該影片。下載器絕不會索要 Vimeo 密碼、驗證碼或工作階段檔案，遇到索要這些資訊的頁面請直接離開。'
          },
          {
            question: '下載 Vimeo 影片合法嗎？',
            answer:
              '這取決於影片內容、你的權限和使用目的。請只下載你有權保留的內容，未經授權不要散布受著作權保護或私密的素材。'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: '網頁登入',
          title: '登入後同步積分',
          signedInAs: '目前登入帳號',
          continueWithGoogle: '使用 Google 繼續',
          googleLoading: '正在開啟 Google...',
          or: '或',
          emailLabel: '電子郵件',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: '使用電子郵件繼續',
          sendCode: '發送驗證碼',
          sendingCode: '發送中...',
          sendCodeSuccess: '驗證碼已發送。',
          sendAgain: '重新發送',
          codeLabel: '驗證碼',
          codePlaceholder: '123456',
          signIn: '登入',
          termsNotice: '登入即表示你同意',
          termsLink: '服務條款',
          privacyLink: '隱私權政策',
          logout: '登出',
          creditsLabel: '積分'
        },
                quota: {
          eyebrow: '積分',
          title: '目前積分餘額',
          planLabel: '方案',
          remainingLabel: '剩餘',
          dailyLimitLabel: '每日上限',
          unlimited: '不限'
        },
                checkin: {
          creditsLoading: '積分',
          creditsButtonLabel: '開啟每日簽到',
          accountButtonLabel: '開啟帳戶選單',
          accountMenuLabel: '帳戶選單',
          title: '今日免費積分已準備好',
          todayRewardText: '今日獎勵：{credits} 積分',
          claimedRewardText: '你今天已領取 {credits} 積分。',
          nextCountdown: '距離下次可領取還有 {time}',
          nextAt: '（下次刷新：{time} EST）',
          claimButton: '領取 {credits} 積分',
          claimingButton: '領取中...',
          notNow: '稍後再說',
          close: '關閉',
          loadFailed: '載入簽到狀態失敗。',
          claimFailed: '領取積分失敗。'
        },
                creditPurchase: {
          installGuide: '也可以使用瀏覽器擴充功能下載。',
          installExtension: '安裝擴充功能',
          title: '購買積分',
          description: '補充積分後即可繼續在目前下載工作區下載。',
          successTitle: '積分已到帳',
          successDescription: '餘額已重新整理。關閉彈窗後，請重新點擊下載。',
          packageEyebrow: '按需購買',
          cardNote: '積分可用於網站下載，永久有效。',
          creditsAmount: '{credits} 積分',
          buyNow: '立即購買',
          selectPackage: '選擇',
          paymentMethodLabel: '選擇付款方式',
          paymentTitle: '選擇付款方式',
          selectedPackageLabel: '已選商品',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: '繼續付款',
          backToProducts: '返回',
          close: '關閉',
          agreementText: '我已閱讀並同意購買條款、服務條款和隱私政策。',
          loadingConfigs: '正在載入積分套餐...',
          loadFailed: '載入積分套餐失敗，請重試。',
          noConfigs: '目前沒有可購買的積分套餐，請稍後重試。',
          ready: '請選擇積分套餐。頁面只顯示美元價格。',
          creatingOrder: '正在建立訂單...',
          pendingPayment: '請在新開啟的分頁完成付款。我們會自動檢查結果。',
          pendingPaymentTitle: '等待付款',
          cancelPayment: '取消付款',
          supportMailPrefix: '回報問題：',
          success: '付款完成，積分已可使用。',
          failed: '付款尚未完成，你可以重試或關閉彈窗。',
          successCredits: '+{credits} 積分已到帳',
          successBalance: '目前餘額：{balance} 積分',
          createFailed: '建立訂單失敗，請重試。',
          invalidPaymentData: '付款連結異常，請稍後重試。',
          priceUpdated: '價格已更新，請確認最新價格後重新購買。',
          gatewayFailed: '付款入口暫不可用，請稍後重試。',
          paymentCanceled: '付款已取消，請重新選擇付款方式。',
          pollFailed: '重新整理付款狀態失敗，請重試。',
          pollTimeout: '自動重新整理已逾時。付款後請手動重新整理結果。',
          orderNotFound: '訂單已不可用，請重新下單。',
          orderExpired: '訂單已過期，請重新購買。',
          fulfillmentFailed: '付款已收到，但積分暫未到帳，請稍後重試。',
          authExpired: '登入已失效，請重新登入後繼續。'
        },
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
          enterEmailFirst: '請先輸入電子郵件地址。',
          enterEmailAndCode: '請輸入電子郵件與驗證碼。',
          sendCodeFailed: '發送驗證碼失敗。',
          googleSignInFailed: 'Google 登入失敗。',
          googleClientMissing: 'Google 登入尚未設定。',
          restoreSessionFailed: '恢復登入狀態失敗。',
          signInFailed: '登入失敗。',
          logoutFailed: '登出失敗。',
          loadQuotaFailed: '載入積分失敗。',
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
          quotaExceeded: '積分不足，無法下載這個檔案。',
          rateLimitExceeded: '請求過於頻繁，請稍後再試。'
        },
                anonymousQueue: {
          title: '下載排隊中',
          remaining: '下載將在 {seconds} 秒後開始。',
          hint: '登入後無需等待。',
          login: '登入',
          close: '關閉彈窗'
        },
                downloadAll: {
          allSuccess: '全部檔案已下載。',
          partialFailed: '部分檔案已下載，部分檔案失敗。',
          allFailed: '全部下載失敗。'
        }
      }
    },
    changelog: {
      title: 'Vimeo 下載器更新日誌',
      description:
        '追蹤 Vimeo 下載更新、解析變化、更大的檔案支援，以及 Vimeo Video Downloader 的發版說明。',
      seoTitle: 'Vimeo 下載器更新日誌 | Vimeo Video Downloader',
      seoDescription:
        '閱讀 Vimeo Video Downloader 更新日誌：解析更新、畫質處理、更大的檔案支援，以及每個版本的發版說明。',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: '效能提升',
          description: '大幅最佳化效能，整體體驗更流暢。',
          features: ['解析速度提升 50%', '最佳化大檔案下載穩定性', '提升介面回應速度']
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: '多語言支援',
          description: '新增 14 種語言支援。',
          features: ['新增日語、韓語等語言', '提升翻譯準確度', '新增自動語言辨識']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: '畫質選擇',
          description: '下載開始前可以先選擇想要的 Vimeo 畫質。',
          features: ['可選影片提供的任意畫質', '保留可用的最高畫質', '改進下載佇列管理']
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: '安全與隱私',
          description: '安全能力與隱私保護改進。',
          features: ['下載流程不再包含任何分析追蹤', '新增純本機處理模式', '改進資料加密']
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: '首次發布',
          description: 'Vimeo 連結下載器的首個版本。',
          features: ['支援 Vimeo 連結解析與 MP4 輸出', '支援 vimeo.com 與 player.vimeo.com 連結', '基礎畫質處理']
        }
      ],
      labels: {
        features: '新功能',
        fixes: '問題修正'
      }
    },
    pricing: zhTWPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Vimeo 影片下載器高清 - 多畫質 | Vimeo Video Downloader',
          description:
            '免費下載高清 Vimeo 影片，支援多種畫質選擇。不需安裝應用程式，隨時儲存任意公開的 Vimeo 影片。',
          keywords:
            'Vimeo 下載器, Vimeo 影片下載, 下載 Vimeo 高清影片, Vimeo 免費下載, 儲存 Vimeo 影片, Vimeo 高清下載'
        },
        workspace: {
          title: 'Vimeo 影片下載器高清',
          helperText: '貼上任意公開的 Vimeo 影片連結，選擇畫質後即可下載高清版本。',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: '為什麼選擇我們的 Vimeo 下載器',
          subtitle: '完全免費，以高清畫質儲存 Vimeo 影片，並自由選擇畫質。',
          items: [
            {
              title: '原始高清畫質',
              description: '以完整的全高清解析度下載 Vimeo 影片，畫質與創作者上傳時一致。'
            },
            {
              title: '多種畫質',
              description: '在可用畫質（360p、720p、1080p 等）中選擇，挑最適合你的畫質。'
            },
            {
              title: '快速且免費',
              description: '不需安裝應用程式、不需帳號。貼上 Vimeo 連結、選擇畫質、立即下載。'
            }
          ]
        },
        howTo: {
          title: '如何下載高清 Vimeo 影片',
          subtitle: '三步儲存任意公開的 Vimeo 影片，並使用你想要的畫質。',
          steps: [
            {
              title: '複製 Vimeo 影片連結',
              description: '開啟 Vimeo 影片頁面，從瀏覽器網址列複製連結。'
            },
            {
              title: '貼到上方輸入框',
              description: '把複製的 Vimeo 連結貼到輸入框，然後點擊解析。'
            },
            {
              title: '選擇畫質並下載',
              description: '選擇你需要的畫質，點擊下載即可儲存高清影片。'
            }
          ]
        },
        faq: {
          title: 'Vimeo 下載器常見問題',
          items: [
            {
              question: '如何從 Vimeo 下載影片？',
              answer:
                '複製 Vimeo 影片頁面連結，貼到上方輸入框，點擊解析，然後選擇畫質並下載。'
            },
            {
              question: '可以選擇影片畫質嗎？',
              answer:
                '可以。解析完成後，你可以在所有可用畫質中選擇，包括 360p、720p、1080p，以及更高（如果有提供）。'
            },
            {
              question: '這個 Vimeo 下載器免費嗎？',
              answer:
                '解析公開的 Vimeo 連結免費，也不需要註冊。經過工作區的下載會消耗點數。'
            },
            {
              question: '下載需要 Vimeo 帳號嗎？',
              answer: '不需要帳號。不需登入即可下載任意公開的 Vimeo 影片。'
            },
            {
              question: '下載的影片是什麼格式？',
              answer: 'Vimeo 影片以 MP4 格式下載，幾乎相容於所有裝置和播放器。'
            }
          ]
        }
      }
    }
  }
}
