"""服务节点健康检查写回测试。"""

from types import SimpleNamespace

import pytest

from app.models.service_node_model import ServiceNodeModel
from app.services.service_node_health_service import service_node_health_service
from app.services import service_node_health_service as health_module
from app.services.service_node_service import (
    SERVICE_NODE_HEALTH_HEALTHY,
    SERVICE_NODE_HEALTH_UNHEALTHY,
    SERVICE_NODE_TYPE_DOWNLOAD,
)
from app.utils.service_node_url import (
    build_service_node_api_url,
    normalize_service_node_base_url,
)


def test_service_node_base_url_normalization_rejects_ambiguous_parts() -> None:
    """服务节点基础 URL 拒绝 userinfo、query、fragment 和 API prefix。"""
    invalid_urls = [
        "http://user:pass@host",
        "https://host?x=1",
        "https://host#frag",
        "https://host/api",
    ]

    for url in invalid_urls:
        with pytest.raises(ValueError):
            normalize_service_node_base_url(url)


def test_service_node_api_url_keeps_path_prefix() -> None:
    """节点 API URL 拼接保留普通 path prefix 且不受尾斜杠影响。"""
    assert (
        build_service_node_api_url(
            "https://node.example.com/base/",
            "/api/admin/node-monitor/network-rate",
        )
        == "https://node.example.com/base/api/admin/node-monitor/network-rate"
    )
    assert (
        build_service_node_api_url(
            "https://node.example.com",
            "api/client/media/parse-v2",
        )
        == "https://node.example.com/api/client/media/parse-v2"
    )


@pytest.mark.asyncio
async def test_health_check_writes_current_node_record(monkeypatch) -> None:
    """健康检查响应不含 node_id，也只写回当前被检查记录。"""
    node_a = ServiceNodeModel(
        node_id=101,
        node_type=2,
        name="pytest-health-a",
        region="test",
        public_base_url="https://a.example.com",
        internal_base_url="http://a.internal",
        enabled=True,
        status=1,
        weight=100,
        last_health_status=0,
        created_at=1,
        updated_at=1,
    )
    updates: list[tuple[int, dict]] = []

    async def fake_update_node_health(*, node_id: int, values: dict) -> None:
        updates.append((node_id, values))

    monkeypatch.setattr(
        service_node_health_service,
        "_update_node_health",
        fake_update_node_health,
    )

    class FakeClient:
        async def get(self, _url):
            return SimpleNamespace(
                status_code=200,
                json=lambda: {
                    "status": "ok",
                    "role": "download",
                    "version": "v-test",
                },
            )

    await service_node_health_service.check_one(client=FakeClient(), node=node_a)

    assert len(updates) == 1
    node_id, values = updates[0]
    assert node_id == 101
    assert values["last_health_status"] == SERVICE_NODE_HEALTH_HEALTHY
    assert values["version"] == "v-test"
    assert values["last_error"] is None


@pytest.mark.asyncio
async def test_health_check_failure_only_marks_current_node(monkeypatch) -> None:
    """单节点健康检查失败只影响当前节点。"""
    node_a = ServiceNodeModel(
        node_id=201,
        node_type=2,
        name="pytest-health-fail-a",
        region="test",
        public_base_url="https://a.example.com",
        internal_base_url="http://a.internal",
        enabled=True,
        status=1,
        weight=100,
        last_health_status=SERVICE_NODE_HEALTH_HEALTHY,
        created_at=1,
        updated_at=1,
    )
    updates: list[tuple[int, dict]] = []

    async def fake_update_node_health(*, node_id: int, values: dict) -> None:
        updates.append((node_id, values))

    monkeypatch.setattr(
        service_node_health_service,
        "_update_node_health",
        fake_update_node_health,
    )

    class FakeClient:
        async def get(self, _url):
            raise TimeoutError("health timeout")

    await service_node_health_service.check_one(client=FakeClient(), node=node_a)

    assert len(updates) == 1
    node_id, values = updates[0]
    assert node_id == 201
    assert values["last_health_status"] == SERVICE_NODE_HEALTH_UNHEALTHY
    assert "health_request_failed" in values["last_error"]


@pytest.mark.asyncio
async def test_health_check_includes_disabled_and_legacy_status_nodes(
    monkeypatch,
) -> None:
    """健康检查调度检查全部记录，停用节点和历史 status 节点也写回状态。"""
    nodes = [
        ServiceNodeModel(
            node_id=301,
            node_type=SERVICE_NODE_TYPE_DOWNLOAD,
            name="pytest-health-disabled",
            region="test",
            public_base_url="https://disabled.example.com",
            internal_base_url="http://disabled.internal",
            enabled=False,
            status=1,
            weight=100,
            last_health_status=SERVICE_NODE_HEALTH_UNHEALTHY,
            created_at=1,
            updated_at=1,
        ),
        ServiceNodeModel(
            node_id=302,
            node_type=SERVICE_NODE_TYPE_DOWNLOAD,
            name="pytest-health-legacy-status",
            region="test",
            public_base_url="https://legacy-status.example.com",
            internal_base_url="http://legacy-status.internal",
            enabled=True,
            status=2,
            weight=100,
            last_health_status=SERVICE_NODE_HEALTH_UNHEALTHY,
            created_at=1,
            updated_at=1,
        ),
    ]
    updates: list[tuple[int, dict]] = []

    async def fake_list_nodes_for_health_check():
        return nodes

    async def fake_update_node_health(*, node_id: int, values: dict) -> None:
        updates.append((node_id, values))

    monkeypatch.setattr(
        health_module.service_node_service,
        "list_nodes_for_health_check",
        fake_list_nodes_for_health_check,
    )
    monkeypatch.setattr(
        service_node_health_service,
        "_update_node_health",
        fake_update_node_health,
    )

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, _url):
            return SimpleNamespace(
                status_code=200,
                json=lambda: {
                    "status": "ok",
                    "role": "download",
                    "version": "v-disabled-legacy-status",
                },
            )

    monkeypatch.setattr(health_module.httpx, "AsyncClient", FakeAsyncClient)

    await service_node_health_service.check_all_once()

    assert [node_id for node_id, _values in updates] == [301, 302]
    assert all(
        values["last_health_status"] == SERVICE_NODE_HEALTH_HEALTHY
        for _node_id, values in updates
    )
