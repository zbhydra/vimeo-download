"""Redis 限流实现"""

import time
import uuid

from app.utils.logger import logger
from app.core.redis import redis_client
from app.utils.redis_key import build_redis_key


class RedisRateLimiter:
    """Redis 限流实现"""

    def __init__(self) -> None:
        self._key_prefix = "rate_limit"
        self._local_limits: dict[str, list[int]] = {}  # 本地降级

    def _build_key(self, key: str) -> str:
        """构建限流键名"""
        full_key = f"{self._key_prefix}:{key}"
        return build_redis_key(full_key)

    async def is_allowed(self, key: str, limit: int, window: int) -> bool:
        """检查是否允许请求"""
        try:
            redis_key = self._build_key(key)
            current_time = int(time.time())
            redis = await redis_client.get_client()

            # 使用 Sorted Set 实现滑动窗口
            await redis.zremrangebyscore(redis_key, 0, current_time - window)
            count = await redis.zcard(redis_key)

            if count >= limit:
                return False

            await redis.zadd(
                redis_key, {f"{current_time}-{uuid.uuid4().hex[:8]}": current_time}
            )
            await redis.expire(redis_key, window + 1)

            return True

        except Exception as e:
            logger.warning(f"Redis rate limit failed, using local fallback: {e}")
            return self._local_check(key, limit, window)

    def _local_check(self, key: str, limit: int, window: int) -> bool:
        """本地限流降级"""
        current_time = int(time.time())

        if key not in self._local_limits:
            self._local_limits[key] = []

        # 移除窗口外的记录
        self._local_limits[key] = [
            t for t in self._local_limits[key] if current_time - t < window
        ]

        # 检查是否超限
        if len(self._local_limits[key]) >= limit:
            return False

        # 添加当前请求
        self._local_limits[key].append(current_time)

        # 清理空的 key
        if not self._local_limits[key]:
            del self._local_limits[key]

        # 定期清理过期的 key（每 100 次检查一次）
        if id(key) % 100 == 0:
            self._cleanup_expired_keys(window, current_time)

        return True

    def _cleanup_expired_keys(self, window: int, current_time: int) -> None:
        """清理过期的限流 key"""
        keys_to_delete = []
        for k, timestamps in self._local_limits.items():
            # 移除过期时间戳
            self._local_limits[k] = [t for t in timestamps if current_time - t < window]
            # 如果列表为空，标记删除
            if not self._local_limits[k]:
                keys_to_delete.append(k)

        # 删除空 key
        for k in keys_to_delete:
            del self._local_limits[k]

    async def reset(self, key: str) -> bool:
        """重置限流计数"""
        try:
            redis_key = self._build_key(key)
            redis = await redis_client.get_client()
            await redis.delete(redis_key)
            if key in self._local_limits:
                del self._local_limits[key]
            return True
        except Exception as e:
            logger.error(f"Failed to reset rate limit for '{key}': {e}")
            return False
