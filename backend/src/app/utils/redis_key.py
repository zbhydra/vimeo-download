from app.core.config import settings


def build_redis_key(key: str) -> str:
    """构建 Redis key，自动添加配置前缀。"""
    prefix = settings.redis.key_prefix
    return f"{prefix}:{key}"
