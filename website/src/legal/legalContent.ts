/**
 * Legal page copy for Vimeo Downloader website.
 *
 * Legal text is kept in one module so every locale route can render the same
 * reviewed fallback until each translation is explicitly approved.
 * A route that renders the fallback is not a translation: LegalPage.astro marks
 * it noindex and leaves it out of hreflang, so search engines only see one
 * version of the same English text.
 *
 * Inline markup inside the strings is limited to `**bold**` and
 * `[label](href)`; LegalPage.astro renders both.
 */
import { locales, type Locale } from '../i18n/ui'
import { DEVELOPER_EMAIL, OPERATOR_LEGAL_NAME, PRODUCT_NAME } from '../lib/site.mjs'

/** Legal page route identifiers. */
export type LegalPageKind = 'terms' | 'privacy'

/** One renderable block inside a legal section. */
export type LegalBlock =
  | {
      kind: 'paragraph'
      /** Paragraph text; may carry `**bold**` and `[label](href)` inline markup. */
      text: string
    }
  | {
      kind: 'list'
      /** Bullet items for obligations, examples, or user rights. */
      items: string[]
    }

/** One section in a legal document. */
export interface LegalSection {
  /** Visible H2 heading. */
  title: string
  /** Blocks rendered in the order they appear in the source document. */
  blocks: LegalBlock[]
}

/** Copy needed to render one legal page. */
export interface LegalPageContent {
  /** Footer and small-label text. */
  navLabel: string
  /** HTML title. */
  seoTitle: string
  /** Meta description. */
  seoDescription: string
  /** Page H1. */
  title: string
  /** Short summary below the H1; separate blocks by a blank line. */
  intro: string
  /**
   * Label shown before the date. Omitted when the effective date is still an
   * unconfirmed operator fact — LegalPage then renders no date line and no
   * `dateModified` in structured data rather than inventing one.
   */
  updatedLabel?: string
  /** Human-readable last-updated date. */
  updatedAt?: string
  /** ISO date used by semantic markup and structured data. */
  updatedAtIso?: string
  /** Document sections. */
  sections: LegalSection[]
}

/** Terms and privacy copy for one locale. */
interface LegalContent {
  /** Terms of Service page copy. */
  terms: LegalPageContent
  /** Privacy Policy page copy. */
  privacy: LegalPageContent
}

const termsLastUpdated = 'October 5, 2026'
const privacyLastUpdated = 'October 6, 2026'

const englishLegalContent: LegalContent = {
  terms: {
    navLabel: 'Terms',
    seoTitle: `Terms of Service | ${PRODUCT_NAME}`,
    seoDescription:
      'Read the Vimeo Downloader Terms of Service, including acceptable use, account access, free website downloads, subscriptions, disclaimers, and contact details.',
    title: 'Terms of Service',
    intro:
      'These terms explain how you may use Vimeo Downloader, including the website, browser extension, download tools, account features, and subscription-related workflows.',
    updatedLabel: 'Last updated',
    updatedAt: termsLastUpdated,
    updatedAtIso: '2026-10-05',
    sections: [
      {
        title: 'Acceptance',
        blocks: [
          {
            kind: 'paragraph',
            text: `These Terms are an agreement between you and ${OPERATOR_LEGAL_NAME}, the company that operates ${PRODUCT_NAME}. In these Terms, "we", "us", and "our" refer to ${OPERATOR_LEGAL_NAME}.`
          },
          {
            kind: 'paragraph',
            text: `By accessing or using ${PRODUCT_NAME}, you agree to these Terms. If you do not agree, do not use the service.`
          },
          {
            kind: 'paragraph',
            text: 'These Terms apply to the website, extension, download workflows, account features, support communications, and any related services we operate.'
          }
        ]
      },
      {
        title: 'What the service does',
        blocks: [
          {
            kind: 'paragraph',
            text: `${PRODUCT_NAME} helps users save public Vimeo videos that are already accessible to them in a supported browser. The service does not unlock private, password-protected, or paywalled Vimeo videos, does not recover content you cannot access, and does not grant rights to redistribute third-party content.`
          },
          {
            kind: 'paragraph',
            text: 'Some features may run locally in your browser extension, while website parsing, account, and subscription features may communicate with our backend services.'
          }
        ]
      },
      {
        title: 'Acceptable use',
        blocks: [
          {
            kind: 'paragraph',
            text: 'You are responsible for how you use downloaded or saved content. Use the service only for content you own, have permission to keep, or are otherwise legally allowed to use.'
          },
          {
            kind: 'list',
            items: [
              'Do not use the service to infringe copyright, privacy rights, publicity rights, or other rights of another person.',
              'Do not use the service to bypass membership, authentication, payment, technical access controls, or platform restrictions you are not allowed to bypass.',
              'Do not upload, distribute, sell, or repost content unless you have the necessary rights.',
              'Do not use the service for malware, phishing, spam, surveillance, scraping unrelated to the visible user-facing feature, or illegal activity.'
            ]
          }
        ]
      },
      {
        title: 'Accounts and access',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Some website features may require signing in with Google or email. You must provide accurate information and keep your account access secure.'
          },
          {
            kind: 'paragraph',
            text: 'We may limit, suspend, or terminate access if we believe the service is being abused, used illegally, or used in a way that creates risk for users, platforms, or our systems.'
          }
        ]
      },
      {
        title: 'Free website downloads and subscriptions',
        blocks: [
          {
            kind: 'paragraph',
            text: 'The website download tool on the home page is free to use. We may adjust or limit it as described in these Terms.'
          },
          {
            kind: 'paragraph',
            text: 'Paid or upgraded features, if available, may include quotas, limits, billing periods, or manual activation steps shown on the pricing page or in direct support messages. Paid subscriptions apply only to supported desktop browser extension download features.'
          },
          {
            kind: 'paragraph',
            text: 'Subscription payments are final and non-refundable. You may turn off auto-renewal at any time through the original payment provider or by contacting support before the next renewal. Once auto-renewal is turned off, no future renewal charge will be made, and your paid subscription remains available until the end of the current billing period.'
          }
        ]
      },
      {
        title: 'Third-party platforms',
        blocks: [
          {
            kind: 'paragraph',
            text: `${PRODUCT_NAME} is not affiliated with Vimeo, Google, or any other third-party platform unless explicitly stated.`
          },
          {
            kind: 'paragraph',
            text: 'Your use of third-party platforms remains subject to their own terms, policies, copyright rules, account rules, and technical limitations.'
          }
        ]
      },
      {
        title: 'No legal advice',
        blocks: [
          {
            kind: 'paragraph',
            text: 'The service and these Terms do not provide legal advice. Whether you may save, copy, or share specific content depends on permission, platform rules, copyright law, privacy law, and local law.'
          }
        ]
      },
      {
        title: 'Disclaimers',
        blocks: [
          {
            kind: 'paragraph',
            text: 'The service is provided on an "as is" and "as available" basis. We do not promise that every Vimeo link, video, browser version, or video with restricted access will work.'
          },
          {
            kind: 'paragraph',
            text: 'We may change, pause, remove, or limit features when needed for reliability, security, compliance, abuse prevention, or platform changes.'
          }
        ]
      },
      {
        title: 'Changes to these Terms',
        blocks: [
          {
            kind: 'paragraph',
            text: 'We may update these Terms as the product, law, or platform policies change. The updated date above shows when this page last changed.'
          },
          {
            kind: 'paragraph',
            text: 'Continuing to use the service after changes means you accept the updated Terms.'
          }
        ]
      },
      {
        title: 'Contact',
        blocks: [
          {
            kind: 'paragraph',
            text: `Questions about these Terms can be sent to ${DEVELOPER_EMAIL}.`
          }
        ]
      }
    ]
  },
  privacy: {
    navLabel: 'Privacy Policy',
    seoTitle: `Privacy Policy | ${PRODUCT_NAME}`,
    seoDescription:
      'Read the Vimeo Downloader Privacy Policy, including what data is collected, how Google sign-in data is used, analytics, storage, sharing, retention, and contact details.',
    title: 'Privacy Policy',
    intro: `This policy explains what information ${PRODUCT_NAME} collects, why we use it, how it is stored or shared, and what choices you have.

This policy covers the ${PRODUCT_NAME} website and browser extension, which are operated by ${OPERATOR_LEGAL_NAME}. In this policy, "we", "us", and "our" refer to ${OPERATOR_LEGAL_NAME}.`,
    updatedLabel: 'Last updated',
    updatedAt: privacyLastUpdated,
    updatedAtIso: '2026-10-06',
    sections: [
      {
        title: 'Information we process',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Depending on how you use the service, we may process account information, authentication information, submitted links, download request metadata, quota usage, subscription status, support messages, device identifiers, browser storage values, logs, and analytics events.'
          },
          {
            kind: 'paragraph',
            text: 'When you use the browser extension, media detection and download workflows are designed to run from the browser context needed for the user-facing feature. The extension should not ask for your Vimeo password or Vimeo API credentials.'
          }
        ]
      },
      {
        title: 'Google sign-in data',
        blocks: [
          {
            kind: 'paragraph',
            text: 'If you sign in with Google, we use the basic identity information Google provides, such as your email address and profile identity, to create or access your Vimeo Downloader account.'
          },
          {
            kind: 'paragraph',
            text: 'The use and transfer of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.'
          }
        ]
      },
      {
        title: 'How we use information',
        blocks: [
          {
            kind: 'paragraph',
            text: 'We use information to operate the service, authenticate users, enforce quotas, provide downloads and playback workflows, prevent abuse, improve reliability, answer support requests, maintain security, and comply with legal obligations.'
          },
          {
            kind: 'list',
            items: [
              'We do not sell personal information.',
              'We do not use user data for personalized advertising.',
              'We do not ask for Vimeo passwords or Vimeo API credentials.',
              'We use data only for disclosed service, security, analytics, support, and compliance purposes.'
            ]
          }
        ]
      },
      {
        title: 'Analytics',
        blocks: [
          {
            kind: 'paragraph',
            text: 'The website may use analytics tools, including Google Analytics, to understand page usage, navigation, interactions, conversion, and product reliability. Analytics data is not used to sell user data or build personalized advertising profiles for Vimeo Downloader.'
          }
        ]
      },
      {
        title: 'Storage and security',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Account tokens, device identifiers, quota state, and UI state may be stored in browser storage or on our backend systems when needed to keep the product working.'
          },
          {
            kind: 'paragraph',
            text: 'We use reasonable technical and organizational safeguards, including HTTPS for supported network communications. No system can be guaranteed to be completely secure.'
          }
        ]
      },
      {
        title: 'Sharing',
        blocks: [
          {
            kind: 'paragraph',
            text: 'We share information only when needed to operate or improve the service, provide infrastructure, process authentication, run analytics, respond to support, prevent abuse, comply with law, or complete a business transfer such as a merger or asset sale.'
          },
          {
            kind: 'paragraph',
            text: 'Third-party services may process data under their own terms and privacy policies.'
          }
        ]
      },
      {
        title: 'Retention',
        blocks: [
          {
            kind: 'paragraph',
            text: 'We keep information only as long as reasonably needed for the purposes described in this policy, including account operation, security, abuse prevention, legal obligations, accounting, and dispute resolution.'
          },
          {
            kind: 'paragraph',
            text: 'Local browser data may remain on your device until you clear it, uninstall the extension, sign out, or reset browser storage.'
          }
        ]
      },
      {
        title: 'Your choices',
        blocks: [
          {
            kind: 'paragraph',
            text: 'You can stop using the service, sign out, uninstall the extension, clear browser storage, or contact us about account or data requests.'
          },
          {
            kind: 'paragraph',
            text: `For privacy questions or account data requests, contact ${DEVELOPER_EMAIL}. We may need to verify your email address before acting on a request.`
          }
        ]
      },
      {
        title: 'Children',
        blocks: [
          {
            kind: 'paragraph',
            text: 'The service is not intended for children under the age required by applicable law to use online services without parental consent. Do not use the service if you are not old enough to agree to this policy.'
          }
        ]
      },
      {
        title: 'Changes to this policy',
        blocks: [
          {
            kind: 'paragraph',
            text: 'We may update this policy as the product, law, or platform policies change. The updated date above shows when this page last changed.'
          }
        ]
      }
    ]
  }
}

/** Reviewed legal copy, keyed by the locale it is written in. */
const legalContentByLocale: Partial<Record<Locale, LegalContent>> = {
  'en-US': englishLegalContent
}

/** Locales that have reviewed legal copy in their own language; only their legal routes are indexable. */
export const LEGAL_CONTENT_LOCALES: Locale[] = locales.filter(locale => legalContentByLocale[locale] !== undefined)

/** Returns the locale of the copy a legal route actually renders: its own, or the English fallback. */
export function getLegalContentLocale(locale: Locale): Locale {
  return legalContentByLocale[locale] ? locale : 'en-US'
}

/** Returns one reviewed legal page for the requested locale, falling back to English. */
export function getLegalPageContent(locale: Locale, pageKind: LegalPageKind): LegalPageContent {
  return (legalContentByLocale[locale] ?? englishLegalContent)[pageKind]
}
