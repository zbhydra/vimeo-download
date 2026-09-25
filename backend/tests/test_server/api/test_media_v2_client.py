"""媒体 V2 下载节点 API 测试。

覆盖 parse-v2 响应 envelope、download-v2 body token、错误 envelope 契约和
download-v2 JSON 执行响应。
"""

import time

import pytest
from pydantic import TypeAdapter, ValidationError

from app.api.client import media_v2_client as media_v2_api
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.schemas.media_schema import (
    MEDIA_DOWNLOAD_TOKEN_MAX_LENGTH,
    MediaCapabilities,
    MediaClientMuxDownloadIntentResponse,
    MediaClientMuxFileTrackResponse,
    MediaClientMuxSegmentsTrackResponse,
    MediaClientMuxTrackResponse,
    MediaDirectDownloadIntentResponse,
    MediaDownloadV2Request,
    MediaParseResponse,
    MediaPost,
    MediaPostOwner,
    MediaSourceResponse,
)
from app.provider.media.base_media import JsonDownloadResult
from app.contracts.media_download import MediaDownloadTokenClaims


@pytest.fixture(autouse=True)
def allow_parse_v2_ip_limiter(monkeypatch: pytest.MonkeyPatch) -> None:
    """默认让 parse-v2 IP 限流通过，避免 API 单测访问真实 Redis。"""

    async def fake_is_allowed(identifier: str, limit: int, window: int) -> bool:
        return True

    monkeypatch.setattr(
        media_v2_api._parse_v2_ip_limiter,
        "is_allowed",
        fake_is_allowed,
    )


def _claims() -> MediaDownloadTokenClaims:
    """
    构造测试用 media_download claims。

    Returns:
        MediaDownloadTokenClaims。
    """
    now = int(time.time())
    return MediaDownloadTokenClaims(
        typ="media_download",
        v=1,
        platform="vimeo",
        download_mode="direct",
        link="https://vimeo.com/example/123",
        sid="source-video-1",
        size=4,
        uid=42,
        credits_cost=2,
        issued_ip="203.0.113.8",
        active_download_limit=3,
        iat=now,
        exp=now + 3600,
        jti="jti-fixed",
        extra={"tg_client_ref": "client-ref-1"},
    )


@pytest.mark.asyncio
async def test_parse_v2_returns_common_media_schema(async_client, monkeypatch) -> None:
    async def fake_parse_v2(
        *,
        link: str,
        **_kwargs,
    ) -> MediaParseResponse:
        assert link == "https://vimeo.com/example/123"
        return MediaParseResponse(
            status="ok",
            platform="vimeo",
            original_link=link,
            canonical_link=link,
            post=MediaPost(
                content_id="vimeo:1:123",
                title="demo",
                owner=MediaPostOwner(id="example", title="example"),
                extra={},
            ),
            resources=[
                MediaSourceResponse(
                    source_id="source-video-1",
                    platform="vimeo",
                    resource_token="resource-token",
                    filename="demo.mp4",
                    type="video",
                    mime_type="video/mp4",
                    size=4,
                    duration=10,
                    width=320,
                    height=240,
                    content_id="vimeo:1:123",
                    capabilities=MediaCapabilities(download=True, play=False),
                    download_mode="direct",
                    extra={"tg_client_ref": "client-ref-1"},
                )
            ],
        )

    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "parse_v2",
        fake_parse_v2,
    )

    response = await async_client.post(
        "/api/client/media/parse-v2",
        json={"link": "https://vimeo.com/example/123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["status"] == "ok"
    assert body["data"]["resources"][0]["download_mode"] == "direct"
    assert body["data"]["resources"][0]["size"] == 4
    assert "extra" not in body["data"]["resources"][0]
    assert "tg_client_ref" not in str(body["data"])
    assert body["data"]["resources"][0]["resource_token"] == "resource-token"


@pytest.mark.asyncio
async def test_parse_v2_ignores_node_id_in_body(async_client, monkeypatch) -> None:
    async def fake_parse_v2(
        *,
        link: str,
        **_kwargs,
    ) -> MediaParseResponse:
        assert link == "https://vimeo.com/example/123"
        return MediaParseResponse(
            status="ok",
            platform="vimeo",
            original_link=link,
            canonical_link=link,
            post=None,
            resources=[],
        )

    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "parse_v2",
        fake_parse_v2,
    )

    response = await async_client.post(
        "/api/client/media/parse-v2",
        json={"link": "https://vimeo.com/example/123", "node_id": "node-a"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == 10000


@pytest.mark.asyncio
async def test_parse_v2_requires_client_returns_error_envelope(
    async_client,
    monkeypatch,
) -> None:
    async def fake_parse_v2(
        *,
        link: str,
        **_kwargs,
    ) -> MediaParseResponse:
        assert link == "https://vimeo.com/c/123456789/42"
        raise AppCommonException(
            CommonCode.MEDIA_PARSE_REQUIRES_CLIENT,
            data={
                "status": "requires_client",
                "platform": "vimeo",
                "original_link": link,
                "canonical_link": link,
                "reason": "private_channel",
            },
        )

    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "parse_v2",
        fake_parse_v2,
    )

    response = await async_client.post(
        "/api/client/media/parse-v2",
        json={"link": "https://vimeo.com/c/123456789/42"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == CommonCode.MEDIA_PARSE_REQUIRES_CLIENT.value
    assert body["data"]["reason"] == "private_channel"


@pytest.mark.asyncio
async def test_parse_v2_ip_rate_limited_before_parse(
    async_client,
    monkeypatch,
) -> None:
    limiter_calls: list[tuple[str, int, int]] = []
    parse_called = False

    async def fake_is_allowed(identifier: str, limit: int, window: int) -> bool:
        limiter_calls.append((identifier, limit, window))
        return False

    async def fake_parse_v2(
        *,
        link: str,
        **_kwargs,
    ) -> MediaParseResponse:
        nonlocal parse_called
        parse_called = True
        raise AssertionError(f"parse-v2 should be rate limited before parsing {link}")

    monkeypatch.setattr(
        media_v2_api._parse_v2_ip_limiter,
        "is_allowed",
        fake_is_allowed,
    )
    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "parse_v2",
        fake_parse_v2,
    )

    response = await async_client.post(
        "/api/client/media/parse-v2",
        json={"link": "https://vimeo.com/example/123"},
        headers={"CF-Connecting-IP": "203.0.113.9"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == CommonCode.RATE_LIMIT_EXCEEDED_MEDIA.value
    assert body["data"]["reason"] == "parse_v2_ip_rate_limited"
    assert limiter_calls == [("203.0.113.9", 10, 60)]
    assert not parse_called


@pytest.mark.asyncio
async def test_download_v2_uses_body_token_and_returns_json(
    async_client,
    monkeypatch,
) -> None:
    def fake_decode_for_download(token: str) -> MediaDownloadTokenClaims:
        assert token == "token-body-value"
        return _claims()

    async def fake_download_v2(
        *,
        claims,
        range_header: str | None,
        client_ip: str | None = None,
    ):
        assert claims.jti == "jti-fixed"
        assert range_header == "bytes=0-"
        assert client_ip == "203.0.113.9"
        return JsonDownloadResult(
            payload=MediaDirectDownloadIntentResponse(
                source_id="vimeo:123:direct:1",
                platform="vimeo",
                download_mode="direct",
                download_url="https://cdn.vimeo.com/demo.mp4",
                filename="demo.mp4",
                mime_type="video/mp4",
                size=4,
                expires_at=None,
            )
        )

    monkeypatch.setattr(
        media_v2_api.media_download_token_service,
        "decode_for_download",
        fake_decode_for_download,
    )
    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "download_v2",
        fake_download_v2,
    )

    response = await async_client.post(
        "/api/client/media/download-v2",
        json={"token": "token-body-value"},
        headers={"CF-Connecting-IP": "203.0.113.9", "Range": "bytes=0-"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["download_mode"] == "direct"
    assert body["data"]["download_url"] == "https://cdn.vimeo.com/demo.mp4"
    assert "content-disposition" not in response.headers


@pytest.mark.asyncio
async def test_download_v2_get_uses_query_token_for_browser_download(
    async_client,
    monkeypatch,
) -> None:
    def fake_decode_for_download(token: str) -> MediaDownloadTokenClaims:
        assert token == "browser-query-token"
        return _claims()

    async def fake_download_v2(
        *,
        claims,
        range_header: str | None,
        client_ip: str | None = None,
    ):
        assert claims.jti == "jti-fixed"
        assert range_header is None
        assert client_ip == "203.0.113.9"
        return JsonDownloadResult(
            payload=MediaClientMuxDownloadIntentResponse(
                source_id="vimeo:123:client_mux:1:2",
                platform="vimeo",
                download_mode="client_mux",
                filename="browser.mp4",
                mime_type="video/mp4",
                size=4,
                expires_at=None,
                video_track=MediaClientMuxFileTrackResponse(
                    delivery="file",
                    kind="video",
                    url="https://cdn.vimeo.com/video.mp4",
                    mime_type="video/mp4",
                    size=3,
                ),
                audio_track=MediaClientMuxFileTrackResponse(
                    delivery="file",
                    kind="audio",
                    url="https://cdn.vimeo.com/audio.mp4",
                    mime_type="audio/mp4",
                    size=1,
                ),
            )
        )

    monkeypatch.setattr(
        media_v2_api.media_download_token_service,
        "decode_for_download",
        fake_decode_for_download,
    )
    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "download_v2",
        fake_download_v2,
    )

    response = await async_client.get(
        "/api/client/media/download-v2?token=browser-query-token",
        headers={"CF-Connecting-IP": "203.0.113.9"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["code"] == 10000
    assert body["data"]["download_mode"] == "client_mux"
    assert body["data"]["video_track"]["url"] == "https://cdn.vimeo.com/video.mp4"
    assert "content-disposition" not in response.headers


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "query",
    [
        "",
        "?token=",
        f"?token={'x' * (MEDIA_DOWNLOAD_TOKEN_MAX_LENGTH + 1)}",
    ],
    ids=["missing", "empty", "too_long"],
)
async def test_download_v2_get_rejects_invalid_query_token_with_no_store(
    async_client,
    query: str,
) -> None:
    response = await async_client.get(f"/api/client/media/download-v2{query}")

    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_download_v2_rejects_token_query_without_body(async_client) -> None:
    response = await async_client.post(
        "/api/client/media/download-v2?token=query-token",
        json={},
    )

    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_download_v2_rejects_mixed_token_and_legacy_fields(async_client) -> None:
    response = await async_client.post(
        "/api/client/media/download-v2",
        json={
            "token": "token-body-value",
            "link": "https://vimeo.com/example/123",
            "source_id": "source-video-1",
        },
    )

    assert response.status_code == 400
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["code"] == CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID.value


@pytest.mark.asyncio
async def test_download_v2_maps_expired_token_to_200_envelope(
    async_client,
    monkeypatch,
) -> None:
    def fake_decode_for_download(_token: str) -> MediaDownloadTokenClaims:
        raise AppCommonException(CommonCode.MEDIA_DOWNLOAD_TOKEN_EXPIRED)

    monkeypatch.setattr(
        media_v2_api.media_download_token_service,
        "decode_for_download",
        fake_decode_for_download,
    )

    response = await async_client.post(
        "/api/client/media/download-v2",
        json={"token": "expired-token"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["code"] == CommonCode.MEDIA_DOWNLOAD_TOKEN_EXPIRED.value


@pytest.mark.asyncio
async def test_download_v2_maps_invalid_token_to_200_envelope(
    async_client,
    monkeypatch,
) -> None:
    def fake_decode_for_download(_token: str) -> MediaDownloadTokenClaims:
        raise AppCommonException(CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID)

    monkeypatch.setattr(
        media_v2_api.media_download_token_service,
        "decode_for_download",
        fake_decode_for_download,
    )

    response = await async_client.post(
        "/api/client/media/download-v2",
        json={"token": "invalid-token"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["code"] == CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID.value


@pytest.mark.asyncio
async def test_download_v2_maps_range_error_to_416_with_header(
    async_client,
    monkeypatch,
) -> None:
    def fake_decode_for_download(_token: str) -> MediaDownloadTokenClaims:
        return _claims()

    async def fake_download_v2(*_args, **_kwargs):
        from app.exceptions.common_exception import AppCommonException

        raise AppCommonException(
            CommonCode.MEDIA_RANGE_NOT_SATISFIABLE,
            data={"content_range": "bytes */4"},
        )

    monkeypatch.setattr(
        media_v2_api.media_download_token_service,
        "decode_for_download",
        fake_decode_for_download,
    )
    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "download_v2",
        fake_download_v2,
    )

    response = await async_client.post(
        "/api/client/media/download-v2",
        json={"token": "token-body-value"},
        headers={"Range": "bytes=9-"},
    )

    assert response.status_code == 416
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-range"] == "bytes */4"
    assert response.json()["code"] == CommonCode.MEDIA_RANGE_NOT_SATISFIABLE.value


@pytest.mark.asyncio
async def test_download_v2_node_unavailable_returns_error_envelope(
    async_client,
    monkeypatch,
) -> None:
    def fake_decode_for_download(_token: str) -> MediaDownloadTokenClaims:
        return _claims()

    async def fake_download_v2(*_args, **_kwargs):
        raise AppCommonException(CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE)

    monkeypatch.setattr(
        media_v2_api.media_download_token_service,
        "decode_for_download",
        fake_decode_for_download,
    )
    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "download_v2",
        fake_download_v2,
    )

    response = await async_client.post(
        "/api/client/media/download-v2",
        json={"token": "token-body-value"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["code"] == CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE.value


@pytest.mark.asyncio
async def test_download_v2_direct_json_has_no_store(async_client, monkeypatch) -> None:
    def fake_decode_for_download(_token: str) -> MediaDownloadTokenClaims:
        return _claims()

    async def fake_download_v2(*_args, **_kwargs):
        return JsonDownloadResult(
            payload=MediaDirectDownloadIntentResponse(
                source_id="reddit:abc:image:1",
                platform="vimeo",
                download_mode="direct",
                download_url="https://i.redd.it/demo.jpg",
                filename="demo.jpg",
                mime_type="image/jpeg",
                size=123,
                expires_at=None,
            )
        )

    monkeypatch.setattr(
        media_v2_api.media_download_token_service,
        "decode_for_download",
        fake_decode_for_download,
    )
    monkeypatch.setattr(
        media_v2_api.media_provider_service,
        "download_v2",
        fake_download_v2,
    )

    response = await async_client.post(
        "/api/client/media/download-v2",
        json={"token": "token-body-value"},
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["data"]["download_mode"] == "direct"
    assert "content-disposition" not in response.headers


def test_download_v2_request_schema_allows_detecting_legacy_field_mix() -> None:
    request = MediaDownloadV2Request(
        token="token-body-value",
        link="https://vimeo.com/example/123",
        source_id="source-video-1",
    )

    assert request.token == "token-body-value"
    assert request.link == "https://vimeo.com/example/123"
    assert request.source_id == "source-video-1"


def test_client_mux_track_schema_discriminates_file_and_segments() -> None:
    track = MediaClientMuxFileTrackResponse(
        delivery="file",
        kind="video",
        url="https://v.redd.it/video.mp4",
        mime_type="video/mp4",
        size=123,
    )

    assert track.kind == "video"
    adapter = TypeAdapter(MediaClientMuxTrackResponse)
    assert adapter.validate_python(track.model_dump()) == track
    segmented = adapter.validate_python(
        {
            "delivery": "segments",
            "kind": "audio",
            "mime_type": "audio/mp4",
            "size": None,
            "init_segment": "AAAA",
            "segments": [{"url": "https://cdn.vimeo.com/audio.m4s"}],
        }
    )
    assert isinstance(segmented, MediaClientMuxSegmentsTrackResponse)
    assert segmented.segments[0].size is None
    with pytest.raises(ValidationError):
        adapter.validate_python({**track.model_dump(), "delivery": "segments"})
