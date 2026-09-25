"""节点本地 Admin JWT-only 鉴权测试。

覆盖业务/下载节点本地管理接口只验 ADMIN_ACCESS JWT，不回查管理员表、
不访问 Redis，也不调用 admin_token_service。
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.constants.auth import TokenType
from app.core.config import settings
from app.main import create_app
from app.utils.jwt import JwtData, JwtUnit

_NODE_LOCAL_GET_ROUTES = ("/api/admin/node-monitor/network-rate",)


def _admin_access_token(*, user_id: int = 1) -> str:
    """签发测试用 admin access JWT。"""
    token, _expires_at = JwtUnit.create_admin_token(
        JwtData(user_id=user_id, email="pytest-admin"),
        expires_delta=timedelta(minutes=5),
    )
    return token


@pytest.mark.asyncio
async def test_node_local_admin_routes_accept_jwt_without_db_or_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """节点本机监控接口校验 JWT 时不访问 DB/Redis。"""

    async def forbidden_get_by_id(*_args, **_kwargs):
        raise AssertionError("JWT-only admin guard must not call admin_service")

    async def forbidden_get_client(*_args, **_kwargs):
        raise AssertionError("JWT-only admin guard must not touch Redis")

    import app.core.database as database_module
    import app.core.redis as redis_module
    import app.services.admin_service as admin_service_module
    import app.services.admin_token_service as admin_token_service_module

    monkeypatch.setattr(
        admin_service_module.admin_service, "get_by_id", forbidden_get_by_id
    )
    monkeypatch.setattr(redis_module.redis_client, "get_client", forbidden_get_client)
    monkeypatch.setattr(
        database_module,
        "get_async_session",
        lambda: (_ for _ in ()).throw(
            AssertionError("JWT-only admin guard must not open DB sessions")
        ),
    )
    monkeypatch.setattr(
        admin_token_service_module.admin_token_service,
        "verify_refresh_token_with_grace_period",
        forbidden_get_client,
    )
    monkeypatch.setattr(settings.app, "role", "download")

    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        responses = [
            await client.get(
                path,
                headers={"Authorization": f"Bearer {_admin_access_token()}"},
            )
            for path in _NODE_LOCAL_GET_ROUTES
        ]

    for response in responses:
        assert response.status_code == 200
        assert response.json()["code"] == 10000


@pytest.mark.asyncio
async def test_node_local_admin_routes_reject_refresh_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """节点本地管理接口拒绝 ADMIN_REFRESH token。"""
    monkeypatch.setattr(settings.app, "role", "download")
    token, _expires_at = JwtUnit.create_admin_refresh_token(
        JwtData(user_id=1, email="pytest-admin"),
        expires_delta=timedelta(minutes=5),
    )

    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        responses = [
            await client.get(
                path,
                headers={"Authorization": f"Bearer {token}"},
            )
            for path in _NODE_LOCAL_GET_ROUTES
        ]

    for response in responses:
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_node_local_admin_routes_reject_missing_jti(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """节点本地管理接口拒绝缺少 jti 的 ADMIN_ACCESS token。"""
    import app.api.admin_dependencies as dependencies_module

    monkeypatch.setattr(settings.app, "role", "download")
    monkeypatch.setattr(
        dependencies_module.JwtUnit,
        "decode_token",
        lambda _token: JwtData(
            user_id=1,
            email="pytest-admin",
            exp=9999999999,
            type=TokenType.ADMIN_ACCESS,
            jti="",
        ),
    )

    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        responses = [
            await client.get(
                path,
                headers={"Authorization": "Bearer no-jti-token"},
            )
            for path in _NODE_LOCAL_GET_ROUTES
        ]

    for response in responses:
        assert response.status_code == 401
