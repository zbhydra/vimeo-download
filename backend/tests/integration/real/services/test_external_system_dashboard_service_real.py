"""ExternalSystemDashboardService MySQL real 测试。

真实资源依赖：
- MySQL
- orders 表
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
import uuid

import pytest
from sqlalchemy import delete, text

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_async_session, get_engine
from app.models.order_model import OrderModel
from app.services.external_system_dashboard_service import (
    ExternalCurrencyAmount,
    external_system_dashboard_service,
)
from app.utils.time import timestamp_now


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的订单。"""

    test_run_id: str
    order_nos: list[str] = field(default_factory=list)


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


@pytest.fixture
async def real_external_dashboard_schema_ready(real_mysql_ready) -> None:
    """检查外部大盘 real 测试需要的表。"""

    if not await _table_exists("orders"):
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 数据库缺少 orders 表")


@pytest.fixture
async def real_external_dashboard_cleanup_state(
    real_external_dashboard_schema_ready,
    test_run_id: str,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的订单。"""

    state = _CleanupState(test_run_id=test_run_id)
    try:
        yield state
    finally:
        if not state.order_nos:
            return
        async with get_async_session() as db:
            await db.execute(
                delete(OrderModel).where(OrderModel.order_no.in_(state.order_nos))
            )
            await db.commit()


def _amount_by_currency(
    amounts: list[ExternalCurrencyAmount],
    currency: str,
) -> ExternalCurrencyAmount | None:
    """按币种读取金额对象。"""

    for amount in amounts:
        if amount.currency == currency:
            return amount
    return None


def _make_order_no(cleanup: _CleanupState, label: str) -> str:
    """生成可清理的真实库测试订单号。"""

    safe_label = "".join(char for char in label.upper() if char.isalnum())[:6]
    order_no = f"ORDE{safe_label}{uuid.uuid4().hex[:18].upper()}"
    cleanup.order_nos.append(order_no)
    return order_no


async def _insert_dashboard_order(
    cleanup: _CleanupState,
    *,
    label: str,
    product_class: ProductClass,
    order_status: OrderStatus,
    callback_status: CallbackStatus,
    amount: int,
    currency: str,
    paid_at: int,
) -> None:
    """写入外部大盘统计测试订单。"""

    order = OrderModel(  # type: ignore[call-arg]
        order_no=_make_order_no(cleanup, label),
        user_id=9_700_000_000 + uuid.uuid4().int % 1_000_000,
        product_class=product_class.value,
        product_id=f"pytest-dashboard-{label}",
        product_name=f"pytest-dashboard-{cleanup.test_run_id}-{label}",
        amount=amount,
        currency=currency,
        order_status=order_status.value,
        callback_status=callback_status.value,
        payment_method="pytest",
        payment_channel_order_no=f"pytest-channel-{uuid.uuid4().hex}",
        paid_amount=amount,
        paid_currency=currency,
        created_at=paid_at,
        updated_at=paid_at,
        paid_at=paid_at,
        expired_at=paid_at + 3_600_000,
    )
    async with get_async_session() as db:
        db.add(order)
        await db.commit()


async def test_real_today_paid_order_stats_include_all_product_classes_and_failed_orders(
    real_external_dashboard_cleanup_state: _CleanupState,
) -> None:
    """真实 MySQL 中外部大盘不按商品类别过滤，并单独突出履约失败金额。"""

    cleanup = real_external_dashboard_cleanup_state
    now_ms = timestamp_now()
    today_start_ms = now_ms - 10_000
    tomorrow_start_ms = now_ms + 10_000
    outside_paid_at = now_ms - 20_000

    await _insert_dashboard_order(
        cleanup,
        label="credit-success-usd",
        product_class=ProductClass.RECHARGE,
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        amount=10_000_000,
        currency="USD",
        paid_at=now_ms,
    )
    await _insert_dashboard_order(
        cleanup,
        label="credit-failed-usd",
        product_class=ProductClass.RECHARGE,
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.FAILED,
        amount=20_000_000,
        currency="USD",
        paid_at=now_ms,
    )
    await _insert_dashboard_order(
        cleanup,
        label="subscription-success-usd",
        product_class=ProductClass.SUBSCRIPTION,
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        amount=30_000_000,
        currency="USD",
        paid_at=now_ms,
    )
    await _insert_dashboard_order(
        cleanup,
        label="subscription-failed-xtr",
        product_class=ProductClass.SUBSCRIPTION,
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.FAILED,
        amount=40_000_000,
        currency="XTR",
        paid_at=now_ms,
    )
    await _insert_dashboard_order(
        cleanup,
        label="pending-callback",
        product_class=ProductClass.RECHARGE,
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.PENDING,
        amount=50_000_000,
        currency="USD",
        paid_at=now_ms,
    )
    await _insert_dashboard_order(
        cleanup,
        label="other-product",
        product_class=ProductClass.OTHER,
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        amount=60_000_000,
        currency="USD",
        paid_at=now_ms,
    )
    await _insert_dashboard_order(
        cleanup,
        label="outside-range",
        product_class=ProductClass.SUBSCRIPTION,
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.FAILED,
        amount=70_000_000,
        currency="USD",
        paid_at=outside_paid_at,
    )

    stats = await external_system_dashboard_service._load_today_paid_order_stats(
        today_start_ms=today_start_ms,
        tomorrow_start_ms=tomorrow_start_ms,
    )

    usd_total = _amount_by_currency(stats.amounts, "USD")
    xtr_total = _amount_by_currency(stats.amounts, "XTR")
    usd_failed = _amount_by_currency(stats.fulfillment_failed_amounts, "USD")
    xtr_failed = _amount_by_currency(stats.fulfillment_failed_amounts, "XTR")

    assert usd_total is not None
    assert usd_total.amount == 120_000_000
    assert usd_total.display_amount == "120"
    assert xtr_total is not None
    assert xtr_total.amount == 40_000_000
    assert stats.fulfillment_failed_count == 2
    assert usd_failed is not None
    assert usd_failed.amount == 20_000_000
    assert xtr_failed is not None
    assert xtr_failed.amount == 40_000_000
