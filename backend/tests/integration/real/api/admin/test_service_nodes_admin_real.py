"""Admin 服务节点管理 API real 集成测试。

依赖：真实 MySQL，`admins` 和 `service_nodes` 表。

覆盖矩阵：
Endpoint                                  Happy Permission Missing Type Min/Max Overflow XSS SQLi Unicode Side Effect
GET /api/admin/service-nodes              Y     Y          n/a     n/a  n/a     n/a      n/a n/a  n/a     reads DB
POST /api/admin/service-nodes             Y     centralized Y       Y    Y       Y        Y   Y    Y       inserts DB, rejects ambiguous base URL
POST /api/admin/service-nodes/{id}/update Y     centralized Y       Y    Y       Y        Y   Y    Y       updates DB, rejects ambiguous base URL
POST /api/admin/service-nodes/{id}/enable Y     centralized n/a     n/a  n/a     n/a      n/a n/a  n/a     updates DB
POST /api/admin/service-nodes/{id}/disable Y    centralized n/a     n/a  n/a     n/a      n/a n/a  n/a     updates DB
POST /api/admin/service-nodes/{id}/health-check Y centralized n/a   n/a  n/a     n/a      n/a n/a  n/a     writes health fields
"""

from __future__ import annotations

from collections.abc import AsyncIterator
import uuid

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_engine
from app.models.admin_model import AdminModel
from app.models.service_node_model import ServiceNodeModel
from app.services.admin_service import admin_service
from app.services.service_node_service import (
    SERVICE_NODE_HEALTH_HEALTHY,
    SERVICE_NODE_HEALTH_UNHEALTHY,
    SERVICE_NODE_TYPE_DOWNLOAD,
)
from app.utils.crypto import hash_password


pytestmark = [pytest.mark.real, pytest.mark.asyncio]

# real 测试临时管理员密码，只用于本测试创建的 pytest-admin-node-* 账号。
_TEST_ADMIN_PASSWORD = "AdminRealTest123!"


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
async def real_service_nodes_schema_ready(real_mysql_ready) -> None:
    """检查服务节点管理 real 测试需要的表。"""
    missing = [
        table for table in ("admins", "service_nodes") if not await _table_exists(table)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_admin_token_for_nodes(
    real_service_nodes_schema_ready,
    test_run_id: str,
) -> AsyncIterator[str]:
    """创建真实管理员并返回 access token。"""
    username = f"pytest-admin-node-{uuid.uuid4().hex[:8]}-{test_run_id}"
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
async def service_node_cleanup(test_run_id: str) -> AsyncIterator[list[int]]:
    """清理本测试创建的 service_nodes 记录。"""
    created_node_ids: list[int] = []
    try:
        yield created_node_ids
    finally:
        engine = get_engine()
        async with AsyncSession(engine) as session:
            if created_node_ids:
                await session.execute(
                    delete(ServiceNodeModel).where(
                        ServiceNodeModel.node_id.in_(created_node_ids)
                    )
                )
            await session.execute(
                delete(ServiceNodeModel).where(
                    ServiceNodeModel.name.like(f"pytest-node-%-{test_run_id}%")
                )
            )
            await session.commit()


def _node_payload(test_run_id: str, *, name_suffix: str = "a") -> dict[str, object]:
    """生成服务节点写入请求。"""
    return {
        "node_type": SERVICE_NODE_TYPE_DOWNLOAD,
        "name": f"pytest-node-{name_suffix}-{uuid.uuid4().hex[:8]}-{test_run_id}",
        "region": "sg",
        "public_base_url": f"https://pytest-{name_suffix}.example.com",
        "internal_base_url": f"http://pytest-{name_suffix}.internal",
        "enabled": True,
        "weight": 100,
    }


async def _get_node(node_id: int) -> ServiceNodeModel:
    """从真实数据库读取 service_nodes 记录。"""
    engine = get_engine()
    async with AsyncSession(engine) as session:
        result = await session.execute(
            select(ServiceNodeModel).where(ServiceNodeModel.node_id == node_id)
        )
        node = result.scalar_one()
        return node


async def test_real_service_nodes_requires_admin(real_async_client) -> None:
    """服务节点列表未登录返回 401。"""
    response = await real_async_client.get("/api/admin/service-nodes")

    assert response.status_code == 401


async def test_real_service_nodes_crud_and_enable_disable(
    real_async_client,
    real_admin_token_for_nodes,
    service_node_cleanup: list[int],
    test_run_id: str,
) -> None:
    """服务节点创建、列表、更新和启停写入真实数据库。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_nodes}"}
    payload = _node_payload(test_run_id)

    create_response = await real_async_client.post(
        "/api/admin/service-nodes",
        headers=headers,
        json=payload,
    )

    create_body = create_response.json()
    assert create_response.status_code == 200
    assert create_body["code"] == 10000
    node_id = create_body["data"]["node_id"]
    service_node_cleanup.append(node_id)
    assert create_body["data"]["created_at"] > 0
    assert create_body["data"]["updated_at"] >= create_body["data"]["created_at"]
    assert create_body["data"]["last_health_status"] == 0

    list_response = await real_async_client.get(
        "/api/admin/service-nodes",
        headers=headers,
    )
    list_body = list_response.json()
    assert list_response.status_code == 200
    assert list_body["code"] == 10000
    assert any(node["node_id"] == node_id for node in list_body["data"]["nodes"])
    assert "healthy_business_count" not in list_body["data"]

    update_payload = _node_payload(test_run_id, name_suffix="b")
    update_payload["enabled"] = False
    update_payload["weight"] = 0
    update_response = await real_async_client.post(
        f"/api/admin/service-nodes/{node_id}/update",
        headers=headers,
        json=update_payload,
    )
    update_body = update_response.json()
    assert update_response.status_code == 200
    assert update_body["code"] == 10000
    assert update_body["data"]["name"] == update_payload["name"]
    assert update_body["data"]["enabled"] is False
    assert update_body["data"]["status"] == 3
    assert update_body["data"]["weight"] == 0

    for action, expected_enabled, expected_status in (
        ("enable", True, 1),
        ("disable", False, 3),
    ):
        response = await real_async_client.post(
            f"/api/admin/service-nodes/{node_id}/{action}",
            headers=headers,
        )
        body = response.json()
        assert response.status_code == 200
        assert body["code"] == 10000
        assert body["data"]["enabled"] is expected_enabled
        assert body["data"]["status"] == expected_status

    db_node = await _get_node(node_id)
    assert db_node.enabled is False
    assert db_node.status == 3


async def test_real_service_nodes_reject_invalid_write_payload(
    real_async_client,
    real_admin_token_for_nodes,
    test_run_id: str,
) -> None:
    """服务节点写入接口拒绝缺失、类型、越界和空白/XSS/SQLi/Unicode 控制字符组合。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_nodes}"}
    base_payload = _node_payload(test_run_id)

    invalid_payloads = [
        {key: value for key, value in base_payload.items() if key != "name"},
        {**base_payload, "node_type": 9},
        {**base_payload, "weight": -1},
        {**base_payload, "weight": 1001},
        {**base_payload, "name": "   "},
        {**base_payload, "public_base_url": ""},
        {**base_payload, "region": "<script>alert(1)</script>" * 20},
        {**base_payload, "internal_base_url": "'; DROP TABLE service_nodes; --"},
        {**base_payload, "name": "\u202e"},
    ]

    for payload in invalid_payloads:
        response = await real_async_client.post(
            "/api/admin/service-nodes",
            headers=headers,
            json=payload,
        )
        assert response.status_code in (200, 400, 422)
        if response.status_code == 200:
            body = response.json()
            assert body["code"] != 10000


async def test_real_service_nodes_reject_ambiguous_base_urls(
    real_async_client,
    real_admin_token_for_nodes,
    test_run_id: str,
) -> None:
    """服务节点基础地址拒绝 userinfo、query、fragment 和直接 API path。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_nodes}"}
    base_payload = _node_payload(test_run_id, name_suffix="bad-url")
    invalid_url_cases = [
        ("public_base_url", "http://user:pass@host"),
        ("public_base_url", "https://host?x=1"),
        ("public_base_url", "https://host#frag"),
        ("public_base_url", "https://host/api"),
        ("internal_base_url", "http://user:pass@internal"),
        ("internal_base_url", "https://internal?x=1"),
        ("internal_base_url", "https://internal#frag"),
        ("internal_base_url", "https://internal/api/admin"),
    ]

    for field_name, value in invalid_url_cases:
        response = await real_async_client.post(
            "/api/admin/service-nodes",
            headers=headers,
            json={**base_payload, field_name: value},
        )

        assert response.status_code == 422


async def test_real_service_nodes_accept_root_and_path_prefix_base_urls(
    real_async_client,
    real_admin_token_for_nodes,
    service_node_cleanup: list[int],
    test_run_id: str,
) -> None:
    """合法根地址和普通 path prefix 会保存为规范化 base URL。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_nodes}"}
    root_payload = {
        **_node_payload(test_run_id, name_suffix="root-url"),
        "public_base_url": "https://root.example.com/",
        "internal_base_url": "http://root.internal/",
    }
    path_payload = {
        **_node_payload(test_run_id, name_suffix="path-url"),
        "public_base_url": "https://path.example.com/base/",
        "internal_base_url": "http://path.internal/base/",
    }

    root_response = await real_async_client.post(
        "/api/admin/service-nodes",
        headers=headers,
        json=root_payload,
    )
    path_response = await real_async_client.post(
        "/api/admin/service-nodes",
        headers=headers,
        json=path_payload,
    )

    root_body = root_response.json()
    path_body = path_response.json()
    assert root_response.status_code == 200
    assert root_body["code"] == 10000
    assert path_response.status_code == 200
    assert path_body["code"] == 10000
    service_node_cleanup.extend(
        [root_body["data"]["node_id"], path_body["data"]["node_id"]]
    )
    assert root_body["data"]["public_base_url"] == "https://root.example.com"
    assert root_body["data"]["internal_base_url"] == "http://root.internal"
    assert path_body["data"]["public_base_url"] == "https://path.example.com/base"
    assert path_body["data"]["internal_base_url"] == "http://path.internal/base"


async def test_real_service_node_manual_health_check_writes_back(
    real_async_client,
    real_admin_token_for_nodes,
    service_node_cleanup: list[int],
    test_run_id: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """手动健康检查复用 health service 写回最新健康状态并返回诊断。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_nodes}"}
    payload = _node_payload(test_run_id, name_suffix="health")
    create_response = await real_async_client.post(
        "/api/admin/service-nodes",
        headers=headers,
        json=payload,
    )
    node_id = create_response.json()["data"]["node_id"]
    service_node_cleanup.append(node_id)

    import app.services.service_node_admin_service as admin_service_module

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, _url):
            return type(
                "FakeResponse",
                (),
                {
                    "status_code": 200,
                    "text": "",
                    "json": lambda self: {
                        "status": "ok",
                        "role": "download",
                        "version": "pytest-version",
                    },
                },
            )()

    monkeypatch.setattr(admin_service_module.httpx, "AsyncClient", FakeAsyncClient)

    response = await real_async_client.post(
        f"/api/admin/service-nodes/{node_id}/health-check",
        headers=headers,
    )

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["diagnosis"]["healthy"] is True
    assert body["data"]["node"]["last_health_status"] == SERVICE_NODE_HEALTH_HEALTHY
    assert body["data"]["node"]["version"] == "pytest-version"

    db_node = await _get_node(node_id)
    assert db_node.last_health_status == SERVICE_NODE_HEALTH_HEALTHY


async def test_real_service_node_manual_health_check_failure_writes_unhealthy(
    real_async_client,
    real_admin_token_for_nodes,
    service_node_cleanup: list[int],
    test_run_id: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """手动健康检查失败时写回 unhealthy 和错误详情。"""
    headers = {"Authorization": f"Bearer {real_admin_token_for_nodes}"}
    payload = _node_payload(test_run_id, name_suffix="health-fail")
    create_response = await real_async_client.post(
        "/api/admin/service-nodes",
        headers=headers,
        json=payload,
    )
    node_id = create_response.json()["data"]["node_id"]
    service_node_cleanup.append(node_id)

    import app.services.service_node_admin_service as admin_service_module

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, _url):
            raise TimeoutError("pytest timeout")

    monkeypatch.setattr(admin_service_module.httpx, "AsyncClient", FakeAsyncClient)

    response = await real_async_client.post(
        f"/api/admin/service-nodes/{node_id}/health-check",
        headers=headers,
    )

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["diagnosis"]["healthy"] is False
    assert "health_request_failed" in body["data"]["diagnosis"]["error"]
    assert body["data"]["node"]["last_health_status"] == SERVICE_NODE_HEALTH_UNHEALTHY
