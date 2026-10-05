import type { SiteContent } from '../schema'
import { jaJPPricingContent } from '../pricing'

export const jaJP: SiteContent = {
  site: {
    description: 'Vimeo のリンクを貼るだけで、ログイン不要・無料でブラウザに動画を保存できます。音声、字幕、カバー画像、キューが必要なら Chrome 拡張機能を追加してください。'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'ホーム',
      pricing: '料金',
    },
    footer: {
      resources: 'リソース',
      rights: '© 2026 Vimeo Video Downloader. All rights reserved.'
    }
  },
  common: {
    installCta: '今すぐインストール'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Video Downloader – 無料のオンラインツールと Chrome 拡張機能',
        description: 'Vimeo のリンクを貼るだけで、ログイン不要・無料でブラウザに動画を保存できます。音声、字幕、カバー画像、キューが必要なら Chrome 拡張機能を追加してください。'
      },
      heroTrustPoints: [
        'HD ダウンロード',
        '登録不要',
        'モバイル対応',
        'Windows、Mac、Android、iPhone で利用可能'
      ],
      workspace: {
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
          rateLimitExceeded: 'Too many requests. Please try again later.',
          useExtensionForResource: 'このリソースはブラウザ拡張機能でのみダウンロードできます。拡張機能をインストールして続行してください。'
        },
                anonymousQueue: {
          title: 'ダウンロード待機中',
          remaining: '{seconds} 秒後にダウンロードが始まります。',
          close: '閉じる'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    ,
      softwareApplication: {
        description: 'Vimeo を視聴している方向けの Chrome 拡張機能です。再生中の動画をローカルに保存でき、ページ上に動画・音声・字幕・カバー画像の 4 行パネルを表示します。',
        featureList: [
          '動画・音声・字幕・画像の各行を備えたページ内ダウンロードパネル',
          '画質を選択、または Best を指定',
          '音声を M4A で保存、または MP3 に変換',
          '字幕を VTT で保存し、アダプティブ動画・音声を切り抜き',
          'カバー画像を JPEG で保存',
          '進捗と速度をリアルタイム表示するポップアップのリソース一覧',
          'タブをまたいで共有されるグローバルなダウンロードキュー',
          'ローカル履歴、ファイル名テンプレート、保存サブフォルダの設定'
        ]
      },
      intro: {
        heading: 'Chrome 拡張機能でさらに便利に',
        lead: '上のオンラインツールは、リンクから Vimeo 動画を保存します。拡張機能は今まさに視聴している Vimeo のページ上で動作し、音声・字幕・カバー画像・ダウンロードキューを追加します。',
        primaryCta: 'Chrome に追加',
        secondaryCta: 'プランを見る',
        panel: {
          ariaLabel: 'ページ内ダウンロードパネルのイメージ',
          rows: {
            video: '動画',
            audio: '音声',
            subtitle: '字幕',
            image: '画像'
          }
        }
      },
      features: {
        heading: '拡張機能でできること',
        items: [
          {
            title: 'ページ内ダウンロードパネル',
            description: '動画の近くに、動画・音声・字幕・画像の行を持つ小さなパネルを表示します。別の動画に移ると自動で作り直されます。'
          },
          {
            title: '画質の選択と Best',
            description: '720p や 1080p など、その動画で利用できる画質を選べます。Best なら最高画質を自動で選びます。'
          },
          {
            title: '音声を M4A または MP3 で',
            description: '音声トラックだけを M4A で保存できます。ポップアップで MP3 を選ぶと変換して出力します。'
          },
          {
            title: '字幕と切り抜き',
            description: '利用できる字幕を VTT で保存します。アダプティブ動画・音声は、動画を再エンコードせずに切り抜けます。'
          },
          {
            title: 'カバー画像',
            description: '動画のカバー画像を JPEG ファイルとして別に保存します。'
          },
          {
            title: 'ポップアップ一覧とキュー',
            description: '検出した項目をポップアップで進捗付きで確認し、キューに追加するとタブをまたいで順番にダウンロードされます。'
          },
          {
            title: '大きなファイル',
            description: 'Chrome が直接取得できるファイルは Chrome のダウンロードマネージャーに任せます。アダプティブ配信はメモリ予算の範囲内でバックグラウンド結合します。'
          },
          {
            title: '設定と履歴',
            description: '保存サブフォルダ、ファイル名テンプレート、表示言語を設定できます。完了・失敗したダウンロードはローカル履歴に残り、CSV で書き出せます。'
          }
        ]
      },
      steps: {
        heading: '拡張機能の使い方',
        items: [
          {
            title: 'インストール',
            description: 'Chrome ウェブストアから拡張機能を追加します。'
          },
          {
            title: 'アイコンを固定',
            description: 'ツールバーに固定すると、ポップアップをすぐ開けます。'
          },
          {
            title: 'Vimeo の動画を開く',
            description: 'vimeo.com または player.vimeo.com の対応する動画ページを開いて再生します。'
          },
          {
            title: '画質を選ぶ',
            description: 'パネルで希望の画質をクリックするか、拡張機能アイコンから一覧を開きます。ファイルはブラウザがディスクに書き込みます。'
          }
        ]
      },
      comparison: {
        heading: 'オンラインツールと拡張機能の違い',
        columns: {
          dimension: '比較項目',
          web: 'オンラインツール',
          extension: 'Chrome 拡張機能'
        },
        rows: [
          {
            dimension: '動作する場所',
            web: 'このページを開いた任意のブラウザタブで、Vimeo のリンクを貼って使います。',
            extension: 'Chrome などの Chromium ブラウザで、視聴中の Vimeo ページ上で動作します。'
          },
          {
            dimension: '保存できるもの',
            web: '動画を MP4 ファイルとして保存できます。',
            extension: '動画は MP4、音声は M4A または MP3、字幕は VTT、カバー画像は JPEG で保存できます。'
          },
          {
            dimension: '一括・キュー',
            web: '複数のリンクを貼り、「すべてダウンロード」で順番に実行できます。',
            extension: 'ポップアップから項目を追加すると、タブ共通の ひとつのキューで順番にダウンロードされます。'
          },
          {
            dimension: '大きなファイル',
            web: '非常に大きいファイルやサイズ不明のファイルは、拡張機能の利用を案内します。',
            extension: '直接取得できるファイルは Chrome のダウンロードマネージャーを使い、アダプティブ配信はメモリ予算の範囲内で結合します。'
          },
          {
            dimension: 'ログイン',
            web: '不要です。',
            extension: '不要です。ログインは任意で、毎日の無料枠とサブスクリプションの状態にのみ影響します。'
          },
          {
            dimension: '料金',
            web: '無料です。',
            extension: '毎日の無料枠があり、さらに必要な場合は有料の Unlimited プランがあります。'
          }
        ]
      },
      scope: {
        heading: '対応範囲とできないこと',
        worksFor: {
          heading: '対応していること',
          items: [
            'vimeo.com、www.vimeo.com、player.vimeo.com の対応するトップレベル動画ページ。再生できても、ダウンロード可能なリソースがあるとは限りません',
            '既定のストリームではなく、特定の画質や音声トラックを選ぶこと',
            'カバー画像の保存',
            '同じページの複数の項目をキューに追加すること'
          ]
        },
        doesNot: {
          heading: 'できないこと',
          items: [
            'アクセス制御の回避：非公開、パスワード保護、有料の動画は、再生できても動作を保証できません',
            'DRM の解除や回避',
            'すべての HLS 形式、ライブ配信の全録画、Vimeo 以外のサイトへの対応',
            'Vimeo のデスクトップアプリやモバイルアプリでの動作'
          ]
        },
        compliance: {
          heading: '法的事項とコンプライアンス',
          items: [
            '独立した第三者のツールであり、Vimeo, Inc. とは提携・承認・関係がありません。Vimeo は Vimeo, Inc. の商標です。',
            'すでに正当にアクセスできるコンテンツの保存を目的としています。著作権法、Vimeo および原著作者の利用規約の遵守はご自身の責任です。',
            '著作物の再配布や、権利のないコンテンツのアクセス制御の回避には使用しないでください。'
          ]
        }
      },
      plans: {
        heading: 'プラン',
        free: {
          name: 'Free',
          description: '毎日の無料ダウンロード枠があります。新しいアカウントやデバイスは初日が無制限です。',
          cta: 'プランを見る'
        },
        unlimited: {
          name: 'Unlimited',
          description: '拡張機能の 毎日の上限を解除する有料サブスクリプションです。',
          cta: 'Unlimited を購入'
        }
      },
      faq: {
        heading: 'よくある質問',
        items: [
          {
            question: 'ダウンロードにアカウントは必要ですか？',
            answer: 'いいえ。オンラインツールはログイン不要で、拡張機能も同様です。拡張機能でのログインは任意で、毎日の無料枠とサブスクリプションの状態にのみ影響します。'
          },
          {
            question: '無料ですか？',
            answer: 'オンラインツールは無料です。拡張機能には 毎日の無料枠があり、有料の Unlimited プランもあります。最新の内容は料金ページをご確認ください。'
          },
          {
            question: 'オンラインツールと拡張機能のどちらを使えばよいですか？',
            answer: 'リンクからすぐ MP4 を保存したいならオンラインツール、音声・字幕・カバー画像、画質の指定、複数項目のキューが必要なら拡張機能をお使いください。'
          },
          {
            question: '非公開、パスワード保護、有料の Vimeo 動画もダウンロードできますか？',
            answer: '動作は保証できません。どちらのツールも Vimeo のアクセス制御を解除・回避せず、DRM も解除しません。'
          },
          {
            question: 'どんな形式で保存されますか？',
            answer: 'オンラインツールは MP4 動画を保存します。拡張機能は MP4 動画、M4A または MP3 の音声、VTT の字幕、JPEG のカバー画像を保存します。'
          },
          {
            question: '非常に大きなファイルはどうなりますか？',
            answer: 'オンラインツールでは、非常に大きいファイルやサイズ不明のファイルは拡張機能の利用を案内します。拡張機能ではアダプティブ配信をメモリ予算の範囲内で結合するため、超過が分かっている項目は提供されません。'
          },
          {
            question: '動画は開発者のサーバーを経由しますか？',
            answer: 'メディア自体は Vimeo のサーバーからブラウザとディスクに直接届きます。拡張機能は、アカウント機能、ダウンロード枠、サブスクリプション、リモート設定、利用状況・エラーの報告のために、開発者のサービスにも接続します。'
          },
          {
            question: '対応しているブラウザとサイトは？',
            answer: '拡張機能は Chrome のほか Edge や Brave などの Chromium ベースのブラウザで、Vimeo のページでのみ動作します。他の動画サイトには対応していません。'
          }
        ]
      },
      finalCta: {
        heading: '拡張機能で Vimeo からもっと保存',
        description: '一度インストールすれば、視聴中の Vimeo ページからそのままダウンロードできます。',
        primaryCta: 'Chrome に追加'
      }
    },
    pricing: jaJPPricingContent,
  }
}
