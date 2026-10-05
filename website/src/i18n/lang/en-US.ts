import type { SiteContent } from '../schema'
import { pricingContent } from '../pricing'

export const enUS: SiteContent = {
  site: {
    description: 'Paste a Vimeo link to save the video in your browser, free and without signing in. Need audio, subtitles, cover images, or a queue? Add the Chrome extension.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Home',
      pricing: 'Pricing',
    },
    footer: {
      resources: 'Resources',
      rights: '© 2026 Vimeo Video Downloader. All rights reserved.'
    }
  },
  common: {
    installCta: 'Install Now'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Video Downloader – Free Online Tool and Chrome Extension',
        description: 'Paste a Vimeo link to save the video in your browser, free and without signing in. Need audio, subtitles, cover images, or a queue? Add the Chrome extension.'
      },
      heroTrustPoints: [
        'HD downloads',
        'No registration',
        'Mobile friendly',
        'Works on Windows, Mac, Android, and iPhone'
      ],
      workspace: {
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
          rateLimitExceeded: 'Too many requests. Please try again later.',
          useExtensionForResource: 'This resource can only be downloaded with the browser extension. Install it to continue.'
        },
        anonymousQueue: {
          title: 'Download queued',
          remaining: 'Your download starts in {seconds} seconds.',
          close: 'Close dialog'
        },
        downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        },
      }
    ,
      softwareApplication: {
        description: 'A Chrome extension for Vimeo viewers who want a local copy of the video they are already watching, with an in-page panel for video, audio, subtitle and cover image downloads.',
        featureList: [
          'In-page download panel with Video, Audio, Subtitle and Image rows',
          'Choose a video quality or pick Best',
          'Save audio as M4A or transcode to MP3',
          'Save subtitles as VTT and clip adaptive video or audio',
          'Save the cover image as JPEG',
          'Popup resource list with live progress and speed',
          'Global download queue shared across tabs',
          'Local history, filename template and save subfolder settings'
        ]
      },
      intro: {
        heading: 'Go further with the Chrome extension',
        lead: 'The online tool above saves a Vimeo video from a link. The extension works on the Vimeo page you are already watching and adds audio, subtitles, cover images and a download queue.',
        primaryCta: 'Add to Chrome',
        secondaryCta: 'See plans',
        panel: {
          ariaLabel: 'Illustration of the in-page download panel',
          rows: {
            video: 'Video',
            audio: 'Audio',
            subtitle: 'Subtitle',
            image: 'Image'
          }
        }
      },
      features: {
        heading: 'What the extension adds',
        items: [
          {
            title: 'In-page download panel',
            description: 'A small panel next to the video with Video, Audio, Subtitle and Image rows. It rebuilds itself when you move to another video.'
          },
          {
            title: 'Quality selection and Best',
            description: 'Pick 720p, 1080p or another quality the video exposes, or let Best choose the highest one.'
          },
          {
            title: 'Audio as M4A or MP3',
            description: 'Save the audio track on its own as M4A, or choose MP3 in the popup for transcoded output.'
          },
          {
            title: 'Subtitles and clipping',
            description: 'Save available subtitles as VTT. Adaptive video and audio can be clipped without video transcoding.'
          },
          {
            title: 'Cover image',
            description: 'Save the video\'s cover image as a separate JPEG file.'
          },
          {
            title: 'Popup list and queue',
            description: 'See every resolved item in the popup with live progress, then queue items to download one after another across tabs.'
          },
          {
            title: 'Large files',
            description: 'Files Chrome can fetch itself go to Chrome\'s download manager. Adaptive streams are assembled in the background within a memory budget.'
          },
          {
            title: 'Settings and history',
            description: 'Choose a save subfolder, a filename template and the interface language. Completed and failed downloads stay in local history that you can export as CSV.'
          }
        ]
      },
      steps: {
        heading: 'How the extension works',
        items: [
          {
            title: 'Install',
            description: 'Add the extension from the Chrome Web Store.'
          },
          {
            title: 'Pin the icon',
            description: 'Pin it to your toolbar for quick access to the popup.'
          },
          {
            title: 'Open a Vimeo video',
            description: 'Go to a supported video page on vimeo.com or player.vimeo.com and start playing.'
          },
          {
            title: 'Choose a quality',
            description: 'Click the quality you want in the panel, or open the extension icon for the full list. Your browser writes the file to disk.'
          }
        ]
      },
      comparison: {
        heading: 'Online tool or extension',
        columns: {
          dimension: 'Compare',
          web: 'Online tool',
          extension: 'Chrome extension'
        },
        rows: [
          {
            dimension: 'Where it runs',
            web: 'In any browser tab on this page: paste a Vimeo link.',
            extension: 'Inside Chrome and other Chromium browsers, on the Vimeo page you are watching.'
          },
          {
            dimension: 'What you can save',
            web: 'The video as an MP4 file.',
            extension: 'Video as MP4, audio as M4A or MP3, subtitles as VTT, and the cover image as JPEG.'
          },
          {
            dimension: 'Batch and queue',
            web: 'Paste several links and run them one at a time with Download all.',
            extension: 'Add items from the popup to one queue shared across tabs; they download in order.'
          },
          {
            dimension: 'Large files',
            web: 'Very large files, or files of unknown size, are redirected to the extension.',
            extension: 'Direct files use Chrome\'s download manager; adaptive streams are assembled within a memory budget.'
          },
          {
            dimension: 'Sign-in',
            web: 'Not required.',
            extension: 'Not required. Signing in is optional and only affects your daily allowance and subscription status.'
          },
          {
            dimension: 'Cost',
            web: 'Free.',
            extension: 'A free daily allowance, with a paid Unlimited plan for more.'
          }
        ]
      },
      scope: {
        heading: 'What it works for, and what it does not do',
        worksFor: {
          heading: 'Works for',
          items: [
            'Supported top-level video pages on vimeo.com, www.vimeo.com and player.vimeo.com; playback alone does not guarantee a downloadable resource',
            'Choosing a specific quality or the audio track instead of the default stream',
            'Saving the cover image',
            'Queueing several items from the same page'
          ]
        },
        doesNot: {
          heading: 'Does not do',
          items: [
            'Bypass access controls: private, password-protected or paid videos are not guaranteed to work, even when you can play them',
            'Remove or bypass DRM',
            'Support every HLS format, full live capture, or sites other than Vimeo',
            'Work in the Vimeo desktop or mobile apps'
          ]
        },
        compliance: {
          heading: 'Legal and compliance',
          items: [
            'Independent third-party tool, not affiliated with, endorsed by, or connected to Vimeo, Inc. Vimeo is a trademark of Vimeo, Inc.',
            'Meant for content you already have legitimate access to. You are responsible for copyright law and the terms of Vimeo and the original author.',
            'Do not use it to redistribute copyrighted material or to circumvent access controls you are not entitled to.'
          ]
        }
      },
      plans: {
        heading: 'Plans',
        free: {
          name: 'Free',
          description: 'A free daily download allowance. A new account or device starts with an unlimited first day.',
          cta: 'View plans'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'A paid subscription that lifts the daily limit for the extension.',
          cta: 'Get Unlimited'
        }
      },
      faq: {
        heading: 'Frequently asked questions',
        items: [
          {
            question: 'Do I need an account to download?',
            answer: 'No. The online tool needs no sign-in, and neither does the extension. Signing in to the extension is optional and only affects your daily allowance and subscription status.'
          },
          {
            question: 'Is it free?',
            answer: 'The online tool is free. The extension has a free daily allowance, and a paid Unlimited plan is available. See the Pricing page for the current details.'
          },
          {
            question: 'Which should I use, the online tool or the extension?',
            answer: 'Use the online tool for a quick MP4 from a link. Use the extension when you want audio, subtitles, the cover image, a chosen quality, or a queue of several items.'
          },
          {
            question: 'Can it download private, password-protected or paid Vimeo videos?',
            answer: 'Support is not guaranteed. Neither tool unlocks or bypasses Vimeo\'s access controls, and neither removes DRM.'
          },
          {
            question: 'Which formats do I get?',
            answer: 'The online tool saves MP4 video. The extension saves MP4 video, M4A or MP3 audio, VTT subtitles and JPEG cover images.'
          },
          {
            question: 'What happens with very large files?',
            answer: 'The online tool points very large or unknown-size files to the extension. In the extension, adaptive streams are assembled within a memory budget, so known oversized items are not offered.'
          },
          {
            question: 'Does my video pass through your servers?',
            answer: 'The media itself goes from Vimeo\'s servers to your browser and disk. The extension also contacts developer services for account features, download allowances, subscriptions, remote settings and usage or error reporting.'
          },
          {
            question: 'Which browsers and sites are supported?',
            answer: 'The extension runs on Chrome and other Chromium browsers such as Edge and Brave, and only on Vimeo pages. Other video sites are not supported.'
          }
        ]
      },
      finalCta: {
        heading: 'Save more from Vimeo with the extension',
        description: 'Install it once and download from the Vimeo page you are already watching.',
        primaryCta: 'Add to Chrome'
      }
    },
    pricing: pricingContent,
  }
}
