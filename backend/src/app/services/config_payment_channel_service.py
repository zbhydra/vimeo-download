"""支付渠道配置表服务。"""

from dataclasses import dataclass

from sqlalchemy import select

from app.constants.config_cache import CONFIG_CACHE_TTL_MS
from app.core.database import get_async_session
from app.models.config_payment_channel_model import ConfigPaymentChannelModel
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class ConfigPaymentChannelRow:
    """支付渠道配置行。"""

    channel_code: str
    channel_name: str
    config_json: str | None


class ConfigPaymentChannelService:
    """支付渠道配置表读取服务。"""

    def __init__(self) -> None:
        self._enabled_cache: tuple[ConfigPaymentChannelRow, ...] | None = None
        self._enabled_cache_expires_at = 0

    def clear_cache(self) -> None:
        """清空支付渠道配置缓存。"""

        self._enabled_cache = None
        self._enabled_cache_expires_at = 0

    async def list_enabled(
        self,
        *,
        force_refresh: bool = False,
    ) -> list[ConfigPaymentChannelRow]:
        """读取启用的支付渠道配置。"""

        if not force_refresh and self._is_cache_valid():
            assert self._enabled_cache is not None
            return list(self._enabled_cache)

        rows = await self._load_enabled_rows()
        self._enabled_cache = tuple(rows)
        self._enabled_cache_expires_at = timestamp_now() + CONFIG_CACHE_TTL_MS
        return rows

    async def get_by_channel_code(
        self,
        channel_code: str,
    ) -> ConfigPaymentChannelRow | None:
        """按渠道编码读取配置，包括已停止新销售的渠道。

        历史订单仍可能需要退款、查询或取消长期协议，不能因 `enabled=false`
        丢失渠道凭据。该方法不缓存，避免运维操作读取过期密钥。
        """

        normalized_code = channel_code.strip()
        async with get_async_session() as db:
            result = await db.execute(
                select(ConfigPaymentChannelModel)
                .where(ConfigPaymentChannelModel.channel_code == normalized_code)
                .limit(1)
            )
            row = result.scalar_one_or_none()
        if row is None:
            return None
        return ConfigPaymentChannelRow(
            channel_code=row.channel_code,
            channel_name=row.channel_name,
            config_json=row.config_json,
        )

    async def _load_enabled_rows(self) -> list[ConfigPaymentChannelRow]:
        """从数据库读取启用的支付渠道配置。"""

        async with get_async_session() as db:
            result = await db.execute(
                select(ConfigPaymentChannelModel)
                .where(ConfigPaymentChannelModel.enabled.is_(True))
                .order_by(ConfigPaymentChannelModel.id.asc())
            )
            rows = list(result.scalars().all())

        return [
            ConfigPaymentChannelRow(
                channel_code=row.channel_code,
                channel_name=row.channel_name,
                config_json=row.config_json,
            )
            for row in rows
        ]

    def _is_cache_valid(self) -> bool:
        """判断启用配置缓存是否仍有效。"""

        return (
            self._enabled_cache is not None
            and self._enabled_cache_expires_at > timestamp_now()
        )


config_payment_channel_service = ConfigPaymentChannelService()
