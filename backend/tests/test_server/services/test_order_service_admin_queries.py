"""订单 service 管理后台查询能力测试。"""

import uuid

import pytest
from sqlalchemy import delete

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_async_session
from app.models.order_model import OrderModel
from app.services.order_service import order_service
from app.services.user_service import user_service


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
    order_status: OrderStatus = OrderStatus.PENDING,
    callback_status: CallbackStatus = CallbackStatus.NOT_CALLED,
    product_id: str = "month",
    payment_method: str = "telegram_stars",
    channel_order_no: str | None = None,
    created_at: int = 1_780_000_000_000,
) -> OrderModel:
    """创建一条可筛选的订单记录。"""
    order_no = f"ORDADMIN{uuid.uuid4().hex[:18].upper()}"
    order = OrderModel(  # type: ignore[call-arg]
        order_no=order_no,
        user_id=user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id=product_id,
        product_name=f"pytest {label}",
        amount=990_000_000,
        currency="XTR",
        order_status=order_status.value,
        callback_status=callback_status.value,
        payment_method=payment_method,
        payment_channel_order_no=channel_order_no,
        payment_data='{"url":"https://vimeo.com/pytest"}',
        extra_metadata='{"source":"pytest"}',
        expired_at=created_at + 1_800_000,
        created_at=created_at,
        updated_at=created_at,
    )
    async with get_async_session() as db:
        db.add(order)
        await db.commit()
        await db.refresh(order)
    return order


@pytest.mark.asyncio
async def test_order_lists_and_count_share_admin_filters(make_test_email) -> None:
    """订单列表和 count 使用同一套订单号、渠道号、状态、商品、支付方式条件。"""
    user_id = await _create_user("order-admin-query", make_test_email)
    matched = await _create_order(
        user_id=user_id,
        label="matched",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        product_id="legacy-plan",
        payment_method="legacy_pay",
        channel_order_no="ch-admin-target-001",
        created_at=1_780_000_100_000,
    )
    await _create_order(
        user_id=user_id,
        label="other",
        order_status=OrderStatus.PENDING,
        callback_status=CallbackStatus.NOT_CALLED,
        product_id="legacy-plan",
        payment_method="legacy_pay",
        channel_order_no="ch-admin-target-002",
        created_at=1_780_000_200_000,
    )

    filters = {
        "user_ids": [user_id],
        "order_no_like": matched.order_no[-10:],
        "payment_channel_order_no_like": "target-001",
        "order_statuses": [OrderStatus.PAID],
        "callback_statuses": [CallbackStatus.SUCCESS],
        "product_ids": ["legacy-plan"],
        "payment_methods": ["legacy_pay"],
        "created_after_ms": 1_780_000_000_000,
        "created_before_ms": 1_780_000_150_000,
    }

    rows = await order_service.order_lists(**filters, limit=10)
    total = await order_service.count_orders(**filters)

    assert [row.order_no for row in rows] == [matched.order_no]
    assert total == 1


@pytest.mark.asyncio
async def test_order_lists_like_filters_escape_wildcards(make_test_email) -> None:
    """LIKE 包含搜索把 % 和 _ 当作普通字符处理。"""
    user_id = await _create_user("order-admin-like", make_test_email)
    literal_channel_order_no = "channel_%_literal"
    order = await _create_order(
        user_id=user_id,
        label="literal",
        channel_order_no=literal_channel_order_no,
    )
    await _create_order(
        user_id=user_id,
        label="plain",
        channel_order_no="channel-plain-literal",
    )

    wildcard_rows = await order_service.order_lists(
        user_ids=[user_id],
        payment_channel_order_no_like="%",
        limit=10,
    )
    literal_rows = await order_service.order_lists(
        user_ids=[user_id],
        payment_channel_order_no_like="_%_",
        limit=10,
    )

    assert [row.order_no for row in wildcard_rows] == [order.order_no]
    assert [row.order_no for row in literal_rows] == [order.order_no]


@pytest.mark.asyncio
async def test_user_lists_email_like_supports_two_step_order_search(
    make_test_email,
) -> None:
    """用户 service 可按当前邮箱 contains 查出 user_id。"""
    email = make_test_email("order-email-search")
    user = await user_service.create_user_without_password(email=email)

    try:
        rows = await user_service.user_lists(email_like=email.split("@", maxsplit=1)[0])

        assert [row.user_id for row in rows] == [user.user_id]
    finally:
        async with get_async_session() as db:
            await db.execute(
                delete(OrderModel).where(OrderModel.user_id == user.user_id)
            )
            await db.commit()
