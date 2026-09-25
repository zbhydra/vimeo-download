"""订阅商品渠道价格配置表服务。"""

from dataclasses import dataclass

from sqlalchemy import select

from app.constants.config_cache import CONFIG_CACHE_TTL_MS
from app.core.database import get_async_session
from app.models.config_subscription_product_price_model import (
    ConfigSubscriptionProductPriceModel,
)
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class ConfigSubscriptionProductPriceRow:
    """订阅商品渠道价格配置行。"""

    id: int
    product_id: str
    channel_code: str
    auto_renew_supported: bool
    currency: str
    amount: int
    provider_sku: str | None


class ConfigSubscriptionProductPriceService:
    """订阅商品渠道价格配置表读取服务。"""

    def __init__(self) -> None:
        self._enabled_cache: tuple[ConfigSubscriptionProductPriceRow, ...] | None = None
        self._enabled_cache_expires_at = 0

    def clear_cache(self) -> None:
        """清空订阅商品渠道价格配置缓存。"""

        self._enabled_cache = None
        self._enabled_cache_expires_at = 0

    async def list_enabled(
        self,
        *,
        force_refresh: bool = False,
    ) -> list[ConfigSubscriptionProductPriceRow]:
        """读取启用的订阅商品渠道价格配置。"""

        if not force_refresh and self._is_cache_valid():
            assert self._enabled_cache is not None
            return list(self._enabled_cache)

        rows = await self._load_enabled_rows()
        self._enabled_cache = tuple(rows)
        self._enabled_cache_expires_at = timestamp_now() + CONFIG_CACHE_TTL_MS
        return rows

    async def _load_enabled_rows(self) -> list[ConfigSubscriptionProductPriceRow]:
        """从数据库读取启用的订阅商品渠道价格配置。"""

        async with get_async_session() as db:
            result = await db.execute(
                select(ConfigSubscriptionProductPriceModel)
                .where(ConfigSubscriptionProductPriceModel.enabled.is_(True))
                .order_by(ConfigSubscriptionProductPriceModel.id.asc())
            )
            rows = list(result.scalars().all())

        return [
            ConfigSubscriptionProductPriceRow(
                id=row.id,
                product_id=row.product_id,
                channel_code=row.channel_code,
                auto_renew_supported=row.auto_renew_supported,
                currency=row.currency,
                amount=row.amount,
                provider_sku=row.provider_sku,
            )
            for row in rows
        ]

    def _is_cache_valid(self) -> bool:
        """判断启用配置缓存是否仍有效。"""

        return (
            self._enabled_cache is not None
            and self._enabled_cache_expires_at > timestamp_now()
        )


config_subscription_product_price_service = ConfigSubscriptionProductPriceService()
