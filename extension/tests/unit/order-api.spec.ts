/** 订单 API 合同测试：请求形状、支付 URL 白名单、订单状态归类与错误归类。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('../../src/core/api/index', () => ({
  httpClient: { get: mocks.get, post: mocks.post }
}))

import { ApiError } from '../../src/core/api/client/types'
import {
  buildCreateOrderRequest,
  classifyOrderStatus,
  createOrder,
  getDefaultOrderPaymentChannel,
  getOrderStatus,
  hasOrderPollingTimedOut,
  isPaymentGatewayError,
  isPaymentPriceUpdatedError,
  isRecoverableOrderStatusError,
  ORDER_POLL_TIMEOUT_MS,
  readPaymentUrl
} from '../../src/core/api/order/api'
import type { OrderStatusResponse } from '../../src/core/api/order/types'

function orderStatus(overrides: Partial<OrderStatusResponse>): OrderStatusResponse {
  return {
    order_no: 'o_1',
    product_class: 1,
    product_id: 'unlimited_year',
    product_name: 'Unlimited Year',
    amount: 50_000_000,
    currency: 'USD',
    order_status: 1,
    callback_status: 1,
    payment_method: 'clink',
    paid_at: null,
    created_at: 1,
    expired_at: 2,
    ...overrides
  }
}

describe('orderApi', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.post.mockReset()
  })

  it('createOrder 按 POST /api/client/order/create 合同传参', async () => {
    mocks.post.mockResolvedValueOnce({
      order_no: 'o_9',
      amount: 50_000_000,
      currency: 'USD',
      expired_at: 123,
      support_mail: 'support@example.com',
      payment_data: { payment_url: 'https://checkout.clinkbill.com/pay' }
    })

    const request = {
      product_class: 1,
      product_id: 'unlimited_year',
      payment_method: 'clink',
      currency: 'USD',
      amount: 50_000_000,
      auto_renew: true,
      period: 'year' as const
    }
    await expect(createOrder(request)).resolves.toMatchObject({ order_no: 'o_9' })
    expect(mocks.post).toHaveBeenCalledWith('/api/client/order/create', request)
  })

  it('getOrderStatus 拼接订单号路径并转义', async () => {
    mocks.get.mockResolvedValueOnce(orderStatus({}))
    await getOrderStatus('o/1')
    expect(mocks.get).toHaveBeenCalledWith('/api/client/order/status/o%2F1')
  })

  it('buildCreateOrderRequest 从套餐快照与渠道取值', () => {
    expect(
      buildCreateOrderRequest(
        { product_class: 1, product_id: 'p1', auto_renew: false, period: 'lifetime' },
        { payment_method: 'paypal', payment_method_name: 'PayPal', currency: 'USD', amount: 9_000_000 }
      )
    ).toEqual({
      product_class: 1,
      product_id: 'p1',
      payment_method: 'paypal',
      currency: 'USD',
      amount: 9_000_000,
      auto_renew: false,
      period: 'lifetime'
    })
  })

  describe('readPaymentUrl', () => {
    it.each([
      ['paypal', { approval_url: 'https://www.paypal.com/checkoutpay' }, 'https://www.paypal.com/checkoutpay'],
      ['clink', { payment_url: 'https://checkout.clinkbill.com/pay' }, 'https://checkout.clinkbill.com/pay'],
      ['clink', { url: 'https://uat-checkout.clinkbill.com/pay' }, 'https://uat-checkout.clinkbill.com/pay']
    ])('提取 %s 的可信收银台 URL', (method, paymentData, expected) => {
      expect(readPaymentUrl(paymentData, method)).toBe(expected)
    })

    it.each([
      ['paypal', { payment_url: 'http://www.paypal.com/checkoutpay' }],
      ['paypal', { payment_url: 'https://evil.example.com/checkout' }],
      ['clink', { payment_url: 'https://evil.example.com/pay' }],
      ['unknown_method', { payment_url: 'https://checkout.clinkbill.com/pay' }],
      ['paypal', 'https://www.paypal.com/x'],
      ['paypal', { checkoutUrl: '' }],
      ['paypal', {}]
    ])('拒绝不可信支付数据 %j', (method, paymentData) => {
      expect(readPaymentUrl(paymentData, method)).toBeNull()
    })
  })

  describe('classifyOrderStatus', () => {
    it('已支付且履约成功才算 paid', () => {
      expect(classifyOrderStatus(orderStatus({ order_status: 2, callback_status: 3 }))).toBe('paid')
    })

    it('已支付但履约失败或达到最大重试为 failed', () => {
      for (const callback_status of [4, 5] as const) {
        expect(classifyOrderStatus(orderStatus({ order_status: 2, callback_status }))).toBe('failed')
      }
    })

    it('过期、取消、退款分别归类', () => {
      expect(classifyOrderStatus(orderStatus({ order_status: 5 }))).toBe('expired')
      expect(classifyOrderStatus(orderStatus({ order_status: 3 }))).toBe('cancelled')
      expect(classifyOrderStatus(orderStatus({ order_status: 4 }))).toBe('failed')
    })

    it('待支付与回调处理中都继续轮询', () => {
      for (const callback_status of [1, 2] as const) {
        expect(classifyOrderStatus(orderStatus({ order_status: 1, callback_status }))).toBe('pending')
      }
    })
  })

  it('getDefaultOrderPaymentChannel 按 clink > paypal 优先并回退首个渠道', () => {
    const clink = { payment_method: 'clink', payment_method_name: 'Clink', currency: 'USD', amount: 1 }
    const paypal = { payment_method: 'paypal', payment_method_name: 'PayPal', currency: 'USD', amount: 2 }
    expect(getDefaultOrderPaymentChannel([paypal, clink])).toBe(clink)
    expect(getDefaultOrderPaymentChannel([paypal])).toBe(paypal)
    expect(getDefaultOrderPaymentChannel([])).toBeNull()
  })

  it('hasOrderPollingTimedOut 区分未开始与超时', () => {
    expect(hasOrderPollingTimedOut(null)).toBe(false)
    expect(hasOrderPollingTimedOut(Date.now() - ORDER_POLL_TIMEOUT_MS - 1)).toBe(true)
  })

  it('错误归类按后端业务码判定', () => {
    expect(isPaymentPriceUpdatedError(new ApiError('x', 400, 21005))).toBe(true)
    expect(isPaymentGatewayError(new ApiError('x', 400, 21001))).toBe(true)
    expect(isPaymentGatewayError(new ApiError('x', 400, 21004))).toBe(true)
    expect(isRecoverableOrderStatusError(new ApiError('x', 400, 20001))).toBe(true)
    expect(isRecoverableOrderStatusError(new ApiError('x', 400, 20003))).toBe(true)
    expect(isRecoverableOrderStatusError(new Error('network'))).toBe(false)
    expect(isPaymentGatewayError(new ApiError('x', 400, 20001))).toBe(false)
  })
})
