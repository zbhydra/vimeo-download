"""历史 token key 清理脚本的真实 Redis 测试。"""

import hashlib
from collections.abc import AsyncIterator
from dataclasses import dataclass

import pytest

from app.core.config import settings
from app.core.redis import redis_client
from app.utils.time import timestamp_now_seconds
from scripts.cleanup_expired_token_keys import (
    _read_key_expiration,
    cleanup_expired_token_keys,
)


@dataclass(frozen=True, slots=True)
class _CleanupNamespace:
    """记录单个测试独占的清理前缀与前缀外哨兵 key。"""

    prefix: str
    sentinel_key: str


@pytest.fixture
async def real_cleanup_namespace(
    real_redis_ready: None,
    test_run_id: str,
    request: pytest.FixtureRequest,
) -> AsyncIterator[_CleanupNamespace]:
    """创建隔离清理前缀，并精确清理本测试 Redis 数据。"""

    node_hash = hashlib.sha256(request.node.nodeid.encode()).hexdigest()[:12]
    prefix = f"{settings.redis.key_prefix}:test-token-cleanup:{test_run_id}:{node_hash}"
    state = _CleanupNamespace(
        prefix=prefix,
        sentinel_key=(
            f"{settings.redis.key_prefix}:test-token-cleanup-sentinel:"
            f"{test_run_id}:{node_hash}"
        ),
    )
    redis = await redis_client.get_client()
    await redis.delete(state.sentinel_key)
    try:
        yield state
    finally:
        owned_keys = [
            str(key) async for key in redis.scan_iter(match=f"{state.prefix}:*")
        ]
        if owned_keys:
            await redis.delete(*owned_keys)
        await redis.delete(state.sentinel_key)


async def _seed_cleanup_keys(
    state: _CleanupNamespace,
) -> tuple[str, str, str, int, int]:
    """创建有效、已过期、已有 TTL 三类 token key 与前缀外哨兵。"""

    redis = await redis_client.get_client()
    now = timestamp_now_seconds()
    active_score = now + 600
    existing_expire_at = now + 300
    active_key = f"{state.prefix}:access_token:1"
    expired_key = f"{state.prefix}:refresh_token:2"
    existing_ttl_key = f"{state.prefix}:admin_refresh_token:3"
    await redis.zadd(active_key, {"active-member": active_score})
    await redis.zadd(expired_key, {"expired-member": now - 1})
    await redis.zadd(existing_ttl_key, {"existing-member": now + 900})
    await redis.expireat(existing_ttl_key, existing_expire_at)
    await redis.zadd(state.sentinel_key, {"sentinel-member": now + 1200})
    return active_key, expired_key, existing_ttl_key, active_score, existing_expire_at


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_cleanup_dry_run_reports_without_modifying_redis(
    real_cleanup_namespace: _CleanupNamespace,
) -> None:
    """默认 dry-run 只统计无 TTL key，不修改 TTL、member 或 score。"""

    redis = await redis_client.get_client()
    active_key, expired_key, existing_ttl_key, _, existing_expire_at = (
        await _seed_cleanup_keys(real_cleanup_namespace)
    )
    before_members = {
        key: await redis.zrange(key, 0, -1, withscores=True)
        for key in (active_key, expired_key, existing_ttl_key)
    }
    sentinel_members = await redis.zrange(
        real_cleanup_namespace.sentinel_key, 0, -1, withscores=True
    )

    stats = await cleanup_expired_token_keys(key_prefix=real_cleanup_namespace.prefix)

    assert stats.scanned_keys == 3
    assert stats.keys_without_ttl == 2
    assert stats.expired_max_score_keys == 1
    assert stats.active_max_score_keys == 1
    assert await redis.ttl(active_key) == -1
    assert await redis.ttl(expired_key) == -1
    assert await redis.expiretime(existing_ttl_key) == existing_expire_at
    for key, members in before_members.items():
        assert await redis.zrange(key, 0, -1, withscores=True) == members
    assert (
        await redis.zrange(real_cleanup_namespace.sentinel_key, 0, -1, withscores=True)
        == sentinel_members
    )


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_cleanup_execute_sets_ttl_isolated_and_is_repeatable(
    real_cleanup_namespace: _CleanupNamespace,
) -> None:
    """execute 用最大 score 补 TTL、删除过期 key，重复执行保持稳定。"""

    redis = await redis_client.get_client()
    active_key, expired_key, existing_ttl_key, active_score, existing_expire_at = (
        await _seed_cleanup_keys(real_cleanup_namespace)
    )
    active_members = await redis.zrange(active_key, 0, -1, withscores=True)
    existing_members = await redis.zrange(existing_ttl_key, 0, -1, withscores=True)
    sentinel_members = await redis.zrange(
        real_cleanup_namespace.sentinel_key, 0, -1, withscores=True
    )
    sentinel_ttl = await redis.ttl(real_cleanup_namespace.sentinel_key)

    first_stats = await cleanup_expired_token_keys(
        key_prefix=real_cleanup_namespace.prefix,
        execute=True,
    )
    second_stats = await cleanup_expired_token_keys(
        key_prefix=real_cleanup_namespace.prefix,
        execute=True,
    )

    assert first_stats.scanned_keys == 3
    assert first_stats.keys_without_ttl == 2
    assert await redis.expiretime(active_key) == active_score
    assert not await redis.exists(expired_key)
    assert await redis.expiretime(existing_ttl_key) == existing_expire_at
    assert await redis.zrange(active_key, 0, -1, withscores=True) == active_members
    assert await redis.zrange(existing_ttl_key, 0, -1, withscores=True) == (
        existing_members
    )
    assert second_stats.scanned_keys == 2
    assert second_stats.keys_without_ttl == 0
    assert (
        await redis.zrange(real_cleanup_namespace.sentinel_key, 0, -1, withscores=True)
        == sentinel_members
    )
    assert await redis.ttl(real_cleanup_namespace.sentinel_key) == sentinel_ttl


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_cleanup_read_skips_key_missing_before_zrange(
    real_cleanup_namespace: _CleanupNamespace,
) -> None:
    """SCAN 后并发消失的 key 在读取最大 score 时按正常空结果跳过。"""

    redis = await redis_client.get_client()
    key = f"{real_cleanup_namespace.prefix}:access_token:deleted"
    await redis.zadd(key, {"member": timestamp_now_seconds() + 300})
    await redis.delete(key)

    assert await _read_key_expiration(key) is None
