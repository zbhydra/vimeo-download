/** 原生模态与现有显隐 owner 的接线；真实键盘/焦点行为由扩展 E2E 验收。 */
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { expect, it } from 'vitest'
import PremiumView from '@/popup/components/PremiumView.vue'
import LoginModal from '@/popup/components/LoginModal.vue'
import { premiumViewVisible } from '@/core/composables/premiumView'
import { loginModalVisible } from '@/core/composables/loginModal'
import TRANSLATIONS from '@/locales/messages'

it('购买视图打开登录后，原生关闭仅收起登录；购买视图可随后独立关闭', async () => {
  const wrapper = mount(
    {
      components: { PremiumView, LoginModal },
      template: '<div><PremiumView /><LoginModal /></div>'
    },
    {
      attachTo: document.body,
      global: {
        plugins: [
          createPinia(),
          createI18n({ legacy: false, locale: 'en-US', messages: TRANSLATIONS })
        ],
        stubs: { Icon: true, Teleport: true }
      }
    }
  )
  try {
    const premium = () => wrapper.get('.premium-overlay').element as HTMLDialogElement
    const login = () => wrapper.get('.login-modal-overlay').element as HTMLDialogElement
    expect(premium().open).toBe(false)
    expect(login().open).toBe(false)

    // 仅验证原生 dialog 接线；购买视图套餐加载走真实 API，由集成/E2E 验收覆盖。
    premium().showModal()
    expect(premium().open).toBe(true)

    loginModalVisible.value = true
    await flushPromises()
    expect(login().open).toBe(true)
    premium().showModal()

    login().close()
    await flushPromises()
    expect(loginModalVisible.value).toBe(false)
    expect(premiumViewVisible.value).toBe(false)
    expect(premium().open).toBe(true)

    premium().close()
    await flushPromises()
    expect(premiumViewVisible.value).toBe(false)
    expect(premium().open).toBe(false)
  } finally {
    wrapper.unmount()
    premiumViewVisible.value = false
    loginModalVisible.value = false
  }
})
