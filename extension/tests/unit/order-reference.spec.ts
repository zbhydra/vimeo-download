/** 订单定位引用的 Chrome 存储与用户隔离检查，不调用项目订单 API。 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/core/api/config'
import type { StorageValue } from '@/core/storage'
import { clearOrderReference, getLatestOrderReference } from '@/background/services/orderCheckout'
import { parseCreateCheckoutOrderRequest } from '@/background/services/BackgroundMessageRouter'

const values = new Map<string, StorageValue>()

describe('订单定位引用', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    values.clear()
    vi.spyOn(chrome.storage.local, 'get').mockImplementation(async keys => {
      const result: Record<string, StorageValue> = {}
      if (typeof keys === 'string' && values.has(keys)) {
        result[keys] = values.get(keys)!
      }
      return result
    })
    vi.spyOn(chrome.storage.local, 'remove').mockImplementation(async keys => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        values.delete(key)
      }
    })
  })

  it('只有当前用户可以读自己的引用，游客和其他用户读取不删除它', async () => {
    const reference = { userId: 10, orderNo: 'order-a' }
    values.set(STORAGE_KEYS.LATEST_ORDER_REFERENCE, reference)
    await expect(getLatestOrderReference()).resolves.toBeNull()
    values.set(STORAGE_KEYS.USER_INFO, { user_id: 20 })
    await expect(getLatestOrderReference()).resolves.toBeNull()
    expect(values.get(STORAGE_KEYS.LATEST_ORDER_REFERENCE)).toEqual(reference)
    values.set(STORAGE_KEYS.USER_INFO, { user_id: 10 })
    await expect(getLatestOrderReference()).resolves.toEqual(reference)
  })

  it('终态清理必须同时匹配当前用户与订单号', async () => {
    values.set(STORAGE_KEYS.LATEST_ORDER_REFERENCE, { userId: 10, orderNo: 'order-a' })
    values.set(STORAGE_KEYS.USER_INFO, { user_id: 20 })
    await clearOrderReference('order-a')
    expect(values.has(STORAGE_KEYS.LATEST_ORDER_REFERENCE)).toBe(true)
    values.set(STORAGE_KEYS.USER_INFO, { user_id: 10 })
    await clearOrderReference('order-b')
    expect(values.has(STORAGE_KEYS.LATEST_ORDER_REFERENCE)).toBe(true)
    await clearOrderReference('order-a')
    expect(values.has(STORAGE_KEYS.LATEST_ORDER_REFERENCE)).toBe(false)
  })

  it('下单 RPC 校验字段类型，保留服务端价格快照', () => {
    const request = {
      product_class: 1,
      product_id: 'year',
      payment_method: 'clink',
      currency: 'USD',
      amount: 9_000_000,
      auto_renew: false,
      period: 'year'
    }
    expect(parseCreateCheckoutOrderRequest(request)).toEqual(request)
    expect(() => parseCreateCheckoutOrderRequest({ ...request, amount: '9000000' })).toThrow(
      'createCheckoutOrder'
    )
    expect(() => parseCreateCheckoutOrderRequest({ ...request, period: 'week' })).toThrow(
      'createCheckoutOrder'
    )
  })
})
