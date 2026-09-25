export const locales = [
  'zh-CN',
  'en-US',
  'ja-JP',
  'ko-KR',
  'zh-TW',
  'es-ES',
  'pt-BR',
  'de-DE',
  'fr-FR',
  'ru-RU',
  'it-IT',
  'vi-VN',
  'th-TH',
  'id-ID'
] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en-US'

export const localeNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'zh-TW': '繁體中文',
  'es-ES': 'Español',
  'pt-BR': 'Português',
  'de-DE': 'Deutsch',
  'fr-FR': 'Français',
  'ru-RU': 'Русский',
  'it-IT': 'Italiano',
  'vi-VN': 'Tiếng Việt',
  'th-TH': 'ไทย',
  'id-ID': 'Bahasa Indonesia'
}

export const localePaths: Record<Locale, string> = {
  'en-US': '',
  'zh-CN': 'zh-cn',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'zh-TW': 'zh-tw',
  'es-ES': 'es',
  'pt-BR': 'pt',
  'de-DE': 'de',
  'fr-FR': 'fr',
  'ru-RU': 'ru',
  'it-IT': 'it',
  'vi-VN': 'vi',
  'th-TH': 'th',
  'id-ID': 'id'
}

// Hreflang mapping for SEO alternate language links
export const hreflangMap: Record<Locale, string> = {
  'zh-CN': 'zh-cn',
  'zh-TW': 'zh-tw',
  'ja-JP': 'ja',
  'ko-KR': 'ko',
  'en-US': 'en',
  'es-ES': 'es',
  'pt-BR': 'pt-br',
  'de-DE': 'de',
  'fr-FR': 'fr',
  'ru-RU': 'ru',
  'it-IT': 'it',
  'vi-VN': 'vi',
  'th-TH': 'th',
  'id-ID': 'id'
}
