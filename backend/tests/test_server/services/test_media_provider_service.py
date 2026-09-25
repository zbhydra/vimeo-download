"""media_provider_service 编排测试。"""

from types import SimpleNamespace
import time

import pytest

from app.contracts.media_download import MediaDownloadMode, MediaDownloadTokenClaims
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.media.base_media import (
    BaseMedia,
    JsonDownloadResult,
    MediaDownloadRequest,
    MediaParseRequest,
    MediaParseResult,
    MediaProviderError,
    MediaProviderErrorCode,
    ProviderPolicy,
)
from app.schemas.media_schema import (
    MediaCapabilities,
    MediaClientMuxDownloadIntentResponse,
    MediaClientMuxFileTrackResponse,
    MediaDirectDownloadIntentResponse,
    MediaParseResponse,
    MediaPost,
    MediaPostOwner,
    MediaSourceResponse,
)
from app.services import media_provider_service as provider_module
from app.services import media_resource_token_service as resource_token_module
from app.services.media_active_download_service import media_active_download_service
from app.services.media_provider_service import MediaProviderService
from app.services.media_resource_token_service import MediaResourceTokenService
from app.utils.media_extra import MediaExtra


class _FakeProvider(BaseMedia):
    """测试用 Provider。"""

    platform = "vimeo"

    def __init__(
        self,
        *,
        policy: ProviderPolicy,
        parse_result: MediaParseResult | None = None,
        parse_error: AppCommonException | None = None,
        download_result: JsonDownloadResult | None = None,
        download_error: MediaProviderError | None = None,
    ) -> None:
        self.__class__.policy = policy
        self._parse_result = parse_result
        self._parse_error = parse_error
        self._download_result = download_result
        self._download_error = download_error
        self.download_requests: list[MediaDownloadRequest] = []
        # 记录 Provider 执行瞬间的活跃下载计数，用于验证 acquire/release 时序。
        self.active_count_during_download: list[int] = []

    async def _parse(self, request: MediaParseRequest) -> MediaParseResult:
        """返回预设 parse result。"""
        assert request.url == "https://vimeo.com/example/123"
        if self._parse_error is not None:
            raise self._parse_error
        assert self._parse_result is not None
        return self._parse_result

    async def _download(self, request: MediaDownloadRequest) -> JsonDownloadResult:
        """返回预设 download result 或错误。"""
        self.download_requests.append(request)
        self.active_count_during_download.append(
            media_active_download_service.active_count("user:42")
        )
        if self._download_error is not None:
            raise self._download_error
        assert self._download_result is not None
        return self._download_result


@pytest.fixture(autouse=True)
def _reset_active_downloads() -> None:
    """每个测试清理进程内 active 计数。"""
    media_active_download_service.reset_for_test()


@pytest.fixture(autouse=True)
def _patch_resource_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """parse_v2 签发 resource token 不访问真实配置。"""
    monkeypatch.setattr(
        resource_token_module.settings,
        "download_token",
        SimpleNamespace(resource_token_secret="test-resource-secret"),
        raising=False,
    )


def _claims(
    *,
    download_mode: MediaDownloadMode = "direct",
    uid: int | None = 42,
    extra: MediaExtra | None = None,
    size: int | None = 4,
) -> MediaDownloadTokenClaims:
    """构造测试用 media_download claims。"""
    now = int(time.time())
    return MediaDownloadTokenClaims(
        typ="media_download",
        v=1,
        platform="vimeo",
        download_mode=download_mode,
        link="https://vimeo.com/example/123",
        sid="source-video-1",
        size=size,
        uid=uid,
        credits_cost=1,
        issued_ip="203.0.113.8",
        active_download_limit=3,
        iat=now,
        exp=now + 3600,
        jti="jti-fixed",
        extra={} if extra is None else extra,
    )


def _parse_response(*, extra: dict[str, object] | None = None) -> MediaParseResponse:
    """构造测试用 parse response。"""
    return MediaParseResponse(
        status="ok",
        platform="vimeo",
        original_link="https://vimeo.com/example/123",
        canonical_link="https://vimeo.com/example/123",
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
                extra=extra or {},
            )
        ],
    )


def _direct_result(*, size: int | None = 123) -> JsonDownloadResult:
    """构造 direct JSON result。"""
    return JsonDownloadResult(
        payload=MediaDirectDownloadIntentResponse(
            source_id="source-video-1",
            platform="vimeo",
            download_mode="direct",
            download_url="https://i.redd.it/demo.jpg",
            filename="demo.jpg",
            mime_type="image/jpeg",
            size=size,
            expires_at=None,
        )
    )


def _client_mux_result(*, size: int | None = 456) -> JsonDownloadResult:
    """构造 client_mux JSON result。"""
    return JsonDownloadResult(
        payload=MediaClientMuxDownloadIntentResponse(
            source_id="source-video-1",
            platform="vimeo",
            download_mode="client_mux",
            filename="demo.mp4",
            mime_type="video/mp4",
            size=size,
            expires_at=None,
            video_track=MediaClientMuxFileTrackResponse(
                delivery="file",
                kind="video",
                url="https://v.redd.it/video.mp4",
                mime_type="video/mp4",
                size=300,
            ),
            audio_track=MediaClientMuxFileTrackResponse(
                delivery="file",
                kind="audio",
                url="https://v.redd.it/audio.mp4",
                mime_type="audio/mp4",
                size=156,
            ),
        )
    )


def _install_provider(monkeypatch: pytest.MonkeyPatch, provider: BaseMedia | None):
    """替换 service 模块内的显式 registry 查找函数。"""
    monkeypatch.setattr(
        provider_module, "get_media_provider", lambda _platform: provider
    )
    monkeypatch.setattr(provider_module, "detect_platform", lambda _link: "vimeo")


@pytest.mark.asyncio
async def test_parse_v2_signs_resource_extra_and_keeps_response_internal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """parse_v2 把 resource.extra 签进 resource token。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        parse_result=MediaParseResult(
            response=_parse_response(extra={"tg_client_ref": "client-ref-1"})
        ),
    )
    _install_provider(monkeypatch, provider)

    response = await MediaProviderService().parse_v2(
        link="https://vimeo.com/example/123",
        client_ip="203.0.113.9",
    )

    token = response.resources[0].resource_token
    claims = MediaResourceTokenService().decode_for_download_pre(token)
    assert claims.extra == {"tg_client_ref": "client-ref-1"}
    assert claims.mime_type == "video/mp4"
    assert response.resources[0].extra == {"tg_client_ref": "client-ref-1"}


@pytest.mark.asyncio
async def test_parse_v2_rejects_invalid_extra(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """extra 非短小 JSON object 时 parse 返回节点不可用 invalid_extra。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        parse_result=MediaParseResult(
            response=_parse_response(extra={"a": {"b": {"c": {"d": "too-deep"}}}})
        ),
    )
    _install_provider(monkeypatch, provider)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().parse_v2(
            link="https://vimeo.com/example/123",
            client_ip="203.0.113.9",
        )

    assert exc_info.value.code == CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE
    assert exc_info.value.data == {"reason": "invalid_extra"}


@pytest.mark.asyncio
async def test_parse_v2_distinguishes_unsupported_platform_and_provider_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """URL 不支持和 registry 缺 Provider 使用不同错误。"""
    monkeypatch.setattr(
        provider_module,
        "detect_platform",
        lambda _link: (_ for _ in ()).throw(
            AppCommonException(CommonCode.MEDIA_PLATFORM_UNSUPPORTED)
        ),
    )

    with pytest.raises(AppCommonException) as unsupported:
        await MediaProviderService().parse_v2(
            link="https://unsupported.example/post",
            client_ip="203.0.113.9",
        )
    assert unsupported.value.code == CommonCode.MEDIA_PARSE_UNSUPPORTED_PLATFORM

    monkeypatch.setattr(provider_module, "detect_platform", lambda _link: "vimeo")
    monkeypatch.setattr(provider_module, "get_media_provider", lambda _platform: None)

    with pytest.raises(AppCommonException) as missing:
        await MediaProviderService().parse_v2(
            link="https://vimeo.com/1194296700",
            client_ip="203.0.113.9",
        )
    assert missing.value.code == CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE
    assert missing.value.data == {"reason": "provider_missing"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "legacy_code",
    [
        CommonCode.INVALID_REQUEST,
        CommonCode.VALIDATION_ERROR,
    ],
)
async def test_parse_v2_maps_legacy_invalid_link_errors(
    monkeypatch: pytest.MonkeyPatch,
    legacy_code: CommonCode,
) -> None:
    """旧平台非法链接错误在 parse-v2 中保持 MEDIA_PARSE_INVALID_LINK。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        parse_error=AppCommonException(
            legacy_code,
            ext_msg=f"legacy invalid link: code={legacy_code.name}",
        ),
    )
    _install_provider(monkeypatch, provider)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().parse_v2(
            link="https://vimeo.com/example/123",
            client_ip="203.0.113.9",
        )

    assert exc_info.value.code == CommonCode.MEDIA_PARSE_INVALID_LINK


@pytest.mark.asyncio
async def test_download_v2_active_limited_acquires_and_releases_guard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """active_limited Provider 在 Provider 执行期间持有 guard，返回后释放。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        download_result=_direct_result(),
    )
    _install_provider(monkeypatch, provider)

    result = await MediaProviderService().download_v2(
        claims=_claims(),
        range_header=None,
        client_ip="203.0.113.9",
    )

    assert isinstance(result, JsonDownloadResult)
    assert provider.active_count_during_download == [1]
    assert media_active_download_service.active_count("user:42") == 0


@pytest.mark.asyncio
async def test_download_v2_active_limited_fourth_request_is_rate_limited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """第 4 个 active-limited 下载返回 active limit 错误。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        download_result=_direct_result(),
    )
    _install_provider(monkeypatch, provider)
    first = media_active_download_service.acquire("user:42", 3)
    second = media_active_download_service.acquire("user:42", 3)
    third = media_active_download_service.acquire("user:42", 3)

    try:
        with pytest.raises(AppCommonException) as exc_info:
            await MediaProviderService().download_v2(
                claims=_claims(),
                range_header=None,
                client_ip="203.0.113.9",
            )
    finally:
        first.release()
        second.release()
        third.release()

    assert exc_info.value.code == CommonCode.RATE_LIMIT_EXCEEDED_MEDIA
    assert exc_info.value.data == {"reason": "active_download_limit_exceeded"}


@pytest.mark.asyncio
async def test_download_v2_active_limited_false_does_not_acquire(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """active_limited=False 的 Provider 不占用活跃下载计数。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=False),
        download_result=_direct_result(),
    )
    _install_provider(monkeypatch, provider)

    result = await MediaProviderService().download_v2(
        claims=_claims(download_mode="direct"),
        range_header=None,
        client_ip="203.0.113.9",
    )

    assert isinstance(result, JsonDownloadResult)
    assert media_active_download_service.active_count("user:42") == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("download_mode", "download_result"),
    [
        ("direct", _direct_result(size=5)),
        ("client_mux", _client_mux_result(size=5)),
    ],
)
async def test_download_v2_rejects_oversized_json_result(
    monkeypatch: pytest.MonkeyPatch,
    download_mode: MediaDownloadMode,
    download_result: JsonDownloadResult,
) -> None:
    """direct/client_mux Provider 返回真实 size 超限时统一拒绝。"""
    monkeypatch.setattr(provider_module, "MEDIA_DOWNLOAD_MAX_SIZE_BYTES", 4)
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=False),
        download_result=download_result,
    )
    _install_provider(monkeypatch, provider)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().download_v2(
            claims=_claims(download_mode=download_mode, size=4),
            range_header=None,
            client_ip="203.0.113.9",
        )

    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE
    assert media_active_download_service.active_count("user:42") == 0


@pytest.mark.asyncio
async def test_download_v2_provider_error_releases_active_guard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Provider 返回 result 前抛错时释放 active guard。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        download_error=MediaProviderError(
            MediaProviderErrorCode.NODE_UNAVAILABLE,
            "provider failed before result",
        ),
    )
    _install_provider(monkeypatch, provider)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().download_v2(
            claims=_claims(),
            range_header=None,
            client_ip="203.0.113.9",
        )

    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE
    assert media_active_download_service.active_count("user:42") == 0


@pytest.mark.asyncio
async def test_download_v2_contract_mismatch_releases_active_guard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """claims mode 与 Provider payload 不匹配时按节点不可用处理并释放 active guard。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        download_result=_client_mux_result(),
    )
    _install_provider(monkeypatch, provider)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().download_v2(
            claims=_claims(download_mode="direct"),
            range_header=None,
            client_ip="203.0.113.9",
        )

    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE
    assert media_active_download_service.active_count("user:42") == 0


@pytest.mark.asyncio
async def test_download_v2_maps_range_error_to_416_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Provider Range 错误映射为 MEDIA_RANGE_NOT_SATISFIABLE。"""
    provider = _FakeProvider(
        policy=ProviderPolicy(active_limited=True),
        download_error=MediaProviderError(
            MediaProviderErrorCode.RANGE_NOT_SATISFIABLE,
            "range failed",
            data={"content_range": "bytes */4"},
        ),
    )
    _install_provider(monkeypatch, provider)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().download_v2(
            claims=_claims(),
            range_header="bytes=9-",
            client_ip="203.0.113.9",
        )

    assert exc_info.value.code == CommonCode.MEDIA_RANGE_NOT_SATISFIABLE
    assert exc_info.value.data == {"content_range": "bytes */4"}
    assert media_active_download_service.active_count("user:42") == 0


@pytest.mark.asyncio
async def test_download_v2_provider_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """download_v2 registry 缺 Provider 返回节点不可用 provider_missing。"""
    monkeypatch.setattr(provider_module, "get_media_provider", lambda _platform: None)

    with pytest.raises(AppCommonException) as exc_info:
        await MediaProviderService().download_v2(
            claims=_claims(),
            range_header=None,
            client_ip="203.0.113.9",
        )

    assert exc_info.value.code == CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE
    assert exc_info.value.data == {"reason": "provider_missing"}
