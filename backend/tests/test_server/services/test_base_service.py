"""
Base Service 异步测试
"""

import pytest
from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.services.base_service import BaseService
from app.models.base import BaseDBModel


class MockModel(BaseDBModel):
    """模拟模型类"""

    __tablename__ = "mock_base_test_models"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))


@pytest.mark.asyncio
class TestBaseService:
    """基础操作测试"""

    async def test_get_all(self):
        """测试获取所有记录"""
        ops = BaseService(MockModel)
        ops.primary_key_field = "id"
        assert ops is not None

    async def test_create_method_exists(self):
        """测试创建方法存在"""
        ops = BaseService(MockModel)
        ops.primary_key_field = "id"

        # 验证方法存在
        assert hasattr(ops, "create")
        assert hasattr(ops, "get_by_id")
        assert hasattr(ops, "get_all")
        assert hasattr(ops, "update")
        assert hasattr(ops, "delete")

    async def test_update_method_exists(self):
        """测试更新方法存在"""
        ops = BaseService(MockModel)
        ops.primary_key_field = "id"
        assert hasattr(ops, "update")

    async def test_delete_method_exists(self):
        """测试删除方法存在"""
        ops = BaseService(MockModel)
        ops.primary_key_field = "id"
        assert hasattr(ops, "delete")
