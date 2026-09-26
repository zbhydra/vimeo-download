/**
 * Popup Header 登录入口回归测试。
 *
 * 登录改为插件内弹窗后，Header 只负责打开弹窗，不再发起任何 RPC 或跳转官网。
 */

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppHeader from '../../src/popup/components/AppHeader.vue'

const mocks = vi.hoisted(() => ({
  openLoginModal: vi.fn(),
  logout: vi.fn()
}))

vi.mock('../../src/core/composables/loginModal', () => ({
  openLoginModal: mocks.openLoginModal
}))

vi.mock('../../src/popup/rpc/background.rpc', () => ({
  BackgroundChannel: class {
    recordMark = vi.fn()
  }
}))

vi.mock('../../src/popup/stores/resourceStore', () => ({
  useResourceStore: () => ({
    loading: false,
    hasResources: false
  })
}))

vi.mock('../../src/core/stores/authStore', () => ({
  useAuthStore: () => ({
    logout: mocks.logout
  })
}))

vi.mock('../../src/core/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn()
  }
}))

const LoginButtonStub = defineComponent({
  emits: ['click', 'logout'],
  template: '<button class="login-stub" type="button" @click="$emit(\'click\')">Login</button>'
})

/** 挂载 Header 并返回 wrapper。 */
function mountHeader() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: {
      'en-US': {
        'app.title': 'Vimeo Video Downloader',
        'app.refresh': 'Refresh',
        'app.openOfficialWebsite': 'Open official website'
      }
    }
  })

  return mount(AppHeader, {
    global: {
      plugins: [i18n],
      stubs: {
        Icon: true,
        LanguageSwitcher: true,
        LoginButton: LoginButtonStub,
        QuotaCounter: true
      }
    }
  })
}

describe('AppHeader login entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('点击 Login 打开插件本地登录弹窗，不再跳转官网', async () => {
    const wrapper = mountHeader()

    await wrapper.get('.login-stub').trigger('click')

    expect(mocks.openLoginModal).toHaveBeenCalledOnce()
    expect(mocks.openLoginModal).toHaveBeenCalledWith('popup')
  })
})
