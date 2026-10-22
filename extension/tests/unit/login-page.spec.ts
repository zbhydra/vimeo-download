/** 插件登录入口、Google RPC 结果和成功去向；本项目 API 由真实后端 E2E 覆盖。 */
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackgroundStartGoogleLoginResponse } from '@/background/types'
import { openLoginPage } from '@/core/composables/loginPage'
import { STORAGE_KEYS } from '@/core/api/config'
import { buildExtensionLoginUrl, parseLoginPageParams } from '@/core/utils/loginUrl'
import LoginApp from '@/login/LoginApp.vue'
import LoginPanel from '@/login/LoginPanel.vue'
import TRANSLATIONS from '@/locales/messages'

const mocks = vi.hoisted(() => ({
  recordMark: vi.fn(() => Promise.resolve({ recorded: true })),
  startGoogleLogin: vi.fn<() => Promise<BackgroundStartGoogleLoginResponse>>()
}))

vi.mock('@/content/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    recordMark = mocks.recordMark
  }
}))

vi.mock('@/popup/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    startGoogleLogin = mocks.startGoogleLogin
  }
}))

/** 各登录页面使用独立 i18n 实例，避免挂载间共享状态。 */
function createPlugins() {
  return [createI18n({ legacy: false, locale: 'en-US', messages: TRANSLATIONS })]
}

beforeEach(() => {
  vi.clearAllMocks()
  window.location.href = 'http://localhost/src/popup.html'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('插件登录页 URL 与入口', () => {
  it('URL 只携带登录来源，非法来源回退到顶栏登录', () => {
    const url = new URL(buildExtensionLoginUrl('popup_upgrade_now'))
    expect(url.pathname).toBe('/ext-login.html')
    expect(parseLoginPageParams(url.search)).toEqual({ source: 'popup_upgrade_now' })
    expect([...url.searchParams.keys()]).toEqual(['source'])
    expect(parseLoginPageParams('?source=evil')).toEqual({ source: 'popup' })
  })

  it('popup 记一次点击，再打开登录标签页', () => {
    openLoginPage('popup')
    expect(mocks.recordMark).toHaveBeenCalledOnce()
    expect(mocks.recordMark).toHaveBeenCalledWith({
      mark_type: 'login_click',
      mark_msg: JSON.stringify({ source: 'popup' })
    })
    expect(chrome.tabs.create).toHaveBeenCalledOnce()
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: buildExtensionLoginUrl('popup') })
    expect(mocks.recordMark.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(chrome.tabs.create).mock.invocationCallOrder[0]
    )
  })

  it('订阅页在当前标签页登录，不新增标签页', () => {
    window.location.href = 'http://localhost/ext-pricing.html'
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
    openLoginPage('upgrade_modal')
    expect(assign).toHaveBeenCalledWith(buildExtensionLoginUrl('upgrade_modal'))
    expect(chrome.tabs.create).not.toHaveBeenCalled()
    expect(mocks.recordMark).toHaveBeenCalledOnce()
  })
})

describe('登录页 Google 结果', () => {
  it('Google 按钮与邮箱表单同时可见', () => {
    const wrapper = mount(LoginPanel, {
      props: { source: 'popup' },
      global: { plugins: createPlugins() }
    })
    expect(wrapper.find('.login-google-button').exists()).toBe(true)
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('completed 只通知成功一次，不重复记录 background 的成功事件', async () => {
    mocks.startGoogleLogin.mockResolvedValue({ status: 'completed' })
    const wrapper = mount(LoginPanel, {
      props: { source: 'popup_upgrade_now' },
      global: { plugins: createPlugins() }
    })
    await wrapper.get('.login-google-button').trigger('click')
    await flushPromises()
    expect(mocks.startGoogleLogin).toHaveBeenCalledOnce()
    expect(mocks.startGoogleLogin).toHaveBeenCalledWith(
      { source: 'popup_upgrade_now' },
      { timeout: 660_000 }
    )
    expect(wrapper.emitted('success')).toHaveLength(1)
    expect(mocks.recordMark).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('email_verification 原地填邮箱并显示验证码，邮箱仍可编辑', async () => {
    mocks.startGoogleLogin.mockResolvedValue({
      status: 'email_verification',
      email: 'user@example.com'
    })
    const wrapper = mount(LoginPanel, {
      props: { source: 'popup' },
      global: { plugins: createPlugins() }
    })
    await wrapper.get('.login-google-button').trigger('click')
    await flushPromises()
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe(
      'user@example.com'
    )
    expect(wrapper.get('input[type="email"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(true)
    expect(wrapper.emitted('success')).toBeUndefined()
    expect(chrome.tabs.create).not.toHaveBeenCalled()
    expect(mocks.recordMark).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancelled 保留表单，成功事件为零且不重复记录取消', async () => {
    mocks.startGoogleLogin.mockResolvedValue({ status: 'cancelled', reason: 'user_closed_window' })
    const wrapper = mount(LoginPanel, {
      props: { source: 'popup' },
      global: { plugins: createPlugins() }
    })
    await wrapper.get('.login-google-button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('success')).toBeUndefined()
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.get('.login-google-button').attributes('disabled')).toBeUndefined()
    expect(mocks.recordMark).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('登录成功去向', () => {
  const stubs = {
    LoginPanel: {
      emits: ['success'],
      template: '<button @click="$emit(\'success\')">完成登录</button>'
    }
  }

  it('顶栏登录清理旧待购，保留品牌并显示成功提示', async () => {
    window.location.href = 'http://localhost/ext-login.html?source=popup'
    const wrapper = mount(LoginApp, { global: { plugins: createPlugins(), stubs } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(STORAGE_KEYS.PENDING_PREMIUM_PURCHASE)
    expect(wrapper.find('.login-page-success').exists()).toBe(true)
    expect(wrapper.find('.login-page-brand img').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['popup_upgrade_now', 'popup_quota_counter', 'upgrade_modal'])(
    '购买来源 %s 即使没有待购也替换为订阅页',
    async source => {
      window.location.href = `http://localhost/ext-login.html?source=${source}`
      const replace = vi.spyOn(window.location, 'replace').mockImplementation(() => {})
      const wrapper = mount(LoginApp, { global: { plugins: createPlugins(), stubs } })
      await wrapper.get('button').trigger('click')
      await flushPromises()
      const url = new URL(replace.mock.calls[0][0])
      expect(url.pathname).toBe('/ext-pricing.html')
      expect(url.searchParams.get('source')).toBe(source)
      expect(chrome.storage.local.remove).not.toHaveBeenCalled()
      wrapper.unmount()
    }
  )
})
