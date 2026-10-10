"""媒体 Provider parse-v2 编排测试。"""

import pytest

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.media.base_media import (
    BaseMedia,
    JsonDownloadResult,
    MediaParseRequest,
    MediaParseResult,
)
from app.schemas.media_schema import (
    MediaCapabilities,
    MediaDirectDownloadIntentResponse,
    MediaParseResponse,
    MediaPost,
    MediaPostOwner,
    MediaSourceResponse,
)
from app.services import media_provider_service as provider_module
from app.services.media_provider_service import MediaProviderService


class _FakeProvider(BaseMedia):
    """只实现 parse 的测试 Provider。"""

    platform = "vimeo"

    def __init__(self, result: MediaParseResult | None = None, error=None) -> None:
        self.result = result
        self.error = error

    async def _parse(self, request: MediaParseRequest) -> MediaParseResult:
        assert request.proxy_url == "http://proxy.example:8080"
        if self.error is not None:
            raise self.error
        assert self.result is not None
        return self.result


def _response() -> MediaParseResponse:
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
                source_id="vimeo:123:direct:1",
                platform="vimeo",
                filename="demo.mp4",
                type="video",
                mime_type="video/mp4",
                size=12,
                content_id="vimeo:123",
                capabilities=MediaCapabilities(download=True, play=False),
                download_mode="direct",
            )
        ],
    )


def _material() -> JsonDownloadResult:
    return JsonDownloadResult(
        payload=MediaDirectDownloadIntentResponse(
            source_id="vimeo:123:direct:1",
            platform="vimeo",
            download_mode="direct",
            download_url="https://cdn.vimeocdn.com/video.mp4?sig=1",
            filename="demo.mp4",
            mime_type="video/mp4",
            size=12,
        )
    )


def _install_provider(monkeypatch: pytest.MonkeyPatch, provider: BaseMedia) -> None:
    monkeypatch.setattr(provider_module, "detect_platform", lambda _link: "vimeo")
    monkeypatch.setattr(
        provider_module, "get_media_provider", lambda _platform: provider
    )


@pytest.mark.asyncio
async def test_parse_v2_signs_material_token_and_returns_parse_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _FakeProvider(
        MediaParseResult(response=_response(), material=_material().payload)
    )
    _install_provider(monkeypatch, provider)
    issued: list[dict[str, object]] = []

    def issue_resource_token(**kwargs) -> str:
        issued.append(kwargs)
        return "resource-token"

    monkeypatch.setattr(
        provider_module.media_execution_token_service,
        "issue_resource_token",
        issue_resource_token,
    )

    result = await MediaProviderService().parse_v2(
        link="https://vimeo.com/123",
        proxy_url="http://proxy.example:8080",
        client_ip="203.0.113.8",
    )

    assert result.resources[0].resource_token == "resource-token"
    assert result.resources[0].extra == {}
    assert issued == [
        {
            "platform": "vimeo",
            "canonical_link": "https://vimeo.com/123",
            "source_id": "vimeo:123:direct:1",
            "download_mode": "direct",
            "filename": "demo.mp4",
            "mime_type": "video/mp4",
            "size": 12,
            "material": _material().payload,
        }
    ]


@pytest.mark.asyncio
async def test_parse_v2_maps_unsupported_and_missing_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        provider_module,
        "detect_platform",
        lambda _link: (_ for _ in ()).throw(
            AppCommonException(CommonCode.MEDIA_PLATFORM_UNSUPPORTED)
        ),
    )
    with pytest.raises(AppCommonException) as unsupported:
        await MediaProviderService().parse_v2(
            link="https://unsupported.example/123",
            proxy_url="http://proxy.example:8080",
        )
    assert unsupported.value.code == CommonCode.MEDIA_PARSE_UNSUPPORTED_PLATFORM

    monkeypatch.setattr(provider_module, "detect_platform", lambda _link: "vimeo")
    monkeypatch.setattr(provider_module, "get_media_provider", lambda _platform: None)
    with pytest.raises(AppCommonException) as missing:
        await MediaProviderService().parse_v2(
            link="https://vimeo.com/123",
            proxy_url="http://proxy.example:8080",
        )
    assert missing.value.code == CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE
    assert missing.value.data == {"reason": "provider_missing"}


@pytest.mark.asyncio
async def test_parse_v2_maps_provider_invalid_link(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _FakeProvider(
        error=AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg="provider invalid link",
        )
    )
    _install_provider(monkeypatch, provider)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().parse_v2(
            link="https://vimeo.com/123",
            proxy_url="http://proxy.example:8080",
        )

    assert exc_info.value.code == CommonCode.MEDIA_PARSE_INVALID_LINK
