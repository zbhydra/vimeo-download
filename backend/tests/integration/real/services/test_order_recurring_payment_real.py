"""自动续费回调使用真实 MySQL 与 Redis 的并发收敛回归测试。

测试直接调用生产 OrderService，并由真实订阅履约逻辑写入 MySQL；内部 service、
数据库和 Redis 均不使用 mock 或 monkeypatch。
"""

import asyncio
import json
from typing import Protocol, cast

import pytest
from sqlalchemy import select
from sqlalchemy.sql.elements import ColumnElement

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.constants.subscription import UNLIMITED_SUBSCRIPTION_PRODUCT_ID
from app.core.database import get_async_session
from app.models.order_model import OrderModel
from app.models.subscription_model import UserSubscriptionModel
from app.provider.payment.payment_base import (
    CallbackVerificationResult,
    RecurringPaymentReference,
)
from app.services.order_service import order_service
from app.utils.time import add_natural_months, timestamp_now

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_DAY_MS = 86_400_000
_PAYMENT_METHOD = "paypal"
_PAID_AMOUNT = 12_340_000
_PAID_CURRENCY = "USD"


class _CleanupState(Protocol):
    """本文件消费的自动续费清理 fixture 合同。"""

    test_run_id: str
    user_id: int


async def _get_subscription(user_id: int) -> UserSubscriptionModel | None:
    """从真实 MySQL 读取用户订阅。"""

    subscription_user_id = cast(ColumnElement[int], UserSubscriptionModel.user_id)
    async with get_async_session() as db:
        result = await db.execute(
            select(UserSubscriptionModel).where(subscription_user_id == user_id)
        )
        return result.scalar_one_or_none()


async def _get_renewal_orders(channel_order_no: str) -> list[OrderModel]:
    """从真实 MySQL 读取指定 PayPal 渠道流水对应的续费订单。"""

    async with get_async_session() as db:
        result = await db.scalars(
            select(OrderModel).where(
                OrderModel.payment_method == _PAYMENT_METHOD,
                OrderModel.payment_channel_order_no == channel_order_no,
            )
        )
        return list(result.all())


async def test_real_one_time_subscription_writes_price_snapshot(
    real_recurring_payment_cleanup_state: _CleanupState,
) -> None:
    """一次性月套餐按自然月履约并显式写入实例字段。"""

    cleanup = real_recurring_payment_cleanup_state
    before_ms = timestamp_now()
    order = OrderModel(  # type: ignore[call-arg]
        order_no=f"ORT{cleanup.test_run_id.upper()}",
        user_id=cleanup.user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id=UNLIMITED_SUBSCRIPTION_PRODUCT_ID,
        product_name=f"pytest-onetime-{cleanup.test_run_id}",
        amount=_PAID_AMOUNT,
        currency=_PAID_CURRENCY,
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.PENDING.value,
        payment_method=_PAYMENT_METHOD,
        paid_amount=_PAID_AMOUNT,
        paid_currency=_PAID_CURRENCY,
        paid_at=before_ms,
        expired_at=before_ms + _DAY_MS,
        extra_metadata=json.dumps(
            {
                "product_snapshot": {
                    "product_price_id": 999_003,
                    "auto_renew": False,
                    "period": "month",
                    "currency": _PAID_CURRENCY,
                    "amount": _PAID_AMOUNT,
                    "provider_sku": None,
                }
            },
            separators=(",", ":"),
        ),
        created_at=before_ms,
        updated_at=before_ms,
    )
    stored = await order_service.create(order)
    assert await order_service.fulfill_paid_order(stored) is True

    subscription = await _get_subscription(cleanup.user_id)
    after_ms = timestamp_now()
    assert subscription is not None
    assert subscription.product_price_id == 999_003
    assert subscription.auto_renew is False
    assert subscription.period == "month"
    assert subscription.payment_method == _PAYMENT_METHOD
    assert subscription.expires_at is not None
    assert (
        add_natural_months(before_ms, 1)
        <= subscription.expires_at
        <= (add_natural_months(after_ms, 1))
    )
    assert subscription.start_at is None


async def test_real_recurring_callback_concurrency_creates_and_fulfills_once(
    real_redis_ready: None,
    real_recurring_payment_cleanup_state: _CleanupState,
) -> None:
    """同一渠道扣款的并发回调只创建一条续费订单并延长一次订阅。"""

    cleanup = real_recurring_payment_cleanup_state
    now_ms = timestamp_now()
    original_order_no = f"ORR{cleanup.test_run_id.upper()}"
    original_order = OrderModel(  # type: ignore[call-arg]
        order_no=original_order_no,
        user_id=cleanup.user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id=UNLIMITED_SUBSCRIPTION_PRODUCT_ID,
        product_name=f"pytest-recurring-{cleanup.test_run_id}",
        amount=_PAID_AMOUNT,
        currency=_PAID_CURRENCY,
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.PENDING.value,
        payment_method=_PAYMENT_METHOD,
        payment_channel_order_no=f"initial-{cleanup.test_run_id}",
        paid_amount=_PAID_AMOUNT,
        paid_currency=_PAID_CURRENCY,
        paid_at=now_ms,
        expired_at=now_ms + _DAY_MS,
        extra_metadata=json.dumps(
            {
                "product_snapshot": {
                    "product_price_id": 999_001,
                    "auto_renew": True,
                    "period": "month",
                    "provider_sku": None,
                },
                "payment_callback": {
                    "provider_subscription": {
                        "channel_subscription_id": f"sub-{cleanup.test_run_id}",
                        "original_order_no": original_order_no,
                        "start_at": now_ms,
                        "expires_at": now_ms + 30 * _DAY_MS,
                    }
                },
                "test_run_id": cleanup.test_run_id,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        created_at=now_ms,
        updated_at=now_ms,
    )
    stored_original = await order_service.create(original_order)

    assert await order_service.fulfill_paid_order(stored_original) is True
    subscription_before = await _get_subscription(cleanup.user_id)
    assert subscription_before is not None
    assert subscription_before.expires_at is not None

    renewal_channel_order_no = f"renewal-{cleanup.test_run_id}"
    renewal_period_end = now_ms + 60 * _DAY_MS

    def _make_callback() -> CallbackVerificationResult:
        return CallbackVerificationResult(
            valid=True,
            processed=True,
            event="payment_sale_completed",
            order_no=None,
            channel_order_no=renewal_channel_order_no,
            channel_uid=f"payer-{cleanup.test_run_id}",
            amount=_PAID_AMOUNT,
            currency=_PAID_CURRENCY,
            transaction_id=renewal_channel_order_no,
            extra_metadata=json.dumps(
                {
                    "paypal_sale_id": renewal_channel_order_no,
                    "provider_subscription": {
                        "channel_subscription_id": f"sub-{cleanup.test_run_id}",
                        "original_order_no": original_order_no,
                        "start_at": now_ms + 30 * _DAY_MS,
                        "expires_at": renewal_period_end,
                    },
                    "test_run_id": cleanup.test_run_id,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            recurring_reference=RecurringPaymentReference(
                original_order_no=original_order_no
            ),
        )

    results = await asyncio.gather(
        order_service.handle_payment_callback(
            payment_method=_PAYMENT_METHOD,
            callback=_make_callback(),
        ),
        order_service.handle_payment_callback(
            payment_method=_PAYMENT_METHOD,
            callback=_make_callback(),
        ),
    )

    renewal_orders = await _get_renewal_orders(renewal_channel_order_no)
    assert len(renewal_orders) == 1
    renewal_order = renewal_orders[0]
    assert {result.order_no for result in results} == {renewal_order.order_no}
    assert renewal_order.user_id == cleanup.user_id
    assert renewal_order.order_status == OrderStatus.PAID.value
    assert renewal_order.callback_status == CallbackStatus.SUCCESS.value
    assert renewal_order.payment_transaction_id == renewal_channel_order_no

    subscription_after = await _get_subscription(cleanup.user_id)
    assert subscription_after is not None
    assert subscription_after.expires_at is not None
    assert subscription_after.expires_at == renewal_period_end
    assert subscription_after.start_at == now_ms + 30 * _DAY_MS
