"""管理后台系统设置服务。

当前只包含配置缓存刷新。刷新动作清空当前业务进程的配置表缓存，并用
force_refresh=True 重新加载一次，保证接口成功返回时本进程已拿到新配置。
"""

from dataclasses import dataclass

from app.core.singleton import singleton
from app.services.config_credit_product_price_service import (
    config_credit_product_price_service,
)
from app.services.config_credit_product_service import config_credit_product_service
from app.services.config_payment_channel_service import config_payment_channel_service
from app.services.config_public_service import config_public_service
from app.services.config_subscription_product_price_service import (
    config_subscription_product_price_service,
)
from app.services.config_subscription_product_service import (
    config_subscription_product_service,
)
from app.services.credit_checkout_config_service import credit_checkout_config_service
from app.services.payment_config_service import payment_config_service
from app.services.system_data_service import system_data_service
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class ConfigCacheRefreshResult:
    """配置缓存刷新结果。"""

    #: 已刷新服务名。
    refreshed_services: list[str]
    #: 刷新完成时间，毫秒时间戳。
    refreshed_at: int


@singleton
class AdminSystemSettingsService:
    """管理后台系统设置服务。"""

    async def refresh_config_caches(self) -> ConfigCacheRefreshResult:
        """清空并强制重载当前进程内配置读取缓存。"""
        self._clear_all_config_caches()

        await config_public_service.get_lists(force_refresh=True)
        await config_subscription_product_service.list_enabled(force_refresh=True)
        await config_subscription_product_price_service.list_enabled(force_refresh=True)
        await config_credit_product_service.list_enabled(force_refresh=True)
        await config_credit_product_price_service.list_enabled(force_refresh=True)
        await config_payment_channel_service.list_enabled(force_refresh=True)
        await payment_config_service.get_snapshot(force_refresh=True)
        await credit_checkout_config_service.get_snapshot(force_refresh=True)
        await system_data_service.get_lists(force_refresh=True)

        return ConfigCacheRefreshResult(
            refreshed_services=[
                "config_public_service",
                "config_subscription_product_service",
                "config_subscription_product_price_service",
                "config_credit_product_service",
                "config_credit_product_price_service",
                "config_payment_channel_service",
                "payment_config_service",
                "credit_checkout_config_service",
                "system_data_service",
            ],
            refreshed_at=timestamp_now(),
        )

    def _clear_all_config_caches(self) -> None:
        """清空配置相关 service 缓存；重复清理底层服务是幂等的。"""
        config_public_service.clear_cache()
        config_subscription_product_service.clear_cache()
        config_subscription_product_price_service.clear_cache()
        config_credit_product_service.clear_cache()
        config_credit_product_price_service.clear_cache()
        config_payment_channel_service.clear_cache()
        payment_config_service.clear_cache()
        credit_checkout_config_service.clear_cache()
        system_data_service.clear_cache()


admin_system_settings_service = AdminSystemSettingsService()
