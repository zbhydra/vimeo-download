"""Redis 分布式锁实现"""

import asyncio
import uuid
from contextlib import asynccontextmanager

from app.utils.logger import logger
from app.core.redis import redis_client, RedisException
from app.utils.redis_key import build_redis_key


class RedisLockError(RedisException):
    """Redis 锁异常"""

    pass


class RedisLock:
    """Redis 分布式锁实现"""

    def __init__(self):
        self._key_prefix = "lock"

    def _build_key(self, key: str) -> str:
        """构建锁键名"""
        full_key = f"{self._key_prefix}:{key}"
        return build_redis_key(full_key)

    async def acquire(
        self, key: str, ttl: int = 30, timeout: int | None = None
    ) -> str | None:
        """获取分布式锁"""
        redis_key = self._build_key(key)
        lock_value = str(uuid.uuid4())

        try:
            redis = await redis_client.get_client()

            if timeout:
                start_time = asyncio.get_event_loop().time()
                attempt = 0

                while True:
                    result = await redis.set(redis_key, lock_value, nx=True, ex=ttl)

                    if result is True or result == "OK":
                        return lock_value

                    elapsed = asyncio.get_event_loop().time() - start_time
                    if elapsed >= timeout:
                        return None

                    # 指数退避：0.01s, 0.02s, 0.04s, 0.08s, ..., 最大 1s
                    sleep_time = min(0.01 * (2**attempt), 1.0)
                    await asyncio.sleep(sleep_time)
                    attempt += 1
            else:
                result = await redis.set(redis_key, lock_value, nx=True, ex=ttl)

                if result is True or result == "OK":
                    return lock_value

                return None

        except Exception as e:
            logger.error(f"Failed to acquire lock '{key}': {e}")
            raise

    async def release(self, key: str, lock_value: str) -> bool:
        """释放分布式锁"""
        redis_key = self._build_key(key)

        lua_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """

        try:
            redis = await redis_client.get_client()
            result = await redis.eval(
                lua_script, 1, redis_key, lock_value
            )  # type: ignore[misc]
            return int(result) > 0
        except Exception as e:
            logger.error(f"Failed to release lock '{key}': {e}")
            return False

    @asynccontextmanager
    async def lock_context(self, key: str, ttl: int = 30, timeout: int | None = None):
        """上下文管理器"""
        lock_value = await self.acquire(key, ttl=ttl, timeout=timeout)
        if lock_value is None:
            raise RedisLockError(f"Failed to acquire lock: {key}")

        try:
            yield
        finally:
            await self.release(key, lock_value)
