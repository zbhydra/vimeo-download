"""
Export Database Schema 测试
"""

import pytest


@pytest.mark.asyncio
class TestExportDatabaseSchema:
    """导出数据库架构测试"""

    async def test_export_database_schema(self):
        """测试导出数据库架构"""
        # 验证函数存在
        from app.init.export_database_schema import export_database_schema

        assert callable(export_database_schema)
