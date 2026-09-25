"""Redis 客户端 - 连接池管理"""

import asyncio

from redis.asyncio import BlockingConnectionPool, Redis

from app.core.config import settings


class RedisException(Exception):
    """Redis 基础异常"""

    pass


class RedisConnectionError(RedisException):
    """Redis 连接失败"""

    pass


class RedisOperationError(RedisException):
    """Redis 操作失败"""

    pass


class RedisClient:
    """
    Redis 客户端单例
    负责连接池管理和基础 Redis 操作
    """

    def __init__(self) -> None:
        self._pool: BlockingConnectionPool | None = None
        self._client: Redis | None = None
        self._lock = asyncio.Lock()
        self._is_available = True

    async def _create_pool(self) -> BlockingConnectionPool:
        """创建 Redis 阻塞式连接池"""
        config = settings.redis

        pool: BlockingConnectionPool = BlockingConnectionPool.from_url(
            config.url,
            db=config.db,
            max_connections=config.pool_size,
            timeout=config.pool_timeout,
            socket_timeout=config.socket_timeout,
            socket_connect_timeout=config.socket_connect_timeout,
            retry_on_timeout=config.retry_on_timeout,
            decode_responses=True,
        )
        return pool

    async def get_client(self) -> Redis:
        """
        获取 Redis 客户端实例
        懒加载模式，首次调用时创建连接池
        """
        if self._client is None:
            async with self._lock:
                if self._client is None:
                    self._pool = await self._create_pool()
                    self._client = Redis(connection_pool=self._pool)

        return self._client

    async def _close_internal(self) -> None:
        """内部关闭方法，不获取锁"""
        if self._client:
            try:
                await self._client.close()
            except (RuntimeError, Exception):
                # Event loop might be closed, ignore
                pass

        if self._pool:
            try:
                await self._pool.disconnect()
            except (RuntimeError, Exception):
                # Event loop might be closed, ignore
                pass

        self._client = None
        self._pool = None

    async def close(self) -> None:
        """关闭 Redis 连接"""
        async with self._lock:
            await self._close_internal()
            self._is_available = False

    # execute_command 已经弃用


# 全局 Redis 客户端实例
redis_client = RedisClient()
