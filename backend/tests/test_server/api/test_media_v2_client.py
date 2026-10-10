"""parse-v2 节点 API 的代理 token 合同测试。"""

from types import SimpleNamespace

import pytest

from app.api.client import media_v2_client as media_v2_api
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.schemas.media_schema import (
    MediaCapabilities,
    MediaParseResponse,
    MediaPost,
    MediaPostOwner,
    MediaSourceResponse,
)


def _parse_response() -> MediaParseResponse:
    """构造包含内部 extra 的解析结果，验证公开响应不会泄漏材料字段。"""
    return MediaParseResponse(
        status="ok",
        platform="vimeo",
        original_link="https://vimeo.com/123",
        canonical_link="https://vimeo.com/123",
        post=MediaPost(
            content_id="vimeo:123",
            title="demo",
            owner=MediaPostOwner(id="owner", title="owner"),
        ),
        resources=[
            MediaSourceResponse(
                source_id="vimeo:123:client_mux:video:audio",
                platform="vimeo",
                resource_token="resource-token",
                filename="demo.mp4",
                type="video",
                mime_type="video/mp4",
                size=12,
                content_id="vimeo:123",
                capabilities=MediaCapabilities(download=True, play=False),
                download_mode="client_mux",
                extra={"internal": "material"},
            )
        ],
    )


@pytest.mark.asyncio
async def test_parse_v2_accepts_only_proxy_execution_token(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """parse-v2 从代理 token 取链接和代理，并返回不含内部材料的元数据。"""
    captured: dict[str, str] = {}

    def decode_proxy_token(token: str):
        assert token == "proxy-token"
        return SimpleNamespace(
            link="https://vimeo.com/123",
            proxy_url="http://user:pass@proxy.example:8080",
            node_id=7,
        )

    async def parse_v2(**kwargs):
        captured.update({key: str(value) for key, value in kwargs.items()})
        return _parse_response()

    monkeypatch.setattr(
        media_v2_api.media_execution_token_service,
        "decode_proxy_token",
        decode_proxy_token,
    )
    monkeypatch.setattr(media_v2_api.media_provider_service, "parse_v2", parse_v2)

    response = await async_client.post(
        "/api/client/media/parse-v2",
        json={"token": "proxy-token", "link": "ignored"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["resources"][0]["resource_token"] == "resource-token"
    assert "extra" not in body["data"]["resources"][0]
    assert captured == {
        "link": "https://vimeo.com/123",
        "proxy_url": "http://user:pass@proxy.example:8080",
        "client_ip": "127.0.0.1",
    }


@pytest.mark.asyncio
async def test_parse_v2_maps_invalid_execution_token(
    async_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """代理 token 无效时返回稳定错误码，且不执行 Vimeo。"""
    called = False

    def decode_proxy_token(_token: str):
        raise AppCommonException(CommonCode.MEDIA_PARSE_EXECUTION_TOKEN_INVALID)

    async def forbidden_parse(**_kwargs):
        nonlocal called
        called = True
        raise AssertionError("invalid proxy token must not reach Vimeo")

    monkeypatch.setattr(
        media_v2_api.media_execution_token_service,
        "decode_proxy_token",
        decode_proxy_token,
    )
    monkeypatch.setattr(
        media_v2_api.media_provider_service, "parse_v2", forbidden_parse
    )

    response = await async_client.post(
        "/api/client/media/parse-v2", json={"token": "bad-token"}
    )

    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.MEDIA_PARSE_EXECUTION_TOKEN_INVALID
    assert called is False
