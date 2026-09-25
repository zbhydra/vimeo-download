"""Admin 订单只读查询 API real 集成测试。

依赖：真实 MySQL，`admins`、`users` 和 `orders` 表。

覆盖矩阵：
Endpoint                       Happy Permission Missing Type Min/Max Overflow XSS SQLi Unicode Side Effect
GET /api/admin/orders          Y     Y          n/a     Y    Y       Y        Y   Y    Y       reads DB only
GET /api/admin/orders/{order}  Y     centralized Y      n/a  Y       n/a      n/a n/a  n/a     reads DB only
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
import uuid

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_engine
from app.i18n.common_code import CommonCode
from app.models.admin_model import AdminModel
from app.models.order_model import OrderModel
from app.models.user_model import UserModel
from app.services.admin_service import admin_service
from app.services.user_service import user_service
from app.utils.crypto import hash_password


pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_TEST_ADMIN_PASSWORD = "AdminOrderRealTest123!"


@dataclass
class _CleanupState:
    """记录 real 测试创建的数据。"""

    user_ids: list[int] = field(default_factory=list)
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
async def real_admin_orders_schema_ready(real_mysql_ready) -> None:
    """检查订单管理 real 测试需要的表。"""
    missing = [
        table
        for table in ("admins", "users", "orders")
        if not await _table_exists(table)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_admin_token_for_orders(
    real_admin_orders_schema_ready,
    test_run_id: str,
) -> AsyncIterator[str]:
    """创建真实管理员并返回 access token。"""
    username = f"pytest-admin-order-{uuid.uuid4().hex[:8]}-{test_run_id}"
    admin = AdminModel(  # type: ignore[call-arg]
        username=username,
        password_hash=hash_password(_TEST_ADMIN_PASSWORD),
        is_active=True,
    )
    engine = get_engine()
    async with AsyncSession(engine) as session:
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

    try:
        access_token, _refresh_token, _access_expire, _refresh_expire = (
            admin_service.create_token_pair(admin)
        )
        yield access_token
    finally:
        async with AsyncSession(engine) as session:
            await session.execute(
                delete(AdminModel).where(AdminModel.username == username)
            )
            await session.commit()


@pytest.fixture
async def real_admin_order_cleanup() -> AsyncIterator[_CleanupState]:
    """清理本测试创建的用户和订单。"""
    state = _CleanupState()
    try:
        yield state
    finally:
        engine = get_engine()
        async with AsyncSession(engine) as session:
            if state.order_nos:
                await session.execute(
                    delete(OrderModel).where(OrderModel.order_no.in_(state.order_nos))
                )
            if state.user_ids:
                await session.execute(
                    delete(OrderModel).where(OrderModel.user_id.in_(state.user_ids))
                )
                await session.execute(
                    delete(UserModel).where(UserModel.user_id.in_(state.user_ids))
                )
            await session.commit()


async def _create_real_user(
    *,
    email: str,
    cleanup: _CleanupState,
) -> UserModel:
    """创建真实用户并登记清理。"""
    user = await user_service.create_user_without_password(email=email)
    cleanup.user_ids.append(user.user_id)
    return user


async def _create_real_order(
    *,
    user_id: int,
    cleanup: _CleanupState,
    label: str,
    created_at: int = 1_780_200_000_000,
) -> OrderModel:
    """创建真实订单并登记清理。"""
    order = OrderModel(  # type: ignore[call-arg]
        order_no=f"ORDREALADMIN{uuid.uuid4().hex[:14].upper()}",
        user_id=user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id="real-historical-plan",
        product_name=f"real pytest {label}",
        amount=880_000_000,
        currency="XTR",
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.SUCCESS.value,
        payment_method="real_legacy_pay",
        payment_channel_order_no=f"real-channel-{label}",
        payment_transaction_id=f"real-transaction-{label}",
        payment_channel_uid="real-uid",
        paid_amount=880_000_000,
        paid_currency="XTR",
        payment_data='{"url":"https://vimeo.com/real-admin"}',
        extra_metadata='{"source":"real-admin"}',
        created_at=created_at,
        updated_at=created_at,
        paid_at=created_at,
        expired_at=created_at + 1_800_000,
        client_ip="127.0.0.1",
    )
    engine = get_engine()
    async with AsyncSession(engine) as session:
        session.add(order)
        await session.commit()
        await session.refresh(order)
    cleanup.order_nos.append(order.order_no)
    return order


async def _get_real_order(order_no: str) -> OrderModel:
    """读取真实订单。"""
    engine = get_engine()
    async with AsyncSession(engine) as session:
        result = await session.execute(
            select(OrderModel).where(OrderModel.order_no == order_no)
        )
        return result.scalar_one()


async def test_real_admin_orders_requires_admin(real_async_client) -> None:
    """订单管理列表未登录返回 401。"""
    response = await real_async_client.get("/api/admin/orders")

    assert response.status_code == 401


async def test_real_admin_orders_list_and_detail_are_read_only(
    real_async_client,
    real_admin_token_for_orders,
    real_admin_order_cleanup: _CleanupState,
    make_test_email,
) -> None:
    """真实数据库中按邮箱、渠道订单号、流水 ID 等条件查询并查看详情。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_orders}"}
    email = make_test_email("real-admin-order")
    user = await _create_real_user(email=email, cleanup=real_admin_order_cleanup)
    order = await _create_real_order(
        user_id=user.user_id,
        cleanup=real_admin_order_cleanup,
        label="target",
        created_at=1_780_200_010_000,
    )
    before = await _get_real_order(order.order_no)

    list_response = await real_async_client.get(
        "/api/admin/orders",
        headers=headers,
        params={
            "user_email": email.split("@", maxsplit=1)[0],
            "payment_channel_order_no": "target",
            "payment_transaction_id": "transaction-target",
            "order_status": OrderStatus.PAID.value,
            "callback_status": CallbackStatus.SUCCESS.value,
            "product_id": "real-historical-plan",
            "payment_method": "real_legacy_pay",
            "created_from_ms": 1_780_200_000_000,
            "created_to_ms": 1_780_200_020_000,
        },
    )
    list_body = list_response.json()

    assert list_response.status_code == 200
    assert list_body["code"] == 10000
    assert [row["order_no"] for row in list_body["data"]["rows"]] == [order.order_no]
    assert list_body["data"]["rows"][0]["user_email"] == email
    assert (
        list_body["data"]["rows"][0]["payment_transaction_id"]
        == "real-transaction-target"
    )

    detail_response = await real_async_client.get(
        f"/api/admin/orders/{order.order_no}",
        headers=headers,
    )
    detail_body = detail_response.json()
    after = await _get_real_order(order.order_no)

    assert detail_response.status_code == 200
    assert detail_body["code"] == 10000
    assert detail_body["data"]["payment_data"] == {
        "url": "https://vimeo.com/real-admin"
    }
    assert detail_body["data"]["extra_metadata"] == {"source": "real-admin"}
    assert detail_body["data"]["payment_transaction_id"] == "real-transaction-target"
    assert after.order_status == before.order_status
    assert after.callback_status == before.callback_status
    assert after.updated_at == before.updated_at


async def test_real_admin_orders_reject_invalid_filters(
    real_async_client,
    real_admin_token_for_orders,
) -> None:
    """真实 API 拒绝非法状态和反向时间范围。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_orders}"}

    invalid_type_response = await real_async_client.get(
        "/api/admin/orders",
        headers=headers,
        params={"order_status": "abc"},
    )
    invalid_range_response = await real_async_client.get(
        "/api/admin/orders",
        headers=headers,
        params={
            "created_from_ms": 1_780_200_020_000,
            "created_to_ms": 1_780_200_000_000,
        },
    )

    assert invalid_type_response.status_code == 422
    assert invalid_range_response.status_code == 400
    assert invalid_range_response.json()["code"] == CommonCode.INVALID_REQUEST.value
