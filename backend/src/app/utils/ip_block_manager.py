"""IP 封禁管理器

管理 IP 封禁状态，使用 Redis 存储。
"""

from app.utils.logger import logger
from app.core.redis import redis_client
from app.utils.redis_key import build_redis_key


class IPBlockManager:
    """IP 封禁管理器"""

    def __init__(self, key_prefix: str = "ip_block"):
        """
        初始化 IP 封禁管理器

        Args:
            key_prefix: Redis key 前缀
        """
        self._key_prefix = key_prefix

    def _build_key(self, ip_address: str) -> str:
        """构建封禁键名"""
        key = f"{self._key_prefix}:{ip_address}"
        return build_redis_key(key)

    async def is_blocked(self, ip_address: str) -> bool:
        """
        检查 IP 是否被封禁

        Args:
            ip_address: IP 地址

        Returns:
            True 表示被封禁，False 表示未封禁
        """
        try:
            redis_key = self._build_key(ip_address)
            redis = await redis_client.get_client()
            exists = await redis.exists(redis_key)
            return bool(exists)
        except Exception as e:
            logger.error(f"Failed to check IP block status: {e}")
            # Redis 故障时放行（fail-open），避免因 Redis 故障影响服务可用性
            return False

    async def block(self, ip_address: str, duration: int) -> bool:
        """
        封禁 IP

        Args:
            ip_address: IP 地址
            duration: 封禁时长（秒）

        Returns:
            是否成功
        """
        try:
            redis_key = self._build_key(ip_address)
            redis = await redis_client.get_client()

            # 使用 SET 命令存储封禁状态并设置过期时间（原子操作）
            await redis.set(redis_key, "1", ex=duration)

            logger.warning(f"IP {ip_address} blocked for {duration} seconds")
            return True

        except Exception as e:
            logger.error(f"Failed to block IP {ip_address}: {e}")
            return False

    async def get_remaining_time(self, ip_address: str) -> int:
        """
        获取剩余封禁时间

        Args:
            ip_address: IP 地址

        Returns:
            剩余秒数，0 表示未封禁或已过期
        """
        try:
            redis_key = self._build_key(ip_address)
            redis = await redis_client.get_client()
            ttl = await redis.ttl(redis_key)
            return max(0, ttl)
        except Exception as e:
            logger.error(f"Failed to get remaining time for IP {ip_address}: {e}")
            return 0

    async def unblock(self, ip_address: str) -> bool:
        """
        解除 IP 封禁

        Args:
            ip_address: IP 地址

        Returns:
            是否成功
        """
        try:
            redis_key = self._build_key(ip_address)
            redis = await redis_client.get_client()
            await redis.delete(redis_key)
            logger.info(f"IP {ip_address} unblocked")
            return True
        except Exception as e:
            logger.error(f"Failed to unblock IP {ip_address}: {e}")
            return False
