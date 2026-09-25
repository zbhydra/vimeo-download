#!/usr/bin/env python3
"""
数据库初始化模块
使用 SQL 文件创建数据库和表
"""
import asyncio
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.database import Base, get_engine
from app.utils.logger import logger


async def create_database_if_not_exists():
    """创建数据库（如果不存在）"""
    # 构建不指定数据库的连接 URL
    db_config = settings.database
    server_url = f"mysql+aiomysql://{db_config.user}:{db_config.password}@{db_config.host}:{db_config.port}/"

    # 使用异步引擎
    engine = create_async_engine(server_url, echo=True)

    try:
        async with engine.begin() as conn:
            # 创建数据库
            await conn.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{db_config.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
            logger.info(f"Database '{db_config.database}' created or already exists")
            return True
    except Exception as e:
        logger.error(f"Failed to create database: {e}")
        return False
    finally:
        await engine.dispose()


async def execute_sql_file(sql_file_path: str) -> bool:
    """执行 SQL 文件"""
    try:
        # 读取 SQL 文件
        sql_path = Path(sql_file_path)
        if not sql_path.exists():
            logger.error(f"SQL file not found: {sql_file_path}")
            return False

        with open(sql_path, "r", encoding="utf-8") as f:
            sql_content = f.read()

        # 清理和分割 SQL 语句
        sql_statements = parse_sql_statements(sql_content)

        if not sql_statements:
            logger.warning("No valid SQL statements found in the file")
            return False

        # 获取数据库连接
        engine = get_engine()

        executed_count = 0
        async with engine.begin() as conn:
            for i, statement in enumerate(sql_statements, 1):
                try:
                    await conn.execute(text(statement))
                    executed_count += 1
                    logger.debug(f"Executed SQL statement {i}: {statement[:60]}...")
                except Exception as e:
                    logger.warning(f"Failed to execute SQL statement {i}: {e}")
                    logger.warning(f"Statement: {statement[:120]}...")
                    # 继续执行其他语句，不中断整个过程

        logger.info(
            f"Successfully executed {executed_count}/{len(sql_statements)} SQL statements from {sql_file_path}"
        )
        return True

    except Exception as e:
        logger.error(f"Failed to execute SQL file {sql_file_path}: {e}")
        return False


def parse_sql_statements(sql_content: str) -> list:
    """
    解析 SQL 内容，提取有效的 SQL 语句
    """
    statements = []
    current_statement = ""
    in_multiline_comment = False

    lines = sql_content.split("\n")

    for line in lines:
        line = line.strip()

        # 跳过空行和单行注释
        if not line or line.startswith("--"):
            continue

        # 处理多行注释
        if "/*" in line:
            in_multiline_comment = True
        if in_multiline_comment:
            if "*/" in line:
                in_multiline_comment = False
                # 移除注释部分
                line = line[line.index("*/") + 2 :]
            else:
                continue
        if line.startswith("*/"):
            continue

        # 添加到当前语句
        current_statement += line + " "

        # 如果语句以分号结尾，则添加到语句列表
        if line.endswith(";"):
            statement = current_statement.strip()
            if statement:
                # 移除末尾的分号（SQLAlchemy text() 会自动处理）
                if statement.endswith(";"):
                    statement = statement[:-1]
                statements.append(statement)
            current_statement = ""

    # 处理最后一个可能没有分号的语句
    if current_statement.strip():
        statement = current_statement.strip()
        if statement and not statement.startswith("--"):
            statements.append(statement)

    return statements


async def create_tables():
    """使用 SQL 文件创建所有表"""
    # 获取 SQL 文件路径
    current_dir = Path(__file__).parent
    sql_file_path = current_dir / "database.sql"

    logger.info(f"Creating tables from SQL file: {sql_file_path}")

    if await execute_sql_file(str(sql_file_path)):
        logger.info("All tables created successfully from SQL file")
        return True
    else:
        logger.error(
            "Failed to create tables from SQL file, falling back to SQLAlchemy"
        )
        # 如果 SQL 文件执行失败，回退到 SQLAlchemy 方式
        try:
            engine = get_engine()
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("All tables created successfully using SQLAlchemy fallback")
            return True
        except Exception as e:
            logger.error(f"Failed to create tables with SQLAlchemy fallback: {e}")
            return False


async def verify_database():
    """验证数据库是否正确设置"""
    try:
        engine = get_engine()
        async with engine.begin() as conn:
            # 检查所有表是否存在
            tables_to_check = ["places", "runners", "tasks", "task_results"]

            for table_name in tables_to_check:
                try:
                    result = await conn.execute(
                        text(f"SELECT COUNT(*) FROM {table_name}")
                    )
                    count = result.scalar()
                    logger.info(f"Table '{table_name}' exists with {count} records")
                except Exception as e:
                    logger.warning(f"Table '{table_name}' check failed: {e}")
                    return False

            logger.info("Database verification completed successfully")
            return True
    except Exception as e:
        logger.error(f"Database verification failed: {e}")
        return False


async def init_database():
    """完整的数据库初始化流程"""
    logger.info("Starting database initialization...")

    # 1. 创建数据库
    if not await create_database_if_not_exists():
        logger.error("Failed to create database")
        return False

    # 2. 创建表
    if not await create_tables():
        logger.error("Failed to create tables")
        return False

    # 3. 验证数据库
    if not await verify_database():
        logger.error("Failed to verify database")
        return False

    logger.info("Database initialization completed successfully")
    return True


async def init_database_from_sql_only():
    """仅使用 SQL 文件初始化数据库（不创建数据库本身）"""
    logger.info("Initializing database schema from SQL file only...")

    # 获取 SQL 文件路径
    current_dir = Path(__file__).parent
    sql_file_path = current_dir / "database.sql"

    if await execute_sql_file(str(sql_file_path)):
        logger.info("Database schema initialized successfully from SQL file")
        return True
    else:
        logger.error("Failed to initialize database schema from SQL file")
        return False


def init_database_sync():
    """同步版本的数据库初始化，用于命令行调用"""
    return asyncio.run(init_database())


def init_database_from_sql_sync():
    """同步版本的仅 SQL 文件初始化，用于命令行调用"""
    return asyncio.run(init_database_from_sql_only())


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--sql-only":
        # 仅执行 SQL 文件
        success = init_database_from_sql_sync()
    else:
        # 完整的数据库初始化
        success = init_database_sync()

    sys.exit(0 if success else 1)
