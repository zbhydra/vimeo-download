import { defaultLocale, type Locale } from './ui'
import type { SiteContent } from './schema'
import { zhCN } from './lang/zh-CN'
import { enUS } from './lang/en-US'
import { jaJP } from './lang/ja-JP'
import { koKR } from './lang/ko-KR'
import { zhTW } from './lang/zh-TW'
import { esES } from './lang/es-ES'
import { ptBR } from './lang/pt-BR'
import { deDE } from './lang/de-DE'
import { frFR } from './lang/fr-FR'
import { ruRU } from './lang/ru-RU'
import { itIT } from './lang/it-IT'
import { viVN } from './lang/vi-VN'
import { thTH } from './lang/th-TH'
import { idID } from './lang/id-ID'

export type { Locale }
export type { SiteContent }

export const content: Record<Locale, SiteContent> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'zh-TW': zhTW,
  'es-ES': esES,
  'pt-BR': ptBR,
  'de-DE': deDE,
  'fr-FR': frFR,
  'ru-RU': ruRU,
  'it-IT': itIT,
  'vi-VN': viVN,
  'th-TH': thTH,
  'id-ID': idID
}

export function getContent(locale: Locale): SiteContent {
  return content[locale] ?? content[defaultLocale]
}
