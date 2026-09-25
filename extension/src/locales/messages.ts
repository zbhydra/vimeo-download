/**
 * Extension 界面的 14 语言消息映射。
 *
 * Popup 的 vue-i18n 实例与非 Vue 场景的 I18nService 共用此映射，避免语言清单分叉。
 */

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/core/constants/i18n'
import deDE from './de-DE.json'
import enUS from './en-US.json'
import esES from './es-ES.json'
import frFR from './fr-FR.json'
import idID from './id-ID.json'
import itIT from './it-IT.json'
import jaJP from './ja-JP.json'
import koKR from './ko-KR.json'
import ptBR from './pt-BR.json'
import ruRU from './ru-RU.json'
import thTH from './th-TH.json'
import viVN from './vi-VN.json'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'

/** 每种支持语言对应一份扁平文案表。 */
type TranslationMap = Record<SupportedLanguage, Record<string, string>>

/** Extension 全部界面语言消息。 */
const TRANSLATIONS: TranslationMap = {
  [SUPPORTED_LANGUAGES.EN_US]: enUS,
  [SUPPORTED_LANGUAGES.ZH_CN]: zhCN,
  [SUPPORTED_LANGUAGES.ZH_TW]: zhTW,
  [SUPPORTED_LANGUAGES.JA_JP]: jaJP,
  [SUPPORTED_LANGUAGES.KO_KR]: koKR,
  [SUPPORTED_LANGUAGES.ES_ES]: esES,
  [SUPPORTED_LANGUAGES.PT_BR]: ptBR,
  [SUPPORTED_LANGUAGES.DE_DE]: deDE,
  [SUPPORTED_LANGUAGES.FR_FR]: frFR,
  [SUPPORTED_LANGUAGES.RU_RU]: ruRU,
  [SUPPORTED_LANGUAGES.IT_IT]: itIT,
  [SUPPORTED_LANGUAGES.VI_VN]: viVN,
  [SUPPORTED_LANGUAGES.TH_TH]: thTH,
  [SUPPORTED_LANGUAGES.ID_ID]: idID
}

export default TRANSLATIONS
