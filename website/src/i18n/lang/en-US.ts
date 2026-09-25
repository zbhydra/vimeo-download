import type { SiteContent } from '../schema'
import { pricingContent } from '../pricing'

export const enUS: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Download Vimeo Videos in HD',
    description:
      'Paste a public Vimeo link and save the video in the resolution you need. No app, no account, and no browser extension required for a normal download.',
    keywords:
      'vimeo video downloader, download vimeo video, vimeo download hd, save vimeo video, vimeo to mp4, online vimeo downloader'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Home',
      pricing: 'Pricing',
      solutions: 'Download Guide',
      changelog: 'Changelog'
    },
    footer: {
      resources: 'Resources',
      rights: '© 2026 Vimeo Video Downloader. All rights reserved.'
    }
  },
  common: {
    installCta: 'Install Now'
  },
  sections: {
    features: {
      title: 'Vimeo Download Features',
      subtitle:
        'Everything the downloader does for a public Vimeo link: parse the page, list the renditions Vimeo exposes, and save the one you pick.',
      metaDescription:
        'Vimeo Video Downloader features: HD downloads, resolution selection, MP4 output, no account required, and a clear boundary for private or password-protected videos.',
      items: [
        {
          title: 'Resolution Selection',
          description:
            'Pick the rendition you need instead of settling for the smallest file Vimeo offers',
          details: [
            'Choose from the resolutions the video exposes',
            'Download the highest available quality for offline viewing',
            'Keep the original aspect ratio and audio track',
            'MP4 output that plays on any device or player'
          ]
        },
        {
          title: 'Link-Based Parsing',
          description:
            'Paste a Vimeo video page URL and the downloader reads the available renditions',
          details: [
            'Works with vimeo.com, www.vimeo.com, and player.vimeo.com links',
            'No account or Vimeo login required',
            'Clear message when the video is private or cannot be parsed',
            'Nothing to install for a standard download'
          ]
        },
        {
          title: 'Large File Support',
          description:
            'Longer Vimeo videos stay downloadable with progress tracking and a browser extension path when the file is very large',
          details: [
            'Progress is visible while the file is downloading',
            'Interrupted downloads can be resumed from the workspace',
            'The browser extension handles files the browser alone cannot finish',
            'Storage is checked before a large download starts'
          ]
        },
        {
          title: 'Any Device',
          description:
            'Use the same page from a phone, tablet, or computer — the download starts in the browser',
          details: [
            'Works on Windows, macOS, Android, iPhone, and tablets',
            'No desktop application required',
            'Responsive layout for smaller screens',
            'The saved file lands in your usual downloads folder'
          ]
        },
        {
          title: 'Clear Access Boundary',
          description:
            'Private, password-protected, or paywalled Vimeo videos are out of scope and reported as such',
          details: [
            'No attempt to bypass privacy or access restrictions',
            'No Vimeo password, verification code, or session file is ever requested',
            'Only public video pages can be parsed',
            'You stay responsible for having the right to save the video'
          ]
        },
        {
          title: 'Fast, No-Registration Flow',
          description:
            'Copy, paste, choose, download — with an optional account only for downloads that need Credits',
          details: [
            'No sign-up needed to try a public link',
            'Sign in with Google or an email code only when Credits are required',
            'Credits never expire',
            'Clear error messages when a link cannot be processed'
          ]
        }
      ]
    },
    steps: {
      title: 'How to Save a Vimeo Video',
      subtitle:
        'The whole flow is three steps: copy the Vimeo video page URL, paste it above, then pick a resolution and download.',
      metaDescription:
        'Step-by-step guide to saving a Vimeo video: copy the video page URL, paste it into Vimeo Video Downloader, choose a resolution, and download the MP4.',
      items: [
        {
          title: 'Copy the Vimeo link',
          description:
            'Open the video on vimeo.com and copy the URL from the address bar or the share menu'
        },
        {
          title: 'Paste it above',
          description:
            'Drop the link into the input field and start the parse — the downloader lists what Vimeo exposes'
        },
        {
          title: 'Choose a resolution',
          description:
            'Pick the quality you want from the available renditions'
        },
        {
          title: 'Download the MP4',
          description:
            'Save the file to your device; larger files may need the browser extension'
        }
      ]
    },
    cta: {
      title: 'Ready to Download a Vimeo Video?',
      description: 'Paste a public Vimeo link above and save it in the resolution you need.'
    },
    techSpecs: {
      title: 'Technical Specifications',
      browsersLabel: 'Browsers',
      browsers: 'Chrome, Edge, Brave, and all Chromium-based browsers',
      sourceHostsLabel: 'Supported Links',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Permissions',
      permissions: 'Minimal permissions required',
      updatesLabel: 'Updates',
      updates: 'Automatic updates from extension store'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Download Vimeo videos in the resolution you need',
        description:
          'Paste a public Vimeo link, pick a rendition, and save the MP4 straight from the browser.'
      },
      stats: {
        users: 'Users Worldwide',
        downloads: 'Total Downloads'
      },
      seo: {
        title: 'Vimeo Video Downloader: Download Vimeo Videos in HD',
        description:
          'Save public Vimeo videos in HD and pick the resolution you need. Paste the link, parse the renditions, and download the MP4 without installing anything.',
        keywords:
          'vimeo video downloader, download vimeo video, vimeo downloader hd, save vimeo video, vimeo video download online, vimeo to mp4'
      },
      heroTrustPoints: [
        'HD downloads',
        'No registration',
        'Mobile friendly',
        'Works on Windows, Mac, Android, and iPhone'
      ],
      situation: {
        title: 'Start Here: Which Vimeo Link Do You Have?',
        intro:
          'Most people looking for a Vimeo downloader are holding one of these links. Find yours:',
        headers: ['Your situation', 'Try this first'],
        rows: [
          {
            cells: [
              'You have the URL of a public Vimeo video page',
              'Paste it into the downloader above and pick a resolution'
            ]
          },
          {
            cells: [
              'The video page has no download button',
              'Use this downloader — Vimeo only shows its own button when the owner allows it'
            ]
          },
          {
            cells: [
              'The video is private or password protected',
              'You need access from the owner; a downloader cannot open it for you'
            ]
          },
          {
            cells: [
              'The downloader says the video is private or cannot be parsed',
              'Check that the link is a direct video page URL and the video is public'
            ]
          }
        ]
      },
      solutions: {
        title: 'What Actually Works for a Vimeo Video?',
        intro:
          'Vimeo hosts videos with very different access rules. A public video page can be parsed by a downloader; a private, password-protected, or paywalled video cannot be reached from the outside, no matter which tool you use.',
        quickAnswer:
          'Quick answer: if the Vimeo page is public, paste the link above and download the rendition you need. If Vimeo shows its own download button, that is the cleanest path. If the video is private or password protected, ask the owner for access or an export — no downloader can bypass that.',
        items: [
          {
            title: 'Solution 1: Online Vimeo Downloader',
            description:
              'Best for a public Vimeo video page. Paste the URL, let the downloader list the renditions Vimeo exposes, then save the one you want.',
            useWhenLabel: 'Use this method when:',
            useWhen: [
              'The video page is public and opens without a login.',
              'You want a specific resolution or the highest available quality.',
              'You do not want to install a browser extension or desktop app.'
            ]
          },
          {
            title: "Solution 2: Vimeo's Own Download Button",
            description:
              'Some creators allow downloads on their videos. When that option is enabled, the Vimeo player shows a download button and it is the most direct route.',
            useWhenLabel: 'Use this method when:',
            useWhen: [
              'The Vimeo player shows a download option.',
              'You want exactly the file the creator published.',
              'You already have permission to keep a copy.'
            ]
          },
          {
            title: 'Solution 3: Browser Extension for Large Files',
            description:
              'Long videos can exceed what a browser tab can comfortably stream and store in one go. The extension takes over the transfer and keeps it resumable.',
            useWhenLabel: 'Use this method when:',
            useWhen: [
              'The download is very large or keeps getting interrupted.',
              'The workspace tells you the browser ran out of local storage.',
              'You download from Vimeo regularly.'
            ]
          },
          {
            title: 'Solution 4: Screen Recording (last resort)',
            description:
              'If a video plays for you but cannot be downloaded from any legal route, a screen recorder can capture it. It is a fallback, not the first method, because quality and audio depend on playback.',
            useWhenLabel: 'Use this method when:',
            useWhen: [
              'You have permission to view and keep the video.',
              'The video cannot be parsed from its link.',
              'You need a personal offline copy for reference only.'
            ]
          }
        ]
      },
      benefits: {
        title: 'Why Use an Online Vimeo Downloader?',
        intro:
          'A good downloader answers one question quickly: can this Vimeo video be saved from the link I have? The experience should be direct, honest about limits, and clear when a private video cannot be processed.',
        items: [
          {
            title: 'Save Videos in High Quality',
            description:
              'Keep the highest rendition Vimeo exposes so the offline copy still looks the way the creator published it.'
          },
          {
            title: 'Works Across Devices',
            description:
              'Use the downloader from a browser on Android, iPhone, Windows, Mac, or tablet — the file is saved by the browser you already have.'
          },
          {
            title: 'No Vimeo Login Required',
            description:
              'A public video page needs no Vimeo account. No password, verification code, or session file is ever requested.'
          },
          {
            title: 'Easy Offline Playback',
            description:
              'Downloads come out as MP4, which plays on virtually every device and player without extra codecs.'
          },
          {
            title: 'Fast Link-Based Process',
            description:
              'Copy, paste, choose, download. If the link fails, the page explains whether the video is private, unavailable, or unsupported.'
          },
          {
            title: 'Clear Permission Boundary',
            description:
              'Download only videos you have the right to keep. Respect creator rights, Vimeo’s terms, and any access rules attached to the video.'
          },
          {
            title: 'Resolution Control',
            description:
              'Choose between the renditions the video exposes instead of being locked to a single quality level.'
          },
          {
            title: 'Large File Handling',
            description:
              'Longer videos are checked for browser storage before they start, and can continue through the browser extension when they are too large for a tab.'
          },
          {
            title: 'Predictable Pricing',
            description:
              'Parse a public link without an account. Credits are only needed for downloads that go through the workspace, and they never expire.'
          }
        ]
      },
      troubleshooting: {
        title: 'If the Vimeo Link Does Not Work',
        intro:
          'Not every failure means the downloader is broken. Vimeo videos often fail because the page is not public. Try this checklist:',
        items: [
          'Open the link in a browser and confirm the video plays without logging in.',
          'Make sure the URL is a video page, not a profile, showcase, or search page.',
          'Check whether the video is password protected or marked private.',
          'Confirm the video still exists — deleted videos cannot be parsed.',
          'Try a different browser or network if the page cannot reach Vimeo.',
          'Avoid any tool that asks for your Vimeo or Google password.'
        ]
      },
      permission: {
        title: 'Important Permission Note',
        note:
          'A Vimeo video downloader should not be used to bypass privacy, copyright, or access restrictions. Save videos only when you have permission from the rights holder or when your use is allowed by law and Vimeo’s terms.'
      },
      comparison: {
        title: 'Choose the Right Vimeo Download Method',
        headers: ['Situation', 'Recommended Solution', 'Best For', 'What to Check'],
        rows: [
          {
            cells: [
              'Public Vimeo video page',
              'Online Vimeo downloader',
              'Fast HD download without an app',
              'The page opens without a login and the video is public'
            ]
          },
          {
            cells: [
              'Creator enabled downloads',
              "Vimeo's own download button",
              'Getting exactly the published file',
              'The player shows a download option'
            ]
          },
          {
            cells: [
              'Very large or interrupted download',
              'Browser extension',
              'Resumable transfers beyond a tab’s limits',
              'Available local storage and network stability'
            ]
          },
          {
            cells: [
              'Private or password-protected video',
              'Ask the owner for access or an export',
              'Staying inside Vimeo’s access rules',
              'No downloader can reach a video you cannot access'
            ]
          }
        ]
      },
      howTo: {
        title: 'How to Download a Vimeo Video in 3 Steps',
        subtitle:
          'The fastest route is the link-based downloader above. It works when the Vimeo video page is public and reachable from your browser.',
        steps: [
          {
            title: 'Copy the Video Link',
            description:
              'Open the video on Vimeo and copy the page URL from the address bar or the share menu.'
          },
          {
            title: 'Paste and Parse',
            description:
              'Paste the link into the downloader above. The tool checks which renditions Vimeo exposes for that video.'
          },
          {
            title: 'Choose Quality and Download',
            description:
              'Pick a resolution, then save the MP4 to your device. If nothing appears, the video is probably private or unavailable rather than broken.'
          }
        ]
      },
      faq: {
        title: 'Frequently Asked Questions',
        description: 'The questions people ask before downloading a Vimeo video.',
        items: [
          {
            question: 'How do I download a Vimeo video?',
            answer:
              'Open the video page on Vimeo, copy its URL, paste it into the downloader above, choose one of the available resolutions, and download the MP4.'
          },
          {
            question: 'Can I download private or password-protected Vimeo videos?',
            answer:
              'No. Private, password-protected, and paywalled videos are not reachable from outside your Vimeo session, so the downloader cannot parse them. Ask the owner for access or for an export of the file.'
          },
          {
            question: 'Why does the downloader say the Vimeo video is private?',
            answer:
              'Vimeo returned no public renditions for that link. The usual causes are privacy settings, a password requirement, a deleted video, or a URL that points to a profile or showcase page instead of a video page.'
          },
          {
            question: 'Do I need a Vimeo account or the extension?',
            answer:
              'No account and no extension are needed for a standard public download. The browser extension is only useful for very large files or when you want the transfer to continue outside the tab.'
          },
          {
            question: 'What format and quality do I get?',
            answer:
              'Downloads are MP4 files built from the renditions Vimeo exposes for the video. You can choose among the available resolutions, and the highest one is usually the quality the creator uploaded.'
          },
          {
            question: 'Is it free?',
            answer:
              'Parsing a public Vimeo link is free. Downloads that run through the workspace use Credits, which are one-time purchases and never expire; the extension has a separate Unlimited subscription.'
          },
          {
            question: 'Is it safe to paste a Vimeo link here?',
            answer:
              'Yes. Only the link you paste is used to look up the video. The downloader never asks for a Vimeo password, verification code, or session file, and you should leave any page that does.'
          },
          {
            question: 'Is it legal to download Vimeo videos?',
            answer:
              'It depends on the video, your permission, and your intended use. Download only content you are allowed to keep, and do not redistribute copyrighted or private material without authorization.'
          }
        ]
      },
      workspace: {
        auth: {
          eyebrow: 'Website Access',
          title: 'Sign in to sync your Credits',
          trigger: 'Sign in',
          modalTitle: 'Sign in to continue',
          closeLabel: 'Close',
          signedInAs: 'Signed in as',
          continueWithGoogle: 'Continue with Google',
          googleLoading: 'Opening Google...',
          or: 'or',
          emailLabel: 'Email',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Continue with email',
          sendCode: 'Send code',
          sendingCode: 'Sending...',
          sendCodeSuccess: 'Verification code sent.',
          sendAgain: 'Send again',
          codeLabel: 'Verification code',
          codePlaceholder: '123456',
          signIn: 'Sign in',
          termsNotice: 'By signing in, you agree to the',
          termsLink: 'Terms',
          privacyLink: 'Privacy Policy',
          logout: 'Log out',
          creditsLabel: 'Credits'
        },
        quota: {
          eyebrow: 'Credits',
          title: 'Current Credits balance',
          planLabel: 'Plan',
          remainingLabel: 'Remaining',
          dailyLimitLabel: 'Daily limit',
          unlimited: 'Unlimited'
        },
        checkin: {
          creditsLoading: 'Credits',
          creditsButtonLabel: 'Open daily check-in',
          accountButtonLabel: 'Open account menu',
          accountMenuLabel: 'Account menu',
          title: 'Your Daily Free Credits Are Ready!',
          todayRewardText: "Today's reward: {credits} Credits",
          claimedRewardText: 'You claimed {credits} Credits today.',
          nextCountdown: 'Next claim in {time}',
          nextAt: '(Next refresh: {time} EST)',
          claimButton: 'Claim {credits} Credits',
          claimingButton: 'Claiming...',
          notNow: 'Not now',
          close: 'Close',
          loadFailed: 'Failed to load check-in status.',
          claimFailed: 'Failed to claim Credits.'
        },
        creditPurchase: {
          installGuide: 'You can also download with the browser extension.',
          installExtension: 'Install Extension',
          title: 'Get more Credits',
          description: 'Add Credits and continue downloading from this workspace.',
          successTitle: 'Credits added',
          successDescription: 'Your balance has been refreshed. Close this window and start the download again.',
          packageEyebrow: 'Pay as you go',
          cardNote: 'Use Credits for website downloads. Credits never expire.',
          creditsAmount: '{credits} Credits',
          buyNow: 'Buy Now',
          selectPackage: 'Select',
          paymentMethodLabel: 'Choose payment method',
          paymentTitle: 'Choose payment method',
          selectedPackageLabel: 'Selected package',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Continue to payment',
          backToProducts: 'Back',
          close: 'Close',
          agreementText: 'I agree to the purchase terms, Terms, and Privacy Policy.',
          loadingConfigs: 'Loading Credits packages...',
          loadFailed: 'Failed to load Credits packages. Please try again.',
          noConfigs: 'No Credits packages are available right now. Please try again later.',
          ready: 'Choose a Credits package. Prices are shown in USD.',
          creatingOrder: 'Creating order...',
          pendingPayment: 'Complete payment in the newly opened tab. We will check the result automatically.',
          pendingPaymentTitle: 'Waiting for payment',
          cancelPayment: 'Cancel payment',
          supportMailPrefix: 'Report an issue: ',
          success: 'Payment complete. Credits are available now.',
          failed: 'Payment is not complete. You can retry or close this window.',
          successCredits: '+{credits} Credits added',
          successBalance: 'Current balance: {balance} Credits',
          createFailed: 'Failed to create order. Please try again.',
          invalidPaymentData: 'Payment link is invalid. Please try again later.',
          priceUpdated: 'Price changed. Review the latest price and buy again.',
          gatewayFailed: 'Payment entry is temporarily unavailable. Please try again later.',
          paymentCanceled: 'Payment was canceled. Choose a payment method and try again.',
          pollFailed: 'Failed to refresh payment status. Please try again.',
          pollTimeout: 'Automatic refresh timed out. Use the refresh button after payment.',
          orderNotFound: 'Order is no longer available. Create a new order.',
          orderExpired: 'Order expired. Please buy again.',
          fulfillmentFailed: 'Payment was received but Credits were not added yet. Please retry later.',
          authExpired: 'Sign-in expired. Sign in again to continue.'
        },
        parse: {
          eyebrow: 'Quick link check',
          title: 'Vimeo Video Downloader: Save Any Public Vimeo Video',
          helperText:
            'Paste a public Vimeo video link, review the renditions Vimeo exposes, and download the resolution you need.',
          linkLabel: 'Vimeo link',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Clear input',
          submit: 'Paste Vimeo Video Link',
          submitting: 'Parsing...',
          noResults: 'No downloadable files were found for this video.',
          download: 'Download',
          downloading: 'Downloading...',
          checkingStorage: 'Checking browser storage...',
          unknownSize: 'Unknown size',
          preparingMp4: 'Preparing MP4...',
          downloadAll: 'Download all',
          downloadingAll: 'Downloading all...',
          resumeNotice:
            'Detected an unfinished download "{filename}" ({progress}). Do you want to continue?',
          resumeAction: 'Continue',
          pendingRestartText: 'Previous download record for "{filename}" can be restarted.',
          pendingRestartButton: 'Restart download',
          resumeUnavailableText: 'The local recovery record has expired.',
          resumeDismiss: 'Ignore',
          resuming: 'Resuming...',
          largeFileExtensionInlineChromeTitle: 'Chrome Extension',
          largeFileExtensionInlineChromeDescription:
            'Dedicated extension for Chrome to keep large Vimeo downloads running outside the tab.',
          largeFileExtensionInlineChromeCta: 'Install Extension',
          largeFileExtensionInlineEdgeTitle: 'Edge Extension',
          largeFileExtensionInlineEdgeDescription:
            'Dedicated extension for Microsoft Edge, with the same large-download handling for Vimeo videos.',
          largeFileExtensionInlineEdgeCta: 'Install Extension'
        },
        errors: {
          enterEmailFirst: 'Please enter your email address first.',
          enterEmailAndCode: 'Please enter both email and verification code.',
          sendCodeFailed: 'Failed to send verification code.',
          googleSignInFailed: 'Google sign-in failed.',
          googleClientMissing: 'Google sign-in is not configured.',
          restoreSessionFailed: 'Failed to restore session.',
          signInFailed: 'Failed to sign in.',
          logoutFailed: 'Failed to log out.',
          loadQuotaFailed: 'Failed to load Credits.',
          enterLink: 'Please enter a media link.',
          invalidLink: 'This is not a valid URL.',
          parseFailed: 'Failed to parse this link.',
          downloadFailed: 'Failed to download this file.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          browserStorageInsufficientUseExtension:
            'This browser does not have enough reliable local storage for this file ({file_size}). Available storage is about {available_space}. Install Vimeo Video Downloader and download with the browser extension instead.',
          browserStorageInsufficientConfirmTitle: 'Not enough browser storage',
          browserStorageInsufficientConfirmViewExtension: 'View extension download',
          browserStorageInsufficientConfirmCancel: 'Cancel',
          downloadNetworkInterrupted: 'Network connection interrupted. Click Continue to resume.',
          unsupportedDownloadMode: 'This download method is not supported yet. Please try again later.',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'This video exceeds the browser download size limit.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'This link platform is not supported.',
          vimeoParseFailed: 'This Vimeo video is private or cannot be parsed.',
          quotaExceeded: 'Not enough Credits to download this file.',
          rateLimitExceeded: 'Too many requests. Please try again later.'
        },
        anonymousQueue: {
          title: 'Download queued',
          remaining: 'Your download starts in {seconds} seconds.',
          hint: 'Log in to skip the wait.',
          login: 'Log in',
          close: 'Close dialog'
        },
        downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        },
      }
    },
    changelog: {
      title: 'Vimeo Downloader Changelog',
      description:
        'Track Vimeo download updates, parsing changes, larger file support, and release notes for Vimeo Video Downloader.',
      seoTitle: 'Vimeo Downloader Changelog | Vimeo Video Downloader',
      seoDescription:
        'Read the Vimeo Video Downloader changelog for parsing updates, resolution handling, larger file support, and release notes for each version.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Performance Boost',
          description: 'Major performance improvements for better user experience.',
          features: [
            'Parsing speed improved by 50%',
            'Optimized large file download stability',
            'Enhanced UI responsiveness'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Multi-language Support',
          description: 'Added support for 14 languages worldwide.',
          features: [
            'Added Japanese, Korean, and more languages',
            'Improved translation accuracy',
            'Added automatic language detection'
          ]
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Resolution Selection',
          description: 'Choose the Vimeo rendition you want before the download starts.',
          features: [
            'Pick any resolution the video exposes',
            'Keep the highest available quality',
            'Improved download queue management'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Security & Privacy',
          description: 'Security improvements and privacy enhancements.',
          features: [
            'Removed all analytics tracking from downloads',
            'Added local-only processing mode',
            'Improved data encryption'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Initial Release',
          description: 'First release of the Vimeo link downloader.',
          features: [
            'Vimeo link parsing and MP4 output',
            'Support for vimeo.com and player.vimeo.com links',
            'Basic resolution handling'
          ]
        }
      ],
      labels: {
        features: 'New Features',
        fixes: 'Bug Fixes'
      }
    },
    pricing: pricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Vimeo Video Downloader HD - Multiple Resolutions | Vimeo Video Downloader',
          description:
            'Download Vimeo videos in HD quality with multiple resolution options for free. No app needed. Save any public Vimeo video instantly.',
          keywords:
            'vimeo downloader, vimeo video download, download vimeo video hd, vimeo downloader free, save vimeo video, vimeo hd download'
        },
        workspace: {
          title: 'Vimeo Video Downloader HD',
          helperText:
            'Paste any public Vimeo video link to download it in HD quality with resolution selection.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Why Use Our Vimeo Downloader',
          subtitle: 'Save Vimeo videos in HD quality with your choice of resolution, completely free.',
          items: [
            {
              title: 'HD Original Quality',
              description:
                'Download Vimeo videos in their full HD resolution. Get the same crisp quality that the creator uploaded.'
            },
            {
              title: 'Multiple Resolutions',
              description:
                'Choose from available resolutions (360p, 720p, 1080p, and more). Pick the quality that fits your needs.'
            },
            {
              title: 'Fast & Free',
              description:
                'No app install, no account needed. Paste the Vimeo link, select your resolution, and download instantly.'
            }
          ]
        },
        howTo: {
          title: 'How to Download Vimeo Videos in HD',
          subtitle:
            'Three simple steps to save any public Vimeo video with your preferred resolution.',
          steps: [
            {
              title: 'Copy the Vimeo video link',
              description:
                'Open the Vimeo video page and copy the URL from your browser address bar.'
            },
            {
              title: 'Paste the link above',
              description:
                'Paste the copied Vimeo URL into the input field and click Parse.'
            },
            {
              title: 'Choose resolution and download',
              description:
                'Select your preferred video resolution and click Download to save the HD video.'
            }
          ]
        },
        faq: {
          title: 'Vimeo Downloader FAQ',
          items: [
            {
              question: 'How do I download a video from Vimeo?',
              answer:
                'Copy the Vimeo video page URL, paste it into the input field above, click Parse, then select your preferred resolution and download.'
            },
            {
              question: 'Can I choose the video resolution?',
              answer:
                'Yes. After parsing, you can choose from all available resolutions including 360p, 720p, 1080p, and higher when available.'
            },
            {
              question: 'Is this Vimeo downloader free?',
              answer:
                'Parsing a public Vimeo link is free, and no registration is needed. Downloads that run through the workspace use Credits.'
            },
            {
              question: 'Do I need a Vimeo account to download?',
              answer:
                'No account needed. You can download any public Vimeo video without logging in.'
            },
            {
              question: 'What video format are the downloads?',
              answer:
                'Vimeo videos are downloaded in MP4 format, which is compatible with virtually all devices and players.'
            }
          ]
        },
      },
    }
  }
}
