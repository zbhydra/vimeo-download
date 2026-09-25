"""
用户 Token 管理服务（基于 Redis Sorted Set）
"""

import hashlib
from app.core.redis import redis_client
from app.constants.auth import (
    TokenType,
    REFRESH_TOKEN_GRACE_PERIOD_SECONDS,
)
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key
from app.utils.time import timestamp_now_seconds


class UserTokenService:
    """
    用户 Token 管理服务（Redis Sorted Set 存储）

    Token 注册表是认证硬依赖，核心 Redis 操作失败时直接上抛，不使用本地
    状态或跳过校验；仅写入成功后的过期成员回收允许失败。

    Redis 数据结构：
    - access_token:{user_id}  → ZSet [md5(token)=expires_at, ...]
    - refresh_token:{user_id} → ZSet [md5(token)=expires_at, ...]
    - refresh_token_old:{user_id} → ZSet [md5(old_token)=expires_at, ...] (宽限期)
    """

    def __init__(self):
        self._redis = redis_client

    def _build_key(self, token_type: TokenType, user_id: int) -> str:
        """构建 Redis Key"""
        if token_type == TokenType.USER_ACCESS:
            return build_redis_key(f"access_token:{user_id}")
        elif token_type == TokenType.USER_REFRESH:
            return build_redis_key(f"refresh_token:{user_id}")
        elif token_type == TokenType.USER_REFRESH_OLD:
            return build_redis_key(f"refresh_token_old:{user_id}")
        else:
            return build_redis_key(f"unknown_token_type:{user_id}")

    def _hash_token(self, token: str) -> str:
        """计算 Token 的 MD5 哈希（用于存储）"""
        return hashlib.md5(token.encode()).hexdigest()

    async def store_token(
        self,
        token: str,
        user_id: int,
        token_type: TokenType,
        expires_at: int,
    ) -> bool:
        """
        存储 Token 到 Redis Sorted Set

        Args:
            token: JWT Token 字符串
            user_id: 用户 ID
            token_type: Token 类型（ACCESS 或 REFRESH）
            expires_at: 过期时间（Unix 秒级时间戳）

        Returns:
            是否存储成功
        """
        redis = await self._redis.get_client()
        token_hash = self._hash_token(token)
        key = self._build_key(token_type, user_id)

        pipe = redis.pipeline(transaction=True)
        pipe.zadd(key, {token_hash: expires_at})
        pipe.expireat(key, expires_at)
        # 注册表与 TTL 必须同时成功，否则服务端不能承认本次 token 签发。
        try:
            await pipe.execute()
        except Exception:
            logger.error(
                "Store token transaction failed: "
                f"user_id={user_id}, type={token_type}",
                exc_info=True,
            )
            raise

        now = timestamp_now_seconds()
        # token 已登记成功；回收失败只延迟释放内存，不能反转登录结果。
        try:
            await redis.zremrangebyscore(key, "-inf", now)
        except Exception:
            logger.error(
                "Cleanup expired tokens failed after store: "
                f"user_id={user_id}, type={token_type}",
                exc_info=True,
            )

        logger.debug(
            f"Stored token: user_id={user_id}, type={token_type}, expires_at={expires_at}"
        )
        return True

    async def verify_token(
        self,
        token: str,
        user_id: int,
        token_type: TokenType,
    ) -> bool:
        """
        验证 Token 是否有效（未过期且未被撤销）

        Args:
            token: JWT Token 字符串
            user_id: 用户 ID
            token_type: Token 类型

        Returns:
            Token 是否有效

        Raises:
            TokenExpiredError: Token 已过期
            TokenRevokedError: Token 已被撤销
        """
        redis = await self._redis.get_client()
        token_hash = self._hash_token(token)
        key = self._build_key(token_type, user_id)
        now = timestamp_now_seconds()

        expires_at = await redis.zscore(key, token_hash)

        if expires_at is None:
            return False

        expires_at_int = int(expires_at)

        if expires_at_int < now:
            # token 已判定失效，后置删除只负责回收，不需要 read-modify-write 原子性。
            await self.revoke_token(token, user_id, token_type)
            return False

        return True

    async def revoke_token(
        self,
        token: str,
        user_id: int,
        token_type: TokenType,
    ) -> bool:
        """
        撤销 Token（从 Redis 中删除）

        Args:
            token: JWT Token 字符串
            user_id: 用户 ID
            token_type: Token 类型

        Returns:
            是否撤销成功
        """
        redis = await self._redis.get_client()
        token_hash = self._hash_token(token)
        key = self._build_key(token_type, user_id)

        result = await redis.zrem(key, token_hash)

        logger.debug(
            f"Revoked token: user_id={user_id}, type={token_type}, result={result}"
        )
        return result > 0

    async def revoke_all_user_tokens(self, user_id: int) -> int:
        """
        撤销用户所有 Token（删除整个 ZSet）

        Args:
            user_id: 用户 ID

        Returns:
            删除的 Token 数量
        """

        redis = await self._redis.get_client()

        access_key = self._build_key(TokenType.USER_ACCESS, user_id)
        access_count = await redis.zcard(access_key)
        await redis.delete(access_key)

        refresh_key = self._build_key(TokenType.USER_REFRESH, user_id)
        refresh_count = await redis.zcard(refresh_key)
        await redis.delete(refresh_key)

        refresh_old_key = self._build_key(TokenType.USER_REFRESH_OLD, user_id)
        refresh_old_count = await redis.zcard(refresh_old_key)
        await redis.delete(refresh_old_key)

        total = access_count + refresh_count + refresh_old_count
        logger.info(f"Revoked all tokens for user_id={user_id}, total={total}")
        return total

    async def rotate_refresh_token(
        self,
        old_refresh_token: str,
        new_refresh_token: str,
        user_id: int,
        new_expires_at: int,
    ) -> bool:
        """
        轮换 Refresh Token（带宽限期）

        策略：
        1. 将旧 refresh token 移动到宽限期 ZSet（保留 30 秒）
        2. 存储新的 refresh token

        Args:
            old_refresh_token: 旧的 refresh token
            new_refresh_token: 新的 refresh token
            user_id: 用户 ID
            new_expires_at: 新 token 的过期时间（Unix 秒级时间戳）

        Returns:
            是否轮换成功
        """

        redis = await self._redis.get_client()
        old_token_hash = self._hash_token(old_refresh_token)

        now = timestamp_now_seconds()
        grace_period_expires_at = now + REFRESH_TOKEN_GRACE_PERIOD_SECONDS

        refresh_key = self._build_key(TokenType.USER_REFRESH, user_id)
        refresh_old_key = self._build_key(TokenType.USER_REFRESH_OLD, user_id)

        pipe = redis.pipeline(transaction=True)

        pipe.zrem(refresh_key, old_token_hash)
        pipe.zadd(refresh_old_key, {old_token_hash: grace_period_expires_at})
        pipe.expire(refresh_old_key, REFRESH_TOKEN_GRACE_PERIOD_SECONDS)

        new_token_hash = self._hash_token(new_refresh_token)
        pipe.zadd(refresh_key, {new_token_hash: new_expires_at})
        pipe.expireat(refresh_key, new_expires_at)

        # 当前 token 与宽限期 token 必须整批落库，Redis 失败时续签直接失败。
        try:
            await pipe.execute()
        except Exception:
            logger.error(
                f"Rotate refresh token transaction failed: user_id={user_id}",
                exc_info=True,
            )
            raise

        # 轮换已完成；回收失败只保留无效成员，不影响新 token 的有效性。
        try:
            await redis.zremrangebyscore(refresh_key, "-inf", now)
        except Exception:
            logger.error(
                "Cleanup expired refresh tokens failed after rotation: "
                f"user_id={user_id}",
                exc_info=True,
            )

        logger.info(
            f"Rotated refresh token: user_id={user_id}, "
            f"grace_period_until={grace_period_expires_at}"
        )
        return True

    async def verify_refresh_token_with_grace_period(
        self,
        refresh_token: str,
        user_id: int,
    ) -> bool:
        """
        验证 Refresh Token（支持宽限期内的旧 Token）

        优先验证当前 Token，如果不存在则尝试验证宽限期内的旧 Token

        Args:
            refresh_token: Refresh Token 字符串
            user_id: 用户 ID

        Returns:
            Token 是否有效
        """

        ok = await self.verify_token(
            refresh_token,
            user_id,
            TokenType.USER_REFRESH,
        )
        if ok:
            return True

        redis = await self._redis.get_client()
        token_hash = self._hash_token(refresh_token)
        refresh_old_key = self._build_key(TokenType.USER_REFRESH_OLD, user_id)
        now = timestamp_now_seconds()

        expires_at = await redis.zscore(refresh_old_key, token_hash)

        if expires_at is None:
            return False

        expires_at_int = int(expires_at)

        if expires_at_int < now:
            await redis.zrem(refresh_old_key, token_hash)
            return False

        logger.info(f"Accepted old refresh token in grace period: user_id={user_id}")
        return True

    async def get_active_token_count(self, user_id: int, token_type: TokenType) -> int:
        """
        获取用户的活跃 Token 数量

        Args:
            user_id: 用户 ID
            token_type: Token 类型

        Returns:
            活跃 Token 数量
        """
        redis = await self._redis.get_client()
        key = self._build_key(token_type, user_id)
        count = await redis.zcard(key)
        return count


# 全局 Token 服务实例
user_token_service = UserTokenService()
