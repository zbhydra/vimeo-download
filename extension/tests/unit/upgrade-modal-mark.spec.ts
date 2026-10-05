/** 升级弹窗每次进入显示状态时广播一次打点事件。 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import UpgradeModal from '@/core/content/components/UpgradeModal.vue'

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  isAuthenticated: vi.fn(),
  openLoginModal: vi.fn(),
  onUpgrade: vi.fn()
}))

vi.mock('@/core/api/auth/api', () => ({
  authApi: { isAuthenticated: mocks.isAuthenticated }
}))

vi.mock('@/core/composables/loginModal', () => ({
  openLoginModal: mocks.openLoginModal
}))

vi.mock('@/core/rpc/ChromeEventBus', () => ({
  ChromeEventEmitter: class {
    emit = mocks.emit
  }
}))

/** 创建带最小翻译上下文的升级弹窗。 */
function mountUpgradeModal(show: boolean, resetAt = 0, useTeleport = false): VueWrapper {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: {
      'en-US': {
        'auth.login': 'Login',
        'quota.loginMessage': 'Log in to check your account quota and subscription.',
        'quota.upgradeTitle': 'Upgrade',
        'quota.upgradeMessage': 'Daily quota reached',
        'quota.upgradeButton': 'Upgrade now',
        'quota.resetInHoursMinutes': 'Next refresh in {hours}h {minutes}m',
        'quota.resetInHours': 'Next refresh in {hours}h',
        'quota.resetInMinutes': 'Next refresh in {minutes}m',
        'quota.resetReady': 'Refreshing download limit',
        'quota.resetAt': 'Next refresh: {time}',
        'app.error.dismiss': 'Close'
      }
    }
  })

  return mount(UpgradeModal, {
    attachTo: document.body,
    props: { show, resetAt, useTeleport, onUpgrade: mocks.onUpgrade },
    global: {
      plugins: [i18n],
      stubs: { Icon: true }
    }
  })
}

describe('UpgradeModal SLS event', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-08-13T10:00:00.000Z')
    mocks.emit.mockReset()
    mocks.isAuthenticated.mockResolvedValue(true)
    mocks.openLoginModal.mockReset()
    mocks.onUpgrade.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
  })

  it('broadcasts once for each hidden-to-visible transition', async () => {
    wrapper = mountUpgradeModal(false)
    expect(mocks.emit).not.toHaveBeenCalled()

    await wrapper.setProps({ show: true })
    await flushPromises()
    expect(mocks.emit).toHaveBeenCalledTimes(1)
    expect(mocks.emit).toHaveBeenLastCalledWith('upgradeModalOpened', undefined)

    await wrapper.setProps({ show: true })
    expect(mocks.emit).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })
    await flushPromises()
    expect(mocks.emit).toHaveBeenCalledTimes(2)
  })

  it('broadcasts when mounted already visible', async () => {
    wrapper = mountUpgradeModal(true)
    await flushPromises()

    expect(mocks.emit).toHaveBeenCalledOnce()
    expect(mocks.emit).toHaveBeenCalledWith('upgradeModalOpened', undefined)
  })

  it('renders the refresh prompt between the limit message and upgrade action', async () => {
    const resetAt = Date.now() + 88 * 60_000
    wrapper = mountUpgradeModal(true, resetAt)
    await flushPromises()

    const prompt = wrapper.find('.vdl-upgrade-modal-reset')
    expect(prompt.find('.vdl-upgrade-modal-reset-countdown').text()).toBe('Next refresh in 1h 28m')
    expect(prompt.find('.vdl-upgrade-modal-reset-time').text()).toContain('Next refresh:')

    const contentClasses = Array.from(
      wrapper.find('.vdl-upgrade-modal-content').element.children
    ).map(element => element.className)
    expect(contentClasses).toEqual([
      'vdl-upgrade-modal-icon',
      'vdl-upgrade-modal-title',
      'vdl-upgrade-modal-message',
      'vdl-upgrade-modal-reset',
      'vdl-upgrade-modal-btn'
    ])
  })

  it('旧后端未提供刷新时间时仍显示额度不足弹窗', async () => {
    wrapper = mountUpgradeModal(true)
    await flushPromises()

    expect(wrapper.find('.vdl-upgrade-modal-container').exists()).toBe(true)
    expect(wrapper.find('.vdl-upgrade-modal-reset').exists()).toBe(false)
  })

  it('switches from minute countdown to the refresh-in-progress state', async () => {
    const resetAt = Date.now() + 28 * 60_000
    wrapper = mountUpgradeModal(true, resetAt)
    await flushPromises()

    expect(wrapper.find('.vdl-upgrade-modal-reset-countdown').text()).toBe('Next refresh in 28m')

    vi.setSystemTime(resetAt)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(wrapper.find('.vdl-upgrade-modal-reset-countdown').text()).toBe(
      'Refreshing download limit'
    )
  })

  it('游客提示登录，登录用户的购买动作交给宿主', async () => {
    mocks.isAuthenticated.mockResolvedValue(false)
    wrapper = mountUpgradeModal(true)
    await flushPromises()
    expect(wrapper.get('.vdl-upgrade-modal-title').text()).toBe('Login')
    expect(wrapper.text()).not.toContain('Upgrade')
    expect(mocks.emit).toHaveBeenCalledWith('loginModalOpened', undefined)
    await wrapper.get('.vdl-upgrade-modal-btn').trigger('click')
    await flushPromises()
    expect(mocks.openLoginModal).toHaveBeenCalledOnce()
    expect(mocks.openLoginModal).toHaveBeenCalledWith('upgrade_modal')
    expect(mocks.onUpgrade).not.toHaveBeenCalled()

    await wrapper.setProps({ show: false })
    mocks.isAuthenticated.mockResolvedValue(true)
    await wrapper.setProps({ show: true })
    await flushPromises()
    expect(wrapper.get('.vdl-upgrade-modal-title').text()).toBe('Upgrade')
    await wrapper.get('.vdl-upgrade-modal-btn').trigger('click')
    await flushPromises()
    expect(mocks.onUpgrade).toHaveBeenCalledOnce()
  })

  it('Teleport 挂载使用同一宿主购买动作', async () => {
    wrapper = mountUpgradeModal(true, 0, true)
    await flushPromises()
    // Teleport 渲染到 document.body，不在 wrapper 树内
    const button = document.body.querySelector<HTMLButtonElement>('.vdl-upgrade-modal-btn')
    expect(button).not.toBeNull()
    button!.click()
    await flushPromises()
    expect(mocks.onUpgrade).toHaveBeenCalledOnce()
  })
})
