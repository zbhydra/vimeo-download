"""Admin 通用用户信息弹窗 API 测试。"""

from __future__ import annotations

import uuid

import pytest

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.constants.client_product import ClientProductEnum
from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_async_session
from app.i18n.common_code import CommonCode
from app.main import app
from app.models.order_model import OrderModel
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_download_record_model import UserDownloadRecordModel
from app.services.user_credit_service import user_credit_service
from app.services.user_service import user_service
from app.utils.time import timestamp_now


async def _override_admin_user() -> AdminContext:
    """测试用管理员上下文。"""
    return AdminContext(admin_id=1, username="pytest-admin", token="token")


@pytest.fixture
async def admin_user_api_auth():
    """安装 admin 鉴权 override。"""
    app.dependency_overrides[get_admin_user] = _override_admin_user
    yield
    app.dependency_overrides.pop(get_admin_user, None)


async def _create_user(label: str, make_test_email) -> tuple[int, str]:
    """创建测试用户并返回 user_id 和邮箱。"""
    email = make_test_email(label)
    user = await user_service.create_user_without_password(
        email=email,
        full_name=f"pytest {label}",
        register_source=ClientProductEnum.WEB,
        register_method="email_code",
        register_ip="1.2.3.4",
        register_country="US",
    )
    return user.user_id, email


async def _create_subscription(user_id: int, expires_at: int) -> None:
    """写入用户订阅原始过期时间。"""
    subscription = UserSubscriptionModel(  # type: ignore[call-arg]
        user_id=user_id,
        expires_at=expires_at,
        created_at=timestamp_now(),
        updated_at=timestamp_now(),
    )
    async with get_async_session() as db:
        db.add(subscription)
        await db.commit()


async def _create_download_record(
    *,
    user_id: int,
    source_id: str,
    created_at: int,
    credits_cost: int,
) -> int:
    """创建下载记录并返回主键。"""
    record = UserDownloadRecordModel(  # type: ignore[call-arg]
        user_id=user_id,
        resource_key=uuid.uuid4().hex,
        platform="vimeo",
        canonical_link=f"https://x.com/i/status/{source_id}",
        source_id=source_id,
        filename=f"{source_id}.mp4",
        size_bytes=1024,
        credits_cost=credits_cost,
        created_at=created_at,
    )
    async with get_async_session() as db:
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record.id


async def _create_order(
    *,
    user_id: int,
    label: str,
    order_status: OrderStatus,
    callback_status: CallbackStatus,
    created_at: int,
) -> OrderModel:
    """创建用户订单。"""
    order = OrderModel(  # type: ignore[call-arg]
        order_no=f"ORDUSERAPI{uuid.uuid4().hex[:16].upper()}",
        user_id=user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id="pytest-plan",
        product_name=f"pytest {label}",
        amount=990_000_000,
        currency="XTR",
        order_status=order_status.value,
        callback_status=callback_status.value,
        payment_method="pytest_pay",
        payment_channel_order_no=f"channel-{label}",
        payment_channel_uid="uid-user-api",
        paid_amount=990_000_000 if order_status == OrderStatus.PAID else None,
        paid_currency="XTR" if order_status == OrderStatus.PAID else None,
        payment_data='{"url":"https://vimeo.com/user-api"}',
        extra_metadata='{"source":"admin-user-api"}',
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


@pytest.mark.asyncio
async def test_admin_user_profile_requires_admin(async_client) -> None:
    """用户信息接口需要管理员登录。"""
    response = await async_client.get("/api/admin/users/1/profile")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_user_profile_returns_basic_credits_and_expired_subscription(
    async_client,
    admin_user_api_auth,
    make_test_email,
) -> None:
    """profile 返回基础信息、Credits 余额和已过期订阅原始时间。"""
    user_id, email = await _create_user("admin-user-profile", make_test_email)
    expired_at = timestamp_now() - 1000
    await _create_subscription(user_id, expired_at)
    await user_credit_service.add_balance(
        user_id=user_id,
        amount=18,
        reason="pytest_admin_user_profile",
    )

    response = await async_client.get(f"/api/admin/users/{user_id}/profile")
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    data = body["data"]
    assert data["user"]["user_id"] == user_id
    assert data["user"]["email"] == email
    assert data["user"]["register_source"] == ClientProductEnum.WEB.value
    assert data["user"]["register_ip"] == "1.2.3.4"
    assert data["user"]["register_country"] == "US"
    assert data["user"]["account_status"] == "normal"
    assert data["credits"]["balance"] == 18
    assert data["subscription"] == {
        "has_subscription": False,
        "expires_at": expired_at,
    }


@pytest.mark.asyncio
async def test_admin_user_profile_not_found_returns_user_error(
    async_client,
    admin_user_api_auth,
) -> None:
    """不存在用户返回 USER_NOT_FOUND。"""
    response = await async_client.get("/api/admin/users/999999999/profile")
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == CommonCode.USER_NOT_FOUND.value
    assert body["data"] == {"user_id": 999999999}


@pytest.mark.asyncio
async def test_admin_user_downloads_are_paginated_by_recent_records(
    async_client,
    admin_user_api_auth,
    make_test_email,
) -> None:
    """下载记录按 created_at desc, id desc 分页。"""
    user_id, _email = await _create_user("admin-user-downloads", make_test_email)
    first_id = await _create_download_record(
        user_id=user_id,
        source_id="old",
        created_at=1_780_300_000_000,
        credits_cost=1,
    )
    second_id = await _create_download_record(
        user_id=user_id,
        source_id="same-time-a",
        created_at=1_780_300_100_000,
        credits_cost=0,
    )
    third_id = await _create_download_record(
        user_id=user_id,
        source_id="same-time-b",
        created_at=1_780_300_100_000,
        credits_cost=2,
    )

    page_one_response = await async_client.get(
        f"/api/admin/users/{user_id}/downloads",
        params={"page": 1, "page_size": 2},
    )
    page_two_response = await async_client.get(
        f"/api/admin/users/{user_id}/downloads",
        params={"page": 2, "page_size": 2},
    )

    page_one = page_one_response.json()["data"]
    page_two = page_two_response.json()["data"]

    assert page_one_response.status_code == 200
    assert page_one["total"] == 3
    assert [row["id"] for row in page_one["rows"]] == [third_id, second_id]
    assert page_one["rows"][0]["credits_cost"] == 2
    assert page_two_response.status_code == 200
    assert [row["id"] for row in page_two["rows"]] == [first_id]


@pytest.mark.asyncio
async def test_admin_user_credits_are_paginated_by_id_desc(
    async_client,
    admin_user_api_auth,
    make_test_email,
) -> None:
    """积分记录按流水 ID 倒序分页。"""
    user_id, _email = await _create_user("admin-user-credits", make_test_email)
    first = await user_credit_service.add_balance(
        user_id=user_id,
        amount=10,
        reason="registration_bonus",
    )
    second = await user_credit_service.cut_balance(
        user_id=user_id,
        amount=2,
        reason="download_charge",
        resource_key="0123456789abcdef0123456789abcdef",
        metadata_json='{"platform":"vimeo"}',
    )
    third = await user_credit_service.add_balance(
        user_id=user_id,
        amount=5,
        reason="checkin_reward",
    )

    page_one_response = await async_client.get(
        f"/api/admin/users/{user_id}/credits",
        params={"page": 1, "page_size": 2},
    )
    page_two_response = await async_client.get(
        f"/api/admin/users/{user_id}/credits",
        params={"page": 2, "page_size": 2},
    )
    page_one = page_one_response.json()
    page_two = page_two_response.json()

    assert page_one_response.status_code == 200
    assert page_one["code"] == 10000
    assert page_one["data"]["total"] == 3
    assert [row["id"] for row in page_one["data"]["rows"]] == [
        third.credit_log_id,
        second.credit_log_id,
    ]
    assert page_one["data"]["rows"][1]["change_amount"] == -2
    assert page_one["data"]["rows"][1]["metadata_json"] == ('{"platform":"vimeo"}')
    assert page_two_response.status_code == 200
    assert page_two["code"] == 10000
    assert [row["id"] for row in page_two["data"]["rows"]] == [first.credit_log_id]


@pytest.mark.asyncio
async def test_admin_user_orders_include_success_and_failed_statuses(
    async_client,
    admin_user_api_auth,
    make_test_email,
) -> None:
    """订单 tab 返回该用户全部订单，不过滤成功或失败状态。"""
    user_id, email = await _create_user("admin-user-orders", make_test_email)
    paid_order = await _create_order(
        user_id=user_id,
        label="paid",
        order_status=OrderStatus.PAID,
        callback_status=CallbackStatus.SUCCESS,
        created_at=1_780_400_000_000,
    )
    failed_order = await _create_order(
        user_id=user_id,
        label="failed",
        order_status=OrderStatus.EXPIRED,
        callback_status=CallbackStatus.FAILED,
        created_at=1_780_400_100_000,
    )

    response = await async_client.get(
        f"/api/admin/users/{user_id}/orders",
        params={"page": 1, "page_size": 20},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    rows = body["data"]["rows"]
    assert body["data"]["total"] == 2
    assert [row["order_no"] for row in rows] == [
        failed_order.order_no,
        paid_order.order_no,
    ]
    assert {row["order_status"] for row in rows} == {
        OrderStatus.PAID.value,
        OrderStatus.EXPIRED.value,
    }
    assert {row["callback_status"] for row in rows} == {
        CallbackStatus.SUCCESS.value,
        CallbackStatus.FAILED.value,
    }
    assert rows[0]["user_email"] == email
