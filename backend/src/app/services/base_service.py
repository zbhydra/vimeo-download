"""
数据库操作基类
提供通用的 CRUD 操作模板
"""

from abc import ABC
from typing import Any, Generic, Optional, Type, TypeVar

from sqlalchemy import select

from app.core.database import get_async_session
from app.models.base import BaseDBModel

ModelType = TypeVar("ModelType", bound=BaseDBModel)


class BaseService(ABC, Generic[ModelType]):
    """数据库操作基类"""

    primary_key_field: str = ""  # 子类必须重写此字段

    def __init__(self, model_class: Type[ModelType]):
        self.model_class = model_class

    async def get_by_id(self, id: int) -> Optional[ModelType]:
        """根据ID获取记录"""
        if not self.primary_key_field:
            raise ValueError(f"{self.__class__.__name__} must define primary_key_field")

        async with get_async_session() as db:
            pk_attr = getattr(self.model_class, self.primary_key_field)
            stmt = select(self.model_class).where(pk_attr == id)
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def get_all(self, offset: int = 0, limit: int = 20) -> list[ModelType]:
        """获取所有记录"""
        async with get_async_session() as db:
            stmt = select(self.model_class).offset(offset).limit(limit)
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def create(self, instance: ModelType) -> ModelType:
        """保存实例到数据库"""
        async with get_async_session() as db:
            try:
                db.add(instance)
                await db.commit()
                await db.refresh(instance)
                return instance
            except Exception:
                await db.rollback()
                raise

    async def update(self, id: int, **kwargs) -> bool:
        """更新记录"""
        if not self.primary_key_field:
            raise ValueError(f"{self.__class__.__name__} must define primary_key_field")

        async with get_async_session() as db:
            try:
                pk_attr = getattr(self.model_class, self.primary_key_field)
                stmt = select(self.model_class).where(pk_attr == id)
                result = await db.execute(stmt)
                instance = result.scalar_one_or_none()

                if instance:
                    for key, value in kwargs.items():
                        setattr(instance, key, value)
                    await db.commit()
                    return True
                return False
            except Exception:
                await db.rollback()
                raise

    async def delete(self, id: int) -> bool:
        """删除记录"""
        if not self.primary_key_field:
            raise ValueError(f"{self.__class__.__name__} must define primary_key_field")

        async with get_async_session() as db:
            try:
                pk_attr = getattr(self.model_class, self.primary_key_field)
                stmt = select(self.model_class).where(pk_attr == id)
                result = await db.execute(stmt)
                instance = result.scalar_one_or_none()

                if instance:
                    await db.delete(instance)
                    await db.commit()
                    return True
                return False
            except Exception:
                await db.rollback()
                raise

    async def delete_by_id(self, id: int) -> bool:
        """删除记录（别名方法）"""
        return await self.delete(id)


class ShardedService(BaseService[ModelType], Generic[ModelType]):
    """
    分表数据库操作基类
    提供分表路由和跨表查询功能
    """

    def __init__(self, model_class: Type[ModelType]):
        super().__init__(model_class)

    def _get_model_for_shard(self, shard_key: int) -> Type[ModelType]:
        """
        根据分片键获取对应的分表模型类

        Args:
            shard_key: 分片键（如 enterprise_id）

        Returns:
            分表模型类
        """
        # 从模型类获取分表配置
        shard_count = getattr(self.model_class, "_shard_count")

        shard_index = shard_key % shard_count
        suffix = f"{shard_index:02d}"
        class_name = f"{getattr(self.model_class, "__tablename_base__")}_{suffix}"

        # 从模块中获取动态生成的分表类
        import sys

        module = sys.modules[self.model_class.__module__]
        return getattr(module, class_name, self.model_class)

    async def query_all_shards(
        self,
        query_fn: Any,
        shard_keys: list[int] | None = None,
        concurrent: bool = True,
    ) -> list[ModelType]:
        """
        跨所有分表查询

        Args:
            query_fn: 查询函数，接收 (model_class, db) 参数
            shard_keys: 指定要查询的分片键列表，None 表示查询所有分表
            concurrent: 是否并发查询

        Returns:
            所有分表的查询结果合并列表
        """
        import asyncio

        shard_count = getattr(self.model_class, "_shard_count")

        # 确定要查询的分片
        if shard_keys is not None:
            shard_indices = set(key % shard_count for key in shard_keys)
        else:
            shard_indices = set(range(shard_count))

        async def query_shard(shard_index: int) -> list[ModelType]:
            """查询单个分表"""
            model_class = self._get_model_for_shard(shard_index)
            async with get_async_session() as db:
                return await query_fn(model_class, db)

        if concurrent:
            # 并发查询所有分表
            tasks = [query_shard(i) for i in shard_indices]
            results = await asyncio.gather(*tasks)
            # 合并结果
            all_items: list[ModelType] = []
            for items in results:
                all_items.extend(items)
            return all_items
        else:
            # 串行查询
            items_list: list[ModelType] = []
            for i in shard_indices:
                items = await query_shard(i)
                items_list.extend(items)
            return items_list
