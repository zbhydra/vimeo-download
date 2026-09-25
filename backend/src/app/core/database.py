"""
数据库核心配置和会话管理
使用 SQLAlchemy 异步引擎和连接池支持长久服务
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Optional

from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.core.config import settings
from app.utils.logger import logger

# 全局引擎和会话工厂实例
_engine: Optional[AsyncEngine] = None
_session_factory = None

# 创建基础模型类
Base = declarative_base()

# 元数据
metadata = MetaData()


def get_engine() -> AsyncEngine:
    """
    获取异步引擎实例
    使用单例模式确保整个应用生命周期内使用同一个引擎

    Returns:
        AsyncEngine: SQLAlchemy 异步引擎实例
    """
    global _engine
    if _engine is None:
        # 构建 MySQL+aiomysql 连接 URL
        db_config = settings.database
        url = (
            f"mysql+aiomysql://{db_config.user}:{db_config.password}"
            f"@{db_config.host}:{db_config.port}/{db_config.database}"
        )

        # 创建异步引擎，配置连接池参数
        _engine = create_async_engine(
            url,
            pool_size=db_config.pool_size,  # 连接池大小
            max_overflow=db_config.max_overflow,  # 超出连接池大小的最大连接数
            pool_recycle=3600,  # 连接回收时间（秒）
            echo=settings.app.debug,  # 调试模式打印 SQL
            future=True,  # 使用 SQLAlchemy 2.0 风格
            pool_pre_ping=True,  # 连接前检查连接是否有效
        )
        # print(url)

        # 添加连接池事件监听器，用于监控和调试
        # @event.listens_for(Pool, "connect")
        # def receive_connect(dbapi_connection, connection_record):
        #     logger.info("数据库连接已建立")

        # @event.listens_for(Pool, "checkout")
        # def receive_checkout(dbapi_connection, connection_record, connection_proxy):
        #     logger.debug("从连接池获取连接")

        # @event.listens_for(Pool, "checkin")
        # def receive_checkin(dbapi_connection, connection_record):
        #     logger.debug("连接归还到连接池")

    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """
    获取会话工厂
    使用单例模式确保整个应用生命周期内使用同一个会话工厂

    Returns:
        async_sessionmaker: SQLAlchemy 异步会话工厂
    """

    global _session_factory
    if _session_factory is None:
        engine = get_engine()
        _session_factory = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,  # 提交后不使对象过期
        )
    return _session_factory


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    获取异步数据库会话的上下文管理器
    每个操作从工厂获取会话，使用后自动归还到连接池

    Yields:
        AsyncSession: SQLAlchemy 异步会话
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """初始化数据库"""
    try:
        # 导入所有模型以确保它们被注册到 Base.metadata

        # 创建所有表
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


async def check_db_connection() -> bool:
    """检查数据库连接"""
    try:
        from sqlalchemy import text

        engine = get_engine()
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection successful")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False


async def close_engine() -> None:
    """
    关闭全局引擎实例
    应用关闭时调用，释放所有连接
    """
    global _engine, _session_factory
    if _engine is not None:
        try:
            # 使用 sync_close 确保同步关闭，避免事件循环问题
            await _engine.dispose()
        except Exception as e:
            logger.warning(f"关闭数据库引擎时出现警告: {e}")
        finally:
            _engine = None
            _session_factory = None
            logger.info("数据库引擎已关闭，所有连接已释放")


def reset_engine_for_test() -> None:
    """
    重置全局引擎实例（仅用于测试）
    测试环境需要强制重新创建引擎以避免事件循环冲突
    """
    global _engine, _session_factory
    _engine = None
    _session_factory = None
