"""parse-pre-v2 与 download-pre-v2 控制面合同测试。"""

from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from app.api.client import media_pre_v2_client as pre_router_module
from app.api.user_dependencies import UserContext, get_current_user
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.main import app
from app.schemas.media_schema import MediaDirectDownloadIntentResponse
from app.services import media_pre_authorization_service as pre_module
from app.services.media_pre_authorization_service import DownloadPreValidatedRequest
from app.services.media_service import CreditChargeResult


@pytest.fixture(autouse=True)
def _allow_device_and_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """控制面单测只替换外部 Redis/设备检查，不替换项目 API。"""

    async def trusted_device(**_kwargs):
        return SimpleNamespace(trusted=True, reason="test_trusted")

    async def allowed(_identifier: str, *, limit: int, window: int) -> bool:
        assert limit > 0
        assert window > 0
        return True

    monkeypatch.setattr(
        "app.api.device_dependencies.device_service.verify_request_device",
        trusted_device,
    )
    monkeypatch.setattr(
        pre_router_module._parse_pre_v2_ip_limiter, "is_allowed", allowed
    )


@pytest.mark.asyncio
async def test_parse_pre_v2_returns_one_node_and_proxy_token(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """业务节点只选择一个解析节点，并签发代理执行 token。"""

    async def select_parse_nodes():
        return [
            SimpleNamespace(
                node_id=7,
                api_url=lambda path: f"http://parser.example{path}",
            ),
            SimpleNamespace(
                node_id=8,
                api_url=lambda path: f"http://unused.example{path}",
            ),
        ]

    async def select_parse_proxy() -> str:
        return "http://proxy.example:8080"

    def issue_proxy_token(*, link: str, proxy_url: str, node_id: int) -> str:
        assert link == "https://vimeo.com/123"
        assert proxy_url == "http://proxy.example:8080"
        assert node_id == 7
        return "proxy-execution-token"

    monkeypatch.setattr(
        pre_module.service_node_service, "select_parse_nodes", select_parse_nodes
    )
    monkeypatch.setattr(
        pre_module.proxy_pool_service, "select_parse_proxy", select_parse_proxy
    )
    monkeypatch.setattr(
        pre_module.media_execution_token_service,
        "issue_proxy_token",
        issue_proxy_token,
    )

    response = await async_client.post(
        "/api/client/media/parse-pre-v2",
        json={"link": "https://vimeo.com/123"},
        headers={"X-Device-Id": "test-device"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "code": 10000,
        "data": {
            "node": {
                "node_id": 7,
                "url": "http://parser.example/api/client/media/parse-v2",
            },
            "token": "proxy-execution-token",
        },
        "msg": "success",
    }


@pytest.mark.asyncio
async def test_parse_pre_v2_maps_missing_proxy_to_stable_code(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """没有启用代理时不签发执行 token，返回稳定代理错误码。"""

    async def select_parse_nodes():
        return [SimpleNamespace(node_id=7, api_url=lambda path: f"http://parser{path}")]

    async def select_parse_proxy() -> str:
        raise AppCommonException(CommonCode.MEDIA_PARSE_PROXY_UNAVAILABLE)

    monkeypatch.setattr(
        pre_module.service_node_service, "select_parse_nodes", select_parse_nodes
    )
    monkeypatch.setattr(
        pre_module.proxy_pool_service, "select_parse_proxy", select_parse_proxy
    )

    response = await async_client.post(
        "/api/client/media/parse-pre-v2",
        json={"link": "https://vimeo.com/123"},
        headers={"X-Device-Id": "test-device"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.MEDIA_PARSE_PROXY_UNAVAILABLE


@pytest.mark.asyncio
async def test_download_pre_v2_validates_material_before_charging(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """download-pre-v2 先验签材料，再扣 Credits，并直接返回同一材料。"""
    material = MediaDirectDownloadIntentResponse(
        source_id="vimeo:123:direct:1",
        platform="vimeo",
        download_mode="direct",
        download_url="https://cdn.vimeocdn.com/video.mp4?sig=1",
        filename="demo.mp4",
        mime_type="video/mp4",
        size=12,
    )
    validated = DownloadPreValidatedRequest(
        link="https://vimeo.com/123",
        source_id=material.source_id,
        platform="vimeo",
        download_mode="direct",
        filename=material.filename,
        mime_type=material.mime_type,
        size=material.size,
        preferred_node_id=None,
        extra={},
        material=material,
    )
    charged: list[dict[str, object]] = []

    def validate(_payload) -> DownloadPreValidatedRequest:
        return validated

    async def charge_download(**kwargs) -> CreditChargeResult:
        charged.append(kwargs)
        return CreditChargeResult(
            allowed=True,
            cost=1,
            balance=9,
            free_reason=None,
            resource_key="resource-key",
            record_id=1,
        )

    @asynccontextmanager
    async def lock(**_kwargs):
        yield

    async def current_user() -> UserContext:
        return UserContext(
            user_id=42,
            token="test-token",
            device_id="test-device",
            ip="203.0.113.9",
        )

    app.dependency_overrides[get_current_user] = current_user
    monkeypatch.setattr(
        pre_router_module.media_pre_authorization_service,
        "validate_download_pre_payload",
        validate,
    )
    monkeypatch.setattr(
        pre_router_module.media_pre_authorization_service,
        "download_pre_v2_user_lock",
        lock,
    )
    monkeypatch.setattr(
        pre_router_module.media_service, "charge_download", charge_download
    )
    try:
        response = await async_client.post(
            "/api/client/media/download-pre-v2",
            json={"resource_token": "resource-token"},
            headers={"X-Device-Id": "test-device"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["credits_balance"] == 9
    assert body["data"]["material"]["download_url"] == material.download_url
    assert charged == [
        {
            "user_id": 42,
            "platform": "vimeo",
            "canonical_link": "https://vimeo.com/123",
            "source_id": "vimeo:123:direct:1",
            "download_mode": "direct",
            "filename": "demo.mp4",
            "size_bytes": 12,
        }
    ]
