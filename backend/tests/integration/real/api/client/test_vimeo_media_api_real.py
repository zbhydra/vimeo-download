"""Vimeo Media API real 解析集成测试。"""

import pytest


pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_VIMEO_URL = "https://vimeo.com/1196869805"


async def _parse_vimeo(real_async_client, device_id: str) -> None:
    """依赖真实 Redis/Vimeo，验证分片资源不暴露下载材料。"""

    response = await real_async_client.post(
        "/api/client/media/parse-v2",
        json={"link": _VIMEO_URL},
        headers={"X-Device-Id": device_id, "X-Client-Product": "web"},
    )
    body = response.json()
    if body["code"] != 10000:
        pytest.skip(f"Vimeo real parse unavailable: code={body['code']}")

    data = body["data"]
    assert response.status_code == 200
    assert data["platform"] == "vimeo"
    assert data["resources"]
    resource = data["resources"][0]
    assert resource["download_mode"] == "client_mux"
    assert "download_url" not in resource
    assert "video_track" not in resource and "audio_track" not in resource
    assert resource["source_id"].startswith("vimeo:")


async def test_real_vimeo_parse_returns_client_mux_source_without_download_materials(
    real_async_client,
    real_redis_ready,
):
    """验证真实 Vimeo 解析返回 client_mux 元数据，不暴露 CDN 材料。"""

    await _parse_vimeo(real_async_client, "real-test-device-vimeo-parse")
