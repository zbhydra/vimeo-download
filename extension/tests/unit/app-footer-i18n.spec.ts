/**
 * Popup Footer 国际化作用域回归测试。
 *
 * Footer 使用全局 vue-i18n composer 渲染带链接的插值文案，挂载时不应查找不存在的父级作用域。
 */

import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WEBSITE } from '../../src/core/api/config'
import AppFooter from '../../src/popup/components/AppFooter.vue'

const SUPPORT_EMAIL = WEBSITE.SUPPORT_EMAIL

const mocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn()
}))

vi.mock('../../src/core/composables/useToast', () => ({
  useToast: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError
  })
}))

/** I18nT 回退到全局 composer 前输出的父级作用域警告。 */
const INTLIFY_PARENT_SCOPE_WARNING = '[intlify] Not found parent scope. use the global scope.'

/** 创建 Footer 所需的最小英语翻译表。 */
function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: {
      'en-US': {
        'app.supportContact': 'Questions? Contact {email}.',
        'app.copySupportEmail': 'Copy',
        'app.supportEmailCopied': 'Support email copied',
        'app.supportEmailCopyFailed': 'Could not copy the support email'
      }
    }
  })
}

/** 挂载 Footer。 */
function mountFooter() {
  return mount(AppFooter, {
    global: {
      plugins: [createTestI18n()],
      stubs: { Icon: true }
    }
  })
}

describe('AppFooter i18n scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the support contact through the global composer scope', () => {
    const wrapper = mountFooter()

    expect(wrapper.get('.support-text').text()).toBe(
      `Questions? Contact ${SUPPORT_EMAIL}.`
    )
    expect(wrapper.get('.support-link').attributes('href')).toBe(`mailto:${SUPPORT_EMAIL}`)
    expect(wrapper.findAll('.support-row')).toHaveLength(1)
    expect(console.warn).not.toHaveBeenCalledWith(INTLIFY_PARENT_SCOPE_WARNING)

    wrapper.unmount()
  })

  it('copies the support email and reports success', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mountFooter()

    await wrapper.get('.support-action-button').trigger('click')

    expect(writeText).toHaveBeenCalledWith(SUPPORT_EMAIL)
    expect(mocks.showSuccess).toHaveBeenCalledWith('Support email copied')
    expect(mocks.showError).not.toHaveBeenCalled()

    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('reports a visible error when the clipboard write fails', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('clipboard denied')))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mountFooter()

    await wrapper.get('.support-action-button').trigger('click')

    expect(mocks.showError).toHaveBeenCalledWith('Could not copy the support email')

    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
