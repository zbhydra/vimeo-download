"""
pytest 配置文件
"""

import asyncio
import sys
import uuid
import warnings
from collections.abc import Callable
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.core.database import get_async_session

# 添加 src 目录到 Python 路径
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

TEST_RUN_ID = uuid.uuid4().hex[:12]
TEST_DATA_PREFIX = "pytest"
TEST_EMAIL_DOMAIN = "example.com"


def _normalize_test_label(label: str) -> str:
    """把测试场景名压成可读且长度稳定的邮箱片段。"""

    value = "".join(char if char.isalnum() else "-" for char in label.lower())
    value = value.strip("-")
    return (value or "case")[:20]


async def _table_exists(session, table_name: str) -> bool:
    """判断表是否存在，兼容本地库 schema 未同步的情况。"""

    result = await session.execute(
        text("SHOW TABLES LIKE :table_name"),
        {"table_name": table_name},
    )
    return result.first() is not None


async def _delete_test_owned_rows(session) -> None:
    """只清理当前 pytest 运行创建的数据，保留本地真实数据。"""

    email_pattern = f"{TEST_DATA_PREFIX}-%-{TEST_RUN_ID}@{TEST_EMAIL_DOMAIN}"
    device_pattern = f"{TEST_DATA_PREFIX}-%-{TEST_RUN_ID}"
    users_exists = await _table_exists(session, "users")

    if users_exists and await _table_exists(session, "user_subscriptions"):
        await session.execute(
            text(
                """
                DELETE FROM user_subscriptions
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if users_exists and await _table_exists(session, "orders"):
        await session.execute(
            text(
                """
                DELETE FROM orders
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if users_exists and await _table_exists(session, "user_download_records"):
        await session.execute(
            text(
                """
                DELETE FROM user_download_records
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if users_exists and await _table_exists(session, "user_ip_registers"):
        await session.execute(
            text(
                """
                DELETE FROM user_ip_registers
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if users_exists and await _table_exists(session, "user_checkin_records"):
        await session.execute(
            text(
                """
                DELETE FROM user_checkin_records
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if users_exists and await _table_exists(session, "user_checkin_campaigns"):
        await session.execute(
            text(
                """
                DELETE FROM user_checkin_campaigns
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if users_exists and await _table_exists(session, "user_credit_logs"):
        await session.execute(
            text(
                """
                DELETE FROM user_credit_logs
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if users_exists and await _table_exists(session, "user_credit_accounts"):
        await session.execute(
            text(
                """
                DELETE FROM user_credit_accounts
                WHERE user_id IN (
                    SELECT user_id FROM users WHERE email LIKE :email_pattern
                )
                """
            ),
            {"email_pattern": email_pattern},
        )

    if await _table_exists(session, "mark_logs"):
        await session.execute(
            text(
                """
                DELETE FROM mark_logs
                WHERE device_id LIKE :device_pattern
                   OR mark_msg LIKE :mark_msg_pattern
                """
            ),
            {
                "device_pattern": device_pattern,
                "mark_msg_pattern": f"%{TEST_RUN_ID}%",
            },
        )

    if users_exists:
        await session.execute(
            text("DELETE FROM users WHERE email LIKE :email_pattern"),
            {"email_pattern": email_pattern},
        )


def _create_non_config_tables(connection: Connection) -> None:
    """仅补齐测试可写业务表，配置表由真实环境维护。"""

    from app.core.database import Base

    for table in Base.metadata.sorted_tables:
        if table.name.startswith("config_"):
            continue
        table.create(connection, checkfirst=True)


# 抑制 aiomysql 连接关闭时的警告，这是已知的 pytest+aiomysql 兼容性问题
def pytest_configure(config):
    """配置 pytest，抑制特定警告"""
    import os

    # 设置测试环境标记
    os.environ["PYTEST_RUNNING"] = "true"
    os.environ["TESTING"] = "true"

    # 使用多种方式抑制警告
    warnings.filterwarnings(
        "ignore",
        category=pytest.PytestUnraisableExceptionWarning,
        message=".*Event loop is closed.*",
    )
    warnings.filterwarnings("ignore", category=pytest.PytestUnraisableExceptionWarning)
    # 设置环境变量也抑制警告
    os.environ["PYTHONWARNINGS"] = "ignore::pytest.PytestUnraisableExceptionWarning"


# 在会话开始时设置警告过滤器
@pytest.fixture(scope="session", autouse=True)
def setup_warnings():
    """设置警告过滤器"""
    warnings.filterwarnings(
        "ignore",
        category=pytest.PytestUnraisableExceptionWarning,
        message=".*Event loop is closed.*",
    )
    warnings.filterwarnings("ignore", category=pytest.PytestUnraisableExceptionWarning)
    yield


@pytest.fixture(scope="function")
def event_loop():
    """创建一个事件循环实例（每个测试函数一个新循环）"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    # 关闭事件循环
    loop.close()


@pytest.fixture
def test_run_id() -> str:
    """返回当前 pytest 进程的测试数据标识。"""

    return TEST_RUN_ID


@pytest.fixture
def make_test_email() -> Callable[[str], str]:
    """生成本轮测试专属邮箱，便于定向清理。"""

    def _make_test_email(label: str) -> str:
        normalized_label = _normalize_test_label(label)
        random_part = uuid.uuid4().hex[:8]
        return (
            f"{TEST_DATA_PREFIX}-{normalized_label}-"
            f"{random_part}-{TEST_RUN_ID}@{TEST_EMAIL_DOMAIN}"
        )

    return _make_test_email


@pytest.fixture
def make_test_device_id() -> Callable[[str], str]:
    """生成本轮测试专属设备 ID，便于定向清理。"""

    def _make_test_device_id(label: str) -> str:
        normalized_label = _normalize_test_label(label)
        random_part = uuid.uuid4().hex[:8]
        return f"{TEST_DATA_PREFIX}-{normalized_label}-{random_part}-{TEST_RUN_ID}"

    return _make_test_device_id


@pytest.fixture
async def async_client():
    """提供异步测试客户端"""
    from app.core.database import reset_engine_for_test
    from app.main import app

    # 重置引擎以确保干净的状态
    reset_engine_for_test()

    # 使用 ASGI 传输来测试 FastAPI 应用
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", timeout=30.0
    ) as ac:
        yield ac


@pytest.fixture
async def db_session():
    """提供一个数据库会话用于测试（别名）"""
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.database import get_engine

    engine = get_engine()
    async with AsyncSession(engine) as session:
        try:
            yield session
        finally:
            # 确保会话正确关闭
            await session.close()


@pytest.fixture
async def test_db_session():
    """提供一个数据库会话用于测试"""
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.database import get_engine

    # 确保所有表都存在
    import app.models  # noqa: F401

    engine = get_engine()

    # 配置表是真实环境数据，只允许读取；这里只补齐测试可写业务表。
    async with engine.begin() as conn:
        await conn.run_sync(_create_non_config_tables)

    async with AsyncSession(engine) as session:
        try:
            yield session
        finally:
            # 确保会话正确关闭
            await session.close()


@pytest.fixture(scope="function", autouse=True)
async def cleanup_db_connections():
    """每个测试函数后自动清理数据库连接和测试数据"""
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.database import (
        close_engine,
        get_engine,
        reset_engine_for_test,
    )
    from app.core.redis import redis_client

    # 测试开始前重置引擎
    reset_engine_for_test()

    yield  # 让测试运行

    try:
        # 清理数据库中的所有测试数据
        engine = get_engine()
        async with AsyncSession(engine) as session:
            try:
                await _delete_test_owned_rows(session)
                await session.commit()
            except Exception:
                await session.rollback()
            finally:
                await session.close()

        # 确保引擎连接关闭
        await close_engine()
    except Exception:
        pass  # 忽略清理过程中的错误

    try:
        await redis_client.close()
    except Exception:
        pass  # 忽略清理过程中的错误


# Shared fixtures for integration tests
@pytest.fixture
async def test_db():
    """测试数据库连接"""
    async with get_async_session() as db:
        yield db
