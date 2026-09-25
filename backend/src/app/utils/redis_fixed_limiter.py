"""Redis 固定窗口限流器

使用固定窗口计数器算法实现通用限流器。
算法：将时间戳除以窗口大小得到窗口编号，使用 Redis INCR 计数。

适用于：登录失败限流、API 限流等场景。
"""

import time

from app.utils.logger import logger
from app.core.redis import redis_client
from app.utils.redis_key import build_redis_key


# Lua 脚本：原子性地增加计数器并在首次设置时添加过期时间
# 返回值：增加后的计数值
_INCR_WITH_EXPIRE_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""


class RedisFixedLimiter:
    """Redis 固定窗口限流器"""

    def __init__(self, key_prefix: str = "fixed_window_limit"):
        """
        初始化限流器

        Args:
            key_prefix: Redis key 前缀
        """
        self._key_prefix = key_prefix

    def _build_key(self, identifier: str, window: int) -> str:
        """
        构建限流键名

        Args:
            identifier: 标识符（如 IP、用户 ID 等）
            window: 时间窗口（秒）

        Returns:
            Redis key
        """
        current_time = int(time.time())
        window_id = current_time // window
        key = f"{self._key_prefix}:{identifier}:{window_id}"
        return build_redis_key(key)

    async def is_allowed(
        self,
        identifier: str,
        limit: int,
        window: int,
    ) -> bool:
        """
        检查是否允许请求

        Args:
            identifier: 标识符（如 IP、用户 ID 等）
            limit: 限制次数
            window: 时间窗口（秒）

        Returns:
            True 表示允许，False 表示超过限制
        """
        try:
            redis_key = self._build_key(identifier, window)
            redis = await redis_client.get_client()

            # 使用 Lua 脚本原子性地增加计数并设置过期时间
            result = await redis.eval(  # type: ignore[misc]
                _INCR_WITH_EXPIRE_SCRIPT, 1, redis_key, window + 1
            )
            current_count = int(result) if result is not None else 0

            return current_count <= limit

        except Exception as e:
            logger.error(f"Fixed window rate limit check failed: {e}", exc_info=True)
            # Redis 故障时放行（fail-open），避免因 Redis 故障影响服务可用性
            return True

    async def get_current_count(self, identifier: str, window: int) -> int:
        """
        获取当前窗口的计数值

        Args:
            identifier: 标识符
            window: 时间窗口（秒）

        Returns:
            当前计数值
        """
        try:
            redis_key = self._build_key(identifier, window)
            redis = await redis_client.get_client()
            count = await redis.get(redis_key)
            return int(count) if count else 0
        except Exception as e:
            logger.error(f"Failed to get current count: {e}", exc_info=True)
            return 0

    async def reset(self, identifier: str, window: int) -> bool:
        """
        重置当前窗口的计数

        Args:
            identifier: 标识符
            window: 时间窗口（秒）

        Returns:
            是否成功
        """
        try:
            redis_key = self._build_key(identifier, window)
            redis = await redis_client.get_client()
            await redis.delete(redis_key)
            return True
        except Exception as e:
            logger.error(
                f"Failed to reset rate limit for '{identifier}': {e}",
                exc_info=True,
            )
            return False
