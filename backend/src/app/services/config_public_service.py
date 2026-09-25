"""公共配置表读取服务。

流程：
1. 一次性读取 config_public 全表。
2. 把 g_value 解析成 JSON 值并缓存到内存。
3. 对外提供 get_lists() 和 get(key) 两个读取入口。
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, TypeAlias

from sqlalchemy import select

from app.constants.config_cache import CONFIG_CACHE_TTL_MS
from app.core.database import get_async_session
from app.core.singleton import singleton
from app.models.config_public_model import ConfigPublicModel
from app.utils.time import timestamp_now

ConfigPublicValue: TypeAlias = (
    dict[str, Any] | list[Any] | str | int | float | bool | None
)


@dataclass(frozen=True, slots=True)
class ConfigPublicRow:
    """公共配置行。"""

    c_key: str
    g_value: str


@singleton
class ConfigPublicService:
    """公共配置表读取服务。"""

    def __init__(self) -> None:
        self._cache: dict[str, ConfigPublicValue] | None = None
        self._cache_expires_at = 0

    def clear_cache(self) -> None:
        """清空公共配置缓存。"""

        self._cache = None
        self._cache_expires_at = 0

    async def get_lists(
        self,
        *,
        force_refresh: bool = False,
    ) -> dict[str, ConfigPublicValue]:
        """读取全部公共配置。"""

        if not force_refresh and self._is_cache_valid():
            assert self._cache is not None
            return dict(self._cache)

        rows = await self._load_rows()
        config_map = {row.c_key: self._parse_value(row.g_value) for row in rows}
        self._cache = config_map
        self._cache_expires_at = timestamp_now() + CONFIG_CACHE_TTL_MS
        return dict(config_map)

    async def get(
        self,
        c_key: str,
        *,
        force_refresh: bool = False,
    ) -> ConfigPublicValue | None:
        """读取单个公共配置。"""

        config_map = await self.get_lists(force_refresh=force_refresh)
        return config_map.get(c_key.strip())

    async def _load_rows(self) -> list[ConfigPublicRow]:
        """从数据库读取全部公共配置。"""

        async with get_async_session() as db:
            result = await db.execute(
                select(ConfigPublicModel).order_by(ConfigPublicModel.c_key.asc())
            )
            rows = list(result.scalars().all())

        return [
            ConfigPublicRow(
                c_key=row.c_key,
                g_value=row.g_value,
            )
            for row in rows
        ]

    def _parse_value(self, raw_value: str) -> ConfigPublicValue:
        """把数据库中的配置值解析成 Python 值。

        优先按 JSON 解析，兼容数字、布尔、对象、数组。
        如果库里存的是非 JSON 普通文本，则直接返回原始字符串。
        """

        try:
            return json.loads(raw_value, strict=False)
        except json.JSONDecodeError:
            return raw_value

    def _is_cache_valid(self) -> bool:
        """判断公共配置缓存是否仍有效。"""

        return self._cache is not None and self._cache_expires_at > timestamp_now()


config_public_service = ConfigPublicService()
