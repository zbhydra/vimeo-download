"""匿名授权真实 API、MySQL 计数、Redis 排重及已验签节点分组验证。

依赖真实 MySQL、Redis 和本机签名配置；只读 config_public，测试节点和设备均清理。
覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
POST /api/client/media/download-anonymous-pre-v2 | Y | 设备集中校验 | Y | Y | Y | Y | 无效token | 无效token | 无效token | Y
"""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field, replace

import pytest
from sqlalchemy import delete, text

from app.constants.counter import DeviceCounterId
from app.core.database import get_async_session
from app.core.redis import redis_client
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.counter_device_lifetime_model import CounterDeviceLifetimeModel
from app.models.service_node_model import ServiceNodeModel
from app.services.config_public_service import config_public_service
from app.services.counter_device_service import counter_device_service
from app.services.device_service import device_service
from app.services.media_active_download_service import MediaActiveDownloadService
from app.services.media_anonymous_download_service import (
    AnonymousDownloadPolicy,
    media_anonymous_download_service,
)
from app.services.media_download_token_service import media_download_token_service
from app.services.media_provider_service import _active_user_key
from app.services.media_resource_token_service import media_resource_token_service
from app.services.media_service import media_service
from app.utils.time import timestamp_now_seconds

pytestmark = [pytest.mark.real, pytest.mark.asyncio]
_ENDPOINT = "/api/client/media/download-anonymous-pre-v2"
_COUNTER = DeviceCounterId.ANONYMOUS_DOWNLOAD


@dataclass
class _CleanupState:
    """本次测试独占的数据库和 Redis 资源。"""

    device_id: str
    node_id: int | None = None
    redis_keys: list[str] = field(default_factory=list)


@pytest.fixture
async def real_anonymous_state(
    real_mysql_ready,
    real_redis_ready,
    make_test_device_id,
) -> AsyncIterator[_CleanupState]:
    """检查实际表，并创建可清理的设备和健康候选节点。"""
    async with get_async_session() as db:
        tables = {row[0] for row in await db.execute(text("SHOW TABLES"))}
    missing = {"counter_device_lifetime", "service_nodes", "config_public"} - tables
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 缺少表 {sorted(missing)}")
    state = _CleanupState(device_id=make_test_device_id("anonymous-download"))
    redis = await redis_client.get_client()
    try:
        await device_service.set(state.device_id, "198.51.100.42")
        state.redis_keys.append(device_service._build_key(state.device_id))
        now = timestamp_now_seconds()
        async with get_async_session() as db:
            node = ServiceNodeModel(  # type: ignore[call-arg]
                node_type=2,
                name=state.device_id,
                region="test",
                public_base_url="http://127.0.0.1:19876",
                internal_base_url="http://127.0.0.1:19876",
                enabled=True,
                weight=1,
                last_health_status=1,
                created_at=now,
                updated_at=now,
            )
            db.add(node)
            await db.commit()
            state.node_id = node.node_id
        yield state
    finally:
        if state.redis_keys:
            await redis.delete(*state.redis_keys)
        async with get_async_session() as db:
            await db.execute(
                delete(CounterDeviceLifetimeModel).where(
                    CounterDeviceLifetimeModel.device_id == state.device_id,
                )
            )
            if state.node_id is not None:
                await db.execute(
                    delete(ServiceNodeModel).where(
                        ServiceNodeModel.node_id == state.node_id
                    )
                )
            await db.commit()


def _resource(state: _CleanupState, label: str, size: int | None) -> str:
    """为测试资源签发真实 resource token，同时记录该资源排重 key。"""
    link = "https://vimeo.com/example/123"
    sid = f"{state.device_id}-{label}"
    key = media_service.build_download_resource_key(
        platform="vimeo",
        canonical_link=link,
        source_id=sid,
        download_mode="direct",
    )
    state.redis_keys.append(
        media_anonymous_download_service.build_dedup_key(state.device_id, key)
    )
    return media_resource_token_service.issue_token(
        platform="vimeo",
        canonical_link=link,
        source_id=sid,
        download_mode="direct",
        filename="test.mp4",
        mime_type="video/mp4",
        size=size,
    )


async def test_real_anonymous_authorization_count_dedup_size_and_node_scopes(
    real_async_client,
    real_anonymous_state: _CleanupState,
) -> None:
    """实际路由贯通直接放行、等待、登录墙、永久计次、固定 TTL 与签名身份分组。"""
    state = real_anonymous_state
    policy = AnonymousDownloadPolicy.model_validate(
        await config_public_service.get_lists()
    )
    headers = {"X-Device-Id": state.device_id, "X-Forwarded-For": "198.51.100.42"}
    redis = await redis_client.get_client()

    async def authorize(token: str):
        response = await real_async_client.post(
            _ENDPOINT,
            json={
                "resource_token": token,
                "preferred_node_id": state.node_id,
            },
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["code"] == 10000
        return response.json()["data"]

    for size in (
        None,
        policy.dl_anonymous_max_size_bytes,
        policy.dl_anonymous_max_size_bytes + 1,
    ):
        result = await authorize(_resource(state, f"size-{size}", size))
        assert result == {"status": 3}
        assert await counter_device_service.get(state.device_id, _COUNTER) == 0
        assert await redis.exists(state.redis_keys[-1]) == 0

    free = policy.dl_anonymous_immediate_count
    total = policy.dl_anonymous_total_count
    first = None
    dedup_key = ""
    ttl = 0
    if free > 0:
        # 累计到最后一次直接放行之前，验证免费边界内直接放行并计次。
        await counter_device_service.add(state.device_id, _COUNTER, free - 1)
        first = await authorize(
            _resource(state, "first", policy.dl_anonymous_max_size_bytes - 1)
        )
        assert first["status"] == 1
        assert "credits_balance" not in first and "wait_seconds" not in first
        assert first["nodes"][0]["node_id"] == state.node_id
        assert first["download_mode"] == "direct"
        assert await counter_device_service.get(state.device_id, _COUNTER) == free
        dedup_key = state.redis_keys[-1]
        ttl = await redis.pttl(dedup_key)
        assert 0 < ttl <= policy.dl_anonymous_dedup_seconds * 1000
        await asyncio.sleep(0.02)
        # 新的资源 token 对应同一资源，排重不能依赖 token 字符串。
        repeated = await authorize(_resource(state, "first", 1024))
        assert repeated["status"] == 1
        assert repeated["token"] != first["token"]
        assert await redis.pttl(dedup_key) < ttl
        assert await counter_device_service.get(state.device_id, _COUNTER) == free

    waiting = None
    if total > free:
        # 直接放行次数用尽：第 free+1 个新资源进入等待，仍签发并计次。
        waiting = await authorize(_resource(state, "wait", 1024))
        assert waiting["status"] == 2
        assert waiting["wait_seconds"] == policy.dl_anonymous_wait_seconds
        assert waiting["nodes"][0]["node_id"] == state.node_id
        assert waiting["download_mode"] == "direct"
        assert await counter_device_service.get(state.device_id, _COUNTER) == free + 1
        # 顶到免费总次数上界，验证登录墙。
        if total > free + 1:
            await counter_device_service.add(
                state.device_id, _COUNTER, total - free - 1
            )

    # 免费总次数用尽：新资源要求登录，不签发、不计次、不写排重。
    walled = await authorize(_resource(state, "walled", 1024))
    assert walled == {"status": 3}
    assert await counter_device_service.get(state.device_id, _COUNTER) == total
    assert await redis.exists(state.redis_keys[-1]) == 0

    claims_token = (waiting or first)["token"]
    claims = media_download_token_service.decode_for_download(claims_token)
    assert claims.uid is None and claims.device_id == state.device_id
    assert claims.issued_ip == "198.51.100.42"
    assert claims.exp == (waiting or first)["expires_at"]
    assert claims.active_download_limit == await config_public_service.get(
        "dl_active_download_limit"
    )
    assert _active_user_key(claims) == f"device:{state.device_id}"
    sibling = replace(claims, device_id=f"{state.device_id}-b", jti="sibling")
    assert _active_user_key(sibling) != _active_user_key(claims)
    user = replace(claims, uid=123)
    assert _active_user_key(user) == "user:123"
    active = MediaActiveDownloadService()
    guards = [
        active.acquire(_active_user_key(claims), claims.active_download_limit)
        for _ in range(claims.active_download_limit)
    ]
    with pytest.raises(AppCommonException) as exc:
        active.acquire(
            _active_user_key(replace(claims, jti="another-token")),
            claims.active_download_limit,
        )
    assert exc.value.code == CommonCode.RATE_LIMIT_EXCEEDED_MEDIA
    active.acquire(_active_user_key(sibling), sibling.active_download_limit).release()
    active.acquire(_active_user_key(user), user.active_download_limit).release()
    for guard in guards:
        guard.release()
    assert active.active_count(_active_user_key(claims)) == 0

    # 排重过期后重下：仍在登录墙内，不计次也不重新写排重。
    if waiting is not None:
        await redis.pexpire(dedup_key, 1)
        await asyncio.sleep(0.02)
        assert await redis.exists(dedup_key) == 0
        assert (await authorize(_resource(state, "first", 1024)))["status"] == 3
        assert await counter_device_service.get(state.device_id, _COUNTER) == total
        assert await redis.exists(dedup_key) == 0


async def test_real_anonymous_invalid_resource_does_not_count(
    real_async_client,
    real_anonymous_state: _CleanupState,
) -> None:
    """无效输入沿用错误合同，不能创建授权或计数。"""
    state = real_anonymous_state
    for payload in (
        {},
        {"resource_token": 123},
        {"resource_token": ""},
        {"resource_token": "x" * 8193},
    ):
        response = await real_async_client.post(
            _ENDPOINT, json=payload, headers={"X-Device-Id": state.device_id}
        )
        assert response.status_code == 422
        assert "token" not in response.json().get("data", {})
    for value in (
        "<script>alert(1)</script>",
        "' OR 1=1 --",
        "\u0001bad",
        "tampered.token",
    ):
        response = await real_async_client.post(
            _ENDPOINT,
            json={"resource_token": value},
            headers={"X-Device-Id": state.device_id},
        )
        assert response.status_code == 200
        assert response.json()["code"] == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
        assert "token" not in response.json()["data"]
    assert await counter_device_service.get(state.device_id, _COUNTER) == 0
