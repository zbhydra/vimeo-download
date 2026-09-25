"""客户端订阅状态响应组装服务。"""

from app.constants.quota import QuotaTypeEnum
from app.constants.subscription import SubscriptionProductMetadata
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.subscription_model import UserSubscriptionModel
from app.services.payment_config_service import SubscriptionProductConfig
from app.services.quota_service import quota_service
from app.services.subscription_service import subscription_service
from app.utils.logger import logger
from app.utils.time import get_today_date, timestamp_now

_SUBSCRIPTION_STATUS_UNAVAILABLE = "unavailable"


def _daily_quota_status(*, used: int, limit: int) -> dict[str, int]:
    """构建结构化每日额度响应。"""
    if limit == -1:
        return {"use": 0, "remaining": -1, "limit": -1}
    return {"use": used, "remaining": max(0, limit - used), "limit": limit}


class SubscriptionStatusService:
    """复用同一套订阅配置和 quota 读数构建客户端状态。"""

    async def build_status_data(
        self,
        *,
        user_id: int,
        quota_u_id: str,
        device_id: str | None = None,
    ) -> dict[str, object]:
        """构建订阅状态 data，供 /status 与 /auth/me 复用同一额度契约。

        Args:
            user_id: 账号 ID，0 表示匿名。
            quota_u_id: Redis 额度作用域，取值与下载链路一致。
            device_id: 已校验的设备标识，与下载链路共用同一份首日判定。
        """

        # 首日额度独立于订阅配置，配置异常也不能抹掉已确认的不限次权益。
        is_first_day = await quota_service.is_first_day(quota_u_id, device_id=device_id)
        try:
            (
                subscription,
                config,
                metadata,
            ) = await self._load_subscription_metadata(user_id)
        except AppCommonException as exc:
            if exc.code != CommonCode.PAYMENT_GATEWAY_ERROR:
                raise
            logger.error(
                "subscription_status_config_unavailable: "
                f"user_id={user_id}, quota_u_id={quota_u_id}, "
                f"code={exc.code}, ext_msg={exc.ext_msg}",
                exc_info=True,
            )
            return self._unavailable_status_data(
                _daily_quota_status(used=0, limit=-1 if is_first_day else 0)
            )

        # 首日与下载链路共用同一判定：命中即按不限次展示，与 quota/check 的实际
        # 放行口径一致，否则插件会在不限次的当天显示剩余 0 次。
        if is_first_day:
            extension_download = _daily_quota_status(used=0, limit=-1)
        else:
            extension_download_used = await quota_service.get(
                quota_u_id,
                QuotaTypeEnum.EXTENSION_DOWNLOAD,
            )
            extension_download = _daily_quota_status(
                used=extension_download_used,
                limit=metadata.daily_limit,
            )

        return {
            "period": (
                subscription.period
                or ("month" if subscription.expires_at is not None else "free")
            ),
            "display_name": config.name,
            "expires_at": subscription.expires_at,
            "daily_limit": extension_download["limit"],
            "used": extension_download["use"],
            "remaining": extension_download["remaining"],
            "extension_download": extension_download,
            "reset_date": get_today_date(),
            "auto_renew": self._is_auto_renew(subscription),
            "cancel_at_period_end": self._is_cancel_at_period_end(subscription),
            "cancel_available": self._is_cancel_available(subscription),
            "cancelled_at": subscription.cancelled_at,
            "payment_method": subscription.payment_method,
            "status": "active",
        }

    async def _load_subscription_metadata(
        self,
        user_id: int,
    ) -> tuple[
        UserSubscriptionModel,
        SubscriptionProductConfig,
        SubscriptionProductMetadata,
    ]:
        """读取用户订阅记录、商品配置和 metadata。"""

        subscription, config = await subscription_service.get_user_subscription_config(
            user_id
        )
        metadata = SubscriptionProductMetadata.from_metadata(
            config.metadata,
            product_id=config.product_id,
        )
        return subscription, config, metadata

    def _unavailable_status_data(self, quota: dict[str, int]) -> dict[str, object]:
        """订阅配置异常时返回可渲染状态，不阻断账户和 Credits 业务。"""

        return {
            "period": _SUBSCRIPTION_STATUS_UNAVAILABLE,
            "display_name": "Subscription unavailable",
            "expires_at": None,
            "daily_limit": quota["limit"],
            "used": quota["use"],
            "remaining": quota["remaining"],
            "extension_download": quota,
            "reset_date": get_today_date(),
            "auto_renew": False,
            "cancel_at_period_end": False,
            "cancel_available": False,
            "cancelled_at": None,
            "payment_method": None,
            "status": _SUBSCRIPTION_STATUS_UNAVAILABLE,
        }

    def _is_auto_renew(self, subscription: UserSubscriptionModel) -> bool:
        """按有效权益、实例续费快照与取消事实计算自动续费状态。"""

        return subscription_service.is_auto_renew(subscription)

    def _is_cancel_at_period_end(self, subscription: UserSubscriptionModel) -> bool:
        """判断自动续费协议是否已确认停止后续扣款。"""

        return bool(
            subscription.expires_at
            and subscription.expires_at > timestamp_now()
            and subscription.auto_renew
            and subscription.cancelled_at is not None
        )

    def _is_cancel_available(self, subscription: UserSubscriptionModel) -> bool:
        """判断当前实例是否具备站内取消所需渠道引用。"""

        return bool(
            self._is_auto_renew(subscription)
            and subscription.payment_method
            and subscription.channel_subscription_id
        )


subscription_status_service = SubscriptionStatusService()
