from datetime import timedelta
from dataclasses import dataclass, field
import secrets

import pytest
from sqlalchemy import delete, update

from app.core.database import get_async_session
from app.i18n.common_code import CommonCode
from app.models.admin_model import AdminModel
from app.services.admin_api_key_service import admin_api_key_service
from app.services.admin_system_settings_service import ConfigCacheRefreshResult
from app.utils.crypto import hash_password
from app.utils.jwt import JwtData, JwtUnit
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class _FakeDashboard:
    """外部大盘 API 测试用返回体。"""

    today_registered_count: int = 0
    today_paid_order_amounts: list[object] = field(default_factory=list)
    today_recharge_amounts: list[object] = field(default_factory=list)
    today_fulfillment_failed_count: int = 0
    today_fulfillment_failed_amounts: list[object] = field(default_factory=list)
    nodes: list[object] = field(default_factory=list)


async def _create_admin(username: str, *, is_active: bool = True) -> AdminModel:
    """创建测试管理员并返回 ORM 对象。"""
    now = timestamp_now()
    admin = AdminModel(  # type: ignore[call-arg]
        username=username,
        password_hash=hash_password(secrets.token_urlsafe(12)),
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )
    async with get_async_session() as db:
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        return admin


async def _delete_admin(admin_id: int) -> None:
    """删除测试管理员。"""
    async with get_async_session() as db:
        await db.execute(delete(AdminModel).where(AdminModel.admin_id == admin_id))
        await db.commit()


def _admin_access_token(admin: AdminModel) -> str:
    """签发测试管理员 access JWT。"""
    token, _expires_at = JwtUnit.create_admin_token(
        JwtData(user_id=int(admin.admin_id), email=str(admin.username)),
        expires_delta=timedelta(minutes=5),
    )
    return token


def _bearer(token: str) -> dict[str, str]:
    """构造 Authorization header。"""
    return {"Authorization": f"Bearer {token}"}


async def _fake_dashboard() -> _FakeDashboard:
    """返回固定外部大盘响应，避免 API 鉴权测试触发节点网络。"""
    return _FakeDashboard()


async def _fake_refresh_config_caches() -> ConfigCacheRefreshResult:
    """返回固定配置缓存刷新结果，避免 API 鉴权测试读取配置表。"""
    return ConfigCacheRefreshResult(
        refreshed_services=["pytest"],
        refreshed_at=timestamp_now(),
    )


@pytest.mark.asyncio
async def test_external_dashboard_accepts_api_key_and_rejects_admin_jwt(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    test_run_id: str,
) -> None:
    """外部大盘只接受 API Key，不接受后台 admin JWT。"""
    import app.api.external.external_system_dashboard as dashboard_api

    monkeypatch.setattr(
        dashboard_api.external_system_dashboard_service,
        "get_dashboard",
        _fake_dashboard,
    )
    admin = await _create_admin(
        f"pytest-external-auth-{secrets.token_hex(4)}-{test_run_id}"
    )
    try:
        generated = await admin_api_key_service.generate_api_key(
            admin_id=int(admin.admin_id)
        )
        admin_jwt = _admin_access_token(admin)

        api_key_response = await async_client.get(
            "/api/external/system/dashboard",
            headers=_bearer(generated.api_key),
        )
        admin_jwt_response = await async_client.get(
            "/api/external/system/dashboard",
            headers=_bearer(admin_jwt),
        )

        assert api_key_response.status_code == 200
        assert api_key_response.json()["code"] == 10000
        assert admin_jwt_response.status_code == 401
        assert admin_jwt_response.json()["code"] == CommonCode.EXTERNAL_API_KEY_INVALID
    finally:
        await _delete_admin(int(admin.admin_id))


@pytest.mark.asyncio
async def test_admin_system_settings_accepts_admin_jwt_and_rejects_api_key(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    test_run_id: str,
) -> None:
    """后台系统设置只接受 admin JWT，不接受外部 API Key。"""
    import app.api.admin.admin_system_settings as system_settings_api

    monkeypatch.setattr(
        system_settings_api.admin_system_settings_service,
        "refresh_config_caches",
        _fake_refresh_config_caches,
    )
    admin = await _create_admin(
        f"pytest-system-settings-{secrets.token_hex(4)}-{test_run_id}"
    )
    try:
        generated = await admin_api_key_service.generate_api_key(
            admin_id=int(admin.admin_id)
        )
        admin_jwt = _admin_access_token(admin)

        api_key_get_response = await async_client.get(
            "/api/admin/system-settings/api-key",
            headers=_bearer(generated.api_key),
        )
        api_key_generate_response = await async_client.post(
            "/api/admin/system-settings/api-key",
            headers=_bearer(generated.api_key),
        )
        api_key_refresh_response = await async_client.post(
            "/api/admin/system-settings/config-cache/refresh",
            headers=_bearer(generated.api_key),
        )

        admin_get_response = await async_client.get(
            "/api/admin/system-settings/api-key",
            headers=_bearer(admin_jwt),
        )
        admin_refresh_response = await async_client.post(
            "/api/admin/system-settings/config-cache/refresh",
            headers=_bearer(admin_jwt),
        )
        admin_generate_response = await async_client.post(
            "/api/admin/system-settings/api-key",
            headers=_bearer(admin_jwt),
        )

        assert api_key_get_response.status_code == 401
        assert api_key_generate_response.status_code == 401
        assert api_key_refresh_response.status_code == 401
        assert admin_get_response.status_code == 200
        assert admin_get_response.json()["code"] == 10000
        assert admin_refresh_response.status_code == 200
        assert admin_refresh_response.json()["code"] == 10000
        assert admin_generate_response.status_code == 200
        assert admin_generate_response.json()["code"] == 10000
    finally:
        await _delete_admin(int(admin.admin_id))


@pytest.mark.asyncio
async def test_inactive_admin_api_key_is_rejected_by_external_api_entrypoint(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    test_run_id: str,
) -> None:
    """管理员停用后，真实 FastAPI 外部 API 入口必须拒绝其 API Key。"""
    import app.api.external.external_system_dashboard as dashboard_api

    async def forbidden_dashboard() -> _FakeDashboard:
        raise AssertionError("inactive api key must be rejected before service call")

    monkeypatch.setattr(
        dashboard_api.external_system_dashboard_service,
        "get_dashboard",
        forbidden_dashboard,
    )
    admin = await _create_admin(
        f"pytest-inactive-api-key-{secrets.token_hex(4)}-{test_run_id}"
    )
    try:
        generated = await admin_api_key_service.generate_api_key(
            admin_id=int(admin.admin_id)
        )
        async with get_async_session() as db:
            await db.execute(
                update(AdminModel)
                .where(AdminModel.admin_id == int(admin.admin_id))
                .values(is_active=False)
            )
            await db.commit()

        response = await async_client.get(
            "/api/external/system/dashboard",
            headers=_bearer(generated.api_key),
        )

        assert response.status_code == 401
        assert response.json()["code"] == CommonCode.EXTERNAL_API_KEY_INVALID
    finally:
        await _delete_admin(int(admin.admin_id))
