"""匿名 download-pre-v2 真实 API、MySQL 计次与 Redis 排重合同。"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import pytest
from sqlalchemy import delete, text

from app.constants.counter import DeviceCounterId
from app.core.database import get_async_session
from app.core.redis import redis_client
from app.i18n.common_code import CommonCode
from app.models.counter_device_lifetime_model import CounterDeviceLifetimeModel
from app.services.config_public_service import config_public_service
from app.services.counter_device_service import counter_device_service
from app.services.device_service import device_service
from app.services.media_anonymous_download_service import AnonymousDownloadPolicy
from app.services.media_execution_token_service import media_execution_token_service
from app.services.media_anonymous_download_service import (
    media_anonymous_download_service,
)
from app.schemas.media_schema import MediaDirectDownloadIntentResponse

pytestmark = [pytest.mark.real, pytest.mark.asyncio]
_ENDPOINT = "/api/client/media/download-anonymous-pre-v2"
_COUNTER = DeviceCounterId.ANONYMOUS_DOWNLOAD


@dataclass
class _CleanupState:
    """本次测试创建的真实设备和 Redis key。"""

    device_id: str
    redis_keys: list[str] = field(default_factory=list)


@pytest.fixture
async def real_anonymous_state(
    real_mysql_ready,
    real_redis_ready,
    make_test_device_id,
) -> AsyncIterator[_CleanupState]:
    """检查真实表并准备一个可信 Website 设备。"""
    async with get_async_session() as db:
        tables = {row[0] for row in await db.execute(text("SHOW TABLES"))}
    if "counter_device_lifetime" not in tables or "config_public" not in tables:
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 缺少匿名下载所需表")

    state = _CleanupState(make_test_device_id("anonymous-download"))
    await device_service.set(state.device_id, "198.51.100.42")
    state.redis_keys.append(device_service._build_key(state.device_id))  # noqa: SLF001
    yield state

    redis = await redis_client.get_client()
    dedup = media_anonymous_download_service.build_dedup_key(
        state.device_id, "vimeo:test"
    )
    await redis.delete(*state.redis_keys, dedup)
    async with get_async_session() as db:
        await db.execute(
            delete(CounterDeviceLifetimeModel).where(
                CounterDeviceLifetimeModel.device_id == state.device_id
            )
        )
        await db.commit()


def _resource_token(*, size: int | None, source_id: str) -> str:
    """签发真实执行 token，材料由后端真实验签。"""
    material = MediaDirectDownloadIntentResponse(
        source_id=source_id,
        platform="vimeo",
        download_mode="direct",
        download_url="https://cdn.vimeocdn.com/video.mp4?sig=real",
        filename="demo.mp4",
        mime_type="video/mp4",
        size=size,
    )
    return media_execution_token_service.issue_resource_token(
        platform="vimeo",
        canonical_link="https://vimeo.com/123",
        source_id=source_id,
        download_mode="direct",
        filename=material.filename,
        mime_type=material.mime_type,
        size=size,
        material=material,
    )


async def _authorize(real_async_client, state: _CleanupState, token: str):
    response = await real_async_client.post(
        _ENDPOINT,
        json={"resource_token": token},
        headers={
            "X-Device-Id": state.device_id,
            "X-Forwarded-For": "198.51.100.42",
            "X-Client-Product": "web",
        },
    )
    assert response.status_code == 200
    return response


async def test_real_anonymous_authorization_returns_material_once_per_resource(
    real_async_client,
    real_anonymous_state: _CleanupState,
) -> None:
    """真实后端首次计次并写排重，手动重复请求不再次计次。"""
    state = real_anonymous_state
    token = _resource_token(size=1024, source_id=f"{state.device_id}:one")

    first = await _authorize(real_async_client, state, token)
    first_body = first.json()
    assert first_body["code"] == 10000
    assert first_body["data"]["status"] in (1, 2)
    assert first_body["data"]["material"]["download_url"].startswith("https://")
    assert await counter_device_service.get(state.device_id, _COUNTER) == 1

    second = await _authorize(real_async_client, state, token)
    second_body = second.json()
    assert second_body["code"] == 10000
    assert second_body["data"]["material"] == first_body["data"]["material"]
    assert await counter_device_service.get(state.device_id, _COUNTER) == 1


async def test_real_anonymous_size_gate_does_not_count(
    real_async_client,
    real_anonymous_state: _CleanupState,
) -> None:
    """超过匿名大小门禁返回状态 3，不计次也不写排重。"""
    policy = AnonymousDownloadPolicy.model_validate(
        await config_public_service.get_lists()
    )
    response = await _authorize(
        real_async_client,
        real_anonymous_state,
        _resource_token(
            size=policy.dl_anonymous_max_size_bytes,
            source_id=f"{real_anonymous_state.device_id}:large",
        ),
    )
    body = response.json()
    assert body["code"] == 10000
    assert body["data"] == {"status": 3}
    assert (
        await counter_device_service.get(real_anonymous_state.device_id, _COUNTER) == 0
    )


async def test_real_anonymous_invalid_material_has_stable_error(
    real_async_client,
    real_anonymous_state: _CleanupState,
) -> None:
    """篡改 resource token 返回稳定材料错误，不能进入计次。"""
    response = await _authorize(
        real_async_client,
        real_anonymous_state,
        "invalid-resource-token",
    )
    assert response.json()["code"] == CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID
    assert (
        await counter_device_service.get(real_anonymous_state.device_id, _COUNTER) == 0
    )
