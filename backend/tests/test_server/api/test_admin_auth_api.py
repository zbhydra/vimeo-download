"""
Admin Auth API Tests - Using Real Database and Redis

覆盖管理后台 token pair 契约：
1. access token 默认 30 分钟过期。
2. refresh token 默认 7 天过期。
3. refresh 接口使用 refresh token 轮换 token pair。
4. refresh token 无效时返回 HTTP 401。
"""

import time
import uuid

import pytest
from sqlalchemy import delete

from app.constants.auth import TokenType
from app.core.config import settings
from app.core.redis import redis_client
from app.models.admin_model import AdminModel
from app.services.admin_service import admin_service
from app.services.admin_token_service import admin_token_service
from app.utils.crypto import hash_password
from app.utils.jwt import JwtUnit
from app.utils.redis_key import build_redis_key


# 单测临时管理员密码，只参与 hash 与登录验证，不对应真实账号。
TEST_ADMIN_PASSWORD = "AdminTest123!"


def unwrap_ok(response):
    """断言成功响应并返回 data。"""

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 10000
    return payload["data"]


async def _delete_admin_refresh_keys(admin_id: int) -> None:
    """删除测试管理员 refresh token Redis key。"""

    redis = await redis_client.get_client()
    await redis.delete(
        build_redis_key(f"admin_refresh_token:{admin_id}"),
        build_redis_key(f"admin_refresh_token_old:{admin_id}"),
    )


async def _create_test_admin(test_db_session, username: str) -> AdminModel:
    """创建测试管理员并提交。"""

    admin = AdminModel(  # type: ignore[call-arg]
        username=username,
        password_hash=hash_password(TEST_ADMIN_PASSWORD),
        is_active=True,
    )
    test_db_session.add(admin)
    await test_db_session.commit()
    await test_db_session.refresh(admin)
    return admin


async def _delete_test_admin(test_db_session, admin: AdminModel) -> None:
    """删除测试管理员和对应 refresh token。"""

    await _delete_admin_refresh_keys(admin.admin_id)
    await test_db_session.execute(
        delete(AdminModel).where(AdminModel.admin_id == admin.admin_id)
    )
    await test_db_session.commit()


def test_create_admin_token_pair_uses_30_minute_and_7_day_expiry():
    """Admin token pair 使用 30 分钟 access 和 7 天 refresh。"""

    before = int(time.time())
    admin = AdminModel(
        admin_id=1,
        username="admin-token-contract",
        password_hash="unused",
    )
    access_token, refresh_token, access_expire, refresh_expire = (
        admin_service.create_token_pair(admin)
    )
    after = int(time.time())
    access_data = JwtUnit.decode_token(access_token)
    refresh_data = JwtUnit.decode_token(refresh_token)

    assert access_data is not None
    assert refresh_data is not None
    assert access_data.type == TokenType.ADMIN_ACCESS
    assert refresh_data.type == TokenType.ADMIN_REFRESH
    assert access_data.exp == access_expire
    assert refresh_data.exp == refresh_expire
    assert before + settings.admin.access_token_expire <= access_expire
    assert access_expire <= after + settings.admin.access_token_expire
    assert before + settings.admin.refresh_token_expire <= refresh_expire
    assert refresh_expire <= after + settings.admin.refresh_token_expire


@pytest.mark.asyncio
async def test_admin_refresh_rotates_refresh_token(
    async_client,
    test_db_session,
    test_run_id,
):
    """Refresh 接口用 refresh token 轮换并返回新 token pair。"""

    admin = await _create_test_admin(
        test_db_session,
        f"pytest-admin-refresh-{uuid.uuid4().hex[:8]}-{test_run_id}",
    )
    try:
        _access_token, refresh_token, _access_expire, refresh_expire = (
            admin_service.create_token_pair(admin)
        )
        await admin_token_service.store_refresh_token(
            refresh_token,
            admin.admin_id,
            refresh_expire,
        )

        response = await async_client.post(
            "/api/admin/auth/refresh",
            json={"refresh_token": refresh_token},
        )

        data = unwrap_ok(response)
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["refresh_token"] != refresh_token
        assert data["expires_in"] <= settings.admin.access_token_expire
        assert data["refresh_expires_in"] <= settings.admin.refresh_token_expire
    finally:
        await _delete_test_admin(test_db_session, admin)


@pytest.mark.asyncio
async def test_admin_refresh_rejects_invalid_refresh_token(async_client):
    """Refresh token 无效时返回 HTTP 401。"""

    response = await async_client.post(
        "/api/admin/auth/refresh",
        json={"refresh_token": "invalid-admin-refresh-token"},
    )

    assert response.status_code == 401
