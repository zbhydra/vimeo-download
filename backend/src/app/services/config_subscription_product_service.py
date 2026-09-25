"""订阅商品配置表服务。"""

from dataclasses import dataclass

from sqlalchemy import select

from app.core.database import get_async_session
from app.constants.config_cache import CONFIG_CACHE_TTL_MS
from app.models.config_subscription_product_model import ConfigSubscriptionProductModel
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class ConfigSubscriptionProductRow:
    """订阅商品配置行。"""

    product_id: str
    name: str
    period: str
    auto_renew: bool
    display_currency: str
    display_amount: int
    sort_order: int
    metadata_json: str | None


class ConfigSubscriptionProductService:
    """订阅商品配置表读取服务。"""

    def __init__(self) -> None:
        self._enabled_cache: tuple[ConfigSubscriptionProductRow, ...] | None = None
        self._enabled_cache_expires_at = 0

    def clear_cache(self) -> None:
        """清空订阅商品配置缓存。"""

        self._enabled_cache = None
        self._enabled_cache_expires_at = 0

    async def list_enabled(
        self,
        *,
        force_refresh: bool = False,
    ) -> list[ConfigSubscriptionProductRow]:
        """按展示顺序读取启用的订阅商品配置。"""

        if not force_refresh and self._is_cache_valid():
            assert self._enabled_cache is not None
            return list(self._enabled_cache)

        rows = await self._load_enabled_rows()
        self._enabled_cache = tuple(rows)
        self._enabled_cache_expires_at = timestamp_now() + CONFIG_CACHE_TTL_MS
        return rows

    async def _load_enabled_rows(self) -> list[ConfigSubscriptionProductRow]:
        """从数据库读取启用的订阅商品配置。"""

        async with get_async_session() as db:
            result = await db.execute(
                select(ConfigSubscriptionProductModel)
                .where(ConfigSubscriptionProductModel.enabled.is_(True))
                .order_by(
                    ConfigSubscriptionProductModel.sort_order.asc(),
                    ConfigSubscriptionProductModel.id.asc(),
                )
            )
            rows = list(result.scalars().all())

        return [
            ConfigSubscriptionProductRow(
                product_id=row.product_id,
                name=row.name,
                period=row.period,
                auto_renew=row.auto_renew,
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


config_subscription_product_service = ConfigSubscriptionProductService()
