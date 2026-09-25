"""Redis 消息队列实现 - 基于 Redis Streams"""

from typing import Any

from app.utils.logger import logger
from app.core.redis import redis_client
from app.utils.redis_key import build_redis_key


class RedisQueue:
    """Redis 消息队列实现 - 基于 Redis Streams"""

    def __init__(self):
        self._key_prefix = "queue"

    def _build_key(self, stream_name: str) -> str:
        """构建流键名"""
        full_key = f"{self._key_prefix}:{stream_name}"
        return build_redis_key(full_key)

    async def create_group(self, stream_name: str, group_name: str) -> bool:
        """创建消费者组"""
        try:
            redis_key = self._build_key(stream_name)
            redis = await redis_client.get_client()
            # MKSTREAM: 如果流不存在则自动创建
            result = await redis.xgroup_create(
                redis_key, group_name, id="0", mkstream=True
            )
            return result is True or result == b"OK"
        except Exception as e:
            # 如果组已存在，返回 True
            if "BUSYGROUP" in str(e):
                return True
            logger.error(f"Failed to create consumer group '{group_name}': {e}")
            return False

    async def add_message(self, stream_name: str, data: dict[str, Any]) -> str | None:
        """添加消息到队列"""
        try:
            redis_key = self._build_key(stream_name)
            redis = await redis_client.get_client()
            # XADD: 添加消息到流，* 表示自动生成 ID
            # 转换数据类型以匹配 Redis 的要求
            converted_data: dict[str, str | int | float] = {
                k: str(v) for k, v in data.items()
            }
            message_id = await redis.xadd(redis_key, converted_data)  # type: ignore[arg-type]
            return str(message_id) if message_id else None
        except Exception as e:
            logger.error(f"Failed to add message to '{stream_name}': {e}")
            return None

    async def read_group(
        self,
        stream_name: str,
        group_name: str,
        consumer_name: str,
        count: int = 1,
        block: int | None = None,
    ) -> list[dict[str, Any]]:
        """从消费者组读取消息"""
        try:
            redis_key = self._build_key(stream_name)
            redis = await redis_client.get_client()
            # XREADGROUP: 从消费者组读取消息
            # >: 表示只接收新消息（从未发送给其他消费者的消息）
            # 0: 表示读取所有pending消息
            if block is not None:
                # 阻塞读取
                result = await redis.xreadgroup(
                    group_name,
                    consumer_name,
                    {redis_key: ">"},
                    count=count,
                    block=block,
                )
            else:
                # 非阻塞读取
                result = await redis.xreadgroup(
                    group_name, consumer_name, {redis_key: ">"}, count=count
                )

            if not result:
                return []

            # 解析结果: [[stream_name, [[message_id, {field: value, ...}], ...]]]
            messages = []
            for stream_data in result:
                for message in stream_data[1]:
                    message_id = str(message[0])
                    fields = message[1].copy()
                    fields["message_id"] = message_id
                    messages.append(fields)

            return messages
        except Exception as e:
            logger.error(f"Failed to read from group '{group_name}': {e}")
            return []

    async def acknowledge(
        self, stream_name: str, group_name: str, message_id: str
    ) -> bool:
        """确认消息已处理"""
        try:
            redis_key = self._build_key(stream_name)
            redis = await redis_client.get_client()
            # XACK: 确认消息已处理
            result = await redis.xack(redis_key, group_name, message_id)
            return result > 0
        except Exception as e:
            logger.error(f"Failed to acknowledge message '{message_id}': {e}")
            return False
