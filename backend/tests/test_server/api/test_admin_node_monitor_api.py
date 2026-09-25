"""Admin 节点本机监控 API 测试。"""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.admin import admin_node_monitor
from app.core.config import settings
from app.main import create_app
from app.utils.jwt import JwtData, JwtUnit


def _admin_access_token(*, user_id: int = 1) -> str:
    """签发测试用 admin access JWT。"""
    token, _expires_at = JwtUnit.create_admin_token(
        JwtData(user_id=user_id, email="pytest-admin"),
        expires_delta=timedelta(minutes=5),
    )
    return token


@pytest.mark.asyncio
async def test_node_monitor_network_rate_returns_cached_rate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """节点本机监控接口返回当前进程缓存的网络速率。"""
    monkeypatch.setattr(settings.app, "role", "download")
    monkeypatch.setattr(
        admin_node_monitor.monitor_service,
        "get_network_rate",
        lambda: {
            "rx_bytes_per_second": 123,
            "tx_bytes_per_second": 456,
            "sampled_at": 1000,
        },
    )
    app = create_app()

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/api/admin/node-monitor/network-rate",
            headers={"Authorization": f"Bearer {_admin_access_token()}"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["network_rate"] == {
        "rx_bytes_per_second": 123,
        "tx_bytes_per_second": 456,
        "sampled_at": 1000,
    }


@pytest.mark.asyncio
async def test_node_monitor_network_rate_failure_returns_null(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """监控缓存读取失败时，节点本机监控接口返回空速率。"""
    monkeypatch.setattr(settings.app, "role", "download")

    def fake_get_network_rate() -> dict[str, int]:
        raise RuntimeError("monitor unavailable")

    monkeypatch.setattr(
        admin_node_monitor.monitor_service,
        "get_network_rate",
        fake_get_network_rate,
    )
    app = create_app()

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/api/admin/node-monitor/network-rate",
            headers={"Authorization": f"Bearer {_admin_access_token()}"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["network_rate"] is None
