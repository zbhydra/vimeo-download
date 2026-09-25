"""
Init DB 测试
"""

import pytest


@pytest.mark.asyncio
class TestInitDb:
    """数据库初始化测试"""

    async def test_database_exists(self):
        """测试数据库是否存在"""
        from app.core.database import get_engine

        engine = get_engine()
        assert engine is not None

    async def test_execute_sql_file(self):
        """测试执行 SQL 文件"""
        # 这个测试需要实际的 SQL 文件
        # 这里只是验证接口存在
        from app.init.init_db import parse_sql_statements

        sql = "SELECT 1;"
        statements = parse_sql_statements(sql)
        assert len(statements) >= 1
