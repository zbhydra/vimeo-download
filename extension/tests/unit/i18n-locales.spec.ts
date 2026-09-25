/**
 * extension 文案表契约：14 个 locale 的键集合与插值占位符必须与 en-US 完全一致。
 *
 * vue-i18n 缺键时静默回退 en-US，漏翻不会报错，只能靠测试挡住；这也是
 * `docs/feat/010.多语言/tech-extension与后端文案.md` §2.3「14 文件同步」的机器检查。
 */

import { describe, expect, it } from 'vitest'

import { SUPPORTED_LANGUAGES } from '@/core/constants/i18n'
import TRANSLATIONS from '@/locales/messages'

const REFERENCE_LOCALE = SUPPORTED_LANGUAGES.EN_US

/** 取文案里的 `{name}` 占位符，用于跨语言比对插值参数。 */
function placeholdersOf(message: string): string[] {
  return (message.match(/\{(\w+)\}/g) ?? []).map(token => token.slice(1, -1)).sort()
}

describe('extension 文案表', () => {
  const reference = TRANSLATIONS[REFERENCE_LOCALE]
  const referenceKeys = Object.keys(reference).sort()

  it('装配的语言与 SUPPORTED_LANGUAGES 一致', () => {
    expect(Object.keys(TRANSLATIONS).sort()).toEqual(
      [...Object.values(SUPPORTED_LANGUAGES)].sort()
    )
  })

  it('每种语言的键集合与 en-US 完全一致', () => {
    for (const [locale, messages] of Object.entries(TRANSLATIONS)) {
      expect({ locale, keys: Object.keys(messages).sort() }).toEqual({
        locale,
        keys: referenceKeys
      })
    }
  })

  it('没有空文案，插值占位符与 en-US 一致', () => {
    for (const [locale, messages] of Object.entries(TRANSLATIONS)) {
      for (const [key, message] of Object.entries(messages)) {
        expect({ locale, key, isEmpty: message.trim().length === 0 }).toEqual({
          locale,
          key,
          isEmpty: false
        })
        expect({ locale, key, placeholders: placeholdersOf(message) }).toEqual({
          locale,
          key,
          placeholders: placeholdersOf(reference[key])
        })
      }
    }
  })
})
