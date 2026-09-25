import type { SiteContent } from '../schema'
import { jaJPPricingContent } from '../pricing'

export const jaJP: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Vimeo 動画を HD でダウンロード',
    description:
      '公開 Vimeo リンクを貼り付けて、必要な画質で動画を保存できます。通常のダウンロードにアプリもアカウントも拡張機能も不要です。',
    keywords:
      'Vimeo 動画 ダウンロード, Vimeo ダウンローダー, Vimeo 保存, Vimeo HD ダウンロード, Vimeo MP4 変換, オンライン Vimeo ダウンロード'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'ホーム',
      pricing: '料金',
      solutions: 'ダウンロードガイド',
      changelog: '変更履歴'
    },
    footer: {
      resources: 'リソース',
      rights: '© 2026 Vimeo Video Downloader. All rights reserved.'
    }
  },
  common: {
    installCta: '今すぐインストール'
  },
  sections: {
    features: {
      title: 'Vimeo ダウンロード機能',
      subtitle:
        '公開 Vimeo リンクに対して、ページを解析し、Vimeo が公開している画質を一覧表示し、選んだものを保存します。',
      metaDescription:
        'Vimeo Video Downloader の機能：HD ダウンロード、画質の選択、MP4 出力、アカウント不要、そして非公開・パスワード付き動画に対する明確な対応範囲。',
      items: [
        {
          title: '画質を選べる',
          description: 'Vimeo が用意した最小ファイルで妥協せず、必要な画質を選べます',
          details: [
            '動画が公開している画質から選択',
            'オフライン視聴用に利用可能な最高画質をダウンロード',
            '元のアスペクト比と音声トラックを維持',
            'どの端末・プレイヤーでも再生できる MP4 出力'
          ]
        },
        {
          title: 'リンク解析',
          description: 'Vimeo の動画ページ URL を貼り付けると、利用可能な画質を読み取ります',
          details: [
            'vimeo.com、www.vimeo.com、player.vimeo.com のリンクに対応',
            'Vimeo アカウントやログインは不要',
            '非公開または解析できない場合は明確に表示',
            '通常のダウンロードはインストール不要'
          ]
        },
        {
          title: '大容量ファイル対応',
          description:
            '長い Vimeo 動画も進捗表示つきでダウンロードでき、巨大なファイルはブラウザ拡張機能が引き継ぎます',
          details: [
            'ダウンロード中は進捗を確認できる',
            '中断したダウンロードはワークスペースから再開できる',
            'ブラウザだけでは完了できないファイルは拡張機能が処理',
            '大きなダウンロードの前にストレージを確認'
          ]
        },
        {
          title: 'どの端末でも',
          description:
            'スマートフォン、タブレット、PC のどれでも同じページを使え、ダウンロードはブラウザ内で完結します',
          details: [
            'Windows、macOS、Android、iPhone、タブレットに対応',
            'デスクトップアプリは不要',
            '小さい画面でも使いやすいレイアウト',
            '保存先はブラウザの通常のダウンロードフォルダ'
          ]
        },
        {
          title: '明確なアクセス範囲',
          description:
            '非公開・パスワード付き・有料の Vimeo 動画は対象外で、そのまま伝えます',
          details: [
            'プライバシーやアクセス制限を回避しようとしない',
            'Vimeo のパスワード、確認コード、セッションファイルは一切要求しない',
            '解析できるのは公開された動画ページのみ',
            '保存する権利があるかは利用者の責任'
          ]
        },
        {
          title: '登録不要のすばやい流れ',
          description: 'コピー、貼り付け、選択、ダウンロード。アカウントが必要になるのはクレジットを使うときだけ',
          details: [
            '公開リンクの解析に登録は不要',
            'クレジットが必要なときだけ Google かメールの確認コードでログイン',
            'クレジットは有効期限なし',
            'リンクを処理できない場合は明確なエラーを表示'
          ]
        }
      ]
    },
    steps: {
      title: 'Vimeo 動画を保存する手順',
      subtitle:
        '流れは 3 ステップだけです。Vimeo の動画ページ URL をコピーし、上に貼り付け、画質を選んでダウンロードします。',
      metaDescription:
        'Vimeo 動画を保存する手順：動画ページの URL をコピーし、Vimeo Video Downloader に貼り付け、画質を選んで MP4 をダウンロードします。',
      items: [
        {
          title: 'Vimeo のリンクをコピー',
          description: 'vimeo.com で動画を開き、アドレスバーか共有メニューから URL をコピーします'
        },
        {
          title: '上に貼り付ける',
          description: '入力欄にリンクを入れて解析を開始すると、Vimeo が公開している画質が一覧表示されます'
        },
        {
          title: '画質を選ぶ',
          description: '利用可能な画質から、必要なものを選びます'
        },
        {
          title: 'MP4 をダウンロード',
          description: '端末に保存します。大きなファイルはブラウザ拡張機能が必要な場合があります'
        }
      ]
    },
    cta: {
      title: 'Vimeo 動画をダウンロードしますか？',
      description: '公開 Vimeo リンクを上に貼り付けて、必要な画質で保存しましょう。'
    },
    techSpecs: {
      title: '技術仕様',
      browsersLabel: 'ブラウザ',
      browsers: 'Chrome、Edge、Brave、およびすべての Chromium ベースのブラウザ',
      sourceHostsLabel: '対応リンク',
      sourceHosts: 'vimeo.com、www.vimeo.com、player.vimeo.com',
      permissionsLabel: '権限',
      permissions: '最小限の権限のみ',
      updatesLabel: '更新',
      updates: '拡張機能ストアから自動更新'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Vimeo 動画を必要な画質でダウンロード',
        description: '公開 Vimeo リンクを貼り付け、画質を選んで、ブラウザからそのまま MP4 を保存します。'
      },
      stats: {
        users: '世界中のユーザー',
        downloads: '総ダウンロード数'
      },
      seo: {
        title: 'Vimeo 動画ダウンローダー：Vimeo の動画を HD で保存',
        description:
          '公開 Vimeo 動画を HD で保存し、画質を選べます。リンクを貼り付けて解析し、何もインストールせずに MP4 をダウンロードできます。',
        keywords:
          'Vimeo 動画 ダウンロード, Vimeo ダウンローダー, Vimeo HD 保存, Vimeo 動画 保存, Vimeo MP4, オンライン Vimeo ダウンロード'
      },
      heroTrustPoints: [
        'HD ダウンロード',
        '登録不要',
        'モバイル対応',
        'Windows、Mac、Android、iPhone で利用可能'
      ],
      situation: {
        title: 'はじめに：手元のリンクはどのタイプですか？',
        intro: 'Vimeo ダウンローダーを探している人の多くは、次のいずれかのリンクを持っています。',
        headers: ['状況', 'まず試すこと'],
        rows: [
          {
            cells: [
              '公開された Vimeo 動画ページの URL がある',
              '上のダウンローダーに貼り付けて画質を選ぶ'
            ]
          },
          {
            cells: [
              '動画ページにダウンロードボタンがない',
              'このダウンローダーを使う（Vimeo 側のボタンは投稿者が許可した場合のみ表示されます）'
            ]
          },
          {
            cells: [
              '動画が非公開またはパスワード付き',
              '所有者からのアクセス許可が必要で、ダウンローダーでは開けません'
            ]
          },
          {
            cells: [
              'ダウンローダーが「非公開または解析できない」と表示する',
              'リンクが動画ページの URL で、動画が公開されているか確認する'
            ]
          }
        ]
      },
      solutions: {
        title: 'Vimeo 動画に対して実際に使える方法',
        intro:
          'Vimeo の動画はアクセス規則が大きく異なります。公開された動画ページはダウンローダーで解析できますが、非公開・パスワード付き・有料の動画は外部からはたどれず、どのツールでも同じです。',
        quickAnswer:
          '結論：Vimeo のページが公開なら、上のリンクを貼り付けて必要な画質をダウンロードしてください。Vimeo 自身がダウンロードボタンを表示しているならそれが最も確実です。非公開やパスワード付きの場合は、所有者にアクセス許可か書き出しを依頼してください。どのダウンローダーでも回避できません。',
        items: [
          {
            title: '方法 1：オンライン Vimeo ダウンローダー',
            description:
              '公開された Vimeo 動画ページに最適です。URL を貼り付けると Vimeo が公開している画質が一覧表示されるので、必要なものを保存します。',
            useWhenLabel: '向いている場面：',
            useWhen: [
              '動画ページが公開され、ログインなしで開ける。',
              '特定の画質、または利用可能な最高画質がほしい。',
              '拡張機能やデスクトップアプリを入れたくない。'
            ]
          },
          {
            title: '方法 2：Vimeo 純正のダウンロードボタン',
            description:
              '投稿者がダウンロードを許可している動画では、Vimeo プレイヤーにダウンロードボタンが表示されます。これが最も直接的な方法です。',
            useWhenLabel: '向いている場面：',
            useWhen: [
              'Vimeo プレイヤーにダウンロード項目が表示される。',
              '投稿者が公開したそのままのファイルがほしい。',
              'すでにコピーを保持する許可がある。'
            ]
          },
          {
            title: '方法 3：大容量ファイルはブラウザ拡張機能',
            description:
              '長い動画は、タブだけで快適に転送・保存できる範囲を超えることがあります。拡張機能が転送を引き継ぎ、再開可能な状態を保ちます。',
            useWhenLabel: '向いている場面：',
            useWhen: [
              'ファイルが非常に大きい、またはダウンロードが頻繁に中断する。',
              'ワークスペースがブラウザのローカルストレージ不足を知らせる。',
              'Vimeo から頻繁にダウンロードする。'
            ]
          },
          {
            title: '方法 4：画面収録（最終手段）',
            description:
              '再生はできるものの、合法的なダウンロード経路がない場合は画面収録で記録できます。画質と音声が再生状況に左右されるため、最初の手段ではなく最後の手段です。',
            useWhenLabel: '向いている場面：',
            useWhen: [
              '動画を視聴し保持する許可がある。',
              'リンクからは解析できない動画である。',
              '個人的なオフライン参照用のコピーがほしいだけ。'
            ]
          }
        ]
      },
      benefits: {
        title: 'オンライン Vimeo ダウンローダーを使う理由',
        intro:
          '良いダウンローダーは「このリンクの Vimeo 動画は保存できるか」という問いにすぐ答えます。制限は正直に示し、非公開動画を処理できないときは理由を明確に説明すべきです。',
        items: [
          {
            title: '高画質で保存',
            description: 'Vimeo が公開している最高画質を保つので、オフラインでも投稿時の見た目のままです。'
          },
          {
            title: '端末を選ばない',
            description:
              'Android、iPhone、Windows、Mac、タブレットのブラウザで使えます。保存は手持ちのブラウザが行います。'
          },
          {
            title: 'Vimeo ログイン不要',
            description:
              '公開動画ページに Vimeo アカウントは不要です。パスワード、確認コード、セッションファイルは一切要求しません。'
          },
          {
            title: 'オフライン再生が簡単',
            description:
              'ダウンロードは MP4 なので、追加のコーデックなしでほとんどの端末とプレイヤーで再生できます。'
          },
          {
            title: 'リンクベースの速い流れ',
            description:
              'コピー、貼り付け、選択、ダウンロード。失敗した場合は、非公開・削除済み・非対応のどれなのかをページが説明します。'
          },
          {
            title: '明確な権限の境界',
            description:
              '保持する権利のある動画だけをダウンロードしてください。クリエイターの権利、Vimeo の規約、動画に付いたアクセス規則を尊重します。'
          },
          {
            title: '画質を選べる',
            description: '1 つの画質に固定されず、動画が公開している複数の画質から選べます。'
          },
          {
            title: '大容量ファイルの扱い',
            description:
              '長い動画は開始前にブラウザのストレージを確認し、タブでは足りない場合はブラウザ拡張機能で続行できます。'
          },
          {
            title: 'わかりやすい料金',
            description:
              '公開リンクの解析にアカウントは不要です。クレジットが必要になるのはワークスペース経由のダウンロードだけで、クレジットは買い切りで有効期限がありません。'
          }
        ]
      },
      troubleshooting: {
        title: 'Vimeo リンクが機能しないとき',
        intro:
          '失敗がすべてダウンローダーの不具合というわけではありません。Vimeo 動画はページが公開されていないことが原因のことが多いです。次の項目を確認してください。',
        items: [
          'ブラウザでリンクを開き、ログインなしで再生できるか確認する。',
          'URL が動画ページであり、プロフィールやショーケース、検索ページでないことを確認する。',
          'パスワード付き、または非公開に設定されていないか確認する。',
          '動画がまだ存在するか確認する（削除済みは解析できません）。',
          'ページが Vimeo に到達できない場合は、別のブラウザやネットワークを試す。',
          'Vimeo や Google のパスワードを求めるツールは使わない。'
        ]
      },
      permission: {
        title: '重要な権限の注意',
        note:
          'Vimeo 動画ダウンローダーを、プライバシー・著作権・アクセス制限の回避に使ってはいけません。権利者の許可がある場合、または法律と Vimeo の規約で認められる場合にのみ保存してください。'
      },
      comparison: {
        title: 'Vimeo のダウンロード方法の選び方',
        headers: ['状況', 'おすすめ', '最適な用途', '確認すること'],
        rows: [
          {
            cells: [
              '公開された Vimeo 動画ページ',
              'オンライン Vimeo ダウンローダー',
              'アプリなしで素早く HD ダウンロード',
              'ログインなしで開ける公開動画であること'
            ]
          },
          {
            cells: [
              '投稿者がダウンロードを許可',
              'Vimeo 純正のダウンロードボタン',
              '公開されたそのままのファイル',
              'プレイヤーにダウンロード項目があること'
            ]
          },
          {
            cells: [
              '非常に大きい、または中断するダウンロード',
              'ブラウザ拡張機能',
              'タブの限界を超える再開可能な転送',
              'ローカルの空き容量とネットワークの安定性'
            ]
          },
          {
            cells: [
              '非公開またはパスワード付きの動画',
              '所有者にアクセス許可か書き出しを依頼',
              'Vimeo のアクセス規則を守る',
              'アクセスできない動画はどのツールでも取得できません'
            ]
          }
        ]
      },
      howTo: {
        title: 'Vimeo 動画を 3 ステップでダウンロード',
        subtitle:
          '最も速いのは上のリンク型ダウンローダーです。Vimeo の動画ページが公開され、ブラウザから到達できる場合に機能します。',
        steps: [
          {
            title: '動画リンクをコピー',
            description: 'Vimeo で動画を開き、アドレスバーまたは共有メニューからページ URL をコピーします。'
          },
          {
            title: '貼り付けて解析',
            description:
              '上のダウンローダーにリンクを貼り付けます。Vimeo がその動画で公開している画質を確認します。'
          },
          {
            title: '画質を選んでダウンロード',
            description:
              '画質を選び、MP4 を端末に保存します。何も表示されない場合は、壊れているのではなく非公開か利用不可の可能性が高いです。'
          }
        ]
      },
      faq: {
        title: 'よくある質問',
        description: 'Vimeo 動画をダウンロードする前に、よく聞かれる質問です。',
        items: [
          {
            question: 'Vimeo の動画はどうやってダウンロードしますか？',
            answer:
              'Vimeo で動画ページを開いて URL をコピーし、上のダウンローダーに貼り付け、利用可能な画質を選んで MP4 をダウンロードします。'
          },
          {
            question: '非公開やパスワード付きの Vimeo 動画もダウンロードできますか？',
            answer:
              'できません。非公開・パスワード付き・有料の動画は Vimeo のセッション外からはたどれないため、解析できません。所有者にアクセス許可か書き出しを依頼してください。'
          },
          {
            question: 'ダウンローダーが「非公開」と表示するのはなぜですか？',
            answer:
              'Vimeo がそのリンクに対して公開画質を返していません。原因はプライバシー設定、パスワード要求、削除済み、あるいは動画ページではなくプロフィールやショーケースの URL であることが多いです。'
          },
          {
            question: 'Vimeo アカウントや拡張機能は必要ですか？',
            answer:
              '通常の公開ダウンロードにアカウントも拡張機能も不要です。拡張機能が役立つのは、ファイルが非常に大きい場合や、タブの外で転送を続けたい場合だけです。'
          },
          {
            question: 'どの形式・画質でダウンロードされますか？',
            answer:
              'Vimeo が公開している画質から生成した MP4 ファイルです。利用可能な画質から選べ、通常は最上位が投稿者がアップロードした画質です。'
          },
          {
            question: '無料ですか？',
            answer:
              '公開 Vimeo リンクの解析は無料です。ワークスペース経由のダウンロードはクレジットを消費します。クレジットは買い切りで有効期限がなく、拡張機能には別途 Unlimited サブスクリプションがあります。'
          },
          {
            question: 'Vimeo のリンクを貼り付けても安全ですか？',
            answer:
              '安全です。貼り付けたリンクは動画の照会にのみ使われます。パスワード、確認コード、セッションファイルを求めることはありません。求めるページからは離れてください。'
          },
          {
            question: 'Vimeo 動画のダウンロードは合法ですか？',
            answer:
              '動画の内容、あなたの権限、利用目的によります。保持する権利のあるコンテンツだけをダウンロードし、著作権で保護された素材や非公開素材を無断で配布しないでください。'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Web ログイン',
          title: 'ログインしてクレジットを同期',
          signedInAs: 'ログイン中のアカウント',
          continueWithGoogle: 'Google で続行',
          googleLoading: 'Google を開いています...',
          or: 'または',
          emailLabel: 'メールアドレス',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'メールで続行',
          sendCode: '認証コードを送信',
          sendingCode: '送信中...',
          sendCodeSuccess: '認証コードを送信しました。',
          sendAgain: '再送信',
          codeLabel: '認証コード',
          codePlaceholder: '123456',
          signIn: 'ログイン',
          termsNotice: 'ログインすると、以下に同意したものとみなされます',
          termsLink: '利用規約',
          privacyLink: 'プライバシーポリシー',
          logout: 'ログアウト',
          creditsLabel: 'クレジット'
        },
                quota: {
          eyebrow: 'Web クォータ',
          title: '現在のクレジット残高',
          planLabel: 'プラン',
          remainingLabel: '残り',
          dailyLimitLabel: '1日の上限',
          unlimited: '無制限'
        },
                checkin: {
          creditsLoading: 'クレジット',
          creditsButtonLabel: 'デイリーチェックインを開く',
          accountButtonLabel: 'アカウントメニューを開く',
          accountMenuLabel: 'アカウントメニュー',
          title: '今日の無料クレジットを受け取れます',
          todayRewardText: '本日の報酬: {credits} クレジット',
          claimedRewardText: '本日は {credits} クレジットを受け取りました。',
          nextCountdown: '次回受け取りまで {time}',
          nextAt: '(次回更新: {time} EST)',
          claimButton: '{credits} クレジットを受け取る',
          claimingButton: '受け取り中...',
          notNow: '後で',
          close: '閉じる',
          loadFailed: 'チェックイン状態の読み込みに失敗しました。',
          claimFailed: 'クレジットの受け取りに失敗しました。'
        },
                creditPurchase: {
          installGuide: 'ブラウザー拡張機能でもダウンロードできます。',
          installExtension: '拡張機能をインストール',
          title: 'クレジットを購入',
          description: 'クレジットを追加して、このワークスペースでダウンロードを続けられます。',
          successTitle: 'クレジットを追加しました',
          successDescription: '残高を更新しました。このウィンドウを閉じて、もう一度ダウンロードを開始してください。',
          packageEyebrow: '使った分だけ購入',
          cardNote: 'クレジットは Web ダウンロードに使えます。有効期限はありません。',
          creditsAmount: '{credits} クレジット',
          buyNow: '今すぐ購入',
          selectPackage: '選択',
          paymentMethodLabel: '支払い方法を選択',
          paymentTitle: '支払い方法を選択',
          selectedPackageLabel: '選択した商品',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: '支払いへ進む',
          backToProducts: '戻る',
          close: '閉じる',
          agreementText: '購入条件、利用規約、プライバシーポリシーに同意します。',
          loadingConfigs: 'クレジットパッケージを読み込み中...',
          loadFailed: 'クレジットパッケージの読み込みに失敗しました。もう一度お試しください。',
          noConfigs: '現在購入できるクレジットパッケージはありません。後でもう一度お試しください。',
          ready: 'クレジットパッケージを選択してください。価格は USD で表示されます。',
          creatingOrder: '注文を作成中...',
          pendingPayment: '新しく開いたタブで支払いを完了してください。結果は自動で確認します。',
          pendingPaymentTitle: '支払い待ち',
          cancelPayment: '支払いをキャンセル',
          supportMailPrefix: '問題を報告: ',
          success: '支払いが完了しました。クレジットを利用できます。',
          failed: '支払いはまだ完了していません。再試行するか、このウィンドウを閉じられます。',
          successCredits: '+{credits} クレジットを追加しました',
          successBalance: '現在の残高: {balance} クレジット',
          createFailed: '注文作成に失敗しました。もう一度お試しください。',
          invalidPaymentData: '支払いリンクが無効です。後でもう一度お試しください。',
          priceUpdated: '価格が変更されました。最新価格を確認して再購入してください。',
          gatewayFailed: '支払い入口を一時的に利用できません。後でもう一度お試しください。',
          paymentCanceled: '支払いがキャンセルされました。支払い方法を選んでもう一度お試しください。',
          pollFailed: '支払い状態の更新に失敗しました。もう一度お試しください。',
          pollTimeout: '自動更新がタイムアウトしました。支払い後に手動で結果を更新してください。',
          orderNotFound: '注文は利用できなくなりました。新しい注文を作成してください。',
          orderExpired: '注文の期限が切れました。再購入してください。',
          fulfillmentFailed: '支払いは受領済みですが、クレジットはまだ追加されていません。後でもう一度お試しください。',
          authExpired: 'ログイン期限が切れました。再ログインして続けてください。'
        },
        parse: {
          eyebrow: 'クイックリンクチェック',
          title: 'Vimeo 動画ダウンローダー：公開 Vimeo 動画を保存',
          helperText:
            '公開 Vimeo 動画のリンクを貼り付け、Vimeo が公開している画質を確認して、必要な解像度をダウンロードします。',
          linkLabel: 'Vimeo リンク',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: '入力をクリア',
          submit: 'Vimeo 動画リンクを貼り付け',
          submitting: '解析中...',
          noResults: 'この動画でダウンロードできるファイルが見つかりませんでした。',
          download: 'ダウンロード',
          downloading: 'ダウンロード中...',
          checkingStorage: 'ブラウザのストレージを確認しています...',
          unknownSize: 'サイズ不明',
          preparingMp4: 'MP4 を準備しています...',
          downloadAll: 'すべてダウンロード',
          downloadingAll: 'すべてダウンロード中...',
          resumeNotice: '未完了のダウンロード「{filename}」（{progress}）があります。続行しますか？',
          resumeAction: '続行',
          pendingRestartText: '「{filename}」のダウンロード記録を再開できます。',
          pendingRestartButton: 'ダウンロードを再開',
          resumeUnavailableText: 'ローカルの復元記録は期限切れです。',
          resumeDismiss: '無視',
          resuming: '再開しています...',
          largeFileExtensionInlineChromeTitle: 'Chrome 拡張機能',
          largeFileExtensionInlineChromeDescription:
            'Chrome 専用の拡張機能で、大きな Vimeo ダウンロードをタブの外で続行できます。',
          largeFileExtensionInlineChromeCta: '拡張機能をインストール',
          largeFileExtensionInlineEdgeTitle: 'Edge 拡張機能',
          largeFileExtensionInlineEdgeDescription:
            'Microsoft Edge 専用の拡張機能で、Vimeo の大容量ダウンロードを同じように扱えます。',
          largeFileExtensionInlineEdgeCta: '拡張機能をインストール'
        },
                errors: {
          enterEmailFirst: '先にメールアドレスを入力してください。',
          enterEmailAndCode: 'メールアドレスと認証コードを入力してください。',
          sendCodeFailed: '認証コードの送信に失敗しました。',
          googleSignInFailed: 'Google ログインに失敗しました。',
          googleClientMissing: 'Google ログインが設定されていません。',
          restoreSessionFailed: 'セッションの復元に失敗しました。',
          signInFailed: 'ログインに失敗しました。',
          logoutFailed: 'ログアウトに失敗しました。',
          loadQuotaFailed: 'クレジットの取得に失敗しました。',
          enterLink: 'メディアリンクを入力してください。',
          invalidLink: 'これは有効なURLではありません。',
          parseFailed: 'このリンクを解析できませんでした。',
          downloadFailed: 'ダウンロードに失敗しました。',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'この動画はブラウザーのダウンロードサイズ制限を超えています。',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'This link platform is not supported.',
          vimeoParseFailed: 'This Vimeo video is private or cannot be parsed.',
          quotaExceeded: 'このファイルをダウンロードするためのクレジットが足りません。',
          rateLimitExceeded: 'Too many requests. Please try again later.'
        },
                anonymousQueue: {
          title: 'ダウンロード待機中',
          remaining: '{seconds} 秒後にダウンロードが始まります。',
          hint: 'ログインすれば待ち時間なしでダウンロードできます。',
          login: 'ログイン',
          close: '閉じる'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    },
    changelog: {
      title: 'Vimeo ダウンローダー更新履歴',
      description:
        'Vimeo ダウンロードの更新、解析の変更、大容量ファイル対応、Vimeo Video Downloader のリリースノートをまとめています。',
      seoTitle: 'Vimeo ダウンローダー更新履歴 | Vimeo Video Downloader',
      seoDescription:
        'Vimeo Video Downloader の更新履歴：解析の更新、画質処理、大容量ファイル対応、各バージョンのリリースノート。',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'パフォーマンス改善',
          description: '操作性向上のための大幅なパフォーマンス改善。',
          features: ['解析速度が 50% 向上', '大容量ダウンロードの安定性を最適化', 'UI の応答性を改善']
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: '多言語対応',
          description: '世界 14 言語に対応しました。',
          features: ['日本語、韓国語などを追加', '翻訳精度を改善', '自動言語判定を追加']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: '画質の選択',
          description: 'ダウンロード開始前に Vimeo の画質を選べるようになりました。',
          features: ['公開されている任意の画質を選択', '利用可能な最高画質を保持', 'ダウンロードキューの管理を改善']
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'セキュリティとプライバシー',
          description: 'セキュリティとプライバシー保護の改善。',
          features: ['ダウンロードからの解析トラッキングを廃止', 'ローカルのみで処理するモードを追加', 'データ暗号化を改善']
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: '初回リリース',
          description: 'Vimeo リンクダウンローダーの最初のリリース。',
          features: ['Vimeo リンクの解析と MP4 出力', 'vimeo.com と player.vimeo.com のリンクに対応', '基本的な画質処理']
        }
      ],
      labels: {
        features: '新機能',
        fixes: '不具合修正'
      }
    },
    pricing: jaJPPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Vimeo 動画ダウンローダー HD - 複数画質 | Vimeo Video Downloader',
          description:
            'Vimeo 動画を HD 画質で、複数の解像度から選んで無料ダウンロード。アプリ不要で、公開 Vimeo 動画をすぐに保存できます。',
          keywords:
            'Vimeo ダウンローダー, Vimeo 動画 ダウンロード, Vimeo HD ダウンロード, Vimeo 無料 ダウンロード, Vimeo 保存, Vimeo 高画質'
        },
        workspace: {
          title: 'Vimeo 動画ダウンローダー HD',
          helperText: '公開 Vimeo 動画のリンクを貼り付けて、画質を選んで HD でダウンロードできます。',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'この Vimeo ダウンローダーを選ぶ理由',
          subtitle: '完全無料で、Vimeo 動画を HD 画質で保存し、画質も自由に選べます。',
          items: [
            {
              title: '元の HD 画質',
              description:
                'Vimeo 動画をフル HD 解像度のままダウンロード。投稿者がアップロードした通りの鮮明さで保存できます。'
            },
            {
              title: '複数の画質',
              description:
                '利用可能な画質（360p、720p、1080p など）から選べます。用途に合う画質を選んでください。'
            },
            {
              title: '高速かつ無料',
              description:
                'アプリのインストールもアカウントも不要。Vimeo のリンクを貼り、画質を選んで、すぐにダウンロードできます。'
            }
          ]
        },
        howTo: {
          title: 'Vimeo 動画を HD でダウンロードする方法',
          subtitle: '公開 Vimeo 動画を、希望の画質で保存する 3 ステップです。',
          steps: [
            {
              title: 'Vimeo の動画リンクをコピー',
              description: 'Vimeo の動画ページを開き、ブラウザのアドレスバーから URL をコピーします。'
            },
            {
              title: '上の入力欄に貼り付け',
              description: 'コピーした Vimeo の URL を入力欄に貼り付け、解析をクリックします。'
            },
            {
              title: '画質を選んでダウンロード',
              description: '希望の画質を選び、ダウンロードをクリックして HD 動画を保存します。'
            }
          ]
        },
        faq: {
          title: 'Vimeo ダウンローダー FAQ',
          items: [
            {
              question: 'Vimeo から動画をダウンロードするには？',
              answer:
                'Vimeo の動画ページの URL をコピーし、上の入力欄に貼り付けて解析をクリックし、希望の画質を選んでダウンロードします。'
            },
            {
              question: '動画の画質は選べますか？',
              answer:
                'はい。解析後、利用可能なすべての画質（360p、720p、1080p、それ以上が提供されていればそれも）から選べます。'
            },
            {
              question: 'この Vimeo ダウンローダーは無料ですか？',
              answer:
                '公開 Vimeo リンクの解析は無料で、登録も不要です。ワークスペース経由のダウンロードではクレジットを消費します。'
            },
            {
              question: 'ダウンロードに Vimeo アカウントは必要ですか？',
              answer: 'アカウントは不要です。ログインせずに公開 Vimeo 動画をダウンロードできます。'
            },
            {
              question: 'ダウンロードされる動画の形式は？',
              answer: 'Vimeo 動画は MP4 形式でダウンロードされ、ほとんどの端末やプレイヤーで再生できます。'
            }
          ]
        }
      }
    }
  }
}
