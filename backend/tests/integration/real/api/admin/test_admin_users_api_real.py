"""用户管理真实 HTTP 回归，依赖本地 7910 后端、真实 MySQL 和 Redis。

仅准备、清理本轮业务记录；config_* 表只读，不请求支付渠道。
写入矩阵（两个 POST）：正常/权限/缺字段/类型/未来时间与商品边界/副作用均覆盖。
product_id 的 XSS、SQLi、Unicode 按无效商品拒绝；取消无请求字段，输入矩阵不适用。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
import os
import uuid

from httpx import AsyncClient, ConnectError, Response
import pytest
from sqlalchemy import delete, text
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.core.database import get_async_session, get_engine
from app.i18n.common_code import CommonCode
from app.models.admin_model import AdminModel
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_model import UserModel
from app.services.admin_service import admin_service
from app.services.payment_config_service import (
    SubscriptionProductConfig,
    payment_config_service,
)
from app.services.user_service import user_service
from app.utils.jwt import JwtData, JwtUnit
from app.utils.time import add_natural_months, timestamp_now

pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass
class _CleanupState:
    """当前测试拥有的业务记录。"""

    user_ids: list[int] = field(default_factory=list)
    admin_id: int | None = None


@dataclass
class _RealUsers:
    """真实 HTTP 与本轮隔离数据。"""

    client: AsyncClient
    headers: dict[str, str]
    prefix: str
    products: list[SubscriptionProductConfig]
    cleanup: _CleanupState


@pytest.fixture
async def real_users_http(
    real_mysql_ready, real_redis_ready, test_run_id: str
) -> AsyncIterator[_RealUsers]:
    """检测资源、创建真实管理员，并按子表到父表清理本轮数据。"""
    async with get_engine().begin() as conn:
        tables = {row[0] for row in (await conn.execute(text("SHOW TABLES"))).all()}
    missing = {
        "admins",
        "users",
        "user_subscriptions",
        "user_credit_accounts",
        "config_subscription_product",
    } - tables
    if missing:
        pytest.skip(
            f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(sorted(missing))} 表"
        )

    base_url = os.environ.get("ADMIN_USERS_REAL_BASE_URL", "http://127.0.0.1:7910")
    async with AsyncClient(base_url=base_url, timeout=20, trust_env=False) as client:
        try:
            response = await client.get("/api/admin/users")
        except ConnectError as exc:
            pytest.skip(f"REAL_HTTP_UNAVAILABLE: 本地后端不可用: {exc}")
        assert response.status_code == 401, "真实 HTTP 入口必须已启动并要求管理员"
        prefix = f"pytest-users-{test_run_id}-{uuid.uuid4().hex[:6]}"
        cleanup = _CleanupState()
        admin = AdminModel(  # type: ignore[call-arg]
            username=prefix,
            password_hash="!NOLOGIN!",
            is_active=True,
        )
        async with get_async_session() as db:
            db.add(admin)
            await db.commit()
            await db.refresh(admin)
        cleanup.admin_id = admin.admin_id
        token, _, _, _ = admin_service.create_token_pair(admin)
        try:
            yield _RealUsers(
                client=client,
                headers={"Authorization": f"Bearer {token}"},
                prefix=prefix,
                products=await payment_config_service.list_subscription_products(),
                cleanup=cleanup,
            )
        finally:
            async with get_async_session() as db:
                if cleanup.user_ids:
                    await db.execute(delete(UserSubscriptionModel).where(UserSubscriptionModel.user_id.in_(cleanup.user_ids)))  # type: ignore[attr-defined]
                    await db.execute(
                        delete(UserModel).where(UserModel.user_id.in_(cleanup.user_ids))
                    )
                await db.execute(
                    delete(AdminModel).where(AdminModel.admin_id == cleanup.admin_id)
                )
                await db.commit()


def _ok(response: Response) -> dict:
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["code"] == 10000, body
    return body["data"]


async def _user(env: _RealUsers, suffix: str = "a") -> UserModel:
    user = await user_service.create_user_without_password(
        email=f"{env.prefix}{suffix}@example.com"
    )
    env.cleanup.user_ids.append(user.user_id)
    return user


def _product(env: _RealUsers, period: str) -> SubscriptionProductConfig:
    return next(item for item in env.products if item.period == period)


async def _seed(
    env: _RealUsers,
    user_id: int,
    product: SubscriptionProductConfig,
    expires_at: int,
    *,
    auto_renew: bool = False,
) -> dict:
    fields = {
        "product_id": product.product_id,
        "period": product.period,
        "expires_at": expires_at,
        "auto_renew": auto_renew,
        "product_price_id": 91,
        "payment_method": "paypal",
        "original_order_no": env.prefix[:32],
        "channel_subscription_id": env.prefix,
        "channel_uid": env.prefix,
        "start_at": timestamp_now() - 10_000,
        "cancelled_at": None,
        "updated_at": timestamp_now(),
    }
    async with get_async_session() as db:
        stmt = mysql_insert(UserSubscriptionModel).values(user_id=user_id, **fields)
        await db.execute(stmt.on_duplicate_key_update(**fields))
        await db.commit()
    return await _row(user_id)


async def _row(user_id: int) -> dict:
    async with get_async_session() as db:
        row = await db.get(UserSubscriptionModel, user_id)
        return row.to_dict() if row else {}


async def _settings(env: _RealUsers, user_id: int) -> dict:
    return _ok(
        await env.client.get(
            f"/api/admin/users/{user_id}/subscription", headers=env.headers
        )
    )


async def _set(
    env: _RealUsers, user_id: int, product_id: str, expires_at: int | None
) -> dict:
    data = _ok(
        await env.client.post(
            f"/api/admin/users/{user_id}/subscription",
            headers=env.headers,
            json={"product_id": product_id, "expires_at": expires_at},
        )
    )
    await _assert_entitlements(env, user_id, data["expires_at"], active=True)
    row = await _row(user_id)
    assert row["expires_at"] == data["expires_at"]
    assert row["product_id"] == data["product_id"] == product_id
    return row


async def _assert_entitlements(
    env: _RealUsers, user_id: int, expires_at: int | None, *, active: bool
) -> None:
    profile = _ok(
        await env.client.get(f"/api/admin/users/{user_id}/profile", headers=env.headers)
    )
    assert profile["subscription"]["has_subscription"] is active
    assert profile["subscription"]["expires_at"] == expires_at
    token, _ = JwtUnit.create_access_token(
        JwtData(user_id=user_id, email="real@example.com")
    )
    status = _ok(
        await env.client.get(
            "/api/client/subscription/status",
            headers={"Authorization": f"Bearer {token}"},
        )
    )
    assert status["status"] == "active"
    assert status["expires_at"] == (expires_at if active else None)
    assert (status["period"] != "free") is active
    listed = _ok(
        await env.client.get(
            "/api/admin/users", params={"user_id": user_id}, headers=env.headers
        )
    )
    assert listed["rows"][0]["subscription"] == profile["subscription"]


async def test_real_users_queries_share_literal_prefix_and_count(
    real_users_http: _RealUsers,
) -> None:
    """ID、字面前缀、交集、分页与旧包含查询读同一组真实记录。"""
    env = real_users_http
    first = await _user(env, "%_a")
    second = await _user(env, "%_b")
    other = await _user(env, "xx")
    async with get_async_session() as db:
        other_row = await db.get(UserModel, other.user_id)
        assert other_row is not None
        other_row.is_del = True
        first_row = await db.get(UserModel, first.user_id)
        assert first_row is not None
        first_row.locked_until = timestamp_now() + 60_000
        await db.commit()
    params: dict[str, str | int] = {
        "email": f" {env.prefix.upper()}%_ ",
        "page_size": 1,
    }
    page = _ok(
        await env.client.get("/api/admin/users", params=params, headers=env.headers)
    )
    assert page["total"] == 2
    assert page["rows"][0]["user_id"] == second.user_id
    page2 = _ok(
        await env.client.get(
            "/api/admin/users", params={**params, "page": 2}, headers=env.headers
        )
    )
    assert page2["total"] == 2
    assert page2["rows"][0]["user_id"] == first.user_id
    assert page2["rows"][0]["account_status"] == "locked"
    for user_id, expected in ((first.user_id, 1), (other.user_id, 0)):
        data = _ok(
            await env.client.get(
                "/api/admin/users",
                params={**params, "user_id": user_id},
                headers=env.headers,
            )
        )
        assert data["total"] == expected
        assert len(data["rows"]) == expected
    exact = _ok(
        await env.client.get(
            "/api/admin/users", params={"user_id": other.user_id}, headers=env.headers
        )
    )
    assert exact["rows"][0]["account_status"] == "deleted"
    assert set(exact["rows"][0]) == {
        "user_id",
        "email",
        "account_status",
        "created_at",
        "last_login_at",
        "subscription",
    }
    empty = _ok(
        await env.client.get(
            "/api/admin/users",
            params={"email": env.prefix + "absent"},
            headers=env.headers,
        )
    )
    assert empty["rows"] == [] and empty["total"] == 0
    contains = await user_service.user_lists(email_like=env.prefix + "%_")
    assert {row.user_id for row in contains} == {first.user_id, second.user_id}
    assert await user_service.count_users(email_like=env.prefix + "%_") == 2
    assert {row.user_id for row in await user_service.user_lists(email_like="%_")} >= {
        first.user_id,
        second.user_id,
    }


async def test_real_users_settings_preserve_or_replace_purchase_instance(
    real_users_http: _RealUsers,
) -> None:
    """真实入口确认默认自然月、普通换套餐、自动续费限制及终生时间。"""
    env = real_users_http
    user = await _user(env)
    monthly, yearly, lifetime = (
        _product(env, period) for period in ("month", "year", "lifetime")
    )
    before = timestamp_now()
    settings = await _settings(env, user.user_id)
    after = timestamp_now()
    assert settings["product_id"] == monthly.product_id
    assert (
        add_natural_months(before, 1)
        <= settings["expires_at"]
        <= add_natural_months(after, 1)
    )
    assert all(item["period"] != "none" for item in settings["products"])
    end = settings["expires_at"] + 123
    initial = await _set(env, user.user_id, monthly.product_id, end)
    assert initial["auto_renew"] is False
    assert (await _settings(env, user.user_id))["expires_at"] == end
    same = await _set(env, user.user_id, monthly.product_id, end)
    assert same["expires_at"] == end

    purchased = await _seed(env, user.user_id, monthly, end)
    changed_end = end + 99_000
    kept = await _set(env, user.user_id, monthly.product_id, changed_end)
    assert {
        key: value
        for key, value in kept.items()
        if key not in ("expires_at", "updated_at")
    } == {
        key: value
        for key, value in purchased.items()
        if key not in ("expires_at", "updated_at")
    }
    changed = await _set(env, user.user_id, yearly.product_id, changed_end)
    assert changed["period"] == "year" and changed["auto_renew"] is False
    cleared = (
        "product_price_id",
        "payment_method",
        "original_order_no",
        "channel_subscription_id",
        "channel_uid",
        "start_at",
        "cancelled_at",
    )
    assert all(changed[key] is None for key in cleared)

    automatic = await _seed(env, user.user_id, monthly, end, auto_renew=True)
    assert (await _settings(env, user.user_id))["is_auto_renew"] is True
    kept = await _set(env, user.user_id, monthly.product_id, changed_end)
    assert kept["auto_renew"] is True
    assert all(kept[key] == automatic[key] for key in cleared)
    response = await env.client.post(
        f"/api/admin/users/{user.user_id}/subscription",
        headers=env.headers,
        json={"product_id": yearly.product_id, "expires_at": end},
    )
    assert (
        response.status_code == 200
        and response.json()["code"] == CommonCode.INVALID_REQUEST
    )
    assert await _row(user.user_id) == kept

    await _seed(env, user.user_id, monthly, end)
    terminal = await _set(env, user.user_id, lifetime.product_id, None)
    assert terminal["expires_at"] == add_natural_months(end, 2400)
    assert terminal["period"] == "lifetime"
    assert all(terminal[key] is None for key in cleared)
    assert (await _settings(env, user.user_id))["expires_at"] == terminal["expires_at"]
    assert (await _set(env, user.user_id, lifetime.product_id, None))[
        "expires_at"
    ] == terminal["expires_at"]

    await _seed(env, user.user_id, yearly, timestamp_now() - 1)
    before = timestamp_now()
    expired_settings = await _settings(env, user.user_id)
    assert expired_settings["product_id"] == monthly.product_id
    assert (
        add_natural_months(before, 1)
        <= expired_settings["expires_at"]
        <= add_natural_months(timestamp_now(), 1)
    )
    before = timestamp_now()
    opened = await _set(env, user.user_id, lifetime.product_id, None)
    assert (
        add_natural_months(before, 2400)
        <= opened["expires_at"]
        <= add_natural_months(timestamp_now(), 2400)
    )

    for payload in (
        {"product_id": monthly.product_id, "expires_at": None},
        {"product_id": monthly.product_id, "expires_at": timestamp_now() - 1},
        {"product_id": lifetime.product_id, "expires_at": end},
        *(
            {"product_id": invalid, "expires_at": end}
            for invalid in ("free", "absent", "<script>", "' OR 1=1--", "\u202e")
        ),
    ):
        response = await env.client.post(
            f"/api/admin/users/{user.user_id}/subscription",
            headers=env.headers,
            json=payload,
        )
        assert (
            response.status_code == 200
            and response.json()["code"] == CommonCode.INVALID_REQUEST
        )
        assert await _row(user.user_id) == opened
    for payload in (
        {},
        {"product_id": monthly.product_id},
        {"product_id": monthly.product_id, "expires_at": "tomorrow"},
        {"product_id": monthly.product_id, "expires_at": True},
    ):
        response = await env.client.post(
            f"/api/admin/users/{user.user_id}/subscription",
            headers=env.headers,
            json=payload,
        )
        assert response.status_code == 422
        assert await _row(user.user_id) == opened
    absent = max(env.cleanup.user_ids) + 1_000_000_000
    for method, path, body in (
        ("GET", f"/api/admin/users/{absent}/subscription", None),
        (
            "POST",
            f"/api/admin/users/{absent}/subscription",
            {"product_id": monthly.product_id, "expires_at": end},
        ),
        ("POST", f"/api/admin/users/{absent}/subscription/cancel", None),
    ):
        response = await env.client.request(
            method, path, headers=env.headers, json=body
        )
        assert (
            response.status_code == 200
            and response.json()["code"] == CommonCode.USER_NOT_FOUND
        )
    assert await _row(absent) == {}


async def test_real_users_cancel_revokes_local_rights_and_requires_admin(
    real_users_http: _RealUsers,
) -> None:
    """取消普通、终生和自动续费权益只改时间，重复操作不造记录；客户端身份拒绝。"""
    env = real_users_http
    user = await _user(env)
    cancel_path = f"/api/admin/users/{user.user_id}/subscription/cancel"
    _ok(await env.client.post(cancel_path, headers=env.headers))
    assert await _row(user.user_id) == {}
    await _assert_entitlements(env, user.user_id, None, active=False)
    for period, auto in (("month", False), ("lifetime", False), ("month", True)):
        original = await _seed(
            env,
            user.user_id,
            _product(env, period),
            add_natural_months(timestamp_now(), 2400 if period == "lifetime" else 1),
            auto_renew=auto,
        )
        data = _ok(await env.client.post(cancel_path, headers=env.headers))
        assert data["has_subscription"] is False
        cancelled = await _row(user.user_id)
        assert cancelled["expires_at"] <= timestamp_now()
        assert {
            key: value
            for key, value in original.items()
            if key not in ("expires_at", "updated_at")
        } == {
            key: value
            for key, value in cancelled.items()
            if key not in ("expires_at", "updated_at")
        }
        await _assert_entitlements(
            env, user.user_id, cancelled["expires_at"], active=False
        )
        _ok(await env.client.post(cancel_path, headers=env.headers))
        assert await _row(user.user_id) == cancelled

    token, _ = JwtUnit.create_access_token(
        JwtData(user_id=user.user_id, email=user.email or "")
    )
    for headers in ({}, {"Authorization": f"Bearer {token}"}):
        for method, path, payload in (
            ("GET", "/api/admin/users", None),
            ("GET", f"/api/admin/users/{user.user_id}/subscription", None),
            (
                "POST",
                f"/api/admin/users/{user.user_id}/subscription",
                {
                    "product_id": _product(env, "month").product_id,
                    "expires_at": add_natural_months(timestamp_now(), 1),
                },
            ),
            ("POST", cancel_path, None),
        ):
            response = await env.client.request(
                method, path, headers=headers, json=payload
            )
            assert response.status_code == 401
            assert await _row(user.user_id) == cancelled
