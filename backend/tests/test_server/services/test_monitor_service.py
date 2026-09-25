"""本机监控服务测试。"""

from __future__ import annotations

from dataclasses import asdict

import pytest

from app.services import monitor_service as monitor_module
from app.services.monitor_service import (
    MonitorService,
    NetworkRateSnapshot,
)


def test_parse_net_dev_line_skips_loopback() -> None:
    """`lo` 网卡不计入业务网络速率。"""
    line = "    lo: 100 1 0 0 0 0 0 0 200 2 0 0 0 0 0 0"

    assert MonitorService._parse_net_dev_line(line) is None


def test_parse_net_dev_line_reads_rx_and_tx_bytes() -> None:
    """解析 `/proc/net/dev` 单行第 1 和第 9 个数字。"""
    line = "  eth0: 1234 1 0 0 0 0 0 0 5678 2 0 0 0 0 0 0"

    assert MonitorService._parse_net_dev_line(line) == (1234, 5678)


def test_collect_network_rate_sums_non_loopback_interfaces(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """多块非 lo 网卡求和，并按两次采样差值计算速率。"""
    samples = [
        """Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000 1 0 0 0 0 0 0 2000 2 0 0 0 0 0 0
  eth0: 1000 1 0 0 0 0 0 0 4000 2 0 0 0 0 0 0
  ens5: 2000 1 0 0 0 0 0 0 6000 2 0 0 0 0 0 0
""",
        """Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 9000 1 0 0 0 0 0 0 9000 2 0 0 0 0 0 0
  eth0: 2000 1 0 0 0 0 0 0 7000 2 0 0 0 0 0 0
  ens5: 5000 1 0 0 0 0 0 0 9000 2 0 0 0 0 0 0
""",
    ]
    monotonic_values = iter([10.0, 15.0])

    class FakeNetDevPath:
        """测试用 `/proc/net/dev` 路径对象。"""

        def read_text(self, encoding: str) -> str:
            assert encoding == "utf-8"
            return samples.pop(0)

    monkeypatch.setattr(monitor_module, "PROC_NET_DEV_PATH", FakeNetDevPath())
    monkeypatch.setattr(
        monitor_module.time,
        "monotonic",
        lambda: next(monotonic_values),
    )
    monkeypatch.setattr(monitor_module.time, "time", lambda: 1000.0)

    service = MonitorService()

    service.collect_network_rate_once()
    assert service.get_network_rate() is None

    service.collect_network_rate_once()
    assert service.get_network_rate() == {
        "rx_bytes_per_second": 800,
        "tx_bytes_per_second": 1200,
        "sampled_at": 1000,
    }


def test_get_network_rate_returns_none_when_snapshot_expired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """超过有效期的速率缓存不返回。"""
    service = MonitorService()
    service._network_rate = NetworkRateSnapshot(  # noqa: SLF001
        rx_bytes_per_second=1,
        tx_bytes_per_second=2,
        sampled_at=100,
    )
    monkeypatch.setattr(
        monitor_module.time,
        "time",
        lambda: 100 + monitor_module.NETWORK_RATE_TTL_SECONDS + 1,
    )

    assert service.get_network_rate() is None


def test_get_network_rate_returns_plain_dict(monkeypatch: pytest.MonkeyPatch) -> None:
    """有效缓存以 JSON 友好的 dict 返回。"""
    snapshot = NetworkRateSnapshot(
        rx_bytes_per_second=3,
        tx_bytes_per_second=4,
        sampled_at=100,
    )
    service = MonitorService()
    service._network_rate = snapshot  # noqa: SLF001
    monkeypatch.setattr(monitor_module.time, "time", lambda: 105.0)

    assert service.get_network_rate() == asdict(snapshot)
