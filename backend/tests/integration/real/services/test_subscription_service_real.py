"""订阅周期履约 real 测试（真实 MySQL，无 mock）。

真实资源依赖：
- MySQL: orders / user_subscriptions 表

覆盖新增 lifetime 周期的一次性履约、后到账有限周期订单对已生效终生
权益的保留，以及有效订阅重复下单拦截。
"""

import json
from typing import cast

import pytest
from sqlalchemy import select
from sqlalchemy.sql.elements import ColumnElement

from app.constants.order import (
    CallbackStatus,
    OrderCheckProductParam,
    OrderStatus,
    ProductClass,
)
from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.order_model import OrderModel
from app.models.subscription_model import UserSubscriptionModel
from app.services.order_service import order_service
from app.services.subscription_service import subscription_service
from app.utils.time import add_natural_months, timestamp_now

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_DAY_MS = 86_400_000
_PAYMENT_METHOD = "paypal"
_PAID_AMOUNT = 9_900_000
_PAID_CURRENCY = "USD"
_LIFETIME_PRODUCT_ID = "unlimited_lifetime"
_LIFETIME_MONTHS = 2400


class _CleanupState:
    """本文件消费的订阅履约清理 fixture 合同。"""

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


async def _get_order(order_no: str) -> OrderModel | None:
    """从真实 MySQL 读取订单。"""

    async with get_async_session() as db:
        return await db.scalar(
            select(OrderModel).where(OrderModel.order_no == order_no)
        )


def _make_one_time_order(
    cleanup: _CleanupState,
    *,
    label: str,
    product_id: str,
    period: str,
) -> OrderModel:
    """构造一次性订阅支付订单（未落库）。"""

    now_ms = timestamp_now()
    return OrderModel(  # type: ignore[call-arg]
        order_no=f"ORL{label.upper()}{cleanup.test_run_id.upper()}",
        user_id=cleanup.user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id=product_id,
        product_name=f"pytest-subscription-{label}-{cleanup.test_run_id}",
        amount=_PAID_AMOUNT,
        currency=_PAID_CURRENCY,
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.PENDING.value,
        payment_method=_PAYMENT_METHOD,
        paid_amount=_PAID_AMOUNT,
        paid_currency=_PAID_CURRENCY,
        paid_at=now_ms,
        expired_at=now_ms + _DAY_MS,
        extra_metadata=json.dumps(
            {
                "product_snapshot": {
                    "product_price_id": 999_010,
                    "auto_renew": False,
                    "period": period,
                    "currency": _PAID_CURRENCY,
                    "amount": _PAID_AMOUNT,
                    "provider_sku": None,
                }
            },
            separators=(",", ":"),
        ),
        created_at=now_ms,
        updated_at=now_ms,
    )


async def test_real_lifetime_fulfillment_expires_after_2400_natural_months(
    real_recurring_payment_cleanup_state: _CleanupState,
) -> None:
    """lifetime 一次性履约到期时间为当前时间加 2400 个自然月。"""

    cleanup = real_recurring_payment_cleanup_state
    before_ms = timestamp_now()
    order = await order_service.create(
        _make_one_time_order(
            cleanup,
            label="lf",
            product_id=_LIFETIME_PRODUCT_ID,
            period="lifetime",
        )
    )

    assert await order_service.fulfill_paid_order(order) is True

    after_ms = timestamp_now()
    subscription = await _get_subscription(cleanup.user_id)
    assert subscription is not None
    assert subscription.product_id == _LIFETIME_PRODUCT_ID
    assert subscription.period == "lifetime"
    assert subscription.auto_renew is False
    assert subscription.payment_method == _PAYMENT_METHOD
    assert subscription.expires_at is not None
    assert (
        add_natural_months(before_ms, _LIFETIME_MONTHS)
        <= subscription.expires_at
        <= add_natural_months(after_ms, _LIFETIME_MONTHS)
    )


async def test_real_late_finite_order_keeps_active_lifetime_subscription(
    real_recurring_payment_cleanup_state: _CleanupState,
) -> None:
    """终生先履约、月卡后履约：订单照常完成，终生身份与到期时间不被覆盖。"""

    cleanup = real_recurring_payment_cleanup_state
    lifetime_order = await order_service.create(
        _make_one_time_order(
            cleanup,
            label="lb",
            product_id=_LIFETIME_PRODUCT_ID,
            period="lifetime",
        )
    )
    month_order = await order_service.create(
        _make_one_time_order(
            cleanup,
            label="lm",
            product_id="unlimited",
            period="month",
        )
    )

    assert await order_service.fulfill_paid_order(lifetime_order) is True
    subscription_after_lifetime = await _get_subscription(cleanup.user_id)
    assert subscription_after_lifetime is not None
    assert subscription_after_lifetime.period == "lifetime"
    assert subscription_after_lifetime.expires_at is not None
    lifetime_expires_at = subscription_after_lifetime.expires_at

    assert await order_service.fulfill_paid_order(month_order) is True

    fulfilled_month_order = await _get_order(month_order.order_no)
    assert fulfilled_month_order is not None
    assert fulfilled_month_order.callback_status == CallbackStatus.SUCCESS.value

    subscription_after_month = await _get_subscription(cleanup.user_id)
    assert subscription_after_month is not None
    assert subscription_after_month.product_id == _LIFETIME_PRODUCT_ID
    assert subscription_after_month.period == "lifetime"
    assert subscription_after_month.expires_at == lifetime_expires_at
    assert subscription_after_month.payment_method == _PAYMENT_METHOD


async def test_real_check_product_rejects_active_lifetime_user(
    real_recurring_payment_cleanup_state: _CleanupState,
) -> None:
    """有效终生用户再次下单被现有 check_product 拦截。"""

    cleanup = real_recurring_payment_cleanup_state
    lifetime_order = await order_service.create(
        _make_one_time_order(
            cleanup,
            label="le",
            product_id=_LIFETIME_PRODUCT_ID,
            period="lifetime",
        )
    )
    assert await order_service.fulfill_paid_order(lifetime_order) is True

    with pytest.raises(AppCommonException) as exc_info:
        await subscription_service.check_product(
            OrderCheckProductParam(
                user_id=cleanup.user_id,
                product_class=ProductClass.SUBSCRIPTION.value,
                product_id="unlimited",
                payment_method=_PAYMENT_METHOD,
                amount=_PAID_AMOUNT,
                currency=_PAID_CURRENCY,
                auto_renew=False,
                period="month",
            )
        )

    assert exc_info.value.code == CommonCode.INVALID_REQUEST
    assert exc_info.value.data is not None
    assert exc_info.value.data.get("reason") == "active_subscription_exists"
