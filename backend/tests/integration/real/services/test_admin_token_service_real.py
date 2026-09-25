"""AdminTokenService 的真实 Redis 生命周期测试。"""

import hashlib
from collections.abc import AsyncIterator
from dataclasses import dataclass

import pytest

from app.constants.auth import REFRESH_TOKEN_GRACE_PERIOD_SECONDS
from app.core.redis import redis_client
from app.services.admin_token_service import admin_token_service
from app.utils.redis_key import build_redis_key
from app.utils.time import timestamp_now_seconds


@dataclass(frozen=True, slots=True)
class _AdminTokenState:
    """记录单个测试独占的管理员 token key。"""

    admin_id: int
    refresh_key: str
    refresh_old_key: str


def _token_hash(token: str) -> str:
    """按生产合同计算 Redis member。"""

    return hashlib.md5(token.encode()).hexdigest()


@pytest.fixture
async def real_admin_token_state(
    real_redis_ready: None,
    test_run_id: str,
    request: pytest.FixtureRequest,
) -> AsyncIterator[_AdminTokenState]:
    """分配独占管理员 ID，并在测试结束后删除 token key。"""

    identity = f"{test_run_id}:{request.node.nodeid}".encode()
    admin_id = 9_200_000_000_000 + int.from_bytes(
        hashlib.sha256(identity).digest()[:6], "big"
    )
    state = _AdminTokenState(
        admin_id=admin_id,
        refresh_key=build_redis_key(f"admin_refresh_token:{admin_id}"),
        refresh_old_key=build_redis_key(f"admin_refresh_token_old:{admin_id}"),
    )
    redis = await redis_client.get_client()
    await redis.delete(state.refresh_key, state.refresh_old_key)
    try:
        yield state
    finally:
        await redis.delete(state.refresh_key, state.refresh_old_key)


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_store_admin_refresh_sets_ttl_and_removes_expired_members(
    real_admin_token_state: _AdminTokenState,
    test_run_id: str,
) -> None:
    """管理员 refresh 写入同时设置 TTL，并清理过期 member。"""

    redis = await redis_client.get_client()
    now = timestamp_now_seconds()
    expired_token = f"expired-admin-refresh-{test_run_id}"
    new_token = f"new-admin-refresh-{test_run_id}"
    expires_at = now + 600
    await redis.zadd(
        real_admin_token_state.refresh_key,
        {_token_hash(expired_token): now - 1},
    )

    assert await admin_token_service.store_refresh_token(
        new_token,
        real_admin_token_state.admin_id,
        expires_at,
    )

    assert await redis.expiretime(real_admin_token_state.refresh_key) == expires_at
    assert (
        await redis.zscore(
            real_admin_token_state.refresh_key, _token_hash(expired_token)
        )
        is None
    )
    assert (
        int(
            await redis.zscore(
                real_admin_token_state.refresh_key, _token_hash(new_token)
            )
        )
        == expires_at
    )


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_rotate_admin_refresh_accepts_legacy_key_and_sets_current_ttl(
    real_admin_token_state: _AdminTokenState,
    test_run_id: str,
) -> None:
    """无 TTL 管理员旧结构可直接验证，并在轮换后进入新生命周期。"""

    redis = await redis_client.get_client()
    now = timestamp_now_seconds()
    old_token = f"legacy-admin-refresh-{test_run_id}"
    new_token = f"rotated-admin-refresh-{test_run_id}"
    new_expires_at = now + 900
    await redis.zadd(
        real_admin_token_state.refresh_key,
        {_token_hash(old_token): now + 300},
    )
    assert await redis.ttl(real_admin_token_state.refresh_key) == -1
    assert await admin_token_service.verify_refresh_token_with_grace_period(
        old_token,
        real_admin_token_state.admin_id,
    )

    assert await admin_token_service.rotate_refresh_token(
        old_token,
        new_token,
        real_admin_token_state.admin_id,
        new_expires_at,
    )

    assert await redis.expiretime(real_admin_token_state.refresh_key) == new_expires_at
    assert (
        await redis.zscore(real_admin_token_state.refresh_key, _token_hash(old_token))
        is None
    )
    assert (
        int(
            await redis.zscore(
                real_admin_token_state.refresh_key, _token_hash(new_token)
            )
        )
        == new_expires_at
    )
    grace_ttl = await redis.ttl(real_admin_token_state.refresh_old_key)
    assert 0 < grace_ttl <= REFRESH_TOKEN_GRACE_PERIOD_SECONDS
    assert await admin_token_service.verify_refresh_token_with_grace_period(
        old_token,
        real_admin_token_state.admin_id,
    )
