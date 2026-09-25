"""服务节点大盘快照内部 API 测试。"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.internal import service_node_dashboard_snapshot as snapshot_api
from app.core.config import settings
from app.i18n.common_code import CommonCode
from app.main import create_app
from app.utils.service_node_internal_auth import verify_service_node_internal_auth_token


def test_internal_token_does_not_fallback_to_resource_token_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """内部快照鉴权不能复用下载 resource token secret。"""
    monkeypatch.setattr(settings.service_node, "internal_auth_token", None)
    monkeypatch.setattr(
        settings.download_token,
        "resource_token_secret",
        "pytest-resource-token-secret",
    )

    assert not verify_service_node_internal_auth_token("pytest-resource-token-secret")


@pytest.mark.asyncio
async def test_dashboard_snapshot_requires_internal_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """缺失或错误内部凭证时拒绝访问节点敏感快照。"""
    monkeypatch.setattr(settings.app, "role", "download")
    monkeypatch.setattr(settings.service_node, "internal_auth_token", "pytest-token")
    app = create_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        missing_response = await client.get("/internal/service-node/dashboard-snapshot")
        wrong_response = await client.get(
            "/internal/service-node/dashboard-snapshot",
            headers={"X-Service-Node-Internal-Token": "wrong-token"},
        )

    assert missing_response.status_code == 403
    assert missing_response.json()["code"] == CommonCode.PERMISSION_DENIED
    assert wrong_response.status_code == 403
    assert wrong_response.json()["code"] == CommonCode.PERMISSION_DENIED


@pytest.mark.asyncio
async def test_dashboard_snapshot_accepts_correct_internal_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """正确内部凭证可通过 FastAPI 入口读取节点快照。"""
    monkeypatch.setattr(settings.app, "role", "download")
    monkeypatch.setattr(settings.service_node, "internal_auth_token", "pytest-token")
    monkeypatch.setattr(
        snapshot_api.monitor_service,
        "get_network_rate",
        lambda: {
            "rx_bytes_per_second": 11,
            "tx_bytes_per_second": 22,
            "sampled_at": 33,
        },
    )

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/internal/service-node/dashboard-snapshot",
            headers={"X-Service-Node-Internal-Token": "pytest-token"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["network_rate"] == {
        "rx_bytes_per_second": 11,
        "tx_bytes_per_second": 22,
        "sampled_at": 33,
    }
