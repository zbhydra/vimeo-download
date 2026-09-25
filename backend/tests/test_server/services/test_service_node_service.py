"""服务节点选择服务测试。

覆盖 service_nodes 统一候选池、加权不放回、preferred_node_id
首位亲和、空池和不可用节点过滤规则。
"""

import pytest

from app.models.service_node_model import ServiceNodeModel
from app.services import service_node_service as service_node_module
from app.services.service_node_service import (
    SERVICE_NODE_HEALTH_HEALTHY,
    SERVICE_NODE_TYPE_BUSINESS,
    SERVICE_NODE_TYPE_DOWNLOAD,
    service_node_service,
)


def _node(
    node_id: int,
    *,
    node_type: int = SERVICE_NODE_TYPE_DOWNLOAD,
    enabled: bool = True,
    status: int = 1,
    health: int = SERVICE_NODE_HEALTH_HEALTHY,
    weight: int = 100,
    public_base_url: str | None = None,
) -> ServiceNodeModel:
    """构造不入库的节点模型。"""
    return ServiceNodeModel(
        node_id=node_id,
        node_type=node_type,
        name=f"node-{node_id}",
        region="test",
        public_base_url=(
            f"https://node-{node_id}.example.com"
            if public_base_url is None
            else public_base_url
        ),
        internal_base_url=f"http://node-{node_id}.internal",
        enabled=enabled,
        status=status,
        weight=weight,
        last_health_status=health,
        created_at=1,
        updated_at=1,
    )


@pytest.mark.asyncio
async def test_service_node_selects_three_nodes_from_unified_weight_pool(
    monkeypatch,
) -> None:
    """业务节点和下载节点进入同一个最多 3 个的加权随机池。"""
    nodes = [
        _node(1, node_type=SERVICE_NODE_TYPE_DOWNLOAD),
        _node(9, node_type=SERVICE_NODE_TYPE_BUSINESS),
        _node(2, node_type=SERVICE_NODE_TYPE_DOWNLOAD),
        _node(3, node_type=SERVICE_NODE_TYPE_DOWNLOAD),
    ]

    async def fake_list_assignable_nodes():
        return nodes

    monkeypatch.setattr(service_node_module.random, "uniform", lambda _a, _b: 0)
    monkeypatch.setattr(
        service_node_service,
        "_list_assignable_nodes",
        fake_list_assignable_nodes,
    )

    selected = await service_node_service.select_parse_nodes()

    assert len(selected) == 3
    assert [node.node_id for node in selected] == [1, 9, 2]
    assert len({node.node_id for node in selected}) == 3


@pytest.mark.asyncio
async def test_service_node_preferred_candidate_is_first(monkeypatch) -> None:
    """preferred_node_id 命中健康可用候选节点时固定首位。"""
    nodes = [
        _node(1, node_type=SERVICE_NODE_TYPE_DOWNLOAD),
        _node(2, node_type=SERVICE_NODE_TYPE_BUSINESS),
        _node(9, node_type=SERVICE_NODE_TYPE_DOWNLOAD),
    ]

    async def fake_list_assignable_nodes():
        return nodes

    monkeypatch.setattr(
        service_node_service,
        "_list_assignable_nodes",
        fake_list_assignable_nodes,
    )

    selected = await service_node_service.select_download_nodes(preferred_node_id=2)

    assert selected[0].node_id == 2
    assert {node.node_id for node in selected} == {1, 2, 9}


@pytest.mark.asyncio
async def test_service_node_unusable_preferred_is_ignored(
    monkeypatch,
) -> None:
    """preferred_node_id 对不可用节点不触发首位亲和。"""
    nodes = [
        _node(1, node_type=SERVICE_NODE_TYPE_DOWNLOAD),
        _node(2, node_type=SERVICE_NODE_TYPE_DOWNLOAD),
        _node(9, node_type=SERVICE_NODE_TYPE_BUSINESS, weight=0),
    ]

    async def fake_list_assignable_nodes():
        return nodes

    monkeypatch.setattr(
        service_node_service,
        "_list_assignable_nodes",
        fake_list_assignable_nodes,
    )

    selected = await service_node_service.select_download_nodes(preferred_node_id=9)

    assert {node.node_id for node in selected} == {1, 2}
    assert all(node.node_id != 9 for node in selected)


@pytest.mark.asyncio
async def test_service_node_business_only_pool_is_assignable(
    monkeypatch,
) -> None:
    """只有业务节点时也按统一候选池返回。"""

    async def fake_list_assignable_nodes():
        return [_node(9, node_type=SERVICE_NODE_TYPE_BUSINESS)]

    monkeypatch.setattr(
        service_node_service,
        "_list_assignable_nodes",
        fake_list_assignable_nodes,
    )

    selected = await service_node_service.select_parse_nodes()

    assert [node.node_id for node in selected] == [9]
    assert selected[0].node_type == SERVICE_NODE_TYPE_BUSINESS


@pytest.mark.asyncio
async def test_service_node_empty_all_pool_returns_empty(monkeypatch) -> None:
    """没有健康可分配节点时返回空列表，由 API 映射节点不可用。"""

    async def fake_list_assignable_nodes():
        return []

    monkeypatch.setattr(
        service_node_service,
        "_list_assignable_nodes",
        fake_list_assignable_nodes,
    )

    selected = await service_node_service.select_parse_nodes()

    assert selected == []


@pytest.mark.asyncio
async def test_service_node_filters_unusable_nodes(monkeypatch) -> None:
    """enabled/health/weight/public_base_url 不合格的节点不进入结果。"""
    nodes = [
        _node(1, enabled=False),
        _node(2, status=2),
        _node(3, health=2),
        _node(4, weight=0),
        _node(5, public_base_url=""),
        _node(6),
    ]

    async def fake_list_assignable_nodes():
        return nodes

    monkeypatch.setattr(
        service_node_service,
        "_list_assignable_nodes",
        fake_list_assignable_nodes,
    )

    selected = await service_node_service.select_parse_nodes()

    assert {node.node_id for node in selected} == {2, 6}
