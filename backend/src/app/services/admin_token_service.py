"""
Admin Token 管理服务。

管理后台使用独立 refresh token 续签 access token：
1. 登录签发 access token 和 refresh token。
2. refresh token 存入 Redis ZSet，score 为过期时间。
3. 续签时轮换 refresh token，旧 token 保留短宽限期处理并发请求。
"""

import hashlib
from app.constants.auth import REFRESH_TOKEN_GRACE_PERIOD_SECONDS, TokenType
from app.core.redis import redis_client
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key
from app.utils.time import timestamp_now_seconds


class AdminTokenService:
    """管理后台 refresh token 存储与轮换。

    Token 注册表是认证硬依赖，核心 Redis 操作失败时直接上抛，不使用本地
    状态或跳过校验；仅写入成功后的过期成员回收允许失败。
    """

    def __init__(self) -> None:
        """初始化 Redis 客户端引用。"""

        self._redis = redis_client

    def _build_key(self, token_type: TokenType, admin_id: int) -> str:
        """构建 admin token Redis key。

        Args:
            token_type: 管理后台 token 存储类型。
            admin_id: 管理员 ID。

        Returns:
            带应用前缀的 Redis key。
        """

        if token_type == TokenType.ADMIN_REFRESH:
            return build_redis_key(f"admin_refresh_token:{admin_id}")
        if token_type == TokenType.ADMIN_REFRESH_OLD:
            return build_redis_key(f"admin_refresh_token_old:{admin_id}")
        return build_redis_key(f"admin_unknown_token_type:{admin_id}")

    def _hash_token(self, token: str) -> str:
        """计算 token 摘要，避免在 Redis 中明文保存 token。"""

        return hashlib.md5(token.encode()).hexdigest()

    async def store_refresh_token(
        self,
        token: str,
        admin_id: int,
        expires_at: int,
    ) -> bool:
        """保存当前 refresh token。

        Args:
            token: JWT refresh token。
            admin_id: 管理员 ID。
            expires_at: 过期时间，Unix 秒。

        Returns:
            是否保存成功。
        """

        redis = await self._redis.get_client()
        token_hash = self._hash_token(token)
        key = self._build_key(TokenType.ADMIN_REFRESH, admin_id)
        pipe = redis.pipeline(transaction=True)
        pipe.zadd(key, {token_hash: expires_at})
        pipe.expireat(key, expires_at)
        # 注册表与 TTL 必须同时成功，否则服务端不能承认本次 token 签发。
        try:
            await pipe.execute()
        except Exception:
            logger.error(
                f"Store admin refresh token transaction failed: admin_id={admin_id}",
                exc_info=True,
            )
            raise

        now = timestamp_now_seconds()
        # token 已登记成功；回收失败只延迟释放内存，不能反转登录结果。
        try:
            await redis.zremrangebyscore(key, "-inf", now)
        except Exception:
            logger.error(
                "Cleanup expired admin refresh tokens failed after store: "
                f"admin_id={admin_id}",
                exc_info=True,
            )
        logger.debug(
            f"Stored admin refresh token: admin_id={admin_id}, expires_at={expires_at}"
        )
        return True

    async def verify_refresh_token_with_grace_period(
        self,
        refresh_token: str,
        admin_id: int,
    ) -> bool:
        """验证 refresh token，允许轮换宽限期内的旧 token。

        Args:
            refresh_token: 管理后台 refresh token。
            admin_id: 管理员 ID。

        Returns:
            token 是否仍有效。
        """

        if await self._verify_current_refresh_token(refresh_token, admin_id):
            return True

        redis = await self._redis.get_client()
        token_hash = self._hash_token(refresh_token)
        refresh_old_key = self._build_key(TokenType.ADMIN_REFRESH_OLD, admin_id)
        expires_at = await redis.zscore(refresh_old_key, token_hash)
        if expires_at is None:
            return False

        expires_at_int = int(expires_at)
        if expires_at_int < timestamp_now_seconds():
            # token 已判定失效，后置删除只负责回收，不需要 read-modify-write 原子性。
            await redis.zrem(refresh_old_key, token_hash)
            return False

        logger.info(f"Accepted old admin refresh token in grace period: {admin_id}")
        return True

    async def rotate_refresh_token(
        self,
        old_refresh_token: str,
        new_refresh_token: str,
        admin_id: int,
        new_expires_at: int,
    ) -> bool:
        """轮换 refresh token。

        Args:
            old_refresh_token: 旧 refresh token。
            new_refresh_token: 新 refresh token。
            admin_id: 管理员 ID。
            new_expires_at: 新 token 过期时间，Unix 秒。

        Returns:
            是否轮换成功。
        """

        redis = await self._redis.get_client()
        old_token_hash = self._hash_token(old_refresh_token)
        new_token_hash = self._hash_token(new_refresh_token)
        refresh_key = self._build_key(TokenType.ADMIN_REFRESH, admin_id)
        refresh_old_key = self._build_key(TokenType.ADMIN_REFRESH_OLD, admin_id)
        now = timestamp_now_seconds()
        grace_period_expires_at = now + REFRESH_TOKEN_GRACE_PERIOD_SECONDS

        pipe = redis.pipeline(transaction=True)
        pipe.zrem(refresh_key, old_token_hash)
        pipe.zadd(refresh_old_key, {old_token_hash: grace_period_expires_at})
        pipe.expire(refresh_old_key, REFRESH_TOKEN_GRACE_PERIOD_SECONDS)
        pipe.zadd(refresh_key, {new_token_hash: new_expires_at})
        pipe.expireat(refresh_key, new_expires_at)
        # 当前 token 与宽限期 token 必须整批落库，Redis 失败时续签直接失败。
        try:
            await pipe.execute()
        except Exception:
            logger.error(
                f"Rotate admin refresh token transaction failed: admin_id={admin_id}",
                exc_info=True,
            )
            raise

        # 轮换已完成；回收失败只保留无效成员，不影响新 token 的有效性。
        try:
            await redis.zremrangebyscore(refresh_key, "-inf", now)
        except Exception:
            logger.error(
                "Cleanup expired admin refresh tokens failed after rotation: "
                f"admin_id={admin_id}",
                exc_info=True,
            )

        logger.info(
            f"Rotated admin refresh token: admin_id={admin_id}, "
            f"grace_period_until={grace_period_expires_at}"
        )
        return True

    async def _verify_current_refresh_token(
        self,
        refresh_token: str,
        admin_id: int,
    ) -> bool:
        """验证当前 refresh token 是否存在且未过期。"""

        redis = await self._redis.get_client()
        token_hash = self._hash_token(refresh_token)
        refresh_key = self._build_key(TokenType.ADMIN_REFRESH, admin_id)
        expires_at = await redis.zscore(refresh_key, token_hash)
        if expires_at is None:
            return False

        expires_at_int = int(expires_at)
        if expires_at_int < timestamp_now_seconds():
            # token 已判定失效，后置删除只负责回收，不需要 read-modify-write 原子性。
            await redis.zrem(refresh_key, token_hash)
            return False

        return True


admin_token_service = AdminTokenService()
