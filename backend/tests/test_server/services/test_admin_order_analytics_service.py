"""Admin 订单统计聚合服务测试。"""

from datetime import datetime
import uuid
from zoneinfo import ZoneInfo

import pytest

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_async_session
from app.models.order_model import OrderModel
from app.services.admin_order_analytics_service import (
    AdminOrderCurrencyAmount,
    admin_order_analytics_service,
)
from app.services.user_service import user_service

UTC_PLUS_8 = ZoneInfo("Asia/Shanghai")


def _local_timestamp(
    year: int,
    month: int,
    day: int,
    hour: int = 0,
    minute: int = 0,
) -> int:
    """把 Asia/Shanghai 本地时间转换为毫秒时间戳。"""
    return int(
        datetime(
            year,
            month,
            day,
            hour,
            minute,
            tzinfo=UTC_PLUS_8,
        ).timestamp()
        * 1000
    )


async def _create_user(label: str, make_test_email) -> int:
    """创建测试用户并返回 user_id。"""
    user = await user_service.create_user_without_password(
        email=make_test_email(label),
        full_name=f"pytest {label}",
    )
    return user.user_id


async def _create_order(
    *,
    user_id: int,
    label: str,
    order_status: OrderStatus,
    product_id: str,
    amount: int,
    currency: str,
    created_at: int,
) -> None:
    """创建一条订单统计测试数据。"""
    order = OrderModel(  # type: ignore[call-arg]
        order_no=f"ORDANALYT{uuid.uuid4().hex[:20].upper()}",
        user_id=user_id,
        product_class=ProductClass.RECHARGE.value,
        product_id=product_id,
        product_name=f"pytest analytics {label}",
        amount=amount,
        currency=currency,
        order_status=order_status.value,
        callback_status=(
            CallbackStatus.SUCCESS.value
            if order_status == OrderStatus.PAID
            else CallbackStatus.NOT_CALLED.value
        ),
        payment_method="pytest",
        payment_channel_order_no=f"pytest-channel-{uuid.uuid4().hex}",
        paid_amount=amount if order_status == OrderStatus.PAID else None,
        paid_currency=currency if order_status == OrderStatus.PAID else None,
        created_at=created_at,
        updated_at=created_at,
        paid_at=created_at if order_status == OrderStatus.PAID else None,
        expired_at=created_at + 1_800_000,
    )
    async with get_async_session() as db:
        db.add(order)
        await db.commit()


def _amount_by_currency(
    amounts: list[AdminOrderCurrencyAmount],
    currency: str,
) -> AdminOrderCurrencyAmount | None:
    """按币种读取金额对象。"""
    for amount in amounts:
        if amount.currency == currency:
            return amount
    return None


@pytest.mark.asyncio
async def test_order_analytics_groups_daily_recharge_by_utc_plus_8_day_and_currency(
    make_test_email,
) -> None:
    """每日充值按 +8 日期分桶，并分别统计成功/全部的多币种金额。"""
    user_id = await _create_user("order-analytics-daily", make_test_email)
    from_ms = _local_timestamp(2100, 1, 1, 0, 0)
    to_ms = _local_timestamp(2100, 1, 1, 23, 59)

    await _create_order(
        user_id=user_id,
        label="paid-xtr",
        order_status=OrderStatus.PAID,
        product_id="credits-100",
        amount=10_000_000,
        currency="XTR",
        created_at=_local_timestamp(2100, 1, 1, 0, 30),
    )
    await _create_order(
        user_id=user_id,
        label="paid-usd",
        order_status=OrderStatus.PAID,
        product_id="unlimited",
        amount=20_000_000,
        currency="USD",
        created_at=_local_timestamp(2100, 1, 1, 12, 0),
    )
    await _create_order(
        user_id=user_id,
        label="pending-usd",
        order_status=OrderStatus.PENDING,
        product_id="unlimited",
        amount=15_300_000,
        currency="USD",
        created_at=_local_timestamp(2100, 1, 1, 13, 0),
    )
    await _create_order(
        user_id=user_id,
        label="outside",
        order_status=OrderStatus.PAID,
        product_id="credits-100",
        amount=99_000_000,
        currency="USD",
        created_at=_local_timestamp(2100, 1, 2, 0, 1),
    )

    rows = await admin_order_analytics_service.get_daily_recharge(
        from_ms=from_ms,
        to_ms=to_ms,
    )

    assert len(rows) == 1
    row = rows[0]
    assert row.date == "2100-01-01"
    assert row.success_count == 2
    assert row.success_user_count == 1
    assert row.total_count == 3
    assert row.total_user_count == 1
    assert _amount_by_currency(row.success_amounts, "USD") == (
        AdminOrderCurrencyAmount("USD", 20_000_000, "20")
    )
    assert _amount_by_currency(row.success_amounts, "XTR") == (
        AdminOrderCurrencyAmount("XTR", 10_000_000, "10")
    )
    assert _amount_by_currency(row.total_amounts, "USD") == (
        AdminOrderCurrencyAmount("USD", 35_300_000, "35.3")
    )
    assert _amount_by_currency(row.total_amounts, "XTR") == (
        AdminOrderCurrencyAmount("XTR", 10_000_000, "10")
    )


@pytest.mark.asyncio
async def test_order_analytics_groups_product_statistics_by_day_and_product(
    make_test_email,
) -> None:
    """商品统计按 +8 日期和商品 ID 聚合，金额仍按币种拆分。"""
    user_id = await _create_user("order-analytics-product", make_test_email)
    from_ms = _local_timestamp(2101, 2, 3, 0, 0)
    to_ms = _local_timestamp(2101, 2, 3, 23, 59)

    await _create_order(
        user_id=user_id,
        label="credits-paid-xtr",
        order_status=OrderStatus.PAID,
        product_id="credits-100",
        amount=10_000_000,
        currency="XTR",
        created_at=_local_timestamp(2101, 2, 3, 8, 0),
    )
    await _create_order(
        user_id=user_id,
        label="credits-pending-xtr",
        order_status=OrderStatus.PENDING,
        product_id="credits-100",
        amount=5_000_000,
        currency="XTR",
        created_at=_local_timestamp(2101, 2, 3, 9, 0),
    )
    await _create_order(
        user_id=user_id,
        label="credits-paid-usd",
        order_status=OrderStatus.PAID,
        product_id="credits-100",
        amount=1_500_000,
        currency="USD",
        created_at=_local_timestamp(2101, 2, 3, 10, 0),
    )
    await _create_order(
        user_id=user_id,
        label="unlimited-paid",
        order_status=OrderStatus.PAID,
        product_id="unlimited",
        amount=20_000_000,
        currency="USD",
        created_at=_local_timestamp(2101, 2, 3, 11, 0),
    )

    rows = await admin_order_analytics_service.get_product_statistics(
        from_ms=from_ms,
        to_ms=to_ms,
    )
    row_by_product = {row.product_id: row for row in rows}

    credits = row_by_product["credits-100"]
    assert credits.date == "2101-02-03"
    assert credits.success_count == 2
    assert credits.success_user_count == 1
    assert credits.total_count == 3
    assert credits.total_user_count == 1
    assert _amount_by_currency(credits.success_amounts, "USD") == (
        AdminOrderCurrencyAmount("USD", 1_500_000, "1.5")
    )
    assert _amount_by_currency(credits.success_amounts, "XTR") == (
        AdminOrderCurrencyAmount("XTR", 10_000_000, "10")
    )
    assert _amount_by_currency(credits.total_amounts, "XTR") == (
        AdminOrderCurrencyAmount("XTR", 15_000_000, "15")
    )

    unlimited = row_by_product["unlimited"]
    assert unlimited.success_count == 1
    assert unlimited.success_user_count == 1
    assert unlimited.total_count == 1
    assert unlimited.total_user_count == 1
    assert _amount_by_currency(unlimited.total_amounts, "USD") == (
        AdminOrderCurrencyAmount("USD", 20_000_000, "20")
    )
