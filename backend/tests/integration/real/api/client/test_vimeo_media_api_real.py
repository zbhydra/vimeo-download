"""Vimeo Media API real 解析集成测试。"""

import pytest

from app.core.redis import redis_client
from app.i18n.common_code import CommonCode
from app.services.device_service import device_service


pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_VIMEO_URL = "https://vimeo.com/1225933284"
_CLIENT_IP = "198.51.100.51"
# 没有可用代理，或 Playwright 不支持当前代理时，只能记为环境未验。
# 样本失效（24033）等其他错误码必须失败，否则这条测试坏掉也看不出来。
_EGRESS_UNAVAILABLE_CODES = {
    CommonCode.MEDIA_PARSE_PROXY_UNAVAILABLE.value,
    CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE.value,
}


def _skip_if_egress_unavailable(code: int) -> None:
    """解析出口不可用时跳过，其他错误码交给后续断言。"""

    if code in _EGRESS_UNAVAILABLE_CODES:
        pytest.skip(
            f"REAL_PROXY_UNAVAILABLE: Vimeo 解析出口不可用，跳过 real 测试: code={code}"
        )


async def _parse_vimeo(real_async_client, device_id: str) -> None:
    """依赖真实 Redis/Vimeo/代理，验证分片资源不暴露下载材料。"""

    # parse-pre-v2 只接受最近加载过网站页面的设备，这里写入同一条可信记录。
    await device_service.set(device_id, _CLIENT_IP)
    headers = {
        "X-Device-Id": device_id,
        "X-Client-Product": "web",
        "X-Forwarded-For": _CLIENT_IP,
    }
    try:
        pre_body = (
            await real_async_client.post(
                "/api/client/media/parse-pre-v2",
                json={"link": _VIMEO_URL},
                headers=headers,
            )
        ).json()
        _skip_if_egress_unavailable(pre_body["code"])
        assert pre_body["code"] == 10000, pre_body

        response = await real_async_client.post(
            "/api/client/media/parse-v2",
            json={"token": pre_body["data"]["token"]},
            headers=headers,
        )
    finally:
        redis = await redis_client.get_client()
        await redis.delete(device_service._build_key(device_id))  # noqa: SLF001

    body = response.json()
    _skip_if_egress_unavailable(body["code"])
    assert body["code"] == 10000, body

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
