"""
数据库模型基类
提供通用的字段和方法
注意：Base 已在 core/database.py 中定义
"""

from typing import Any

from app.core.database import Base


class BaseDBModel(Base):
    """数据库模型基类"""

    __abstract__ = True

    def to_dict(self) -> dict[str, Any]:
        """转换为字典的基础实现"""
        result = {}
        # 使用 __dict__ 获取所有实例属性，但过滤掉 SQLAlchemy 的内部属性
        for key, value in self.__dict__.items():
            if not key.startswith("_sa_"):
                result[key] = value
        return result
