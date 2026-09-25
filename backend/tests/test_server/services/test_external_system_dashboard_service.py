"""外部系统大盘服务测试。"""

import asyncio
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.models.service_node_model import ServiceNodeModel
from app.services.external_system_dashboard_service import (
    ExternalPaidOrderStats,
    external_system_dashboard_service,
)


def _node(node_id: int, internal_base_url: str = "http://node.internal"):
    """构造服务节点模型。"""
    return ServiceNodeModel(  # type: ignore[call-arg]
        node_id=node_id,
        node_type=2,
        name=f"pytest-node-{node_id}",
        region="test",
        public_base_url=f"https://node-{node_id}.example.com",
        internal_base_url=internal_base_url,
        enabled=True,
        status=1,
        weight=100,
        last_health_status=1,
        created_at=1,
        updated_at=1,
    )


def test_format_normalized_amount_returns_decimal_string() -> None:
    """6 位精度整数金额转十进制字符串。"""
    assert external_system_dashboard_service._format_normalized_amount(0) == "0"
    assert (
        external_system_dashboard_service._format_normalized_amount(12_345_678)
        == "12.345678"
    )
    assert (
        external_system_dashboard_service._format_normalized_amount(15_300_000)
        == "15.3"
    )


def test_today_range_ms_uses_admin_utc_plus_8_timezone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """外部运营大盘今日边界必须按 UTC+8 自然日计算。"""
    fixed_now = datetime(2026, 6, 28, 12, 30, tzinfo=ZoneInfo("Asia/Shanghai"))
    expected_start = int(
        datetime(2026, 6, 28, 0, 0, tzinfo=ZoneInfo("Asia/Shanghai")).timestamp() * 1000
    )
    expected_tomorrow = int(
        datetime(2026, 6, 29, 0, 0, tzinfo=ZoneInfo("Asia/Shanghai")).timestamp() * 1000
    )
    monkeypatch.setattr(
        external_system_dashboard_service,
        "_now_admin_operation",
        lambda: fixed_now,
    )

    assert external_system_dashboard_service._today_range_ms() == (
        expected_start,
        expected_tomorrow,
    )


@pytest.mark.asyncio
async def test_get_dashboard_uses_admin_utc_plus_8_range_for_today_statistics(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """外部 API 今日注册和充值统计共用 UTC+8 今日窗口。"""
    fixed_now = datetime(2026, 6, 28, 12, 30, tzinfo=ZoneInfo("Asia/Shanghai"))
    expected_start = int(
        datetime(2026, 6, 28, 0, 0, tzinfo=ZoneInfo("Asia/Shanghai")).timestamp() * 1000
    )
    expected_tomorrow = int(
        datetime(2026, 6, 29, 0, 0, tzinfo=ZoneInfo("Asia/Shanghai")).timestamp() * 1000
    )
    received_ranges: list[tuple[int, int]] = []

    async def count_today_registered_users(
        *,
        today_start_ms: int,
        tomorrow_start_ms: int,
    ) -> int:
        received_ranges.append((today_start_ms, tomorrow_start_ms))
        return 7

    async def load_today_paid_order_stats(
        *,
        today_start_ms: int,
        tomorrow_start_ms: int,
    ) -> ExternalPaidOrderStats:
        received_ranges.append((today_start_ms, tomorrow_start_ms))
        return ExternalPaidOrderStats(
            amounts=[],
            fulfillment_failed_count=0,
            fulfillment_failed_amounts=[],
        )

    async def load_dashboard_nodes() -> list[object]:
        return []

    monkeypatch.setattr(
        external_system_dashboard_service,
        "_now_admin_operation",
        lambda: fixed_now,
    )
    monkeypatch.setattr(
        external_system_dashboard_service,
        "_count_today_registered_users",
        count_today_registered_users,
    )
    monkeypatch.setattr(
        external_system_dashboard_service,
        "_load_today_paid_order_stats",
        load_today_paid_order_stats,
    )
    monkeypatch.setattr(
        external_system_dashboard_service,
        "_load_dashboard_nodes",
        load_dashboard_nodes,
    )

    with caplog.at_level("WARNING", logger="server"):
        dashboard = await external_system_dashboard_service.get_dashboard()

    assert dashboard.today_registered_count == 7
    assert received_ranges == [
        (expected_start, expected_tomorrow),
        (expected_start, expected_tomorrow),
    ]
    assert dashboard.today_paid_order_amounts == []
    assert dashboard.today_recharge_amounts == []
    assert dashboard.today_fulfillment_failed_count == 0
    assert dashboard.today_fulfillment_failed_amounts == []
    assert "external_dashboard_stage_timing: stage=today_registered" in caplog.text
    assert "external_dashboard_stage_timing: stage=today_paid_orders" in caplog.text
    assert "external_dashboard_stage_timing: stage=nodes" in caplog.text
    assert "external_dashboard_stage_timing: stage=service_total" in caplog.text


@pytest.mark.asyncio
async def test_load_one_node_snapshot_normalizes_success_payload(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """单节点快照成功时规范化网络速率字段。"""
    monkeypatch.setattr(
        "app.services.external_system_dashboard_service.service_node_internal_auth_token",
        lambda: "pytest-internal-token",
    )

    class FakeClient:
        async def get(self, _url, *, headers):
            assert headers == {"X-Service-Node-Internal-Token": "pytest-internal-token"}
            return SimpleNamespace(
                status_code=200,
                json=lambda: {
                    "network_rate": {
                        "rx_bytes_per_second": "10",
                        "tx_bytes_per_second": 20,
                        "sampled_at": 123,
                    },
                },
            )

    with caplog.at_level("WARNING", logger="server"):
        result = await external_system_dashboard_service._load_one_node_snapshot(
            client=FakeClient(),
            node=_node(101),
        )

    assert result.error == ""
    assert result.node_id == 101
    assert result.network_rate == {
        "rx_bytes_per_second": 10,
        "tx_bytes_per_second": 20,
        "sampled_at": 123,
    }
    assert "external_dashboard_node_timing: node_id=101 enabled=True" in caplog.text
    assert "outcome=success http_status=200" in caplog.text


@pytest.mark.asyncio
async def test_load_one_node_snapshot_keeps_node_when_request_fails() -> None:
    """单节点读取失败不让整个大盘失败，节点保留错误摘要。"""

    class FakeClient:
        async def get(self, _url, *, headers):
            raise TimeoutError("snapshot timeout")

    result = await external_system_dashboard_service._load_one_node_snapshot(
        client=FakeClient(),
        node=_node(102),
    )

    assert result.node_id == 102
    assert result.network_rate is None
    assert "dashboard_snapshot_request_failed" in result.error


@pytest.mark.asyncio
async def test_load_dashboard_nodes_fetches_snapshots_concurrently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """节点快照必须并发拉取，避免节点数乘以单节点超时。"""
    nodes = [_node(201), _node(202), _node(203)]
    started: list[int] = []
    release = asyncio.Event()

    async def list_service_nodes() -> list[ServiceNodeModel]:
        return nodes

    async def load_one_node_snapshot(*, client, node: ServiceNodeModel):
        started.append(int(node.node_id))
        if len(started) == len(nodes):
            release.set()
        await asyncio.wait_for(release.wait(), timeout=1)
        return external_system_dashboard_service._node_with_error(node, "pytest")

    monkeypatch.setattr(
        external_system_dashboard_service,
        "_list_service_nodes",
        list_service_nodes,
    )
    monkeypatch.setattr(
        external_system_dashboard_service,
        "_load_one_node_snapshot",
        load_one_node_snapshot,
    )

    results = await external_system_dashboard_service._load_dashboard_nodes()

    assert started == [201, 202, 203]
    assert [node.node_id for node in results] == [201, 202, 203]
