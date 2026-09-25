"""Credits 积分包渠道价格配置表服务。"""

from dataclasses import dataclass

from sqlalchemy import select

from app.constants.config_cache import CONFIG_CACHE_TTL_MS
from app.core.database import get_async_session
from app.core.singleton import singleton
from app.models.config_credit_product_price_model import ConfigCreditProductPriceModel
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class ConfigCreditProductPriceRow:
    """Credits 积分包渠道价格配置行。"""

    product_id: str
    channel_code: str
    currency: str
    amount: int
    provider_sku: str | None


@singleton
class ConfigCreditProductPriceService:
    """Credits 积分包渠道价格配置表读取服务。"""

    def __init__(self) -> None:
        self._enabled_cache: tuple[ConfigCreditProductPriceRow, ...] | None = None
        self._enabled_cache_expires_at = 0

    def clear_cache(self) -> None:
        """清空 Credits 积分包渠道价格配置缓存。"""

        self._enabled_cache = None
        self._enabled_cache_expires_at = 0

    async def list_enabled(
        self,
        *,
        force_refresh: bool = False,
    ) -> list[ConfigCreditProductPriceRow]:
        """读取启用的 Credits 积分包渠道价格配置。"""

        if not force_refresh and self._is_cache_valid():
            assert self._enabled_cache is not None
            return list(self._enabled_cache)

        rows = await self._load_enabled_rows()
        self._enabled_cache = tuple(rows)
        self._enabled_cache_expires_at = timestamp_now() + CONFIG_CACHE_TTL_MS
        return rows

    async def _load_enabled_rows(self) -> list[ConfigCreditProductPriceRow]:
        """从数据库读取启用的 Credits 积分包渠道价格配置。"""

        async with get_async_session() as db:
            result = await db.execute(
                select(ConfigCreditProductPriceModel)
                .where(ConfigCreditProductPriceModel.enabled.is_(True))
                .order_by(ConfigCreditProductPriceModel.id.asc())
            )
            rows = list(result.scalars().all())

        return [
            ConfigCreditProductPriceRow(
                product_id=row.product_id,
                channel_code=row.channel_code,
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


config_credit_product_price_service = ConfigCreditProductPriceService()
