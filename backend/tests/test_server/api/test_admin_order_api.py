"""Admin 订单只读查询 API 测试。"""

import uuid

import pytest
from sqlalchemy import select

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_async_session
from app.i18n.common_code import CommonCode
from app.main import app
from app.models.order_model import OrderModel
from app.services.user_service import user_service


async def _override_admin_user() -> AdminContext:
    """测试用管理员上下文。"""
    return AdminContext(admin_id=1, username="pytest-admin", token="token")


async def _create_user(label: str, make_test_email) -> tuple[int, str]:
    """创建测试用户并返回 user_id 和邮箱。"""
    email = make_test_email(label)
    user = await user_service.create_user_without_password(email=email)
    return user.user_id, email


async def _create_order(
    *,
    user_id: int,
    label: str,
    order_status: OrderStatus = OrderStatus.PENDING,
    callback_status: CallbackStatus = CallbackStatus.NOT_CALLED,
    product_id: str = "month",
    payment_method: str = "clink",
    channel_order_no: str | None = None,
    created_at: int = 1_780_100_000_000,
) -> OrderModel:
    """创建测试订单。"""
    order = OrderModel(  # type: ignore[call-arg]
        order_no=f"ORDADMINAPI{uuid.uuid4().hex[:16].upper()}",
        user_id=user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id=product_id,
        product_name=f"pytest {label}",
        amount=660_000_000,
        currency="USD",
        order_status=order_status.value,
        callback_status=callback_status.value,
        payment_method=payment_method,
        payment_channel_order_no=channel_order_no,
        payment_channel_uid="uid-admin-api",
        paid_amount=660_000_000 if order_status == OrderStatus.PAID else None,
        paid_currency="USD" if order_status == OrderStatus.PAID else None,
        payment_data='{"url":"https://vimeo.com/admin-api"}',
        extra_metadata='{"source":"admin-api"}',
        created_at=created_at,
        updated_at=created_at + 1000,
        paid_at=created_at + 2000 if order_status == OrderStatus.PAID else None,
        expired_at=created_at + 1_800_000,
        client_ip="127.0.0.1",
    )
    async with get_async_session() as db:
        db.add(order)
        await db.commit()
        await db.refresh(order)
    return order


async def _get_order(order_no: str) -> OrderModel:
    """从数据库读取订单。"""
    async with get_async_session() as db:
        result = await db.execute(
            select(OrderModel).where(OrderModel.order_no == order_no)
        )
        return result.scalar_one()


@pytest.fixture
async def admin_order_api_auth():
    """安装 admin 鉴权 override。"""
    app.dependency_overrides[get_admin_user] = _override_admin_user
    yield
    app.dependency_overrides.pop(get_admin_user, None)


@pytest.mark.asyncio
async def test_admin_orders_requires_admin(async_client) -> None:
    """订单管理列表需要管理员登录。"""
    response = await async_client.get("/api/admin/orders")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_orders_searches_current_email_then_orders(
    async_client,
    admin_order_api_auth,
    make_test_email,
) -> None:
    """邮箱筛选先查 users.email 得到 user_id，再查订单。"""
    user_id, email = await _create_user("admin-order-email", make_test_email)
    other_user_id, _other_email = await _create_user(
        "admin-order-other", make_test_email
    )
    order = await _create_order(
        user_id=user_id,
        label="email",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        product_id="historical-plan",
        payment_method="legacy_pay",
        channel_order_no="channel-email-target",
        created_at=1_780_100_010_000,
    )
    await _create_order(
        user_id=other_user_id,
        label="other",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        product_id="historical-plan",
        payment_method="legacy_pay",
        channel_order_no="channel-email-other",
        created_at=1_780_100_020_000,
    )

    response = await async_client.get(
        "/api/admin/orders",
        params={
            "user_email": email.split("@", maxsplit=1)[0],
            "payment_channel_order_no": "target",
            "order_status": OrderStatus.PAID.value,
            "callback_status": CallbackStatus.SUCCESS.value,
            "product_id": "historical-plan",
            "payment_method": "legacy_pay",
            "created_from_ms": 1_780_100_000_000,
            "created_to_ms": 1_780_100_015_000,
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["total"] == 1
    assert [row["order_no"] for row in body["data"]["rows"]] == [order.order_no]
    assert body["data"]["rows"][0]["user_email"] == email


@pytest.mark.asyncio
async def test_admin_orders_user_id_and_email_intersection_empty(
    async_client,
    admin_order_api_auth,
    make_test_email,
) -> None:
    """同时传 user_id 和邮箱时按交集查询，不相交直接空结果。"""
    user_id, _email = await _create_user("admin-order-user-id", make_test_email)
    _other_user_id, other_email = await _create_user(
        "admin-order-email-other",
        make_test_email,
    )
    await _create_order(user_id=user_id, label="intersection")

    response = await async_client.get(
        "/api/admin/orders",
        params={"user_id": user_id, "user_email": other_email},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == {"rows": [], "total": 0, "page": 1, "page_size": 50}


@pytest.mark.asyncio
async def test_admin_order_detail_returns_read_only_order(
    async_client,
    admin_order_api_auth,
    make_test_email,
) -> None:
    """订单详情返回完整只读字段，不修改订单。"""
    user_id, email = await _create_user("admin-order-detail", make_test_email)
    order = await _create_order(
        user_id=user_id,
        label="detail",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        channel_order_no="channel-detail-001",
    )
    before = await _get_order(order.order_no)

    response = await async_client.get(f"/api/admin/orders/{order.order_no}")
    body = response.json()
    after = await _get_order(order.order_no)

    assert response.status_code == 200
    assert body["code"] == 10000
    data = body["data"]
    assert data["order_no"] == order.order_no
    assert data["user_email"] == email
    assert data["payment_data"] == {"url": "https://vimeo.com/admin-api"}
    assert data["extra_metadata"] == {"source": "admin-api"}
    assert data["payment_channel_order_no"] == "channel-detail-001"
    assert after.order_status == before.order_status
    assert after.callback_status == before.callback_status
    assert after.updated_at == before.updated_at


@pytest.mark.asyncio
async def test_admin_order_detail_not_found_returns_order_error(
    async_client,
    admin_order_api_auth,
) -> None:
    """不存在的订单详情返回 ORDER_NOT_FOUND。"""
    response = await async_client.get("/api/admin/orders/ORD-NOT-FOUND")
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == CommonCode.ORDER_NOT_FOUND.value
    assert body["data"] == {"order_no": "ORD-NOT-FOUND"}


@pytest.mark.asyncio
async def test_admin_orders_reject_invalid_filters(
    async_client,
    admin_order_api_auth,
) -> None:
    """非法状态和时间范围返回 INVALID_REQUEST。"""
    invalid_status_response = await async_client.get(
        "/api/admin/orders",
        params={"order_status": 999},
    )
    invalid_range_response = await async_client.get(
        "/api/admin/orders",
        params={
            "created_from_ms": 1_780_100_100_000,
            "created_to_ms": 1_780_100_000_000,
        },
    )

    assert invalid_status_response.status_code == 400
    assert invalid_status_response.json()["code"] == CommonCode.INVALID_REQUEST.value
    assert invalid_range_response.status_code == 400
    assert invalid_range_response.json()["code"] == CommonCode.INVALID_REQUEST.value
