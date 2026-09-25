"""Real 集成测试专用 fixture。"""

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import check_db_connection, get_engine
from app.core.redis import redis_client
from app.main import app


@pytest.fixture
async def real_async_client() -> AsyncIterator[AsyncClient]:
    """
    提供 real API 测试客户端。

    Yields:
        AsyncClient: 通过 ASGI 调用真实 FastAPI 应用的客户端。
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        timeout=30.0,
    ) as client:
        yield client


@pytest.fixture
async def real_mysql_ready() -> None:
    """
    检查 MySQL 可用性。

    Raises:
        pytest.skip: MySQL 不可用时跳过 real 测试。
    """
    if not await check_db_connection():
        pytest.skip("REAL_MYSQL_UNAVAILABLE: MySQL 不可用，跳过 real 测试")


@pytest.fixture
async def real_schema_ready(real_mysql_ready) -> None:
    """
    检查播放器相关 real 测试需要的表。

    Args:
        real_mysql_ready: MySQL 可用性 fixture。

    Raises:
        pytest.skip: 必要表不存在时跳过 real 测试。
    """
    required_tables = {"users", "user_subscriptions"}
    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(text("SHOW TABLES"))
        tables = {str(row[0]) for row in result.fetchall()}

    missing = sorted(required_tables - tables)
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_redis_ready() -> None:
    """
    检查 Redis 可用性。

    Raises:
        pytest.skip: Redis 不可用时跳过 real 测试。
    """
    try:
        redis = await redis_client.get_client()
        await redis.ping()
    except Exception as exc:
        pytest.skip(f"REAL_REDIS_UNAVAILABLE: Redis 不可用，跳过 real 测试: {exc}")
