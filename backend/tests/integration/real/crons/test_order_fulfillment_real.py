"""订单履约补偿 cron MySQL real 测试。

真实资源依赖：
- MySQL
- orders 表
- user_subscriptions 表
- user_credit_accounts / user_credit_logs 表
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
import json
from typing import Any, cast
import uuid

import pytest
from sqlalchemy import delete, select, text

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_async_session, get_engine
from app.models.order_model import OrderModel
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.services.order_service import order_service
from app.utils.time import timestamp_now


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass
class _CleanupState:
    """记录本文件创建的订单和订阅。"""

    test_run_id: str
    order_nos: list[str] = field(default_factory=list)
    user_ids: list[int] = field(default_factory=list)


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
async def real_order_fulfillment_schema_ready(real_mysql_ready) -> None:
    """检查订单履约补偿 real 测试需要的表。"""
    missing_tables = []
    for table_name in (
        "orders",
        "user_credit_accounts",
        "user_credit_logs",
        "user_subscriptions",
    ):
        if not await _table_exists(table_name):
            missing_tables.append(table_name)
    if missing_tables:
        pytest.skip(
            "REAL_SCHEMA_UNAVAILABLE: 数据库缺少 "
            f"{','.join(sorted(missing_tables))} 表"
        )


@pytest.fixture
async def real_order_fulfillment_cleanup_state(
    real_order_fulfillment_schema_ready,
    test_run_id: str,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的订单和订阅。"""
    state = _CleanupState(test_run_id=test_run_id)
    yield state

    async with get_async_session() as db:
        if state.user_ids:
            await db.execute(
                delete(UserCreditLogModel).where(
                    UserCreditLogModel.user_id.in_(state.user_ids)
                )
            )
            await db.execute(
                delete(UserCreditAccountModel).where(
                    UserCreditAccountModel.user_id.in_(state.user_ids)
                )
            )
            subscription_table = cast(Any, UserSubscriptionModel).__table__
            await db.execute(
                delete(UserSubscriptionModel).where(
                    subscription_table.c.user_id.in_(state.user_ids)
                ),
            )
        if state.order_nos:
            await db.execute(
                delete(OrderModel).where(OrderModel.order_no.in_(state.order_nos))
            )
        await db.commit()


def _make_user_id(cleanup: _CleanupState) -> int:
    """生成可清理的真实库测试用户 ID。"""
    user_id = 9_800_000_000 + uuid.uuid4().int % 1_000_000
    cleanup.user_ids.append(user_id)
    return user_id


def _make_order_no(cleanup: _CleanupState, label: str) -> str:
    """生成可清理的真实库测试订单号。"""
    safe_label = "".join(char for char in label.upper() if char.isalnum())[:6]
    order_no = f"ORDF{safe_label}{uuid.uuid4().hex[:18].upper()}"
    cleanup.order_nos.append(order_no)
    return order_no


async def _insert_order(
    cleanup: _CleanupState,
    *,
    label: str,
    order_status: OrderStatus,
    callback_status: CallbackStatus,
    product_class: ProductClass,
    updated_at: int,
) -> OrderModel:
    """写入订单履约补偿扫描测试订单。"""
    now_ms = timestamp_now()
    order = OrderModel(  # type: ignore[call-arg]
        order_no=_make_order_no(cleanup, label),
        user_id=_make_user_id(cleanup),
        product_class=product_class.value,
        product_id="unlimited",
        product_name=f"pytest-order-fulfillment-{cleanup.test_run_id}-{label}",
        amount=950_000_000,
        currency="XTR",
        order_status=order_status.value,
        callback_status=callback_status.value,
        payment_method="telegram_stars",
        paid_amount=950_000_000,
        paid_currency="XTR",
        created_at=updated_at,
        updated_at=updated_at,
        paid_at=updated_at,
        expired_at=now_ms + 3_600_000,
    )
    async with get_async_session() as db:
        db.add(order)
        await db.commit()
        await db.refresh(order)
    return order


async def test_real_order_fulfillment_scan_filters_stale_paid_pending_orders(
    real_order_fulfillment_cleanup_state: _CleanupState,
) -> None:
    """真实 MySQL 上只扫描滞留 PAID + PENDING/FAILED + 可履约商品订单。"""
    cleanup = real_order_fulfillment_cleanup_state
    now_ms = timestamp_now()
    stale_order = await _insert_order(
        cleanup,
        label="stale",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.PENDING,
        product_class=ProductClass.SUBSCRIPTION,
        updated_at=now_ms - 120_000,
    )
    fresh_order = await _insert_order(
        cleanup,
        label="fresh",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.PENDING,
        product_class=ProductClass.SUBSCRIPTION,
        updated_at=now_ms - 10_000,
    )
    failed_order = await _insert_order(
        cleanup,
        label="failed",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.FAILED,
        product_class=ProductClass.SUBSCRIPTION,
        updated_at=now_ms - 120_000,
    )
    recharge_order = await _insert_order(
        cleanup,
        label="recharge",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.PENDING,
        product_class=ProductClass.RECHARGE,
        updated_at=now_ms - 120_000,
    )
    non_subscription_order = await _insert_order(
        cleanup,
        label="other",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.PENDING,
        product_class=ProductClass.OTHER,
        updated_at=now_ms - 120_000,
    )
    unpaid_order = await _insert_order(
        cleanup,
        label="unpaid",
        order_status=OrderStatus.PENDING,
        callback_status=CallbackStatus.PENDING,
        product_class=ProductClass.SUBSCRIPTION,
        updated_at=now_ms - 120_000,
    )

    scanned_orders = await order_service.order_lists(
        order_statuses=[OrderStatus.PAID],
        callback_statuses=[CallbackStatus.PENDING, CallbackStatus.FAILED],
        product_classes=[ProductClass.SUBSCRIPTION, ProductClass.RECHARGE],
        updated_before_ms=timestamp_now() - 60_000,
        limit=20,
        order_by="updated_at_asc",
    )
    scanned_order_nos = {order.order_no for order in scanned_orders}

    assert stale_order.order_no in scanned_order_nos
    assert fresh_order.order_no not in scanned_order_nos
    assert failed_order.order_no in scanned_order_nos
    assert recharge_order.order_no in scanned_order_nos
    assert non_subscription_order.order_no not in scanned_order_nos
    assert unpaid_order.order_no not in scanned_order_nos


async def test_real_recharge_fulfillment_creates_account_and_is_idempotent(
    real_order_fulfillment_cleanup_state: _CleanupState,
) -> None:
    """真实 MySQL 上 RECHARGE 订单履约会补建账户，重复补偿不重复加积分。"""

    cleanup = real_order_fulfillment_cleanup_state
    now_ms = timestamp_now()
    user_id = _make_user_id(cleanup)
    order_no = _make_order_no(cleanup, "credit")
    order = OrderModel(  # type: ignore[call-arg]
        order_no=order_no,
        user_id=user_id,
        product_class=ProductClass.RECHARGE.value,
        product_id="credit_200",
        product_name=f"pytest-credit-200-{cleanup.test_run_id}",
        amount=850_000_000,
        currency="XTR",
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.PENDING.value,
        payment_method="telegram_stars",
        paid_amount=850_000_000,
        paid_currency="XTR",
        extra_metadata=json.dumps(
            {
                "product_snapshot": {
                    "credits_amount": 200,
                    "provider_sku": "credit-200-telegram-stars",
                }
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        created_at=now_ms,
        updated_at=now_ms - 120_000,
        paid_at=now_ms - 120_000,
        expired_at=now_ms + 3_600_000,
    )
    async with get_async_session() as db:
        db.add(order)
        await db.commit()
        await db.refresh(order)

    first_result = await order_service.fulfill_paid_order(order)
    second_result = await order_service.fulfill_paid_order(order)

    async with get_async_session() as db:
        saved_order = await db.scalar(
            select(OrderModel).where(OrderModel.order_no == order_no)
        )
        account = await db.scalar(
            select(UserCreditAccountModel).where(
                UserCreditAccountModel.user_id == user_id
            )
        )
        logs = list(
            (
                await db.execute(
                    select(UserCreditLogModel).where(
                        UserCreditLogModel.user_id == user_id,
                        UserCreditLogModel.reason == "recharge_purchase",
                    )
                )
            )
            .scalars()
            .all()
        )

    assert first_result is True
    assert second_result is True
    assert saved_order is not None
    assert saved_order.callback_status == CallbackStatus.SUCCESS.value
    assert account is not None
    assert account.balance == 200
    assert len(logs) == 1
    assert logs[0].change_amount == 200
    assert logs[0].reason == "recharge_purchase"
