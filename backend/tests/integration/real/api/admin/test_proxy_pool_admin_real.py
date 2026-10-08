"""代理池 Admin API real 集成测试。

使用真实 MySQL 和真实 FastAPI 路由，覆盖鉴权、批量顺序、凭据边界、筛选、更新和删除。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
import secrets

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_engine
from app.models.admin_model import AdminModel
from app.models.proxy_pool_entry_model import ProxyPoolEntryModel
from app.services.admin_service import admin_service
from app.utils.crypto import hash_password

pytestmark = [pytest.mark.real, pytest.mark.asyncio]


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""
    engine = get_engine()
    async with engine.begin() as connection:
        result = await connection.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


@pytest.fixture
async def real_proxy_pool_schema_ready(real_mysql_ready) -> None:
    """检查代理池 real 测试需要的表。"""
    missing = [
        table
        for table in ("admins", "proxy_pool_entries")
        if not await _table_exists(table)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_proxy_pool_admin_token(
    real_proxy_pool_schema_ready,
    test_run_id: str,
) -> AsyncIterator[str]:
    """创建真实管理员并返回 access token。"""
    username = f"pytest-proxy-admin-{secrets.token_hex(4)}-{test_run_id}"
    admin = AdminModel(  # type: ignore[call-arg]
        username=username,
        password_hash=hash_password("ProxyPoolRealTest123!"),
        is_active=True,
    )
    engine = get_engine()
    async with AsyncSession(engine) as session:
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

    access_token, _refresh_token, _access_expire, _refresh_expire = (
        admin_service.create_token_pair(admin)
    )
    try:
        yield access_token
    finally:
        async with AsyncSession(engine) as session:
            await session.execute(
                delete(AdminModel).where(AdminModel.admin_id == admin.admin_id)
            )
            await session.commit()


@pytest.fixture
async def proxy_pool_cleanup(
    real_proxy_pool_schema_ready,
    test_run_id: str,
) -> AsyncIterator[None]:
    """清理当前测试创建的代理配置。"""
    try:
        yield
    finally:
        engine = get_engine()
        async with AsyncSession(engine) as session:
            await session.execute(
                delete(ProxyPoolEntryModel).where(
                    ProxyPoolEntryModel.name.like(f"pytest-proxy-{test_run_id}-%")
                )
            )
            await session.commit()


async def test_real_proxy_pool_admin_crud_and_credential_boundary(
    real_async_client,
    real_proxy_pool_admin_token: str,
    proxy_pool_cleanup,
    test_run_id: str,
) -> None:
    """代理池完成真实 CRUD，列表摘要不泄漏凭据且协议原样保存。"""
    unauthenticated = await real_async_client.get("/api/admin/proxy-pool")
    assert unauthenticated.status_code == 401

    headers = {"Authorization": f"Bearer {real_proxy_pool_admin_token}"}
    name_prefix = f"pytest-proxy-{test_run_id}-{secrets.token_hex(3)}"
    first_name = f"{name_prefix}-a"
    second_name = f"{name_prefix}-b"
    batch_response = await real_async_client.post(
        "/api/admin/proxy-pool/batch-create",
        headers=headers,
        json={
            "entries": [
                {
                    "name": first_name,
                    "proxy_type": 1,
                    "protocol": "SOCKS5",
                    "dynamic_url": "https://provider.example/a",
                    "country_code": "US",
                    "enabled": True,
                },
                {
                    "name": second_name,
                    "proxy_type": 2,
                    "protocol": "custom+raw",
                    "host": "proxy.example",
                    "port": 18443,
                    "username": "proxy-user",
                    "password": "proxy-secret",
                    "country_code": "SG",
                    "enabled": True,
                },
            ]
        },
    )
    assert batch_response.status_code == 200
    assert batch_response.json()["code"] == 10000
    assert batch_response.json()["data"] == {"count": 2}

    list_response = await real_async_client.get(
        "/api/admin/proxy-pool",
        headers=headers,
        params={"name": name_prefix, "page": 1, "page_size": 10},
    )
    assert list_response.status_code == 200
    list_data = list_response.json()["data"]
    assert [row["name"] for row in list_data["rows"]] == [first_name, second_name]
    assert all(
        "username" not in row and "password" not in row for row in list_data["rows"]
    )
    assert list_data["rows"][0]["protocol"] == "SOCKS5"

    first_id = int(list_data["rows"][0]["proxy_id"])
    second_id = int(list_data["rows"][1]["proxy_id"])
    detail_response = await real_async_client.get(
        f"/api/admin/proxy-pool/{second_id}",
        headers=headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["password"] == "proxy-secret"

    update_response = await real_async_client.post(
        f"/api/admin/proxy-pool/{first_id}/update",
        headers=headers,
        json={
            "name": first_name,
            "proxy_type": 2,
            "protocol": "WireGuard-like",
            "host": "updated.example",
            "port": 443,
            "username": "updated-user",
            "password": "updated-secret",
            "country_code": "CA",
            "enabled": False,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["protocol"] == "WireGuard-like"
    assert update_response.json()["data"]["enabled"] is False

    disabled_response = await real_async_client.get(
        "/api/admin/proxy-pool",
        headers=headers,
        params={"name": name_prefix, "enabled": False},
    )
    assert [row["proxy_id"] for row in disabled_response.json()["data"]["rows"]] == [
        first_id
    ]

    delete_response = await real_async_client.post(
        f"/api/admin/proxy-pool/{second_id}/delete",
        headers=headers,
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["code"] == 10000

    missing_response = await real_async_client.get(
        f"/api/admin/proxy-pool/{second_id}",
        headers=headers,
    )
    assert missing_response.status_code == 200
    assert missing_response.json()["code"] == 404

    async with AsyncSession(get_engine()) as session:
        result = await session.execute(
            select(ProxyPoolEntryModel).where(ProxyPoolEntryModel.proxy_id == first_id)
        )
        assert result.scalar_one().password == "updated-secret"
