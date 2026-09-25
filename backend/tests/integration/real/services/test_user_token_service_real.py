"""UserTokenService 的真实 Redis 生命周期测试。"""

import hashlib
import asyncio
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

import pytest

from app.constants.auth import REFRESH_TOKEN_GRACE_PERIOD_SECONDS, TokenType
from app.core.redis import redis_client
from app.services.user_token_service import user_token_service
from app.utils.jwt import JwtData, JwtUnit
from app.utils.redis_key import build_redis_key
from app.utils.time import timestamp_now_seconds


@dataclass(frozen=True, slots=True)
class _UserTokenState:
    """记录单个测试独占的用户 token key。"""

    user_id: int
    access_key: str
    refresh_key: str
    refresh_old_key: str


def _token_hash(token: str) -> str:
    """按生产合同计算 Redis member。"""

    return hashlib.md5(token.encode()).hexdigest()


@pytest.fixture
async def real_user_token_state(
    real_redis_ready: None,
    test_run_id: str,
    request: pytest.FixtureRequest,
) -> AsyncIterator[_UserTokenState]:
    """分配独占用户 ID，并在测试结束后删除三个 token key。"""

    identity = f"{test_run_id}:{request.node.nodeid}".encode()
    user_id = 9_100_000_000_000 + int.from_bytes(
        hashlib.sha256(identity).digest()[:6], "big"
    )
    state = _UserTokenState(
        user_id=user_id,
        access_key=build_redis_key(f"access_token:{user_id}"),
        refresh_key=build_redis_key(f"refresh_token:{user_id}"),
        refresh_old_key=build_redis_key(f"refresh_token_old:{user_id}"),
    )
    redis = await redis_client.get_client()
    await redis.delete(state.access_key, state.refresh_key, state.refresh_old_key)
    try:
        yield state
    finally:
        await redis.delete(state.access_key, state.refresh_key, state.refresh_old_key)


@pytest.mark.real
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("token_type", "key_attribute"),
    [
        (TokenType.USER_ACCESS, "access_key"),
        (TokenType.USER_REFRESH, "refresh_key"),
    ],
)
async def test_real_store_token_sets_ttl_and_removes_expired_members(
    real_user_token_state: _UserTokenState,
    test_run_id: str,
    token_type: TokenType,
    key_attribute: str,
) -> None:
    """当前 access/refresh 写入同时设置 TTL，并清理过期 member。"""

    redis = await redis_client.get_client()
    key = getattr(real_user_token_state, key_attribute)
    now = timestamp_now_seconds()
    expired_token = f"expired-{token_type.value}-{test_run_id}"
    new_token = f"new-{token_type.value}-{test_run_id}"
    expires_at = now + 600
    await redis.zadd(key, {_token_hash(expired_token): now - 1})

    assert await user_token_service.store_token(
        new_token,
        real_user_token_state.user_id,
        token_type,
        expires_at,
    )

    assert await redis.expiretime(key) == expires_at
    assert await redis.zscore(key, _token_hash(expired_token)) is None
    assert int(await redis.zscore(key, _token_hash(new_token))) == expires_at


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_rotate_refresh_token_accepts_legacy_key_and_sets_current_ttl(
    real_user_token_state: _UserTokenState,
    test_run_id: str,
) -> None:
    """无 TTL 旧结构可直接验证，并在轮换后进入新生命周期。"""

    redis = await redis_client.get_client()
    now = timestamp_now_seconds()
    old_token = f"legacy-user-refresh-{test_run_id}"
    new_token = f"rotated-user-refresh-{test_run_id}"
    old_expires_at = now + 300
    new_expires_at = now + 900
    await redis.zadd(
        real_user_token_state.refresh_key,
        {_token_hash(old_token): old_expires_at},
    )
    assert await redis.ttl(real_user_token_state.refresh_key) == -1
    assert await user_token_service.verify_refresh_token_with_grace_period(
        old_token,
        real_user_token_state.user_id,
    )

    assert await user_token_service.rotate_refresh_token(
        old_token,
        new_token,
        real_user_token_state.user_id,
        new_expires_at,
    )

    assert await redis.expiretime(real_user_token_state.refresh_key) == new_expires_at
    assert (
        await redis.zscore(real_user_token_state.refresh_key, _token_hash(old_token))
        is None
    )
    assert (
        int(
            await redis.zscore(
                real_user_token_state.refresh_key, _token_hash(new_token)
            )
        )
        == new_expires_at
    )
    grace_ttl = await redis.ttl(real_user_token_state.refresh_old_key)
    assert 0 < grace_ttl <= REFRESH_TOKEN_GRACE_PERIOD_SECONDS
    assert await user_token_service.verify_refresh_token_with_grace_period(
        old_token,
        real_user_token_state.user_id,
    )


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_verify_legacy_access_token_without_ttl(
    real_user_token_state: _UserTokenState,
    test_run_id: str,
) -> None:
    """更新前签发的有效 access token 无需重签即可继续验证。"""

    redis = await redis_client.get_client()
    token = f"legacy-user-access-{test_run_id}"
    await redis.zadd(
        real_user_token_state.access_key,
        {_token_hash(token): timestamp_now_seconds() + 300},
    )

    assert await redis.ttl(real_user_token_state.access_key) == -1
    assert await user_token_service.verify_token(
        token,
        real_user_token_state.user_id,
        TokenType.USER_ACCESS,
    )
    assert await redis.ttl(real_user_token_state.access_key) == -1


@pytest.mark.real
@pytest.mark.asyncio
async def test_real_store_same_second_jwt_tokens_with_equal_expiration(
    real_user_token_state: _UserTokenState,
    test_run_id: str,
) -> None:
    """同秒签发的相等 exp token 可共存，key TTL 保持正确。"""

    redis = await redis_client.get_client()
    while time.time() % 1 > 0.25:
        await asyncio.sleep(0.01)

    first_token, first_expires_at = JwtUnit.create_access_token(
        JwtData(
            user_id=real_user_token_state.user_id,
            email=f"same-second-first-{test_run_id}@example.com",
        )
    )
    second_token, second_expires_at = JwtUnit.create_access_token(
        JwtData(
            user_id=real_user_token_state.user_id,
            email=f"same-second-second-{test_run_id}@example.com",
        )
    )
    assert first_expires_at == second_expires_at
    assert first_token != second_token

    assert await user_token_service.store_token(
        first_token,
        real_user_token_state.user_id,
        TokenType.USER_ACCESS,
        first_expires_at,
    )
    assert await user_token_service.store_token(
        second_token,
        real_user_token_state.user_id,
        TokenType.USER_ACCESS,
        second_expires_at,
    )

    assert await redis.expiretime(real_user_token_state.access_key) == second_expires_at
    assert await redis.zcard(real_user_token_state.access_key) == 2
    assert await user_token_service.verify_token(
        first_token,
        real_user_token_state.user_id,
        TokenType.USER_ACCESS,
    )
    assert await user_token_service.verify_token(
        second_token,
        real_user_token_state.user_id,
        TokenType.USER_ACCESS,
    )
