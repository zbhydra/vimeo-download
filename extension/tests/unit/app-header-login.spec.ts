/**
 * Popup Header 登录入口回归测试。
 *
 * Header 将顶栏登录交给统一登录页入口。
 */

import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppHeader from '../../src/popup/components/AppHeader.vue'

const mocks = vi.hoisted(() => ({
  openLoginPage: vi.fn(),
  logout: vi.fn()
}))

vi.mock('../../src/core/composables/loginPage', () => ({
  openLoginPage: mocks.openLoginPage
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
        'app.title': 'Vimeo Downloader',
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

  it('点击登录打开插件登录页并传递顶栏来源', async () => {
    const wrapper = mountHeader()

    await wrapper.get('.login-stub').trigger('click')

    expect(mocks.openLoginPage).toHaveBeenCalledOnce()
    expect(mocks.openLoginPage).toHaveBeenCalledWith('popup')
  })
})
