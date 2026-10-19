"""Vimeo 链接规范化及原生播放器材料选轨合同。"""

from importlib import import_module
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode

svc = import_module("app.provider.media.vimeo_media")
provider = svc.vimeo_media


def test_vimeo_links_normalize_to_canonical():
    assert (
        provider._compute_canonical_link(
            "https://player.vimeo.com/video/1194296700?utm_source=copy&h=abc"
        )
        == "https://vimeo.com/1194296700?h=abc"
    )
    assert (
        provider._compute_canonical_link("https://www.vimeo.com/1194296700")
        == "https://vimeo.com/1194296700"
    )
    assert (
        svc._player_page_url("https://vimeo.com/1194296700?h=abc", 1194296700)
        == "https://player.vimeo.com/video/1194296700?h=abc"
    )


def test_vimeo_unsupported_host_raises_parse_failed():
    with pytest.raises(AppCommonException) as error:
        provider._compute_canonical_link("https://example.com/1194296700")
    assert error.value.code == CommonCode.VIMEO_PARSE_FAILED


@pytest.mark.parametrize("access_hash", ["43f047633a", "1234567890"])
def test_vimeo_path_hash_is_canonicalized_before_video_id(access_hash: str):
    canonical = provider._compute_canonical_link(
        f"https://vimeo.com/749609854/{access_hash}?autoplay=1"
    )
    assert canonical == f"https://vimeo.com/749609854?autoplay=1&h={access_hash}"
    assert provider._compute_canonical_link(canonical) == canonical
    assert (
        provider._compute_canonical_link(
            f"https://vimeo.com/749609854/{access_hash}?h=existing"
        )
        == "https://vimeo.com/749609854?h=existing"
    )
    assert (
        provider._compute_canonical_link(
            f"https://vimeo.com/749609854/{access_hash}?h="
        )
        == "https://vimeo.com/749609854?h="
    )
    assert (
        provider._compute_canonical_link(
            f"https://vimeo.com/channels/749609854/{access_hash}"
        )
        == f"https://vimeo.com/channels/749609854/{access_hash}"
    )


def test_vimeo_config_selects_progressive_then_preserves_original_track():
    config = svc._Config.model_validate(
        {
            "video": {"id": 123, "title": "视频", "duration": 12.35},
            "request": {
                "files": {
                    "progressive": [
                        {
                            "profile": 1,
                            "width": 640,
                            "height": 360,
                            "url": "https://skyfire.vimeocdn.com/low.mp4",
                        },
                        {
                            "profile": 2,
                            "width": 1920,
                            "height": 1080,
                            "url": "https://skyfire.vimeocdn.com/high.mp4",
                        },
                    ]
                }
            },
        }
    )
    assert provider._progressive(config, None).profile == 2
    assert provider._progressive(config, "vimeo:123:direct:1").profile == 1
    assert provider._progressive(config, "vimeo:123:direct:missing") is None


def test_vimeo_dash_selects_avc_aac_and_rejects_missing_original_pair():
    config = svc._Config.model_validate(
        {
            "video": {"id": 123, "title": "视频", "duration": 12.35},
            "request": {"files": {}},
        }
    )
    common = {"init_segment": "AAEC", "segments": [{"url": "segment.mp4", "size": 10}]}
    manifest = svc._Manifest.model_validate(
        {
            "video": [
                {
                    **common,
                    "id": "low",
                    "codecs": "avc1.64002A",
                    "mime_type": "video/mp4",
                    "height": 360,
                    "bitrate": 500,
                },
                {
                    **common,
                    "id": "high",
                    "codecs": "avc1.64002A",
                    "mime_type": "video/mp4",
                    "height": 1080,
                    "bitrate": 1000,
                },
                {
                    **common,
                    "id": "hevc",
                    "codecs": "hvc1",
                    "mime_type": "video/mp4",
                    "height": 2160,
                    "bitrate": 2000,
                },
            ],
            "audio": [
                {
                    **common,
                    "id": "aac",
                    "codecs": "mp4a.40.2",
                    "mime_type": "audio/mp4",
                    "bitrate": 100,
                }
            ],
        }
    )
    assert tuple(
        track.id for track in provider._dash_tracks(config, manifest, None)
    ) == ("high", "aac")
    assert tuple(
        track.id
        for track in provider._dash_tracks(
            config, manifest, "vimeo:123:client_mux:low:aac"
        )
    ) == ("low", "aac")
    with pytest.raises(AppCommonException) as error:
        provider._dash_tracks(config, manifest, "vimeo:123:client_mux:gone:aac")
    assert error.value.code == CommonCode.VIMEO_PARSE_FAILED


def test_vimeo_thumbnail_falls_back_to_video_thumbnail_url_when_thumbs_missing():
    config = svc._Config.model_validate(
        {
            "video": {
                "id": 123,
                "title": "视频",
                "duration": 12.35,
                "thumbs": None,
                "thumbnail_url": "https://i.vimeocdn.com/video/fallback_640",
            },
            "request": {"files": {}},
        }
    )

    assert provider._thumbnail_url(config) == (
        "https://i.vimeocdn.com/video/fallback_640"
    )


def test_vimeo_thumbnail_ignores_non_cdn_thumbnail_url():
    config = svc._Config.model_validate(
        {
            "video": {
                "id": 123,
                "title": "视频",
                "duration": 12.35,
                "thumbnail_url": "https://example.com/fallback.jpg",
            },
            "request": {"files": {}},
        }
    )

    assert provider._thumbnail_url(config) == ""


@pytest.mark.parametrize(
    "status,challenge,delivery,expected",
    [
        (403, False, None, svc.MediaProviderErrorCode.RESOURCE_UNREACHABLE),
        (401, False, None, svc.MediaProviderErrorCode.RESOURCE_UNREACHABLE),
        (404, False, None, svc.MediaProviderErrorCode.RESOURCE_UNREACHABLE),
        (429, False, None, svc.MediaProviderErrorCode.NODE_UNAVAILABLE),
        (503, False, None, svc.MediaProviderErrorCode.NODE_UNAVAILABLE),
        (403, True, None, svc.MediaProviderErrorCode.NODE_UNAVAILABLE),
        (200, True, "inline", None),
        (200, True, "inline_pending_xhr", None),
        (200, True, "xhr", None),
        (200, False, "xhr", None),
    ],
)
async def test_vimeo_page_failure_classification_keeps_valid_config_priority(
    monkeypatch, status, challenge, delivery, expected
):
    config = {
        "video": {"id": 123, "title": "视频", "duration": 1},
        "request": {
            "files": {
                "progressive": [
                    {
                        "id": 1,
                        "width": 640,
                        "height": 360,
                        "url": "https://skyfire.vimeocdn.com/test.mp4",
                    }
                ]
            }
        },
    }
    callbacks = {}
    pending_body = asyncio.get_running_loop().create_future()

    async def read_pending_body():
        return await pending_body

    async def goto(*_args, **_kwargs):
        if delivery in {"xhr", "inline_pending_xhr"}:
            callbacks["response"](
                SimpleNamespace(
                    url="https://player.vimeo.com/video/123/config",
                    status=200,
                    json=(
                        AsyncMock(side_effect=read_pending_body)
                        if delivery == "inline_pending_xhr"
                        else AsyncMock(return_value=config)
                    ),
                )
            )
        return SimpleNamespace(
            status=status, headers={"cf-mitigated": "challenge"} if challenge else {}
        )

    async def evaluate(_expression):
        # 浏览器 RPC 会让已捕获响应的读取任务得到执行机会。
        await asyncio.sleep(0)
        return config if delivery in {"inline", "inline_pending_xhr"} else None

    page = SimpleNamespace(
        route=AsyncMock(),
        on=lambda name, fn: callbacks.update({name: fn}),
        goto=goto,
        title=AsyncMock(return_value="播放器"),
        evaluate=evaluate,
        locator=lambda _selector: SimpleNamespace(
            count=AsyncMock(return_value=int(challenge))
        ),
    )
    context = SimpleNamespace(
        add_init_script=AsyncMock(),
        new_page=AsyncMock(return_value=page),
        close=AsyncMock(),
    )
    browser = SimpleNamespace(
        new_page=AsyncMock(
            return_value=SimpleNamespace(
                evaluate=AsyncMock(return_value="Chrome/145"),
                context=SimpleNamespace(close=AsyncMock()),
            )
        ),
        new_context=AsyncMock(return_value=context),
    )
    monkeypatch.setattr(svc, "ensure_browser", AsyncMock(return_value=browser))
    monkeypatch.setattr(svc, "assert_public_host", lambda _host: None)
    if expected:
        with pytest.raises(svc.MediaProviderError) as error:
            await provider._capture_vimeo(
                "https://vimeo.com/123",
                "https://vimeo.com/123",
                None,
                "http://localhost:1234",
            )
        assert error.value.code == expected
    else:
        parsed, material = await asyncio.wait_for(
            provider._capture_vimeo(
                "https://vimeo.com/123",
                "https://vimeo.com/123",
                None,
                "http://localhost:1234",
            ),
            timeout=1,
        )
        assert parsed.post.content_id == "vimeo:123"
        assert material.payload.download_mode == "direct"
        if delivery == "inline_pending_xhr":
            assert pending_body.cancelled()
    context.close.assert_awaited_once()
