"""Vimeo 链接规范化及原生播放器材料选轨合同。"""

from importlib import import_module

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
