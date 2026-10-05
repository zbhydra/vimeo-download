/** background 创建订单并保存单个定位引用；订单与履约状态始终向服务端查询。 */

import { authApi } from '@/core/api/auth/api'
import { isAuthSessionFailure } from '@/core/api/auth/sessionFailure'
import { STORAGE_KEYS } from '@/core/api/config'
import {
  createOrder,
  isPaymentGatewayError,
  isPaymentPriceUpdatedError,
  isRecoverableOrderStatusError
} from '@/core/api/order'
import { storageManager } from '@/core/storage'
import { logger } from '@/core/utils/logger'
import type {
  BackgroundCreateCheckoutOrderRequest,
  BackgroundCreateCheckoutOrderResponse,
  BackgroundOrderReference
} from '@/background/types'

/** 下单和引用写入都完成后才返回收银台数据，popup 销毁不会终止这段工作。 */
export async function createCheckoutOrder(
  request: BackgroundCreateCheckoutOrderRequest
): Promise<BackgroundCreateCheckoutOrderResponse> {
  try {
    const user = await authApi.getStoredUserInfo()
    if (!user) {
      return { status: 'failed', reason: 'auth' }
    }
    const order = await createOrder(request)
    await storageManager.set<BackgroundOrderReference>(STORAGE_KEYS.LATEST_ORDER_REFERENCE, {
      userId: user.user_id,
      orderNo: order.order_no
    })
    return { status: 'created', order }
  } catch (error) {
    logger.error('[OrderCheckout] 创建订单或保存订单引用失败:', error)
    const reason =
      error instanceof Error && isAuthSessionFailure(error)
        ? 'auth'
        : error instanceof Error && isPaymentPriceUpdatedError(error)
          ? 'priceUpdated'
          : error instanceof Error && isPaymentGatewayError(error)
            ? 'gateway'
            : error instanceof Error && isRecoverableOrderStatusError(error)
              ? 'orderGone'
              : 'generic'
    return { status: 'failed', reason }
  }
}

/** 仅返回当前登录用户的最后订单引用；其他用户的引用保留在存储中。 */
export async function getLatestOrderReference(): Promise<BackgroundOrderReference | null> {
  const user = await authApi.getStoredUserInfo()
  const reference = await storageManager.get<BackgroundOrderReference>(
    STORAGE_KEYS.LATEST_ORDER_REFERENCE
  )
  return user && reference?.userId === user.user_id ? reference : null
}

/** 服务端确认终态后，清理仍属于当前用户、且订单号匹配的引用。 */
export async function clearOrderReference(orderNo: string): Promise<void> {
  const reference = await getLatestOrderReference()
  if (reference?.orderNo === orderNo) {
    await storageManager.remove(STORAGE_KEYS.LATEST_ORDER_REFERENCE)
  }
}
