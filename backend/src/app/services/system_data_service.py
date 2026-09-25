"""系统数据配置表读写服务。

流程：
1. 读取 system_data 全表并缓存 30 分钟。
2. 调用方按 data_key 读取 JSON 值。
3. 写入、更新、删除后立即清空本进程缓存。
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, TypeAlias, cast

from sqlalchemy import delete, select, update
from sqlalchemy.sql import Select

from app.core.database import get_async_session
from app.models.system_data_model import JsonValue, SystemDataModel
from app.utils.time import timestamp_now

JsonObject: TypeAlias = dict[str, JsonValue]
SystemDataOrder = Literal["data_key_asc", "data_key_desc", "updated_at_desc"]

SYSTEM_DATA_CACHE_TTL_MS = 30 * 60 * 1000

#: 客户端远端稀疏覆盖在 system_data 中的固定键；Admin 写入与客户端读取共用这一处定义，
#: 不允许在调用方另写字面量，否则读写两侧会静默漂移成两个键。
REMOTE_CONFIG_DATA_KEY = "remote_config"


@dataclass(frozen=True, slots=True)
class SystemDataRow:
    """系统数据配置缓存行。"""

    #: 系统数据键。
    data_key: str
    #: 系统数据 JSON 值。
    data_value: JsonValue


class SystemDataService:
    """系统数据配置表读写服务。"""

    def __init__(self) -> None:
        self._cache: dict[str, JsonValue] | None = None
        self._cache_expires_at = 0

    def clear_cache(self) -> None:
        """清空当前进程 system_data 读取缓存。"""
        self._cache = None
        self._cache_expires_at = 0

    async def get_lists(
        self,
        *,
        force_refresh: bool = False,
    ) -> dict[str, JsonValue]:
        """读取全部系统数据配置。"""
        if not force_refresh and self._is_cache_valid():
            assert self._cache is not None
            return dict(self._cache)

        rows = await self._load_rows()
        config_map = {row.data_key: row.data_value for row in rows}
        self._cache = config_map
        self._cache_expires_at = timestamp_now() + SYSTEM_DATA_CACHE_TTL_MS
        return dict(config_map)

    async def get(
        self,
        data_key: str,
        *,
        force_refresh: bool = False,
    ) -> JsonValue | None:
        """按 data_key 读取 JSON 配置值。"""
        config_map = await self.get_lists(force_refresh=force_refresh)
        return config_map.get(data_key.strip())

    async def set(self, data_key: str, data_value: JsonValue) -> None:
        """写入或覆盖单个系统数据配置，并清空读取缓存。"""
        normalized_key = data_key.strip()
        now = timestamp_now()
        async with get_async_session() as db:
            result = await db.execute(
                update(SystemDataModel)
                .where(SystemDataModel.data_key == normalized_key)
                .values(data_value=data_value, updated_at=now)
            )
            if int(getattr(result, "rowcount", 0) or 0) == 0:
                db.add(
                    SystemDataModel(  # type: ignore[call-arg]
                        data_key=normalized_key,
                        data_value=data_value,
                        created_at=now,
                        updated_at=now,
                    )
                )
            await db.commit()
        self.clear_cache()

    async def system_data_lists(
        self,
        *,
        data_keys: Sequence[str] | None = None,
        offset: int = 0,
        limit: int = 20,
        order_by: SystemDataOrder = "data_key_asc",
    ) -> list[SystemDataModel]:
        """按基础字段查询系统数据配置。"""
        stmt = self._apply_system_data_filters(
            select(SystemDataModel),
            data_keys=data_keys,
        )
        stmt = self._apply_system_data_order(stmt, order_by).offset(offset).limit(limit)
        async with get_async_session() as db:
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def system_data_info(self, data_key: str) -> SystemDataModel | None:
        """按 data_key 读取单条系统数据配置。"""
        rows = await self.system_data_lists(data_keys=[data_key], limit=1)
        return rows[0] if rows else None

    async def system_data_update(
        self,
        data_key: str,
        fields: dict[str, object],
    ) -> bool:
        """更新系统数据配置，None 字段按规范跳过。"""
        values = {key: value for key, value in fields.items() if value is not None}
        if not values:
            return False
        values["updated_at"] = timestamp_now()
        async with get_async_session() as db:
            result = await db.execute(
                update(SystemDataModel)
                .where(SystemDataModel.data_key == data_key)
                .values(**values)
            )
            await db.commit()
        self.clear_cache()
        return int(getattr(result, "rowcount", 0) or 0) == 1

    async def system_data_del(self, data_keys: Sequence[str]) -> int:
        """批量删除系统数据配置。"""
        if not data_keys:
            return 0
        async with get_async_session() as db:
            result = await db.execute(
                delete(SystemDataModel).where(SystemDataModel.data_key.in_(data_keys))
            )
            await db.commit()
        self.clear_cache()
        return int(getattr(result, "rowcount", 0) or 0)

    async def _load_rows(self) -> list[SystemDataRow]:
        """从数据库读取全部系统数据配置。"""
        rows = await self.system_data_lists(limit=10_000)
        return [
            SystemDataRow(
                data_key=row.data_key,
                data_value=_normalize_json_value(row.data_value),
            )
            for row in rows
        ]

    def _apply_system_data_filters(
        self,
        stmt: Select[tuple[SystemDataModel]],
        *,
        data_keys: Sequence[str] | None,
    ) -> Select[tuple[SystemDataModel]]:
        """应用系统数据基础过滤条件。"""
        if data_keys is not None:
            stmt = stmt.where(SystemDataModel.data_key.in_(data_keys))
        return stmt

    def _apply_system_data_order(
        self,
        stmt: Select[tuple[SystemDataModel]],
        order_by: SystemDataOrder,
    ) -> Select[tuple[SystemDataModel]]:
        """应用系统数据排序。"""
        if order_by == "data_key_desc":
            return stmt.order_by(SystemDataModel.data_key.desc())
        if order_by == "updated_at_desc":
            return stmt.order_by(SystemDataModel.updated_at.desc())
        return stmt.order_by(SystemDataModel.data_key.asc())

    def _is_cache_valid(self) -> bool:
        """判断 system_data 读取缓存是否仍有效。"""
        return self._cache is not None and self._cache_expires_at > timestamp_now()


def _normalize_json_value(value: object) -> JsonValue:
    """把数据库 JSON 结果压成项目认可的 JSON 类型。"""
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list):
        return [_normalize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): _normalize_json_value(item)
            for key, item in cast(dict[object, object], value).items()
        }
    return str(value)


system_data_service = SystemDataService()
