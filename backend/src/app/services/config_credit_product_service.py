"""Credits 积分包商品配置表服务。"""

from dataclasses import dataclass

from sqlalchemy import select

from app.constants.config_cache import CONFIG_CACHE_TTL_MS
from app.core.database import get_async_session
from app.core.singleton import singleton
from app.models.config_credit_product_model import ConfigCreditProductModel
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class ConfigCreditProductRow:
    """Credits 积分包商品配置行。"""

    product_id: str
    name: str
    credits_amount: int
    display_currency: str
    display_amount: int
    sort_order: int
    metadata_json: str | None


@singleton
class ConfigCreditProductService:
    """Credits 积分包商品配置表读取服务。"""

    def __init__(self) -> None:
        self._enabled_cache: tuple[ConfigCreditProductRow, ...] | None = None
        self._enabled_cache_expires_at = 0

    def clear_cache(self) -> None:
        """清空 Credits 积分包商品配置缓存。"""

        self._enabled_cache = None
        self._enabled_cache_expires_at = 0

    async def list_enabled(
        self,
        *,
        force_refresh: bool = False,
    ) -> list[ConfigCreditProductRow]:
        """按展示顺序读取启用的 Credits 积分包商品配置。"""

        if not force_refresh and self._is_cache_valid():
            assert self._enabled_cache is not None
            return list(self._enabled_cache)

        rows = await self._load_enabled_rows()
        self._enabled_cache = tuple(rows)
        self._enabled_cache_expires_at = timestamp_now() + CONFIG_CACHE_TTL_MS
        return rows

    async def _load_enabled_rows(self) -> list[ConfigCreditProductRow]:
        """从数据库读取启用的 Credits 积分包商品配置。"""

        async with get_async_session() as db:
            result = await db.execute(
                select(ConfigCreditProductModel)
                .where(ConfigCreditProductModel.enabled.is_(True))
                .order_by(
                    ConfigCreditProductModel.sort_order.asc(),
                    ConfigCreditProductModel.id.asc(),
                )
            )
            rows = list(result.scalars().all())

        return [
            ConfigCreditProductRow(
                product_id=row.product_id,
                name=row.name,
                credits_amount=row.credits_amount,
                display_currency=row.display_currency,
                display_amount=row.display_amount,
                sort_order=row.sort_order,
                metadata_json=row.metadata_json,
            )
            for row in rows
        ]

    def _is_cache_valid(self) -> bool:
        """判断启用配置缓存是否仍有效。"""

        return (
            self._enabled_cache is not None
            and self._enabled_cache_expires_at > timestamp_now()
        )


config_credit_product_service = ConfigCreditProductService()
