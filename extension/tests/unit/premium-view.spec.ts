/** Popup 内嵌购买视图状态机：登录门控、套餐选择、发起支付、轮询成功与失败。 */

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TRANSLATIONS from '@/locales/messages'

const mocks = vi.hoisted(() => ({
  listCheckoutConfigs: vi.fn(),
  createOrder: vi.fn(),
  getOrderStatus: vi.fn(),
  readPaymentUrl: vi.fn(),
  classifyOrderStatus: vi.fn(),
  hasOrderPollingTimedOut: vi.fn(),
  isPaymentGatewayError: vi.fn(),
  isPaymentPriceUpdatedError: vi.fn(),
  isRecoverableOrderStatusError: vi.fn(),
  openExternalPage: vi.fn(),
  openLoginModal: vi.fn(),
  refreshQuota: vi.fn()
}))

vi.mock('@/core/api/subscription', () => ({
  subscriptionApi: { listCheckoutConfigs: mocks.listCheckoutConfigs }
}))

vi.mock('@/core/api/order', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/api/order/api')>(
    '../../src/core/api/order/api'
  )
  return {
    ...actual,
    createOrder: mocks.createOrder,
    getOrderStatus: mocks.getOrderStatus,
    readPaymentUrl: mocks.readPaymentUrl,
    classifyOrderStatus: mocks.classifyOrderStatus,
    hasOrderPollingTimedOut: mocks.hasOrderPollingTimedOut,
    isPaymentGatewayError: mocks.isPaymentGatewayError,
    isPaymentPriceUpdatedError: mocks.isPaymentPriceUpdatedError,
    isRecoverableOrderStatusError: mocks.isRecoverableOrderStatusError,
    ORDER_POLL_INTERVAL_MS: 10
  }
})

vi.mock('@/core/stores/authStore', async () => {
  const { reactive } = await import('vue')
  const store = reactive({ isAuthenticated: false })
  return { useAuthStore: () => store }
})

vi.mock('@/core/stores/quotaStore', () => ({
  useQuotaStore: () => ({ refreshQuota: mocks.refreshQuota })
}))

vi.mock('@/core/utils/navigation', () => ({
  openExternalPage: mocks.openExternalPage
}))

vi.mock('@/core/composables/loginModal', () => ({
  openLoginModal: mocks.openLoginModal
}))

import { useAuthStore } from '@/core/stores/authStore'
import { premiumViewVisible, openPremiumView } from '@/core/composables/premiumView'
import PremiumView from '@/popup/components/PremiumView.vue'

const monthPlan = {
  product_class: 1,
  product_id: 'unlimited_month',
  product_name: 'Unlimited Month',
  period: 'month',
  auto_renew: true,
  display_currency: 'USD',
  display_amount: 5_000_000,
  daily_limit: -1,
  payment_channels: [
    {
      payment_method: 'clink',
      payment_method_name: 'Card (Clink)',
      product_price_id: 11,
      currency: 'USD',
      amount: 5_000_000
    }
  ]
}

const yearPlan = {
  product_class: 1,
  product_id: 'unlimited_year',
  product_name: 'Unlimited Year',
  period: 'year',
  auto_renew: true,
  display_currency: 'USD',
  display_amount: 50_000_000,
  daily_limit: -1,
  payment_channels: [
    {
      payment_method: 'clink',
      payment_method_name: 'Card (Clink)',
      product_price_id: 21,
      currency: 'USD',
      amount: 50_000_000
    },
    {
      payment_method: 'paypal',
      payment_method_name: 'PayPal',
      product_price_id: 22,
      currency: 'USD',
      amount: 52_000_000
    }
  ]
}

const createResponse = {
  order_no: 'o_1',
  amount: 50_000_000,
  currency: 'USD',
  expired_at: 4_103_443_200_000,
  support_mail: 'support@example.com',
  payment_data: { payment_url: 'https://checkout.clinkbill.com/pay' }
}

/** 挂载购买视图；视图可见性由真实 premiumView composable 驱动。 */
async function mountPremiumView(): Promise<VueWrapper> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: { 'en-US': TRANSLATIONS['en-US'] }
  })
  const wrapper = mount(PremiumView, {
    global: {
      plugins: [i18n],
      stubs: { Icon: true, Teleport: true, Transition: false }
    }
  })
  openPremiumView('upgrade_modal')
  await flushPromises()
  return wrapper
}

/** 测试内直接改 mock store 的登录态；真实 authStore 的 computed 是只读类型，需收窄。 */
function setAuthenticated(value: boolean): void {
  ;(useAuthStore() as { isAuthenticated: boolean }).isAuthenticated = value
}

describe('PremiumView', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-09-26T10:00:00.000Z')
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }
    mocks.refreshQuota.mockResolvedValue(undefined)
    mocks.openExternalPage.mockResolvedValue(true)
    mocks.hasOrderPollingTimedOut.mockReturnValue(false)
    mocks.isPaymentGatewayError.mockReturnValue(false)
    mocks.isPaymentPriceUpdatedError.mockReturnValue(false)
    mocks.isRecoverableOrderStatusError.mockReturnValue(false)
    mocks.listCheckoutConfigs.mockResolvedValue([monthPlan, yearPlan])
    setAuthenticated(false)
    premiumViewVisible.value = false
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    premiumViewVisible.value = false
    vi.useRealTimers()
  })

  it('未登录展示登录门控，登录入口携带原入口归因', async () => {
    wrapper = await mountPremiumView()

    expect(wrapper.find('.premium-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('Log in to see available plans and purchase.')
    expect(mocks.listCheckoutConfigs).not.toHaveBeenCalled()

    await wrapper.get('button.premium-primary-button').trigger('click')
    expect(mocks.openLoginModal).toHaveBeenCalledWith('upgrade_modal')
  })

  it('登录成功后自动进入套餐加载并默认选中年付', async () => {
    wrapper = await mountPremiumView()
    expect(wrapper.findAll('.premium-plan')).toHaveLength(0)

    setAuthenticated(true)
    await flushPromises()

    expect(mocks.listCheckoutConfigs).toHaveBeenCalledTimes(1)
    const planCards = wrapper.findAll('.premium-plan')
    expect(planCards).toHaveLength(2)
    expect(planCards[0].text()).toContain('Monthly')
    expect(planCards[1].classes()).toContain('is-selected')
    expect(planCards[1].text()).toContain('$50.00')
  })

  it('已登录直接展示套餐；发起支付打开收银台并进入等待轮询', async () => {
    setAuthenticated(true)
    wrapper = await mountPremiumView()

    mocks.createOrder.mockResolvedValueOnce(createResponse)
    mocks.readPaymentUrl.mockReturnValueOnce('https://checkout.clinkbill.com/pay')
    mocks.classifyOrderStatus.mockReturnValue('pending')

    await wrapper.get('button.premium-buy').trigger('click')
    await flushPromises()

    expect(mocks.createOrder).toHaveBeenCalledTimes(1)
    const [request] = mocks.createOrder.mock.calls[0]
    expect(request).toMatchObject({
      product_class: 1,
      product_id: 'unlimited_year',
      payment_method: 'clink',
      currency: 'USD',
      amount: 50_000_000,
      auto_renew: true,
      period: 'year'
    })
    expect(mocks.openExternalPage).toHaveBeenCalledWith(
      'https://checkout.clinkbill.com/pay',
      'payment:clink'
    )
    expect(wrapper.text()).toContain('Waiting for payment')

    // 渠道二选一：切换到 PayPal 后下单带 paypal 金额
    await wrapper.get('button.premium-secondary-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('button.premium-buy').exists()).toBe(true)

    mocks.createOrder.mockResolvedValueOnce(createResponse)
    mocks.readPaymentUrl.mockReturnValueOnce('https://www.paypal.com/checkoutpay')
    const paypalChannel = wrapper.findAll('.premium-channel')[1]
    await paypalChannel.trigger('click')
    await wrapper.get('button.premium-buy').trigger('click')
    await flushPromises()
    expect(mocks.createOrder.mock.calls[1][0]).toMatchObject({
      payment_method: 'paypal',
      amount: 52_000_000
    })
  })

  it('轮询到 paid 进入成功态并刷新订阅状态缓存', async () => {
    setAuthenticated(true)
    wrapper = await mountPremiumView()

    mocks.createOrder.mockResolvedValueOnce(createResponse)
    mocks.readPaymentUrl.mockReturnValueOnce('https://checkout.clinkbill.com/pay')
    mocks.classifyOrderStatus.mockReturnValue('pending')
    await wrapper.get('button.premium-buy').trigger('click')
    await flushPromises()

    mocks.classifyOrderStatus.mockReturnValue('paid')
    mocks.getOrderStatus.mockResolvedValueOnce({ order_no: 'o_1' })
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()

    expect(mocks.getOrderStatus).toHaveBeenCalledWith('o_1')
    expect(wrapper.text()).toContain('Payment received')
    expect(mocks.refreshQuota).toHaveBeenCalledTimes(1)
  })

  it('轮询到 expired 进入失败态，重试回到套餐选择', async () => {
    setAuthenticated(true)
    wrapper = await mountPremiumView()

    mocks.createOrder.mockResolvedValueOnce(createResponse)
    mocks.readPaymentUrl.mockReturnValueOnce('https://checkout.clinkbill.com/pay')
    mocks.classifyOrderStatus.mockReturnValue('pending')
    await wrapper.get('button.premium-buy').trigger('click')
    await flushPromises()

    mocks.classifyOrderStatus.mockReturnValue('expired')
    mocks.getOrderStatus.mockResolvedValueOnce({ order_no: 'o_1' })
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()

    expect(wrapper.text()).toContain('Payment not completed')
    expect(wrapper.text()).toContain('This order has expired or is no longer available.')
    expect(mocks.refreshQuota).not.toHaveBeenCalled()

    await wrapper.get('button.premium-primary-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('button.premium-buy').exists()).toBe(true)
  })

  it('轮询期间网络错误保留等待态，超时才判失败', async () => {
    setAuthenticated(true)
    wrapper = await mountPremiumView()

    mocks.createOrder.mockResolvedValueOnce(createResponse)
    mocks.readPaymentUrl.mockReturnValueOnce('https://checkout.clinkbill.com/pay')
    mocks.classifyOrderStatus.mockReturnValue('pending')
    await wrapper.get('button.premium-buy').trigger('click')
    await flushPromises()

    // 单次网络错误不打断等待
    mocks.getOrderStatus.mockRejectedValueOnce(new Error('network down'))
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(wrapper.text()).toContain('Waiting for payment')

    // 超时后终局
    mocks.hasOrderPollingTimedOut.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(10)
    await flushPromises()
    expect(wrapper.text()).toContain('Payment not completed')
  })

  it('套餐配置加载失败提供重试入口', async () => {
    setAuthenticated(true)
    mocks.listCheckoutConfigs.mockRejectedValueOnce(new Error('backend down'))
    wrapper = await mountPremiumView()

    expect(wrapper.text()).toContain('Could not load plans.')
    expect(wrapper.find('button.premium-buy').exists()).toBe(false)

    await wrapper.get('button.premium-primary-button').trigger('click')
    await flushPromises()
    expect(mocks.listCheckoutConfigs).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.premium-plan')).toHaveLength(2)
  })

  it('关闭视图停止轮询', async () => {
    setAuthenticated(true)
    wrapper = await mountPremiumView()

    mocks.createOrder.mockResolvedValueOnce(createResponse)
    mocks.readPaymentUrl.mockReturnValueOnce('https://checkout.clinkbill.com/pay')
    mocks.classifyOrderStatus.mockReturnValue('pending')
    await wrapper.get('button.premium-buy').trigger('click')
    await flushPromises()

    const orderCalls = () => mocks.getOrderStatus.mock.calls.length
    await wrapper.get('button.premium-close').trigger('click')
    await flushPromises()
    expect(premiumViewVisible.value).toBe(false)

    const callsAtClose = orderCalls()
    await vi.advanceTimersByTimeAsync(30)
    expect(orderCalls()).toBe(callsAtClose)
  })
})
