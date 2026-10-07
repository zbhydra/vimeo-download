"""订阅管理服务"""

import json
from datetime import timedelta
from typing import cast

from sqlalchemy import case
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.constants.order import (
    OrderCheckProductParam,
    OrderCreateParam,
    ProductClass,
)
from app.constants.subscription import (
    FREE_SUBSCRIPTION_PRODUCT_ID,
    SubscriptionPeriodEnum,
    SubscriptionProductMetadata,
    UNLIMITED_SUBSCRIPTION_PRODUCT_ID,
)
from app.core.config import settings
from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.order_model import OrderModel
from app.models.subscription_model import UserSubscriptionModel
from app.provider.payment.payment_base import PaymentProviderError
from app.services.base_service import BaseService
from app.services.payment_config_service import (
    SubscriptionCheckoutChannelConfig,
    SubscriptionProductConfig,
    payment_config_service,
)
from app.services.payment_service import payment_service
from app.utils.money import normalize_currency
from app.utils.time import add_natural_months, timestamp_now

_DAY_MS = int(timedelta(days=1).total_seconds() * 1000)
_PERIOD_MONTHS = {
    SubscriptionPeriodEnum.MONTH: 1,
    SubscriptionPeriodEnum.QUARTER: 3,
    SubscriptionPeriodEnum.YEAR: 12,
    # 终生按 200 年自然月一次性履约，复用统一过期判断。
    SubscriptionPeriodEnum.LIFETIME: 2400,
}


class SubscriptionService(BaseService[UserSubscriptionModel]):
    """订阅管理服务"""

    primary_key_field = "user_id"

    def __init__(self):
        super().__init__(UserSubscriptionModel)

    async def check_product(self, param: OrderCheckProductParam) -> OrderCreateParam:
        """校验订阅商品下单参数，并生成订单快照参数。"""
        if param.user_id > 0:
            subscription = await self.get_user_subscription(param.user_id)
            if subscription.expires_at is not None:
                raise AppCommonException(
                    CommonCode.SUBSCRIPTION_ACTIVE_EXISTS,
                    ext_msg=(
                        "subscription_check_product: user already has active "
                        "subscription, reject duplicate subscription checkout: "
                        f"user_id={param.user_id}, product_id={param.product_id}, "
                        f"expires_at={subscription.expires_at}"
                    ),
                    data={
                        "reason": "active_subscription_exists",
                        "expires_at": subscription.expires_at,
                    },
                )

        checkout_config = await self.validate_client_price(
            product_id=param.product_id,
            channel_code=param.payment_method,
            currency=param.currency,
            amount=param.amount,
            auto_renew=param.auto_renew,
            period=param.period,
        )
        SubscriptionProductMetadata.from_metadata(
            checkout_config.product.metadata,
            product_id=checkout_config.product.product_id,
        )
        return OrderCreateParam(
            user_id=param.user_id,
            product_class=ProductClass.SUBSCRIPTION.value,
            product_id=checkout_config.product.product_id,
            product_name=checkout_config.product.name,
            amount=checkout_config.price.amount,
            payment_method=checkout_config.channel.channel_code,
            currency=checkout_config.price.currency,
            client_ip=param.client_ip,
            extra_metadata=self._order_metadata_json(checkout_config),
            language=param.language,
            auto_renew=checkout_config.product.auto_renew,
            provider_sku=checkout_config.price.provider_sku,
        )

    async def validate_client_price(
        self,
        *,
        product_id: str,
        channel_code: str,
        currency: str,
        amount: int,
        auto_renew: bool,
        period: str,
    ) -> SubscriptionCheckoutChannelConfig:
        """校验客户端提交的订阅价格与当前订阅配置一致。"""

        checkout_config = await payment_config_service.get_subscription_checkout_config(
            product_id=product_id,
            channel_code=channel_code,
            auto_renew=auto_renew,
            period=period,
        )
        price = checkout_config.price
        normalized_currency = normalize_currency(currency)

        if price.currency != normalized_currency or price.amount != amount:
            raise AppCommonException(
                CommonCode.PAYMENT_PRICE_UPDATED,
                ext_msg=(
                    "subscription: client price stale: "
                    f"product_id={price.product_id}, channel_code={price.channel_code}, "
                    f"config_currency={price.currency}, client_currency={normalized_currency}, "
                    f"config_amount={price.amount}, client_amount={amount}"
                ),
                data={
                    "product_id": price.product_id,
                    "payment_method": price.channel_code,
                    "currency": price.currency,
                    "amount": price.amount,
                },
            )

        return checkout_config

    async def get_user_subscription(self, user_id: int) -> UserSubscriptionModel:
        """
        获取用户当前付费订阅权益。

        user_subscriptions 只保存有效或曾有效的 Unlimited 权益；Free 不落库。
        """
        subscription = await self.get_by_id(user_id)
        if (
            subscription
            and subscription.expires_at is not None
            and subscription.expires_at > timestamp_now()
        ):
            return subscription

        return UserSubscriptionModel(  # type: ignore[call-arg]
            user_id=user_id,
            expires_at=None,
        )

    def is_auto_renew(self, subscription: UserSubscriptionModel) -> bool:
        """按有效权益、续费快照与取消事实计算自动续费状态。"""

        return bool(
            subscription.expires_at
            and subscription.expires_at > timestamp_now()
            and subscription.auto_renew
            and subscription.cancelled_at is None
        )

    async def create_management_url(self, user_id: int) -> str | None:
        """为当前有效自动续费订阅创建渠道管理入口。"""

        subscription = await self.get_user_subscription(user_id)
        if not self.is_auto_renew(subscription) or not subscription.payment_method:
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                ext_msg=(
                    "subscription_create_management_url: active auto-renew "
                    f"subscription missing: user_id={user_id}"
                ),
            )
        provider = await payment_service.get_provider_for_existing_payment(
            subscription.payment_method
        )
        try:
            return await provider.create_subscription_management_url(
                channel_uid=subscription.channel_uid,
                return_url=f"{settings.app.public_website_base_url.rstrip('/')}/ext-pricing/",
            )
        except PaymentProviderError as exc:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=str(exc),
            ) from exc

    async def update_user_subscription(
        self,
        user_id: int,
        expires_at: int,
    ) -> bool:
        """
        更新用户 Unlimited 订阅到期时间。

        Args:
            user_id: 用户 ID
            expires_at: 过期时间（毫秒时间戳）
        """
        existing = await self.get_by_id(user_id)

        if existing:
            return await self.update(
                user_id,
                expires_at=expires_at,
                updated_at=timestamp_now(),
            )

        subscription = UserSubscriptionModel(  # type: ignore[call-arg]
            user_id=user_id,
            expires_at=expires_at,
        )
        await self.create(subscription)
        return True

    async def get_user_subscription_config(
        self, user_id: int
    ) -> tuple[UserSubscriptionModel, SubscriptionProductConfig]:
        """
        获取用户订阅配置

        Returns:
            (订阅记录, 订阅商品配置)
        """
        if user_id is None or user_id == 0:
            subscription = UserSubscriptionModel(  # type: ignore[call-arg]
                user_id=0,
                expires_at=None,
            )
            return subscription, await self._get_subscription_product_config(
                FREE_SUBSCRIPTION_PRODUCT_ID
            )

        subscription = await self.get_user_subscription(user_id)
        product_id = subscription.product_id or UNLIMITED_SUBSCRIPTION_PRODUCT_ID
        if subscription.expires_at is None:
            product_id = FREE_SUBSCRIPTION_PRODUCT_ID
        return subscription, await self._get_subscription_product_config(product_id)

    async def _get_subscription_product_config(
        self,
        product_id: str,
    ) -> SubscriptionProductConfig:
        """按订阅商品 ID 读取启用配置，不加载支付渠道价格。"""
        products = await payment_config_service.list_subscription_products()
        product = next(
            (item for item in products if item.product_id == product_id),
            None,
        )
        if product is None:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "subscription: enabled subscription product missing, "
                    f"product_id={product_id}"
                ),
            )
        return product

    async def fulfill_paid_order(self, db: AsyncSession, order: OrderModel) -> None:
        """在订单 service 事务内完成订阅发货。

        Args:
            db: 订单 service 管理的事务 session。
            order: 已支付且 callback_status=PENDING 的订阅订单。
        """
        snapshot = self._order_product_snapshot(order)
        auto_renew = snapshot.get("auto_renew")
        if not isinstance(auto_renew, bool):
            raise ValueError(
                "subscription_fulfillment: invalid auto_renew snapshot: "
                f"order_no={order.order_no}, auto_renew={auto_renew!r}"
            )
        if auto_renew:
            await self._fulfill_auto_renew_in_session(db, order, snapshot)
            return
        await self._fulfill_one_time_in_session(db, order, snapshot)

    async def extend_subscription_days(
        self,
        *,
        user_id: int,
        duration_days: int,
    ) -> None:
        """在独立事务内按天延长用户 Unlimited 权益。"""

        async with get_async_session() as db:
            await self.extend_subscription_days_in_session(
                db,
                user_id=user_id,
                duration_days=duration_days,
            )
            await db.commit()

    async def extend_subscription_days_in_session(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        duration_days: int,
    ) -> None:
        """在调用方事务内用 MySQL 原子 upsert 按天延长权益。

        活动订阅从数据库当前到期时间继续累加；无记录、空到期时间或已过期
        均从本次执行时间开始计算，避免并发支付与赠送发生读改写覆盖。
        """

        now_ms = timestamp_now()
        insert_expires_at = now_ms + self._duration_ms(duration_days)
        update_expires_at = self._renew_subscription_expires_at(
            now_ms,
            duration_days,
        )
        expires_at_col = cast(ColumnElement[int], UserSubscriptionModel.expires_at)
        was_active = expires_at_col > now_ms
        stmt = mysql_insert(UserSubscriptionModel).values(
            user_id=user_id,
            product_id=UNLIMITED_SUBSCRIPTION_PRODUCT_ID,
            expires_at=insert_expires_at,
            created_at=now_ms,
            updated_at=now_ms,
        )
        stmt = stmt.on_duplicate_key_update(
            # 有效权益保留原商品身份（终生/年卡等独立商品不降级为默认月卡）；
            # 已过期则回到默认 Unlimited 商品重新起算。
            product_id=case(
                (was_active, UserSubscriptionModel.product_id),
                else_=UNLIMITED_SUBSCRIPTION_PRODUCT_ID,
            ),
            product_price_id=case(
                (was_active, UserSubscriptionModel.product_price_id), else_=None
            ),
            auto_renew=case((was_active, UserSubscriptionModel.auto_renew), else_=None),
            period=case((was_active, UserSubscriptionModel.period), else_=None),
            payment_method=case(
                (was_active, UserSubscriptionModel.payment_method), else_=None
            ),
            original_order_no=case(
                (was_active, UserSubscriptionModel.original_order_no), else_=None
            ),
            channel_subscription_id=case(
                (was_active, UserSubscriptionModel.channel_subscription_id), else_=None
            ),
            channel_uid=case(
                (was_active, UserSubscriptionModel.channel_uid), else_=None
            ),
            start_at=case((was_active, UserSubscriptionModel.start_at), else_=None),
            cancelled_at=case(
                (was_active, UserSubscriptionModel.cancelled_at), else_=None
            ),
            expires_at=update_expires_at,
            updated_at=now_ms,
        )
        await db.execute(stmt)

    def _parse_paid_period(self, period_value: object) -> SubscriptionPeriodEnum:
        """把订单快照 period 解析成订阅周期。"""
        try:
            period = SubscriptionPeriodEnum(period_value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Unsupported subscription period for paid order: "
                f"period={period_value}"
            ) from exc

        if period == SubscriptionPeriodEnum.NONE:
            raise ValueError(
                f"Unconfigured subscription period cannot be fulfilled: "
                f"period={period_value}"
            )
        return period

    def _renew_subscription_expires_at(
        self,
        now_ms: int,
        duration_days: int,
    ) -> object:
        """计算已有订阅记录续费后的到期时间表达式。"""
        duration_ms = self._duration_ms(duration_days)
        expires_at_col = cast(ColumnElement[int], UserSubscriptionModel.expires_at)
        return case(
            (
                expires_at_col > now_ms,
                expires_at_col + duration_ms,
            ),
            else_=now_ms + duration_ms,
        )

    def _duration_ms(self, duration_days: int) -> int:
        """把订阅商品配置天数转换为毫秒。"""
        if duration_days <= 0:
            raise ValueError(
                "subscription_fulfillment: duration_days must be positive: "
                f"duration_days={duration_days}"
            )
        return duration_days * _DAY_MS

    def _order_metadata_json(
        self,
        checkout_config: SubscriptionCheckoutChannelConfig,
    ) -> str:
        """生成订阅订单购买选项快照。"""

        return json.dumps(
            {
                "product_snapshot": {
                    "product_price_id": checkout_config.price.id,
                    "auto_renew": checkout_config.product.auto_renew,
                    "period": checkout_config.product.period,
                    "currency": checkout_config.price.currency,
                    "amount": checkout_config.price.amount,
                    "provider_sku": checkout_config.price.provider_sku,
                }
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    def _order_product_snapshot(self, order: OrderModel) -> dict[str, object]:
        """读取订阅订单购买选项快照。"""
        metadata = self._load_order_metadata(order)
        snapshot = metadata.get("product_snapshot")
        if not isinstance(snapshot, dict):
            raise ValueError(
                "subscription_fulfillment: product_snapshot missing: "
                f"order_no={order.order_no}, user_id={order.user_id}"
            )
        return cast(dict[str, object], snapshot)

    async def _fulfill_one_time_in_session(
        self,
        db: AsyncSession,
        order: OrderModel,
        snapshot: dict[str, object],
    ) -> None:
        """按购买选项自然月周期续期，并显式覆盖实例事实。

        用户已有未到期的终生权益时，后到账的有限周期订单只走正常订单完成
        流程，不再覆盖订阅记录——避免终生身份、周期与到期时间被降级覆盖。
        不为此新增锁或第二套流程，也不处理原合同未保证的付款并发。
        """

        period = self._parse_paid_period(snapshot.get("period"))
        current = await db.get(UserSubscriptionModel, order.user_id)
        if (
            current is not None
            and current.period == SubscriptionPeriodEnum.LIFETIME.value
            and current.expires_at is not None
            and current.expires_at > timestamp_now()
        ):
            return

        months = _PERIOD_MONTHS[period]
        product_price_id = self._snapshot_product_price_id(order, snapshot)
        now_ms = timestamp_now()
        base_expires_at = (
            current.expires_at
            if current is not None
            and current.expires_at is not None
            and current.expires_at > now_ms
            else now_ms
        )
        renewed_expires_at = add_natural_months(base_expires_at, months)
        stmt = mysql_insert(UserSubscriptionModel).values(
            user_id=order.user_id,
            product_id=order.product_id,
            product_price_id=product_price_id,
            auto_renew=False,
            period=period.value,
            payment_method=order.payment_method,
            original_order_no=None,
            channel_subscription_id=None,
            channel_uid=None,
            start_at=None,
            cancelled_at=None,
            expires_at=renewed_expires_at,
            created_at=now_ms,
            updated_at=now_ms,
        )
        stmt = stmt.on_duplicate_key_update(
            product_id=order.product_id,
            product_price_id=product_price_id,
            auto_renew=False,
            period=period.value,
            payment_method=order.payment_method,
            original_order_no=None,
            channel_subscription_id=None,
            channel_uid=None,
            start_at=None,
            cancelled_at=None,
            expires_at=renewed_expires_at,
            updated_at=now_ms,
        )
        await db.execute(stmt)

    async def _fulfill_auto_renew_in_session(
        self,
        db: AsyncSession,
        order: OrderModel,
        snapshot: dict[str, object],
    ) -> None:
        """只按 Provider 已归一化到期时间推进自动续费实例。"""

        period = self._parse_paid_period(snapshot.get("period"))
        callback_metadata = self._load_order_metadata(order).get("payment_callback")
        provider_subscription = (
            callback_metadata.get("provider_subscription")
            if isinstance(callback_metadata, dict)
            else None
        )
        if not isinstance(provider_subscription, dict):
            raise ValueError(
                "subscription_fulfillment: provider subscription missing: "
                f"order_no={order.order_no}, payment_method={order.payment_method}"
            )
        start_at = provider_subscription.get("start_at")
        subscription_expires_at = provider_subscription.get("expires_at")
        subscription_id = provider_subscription.get("channel_subscription_id")
        if (
            type(subscription_expires_at) is not int
            or not isinstance(subscription_id, str)
            or not subscription_id
        ):
            raise ValueError(
                "subscription_fulfillment: invalid provider subscription: "
                f"order_no={order.order_no}, "
                f"provider_subscription={provider_subscription!r}"
            )
        display_start_at = start_at if type(start_at) is int else None
        product_price_id = self._snapshot_product_price_id(order, snapshot)
        now_ms = timestamp_now()
        expires_at = cast(ColumnElement[int], UserSubscriptionModel.expires_at)
        advances = expires_at.is_(None) | (expires_at < subscription_expires_at)
        stmt = mysql_insert(UserSubscriptionModel).values(
            user_id=order.user_id,
            product_id=order.product_id,
            product_price_id=product_price_id,
            auto_renew=True,
            period=period.value,
            payment_method=order.payment_method,
            original_order_no=provider_subscription.get("original_order_no")
            or order.order_no,
            channel_subscription_id=subscription_id,
            channel_uid=order.payment_channel_uid,
            start_at=display_start_at,
            cancelled_at=None,
            expires_at=subscription_expires_at,
            created_at=now_ms,
            updated_at=now_ms,
        )
        stmt = stmt.on_duplicate_key_update(
            product_id=case(
                (advances, order.product_id), else_=UserSubscriptionModel.product_id
            ),
            product_price_id=case(
                (advances, product_price_id),
                else_=UserSubscriptionModel.product_price_id,
            ),
            auto_renew=case((advances, True), else_=UserSubscriptionModel.auto_renew),
            period=case((advances, period.value), else_=UserSubscriptionModel.period),
            payment_method=case(
                (advances, order.payment_method),
                else_=UserSubscriptionModel.payment_method,
            ),
            original_order_no=case(
                (
                    advances,
                    provider_subscription.get("original_order_no") or order.order_no,
                ),
                else_=UserSubscriptionModel.original_order_no,
            ),
            channel_subscription_id=case(
                (advances, subscription_id),
                else_=UserSubscriptionModel.channel_subscription_id,
            ),
            channel_uid=case(
                (advances, order.payment_channel_uid),
                else_=UserSubscriptionModel.channel_uid,
            ),
            start_at=case(
                (advances, display_start_at),
                else_=UserSubscriptionModel.start_at,
            ),
            cancelled_at=case(
                (advances, None), else_=UserSubscriptionModel.cancelled_at
            ),
            expires_at=case(
                (advances, subscription_expires_at),
                else_=expires_at,
            ),
            updated_at=case((advances, now_ms), else_=UserSubscriptionModel.updated_at),
        )
        await db.execute(stmt)

    def _snapshot_product_price_id(
        self, order: OrderModel, snapshot: dict[str, object]
    ) -> int:
        """读取订单快照中的购买选项 ID。"""

        value = snapshot.get("product_price_id")
        if type(value) is not int:
            raise ValueError(
                "subscription_fulfillment: product_price_id missing: "
                f"order_no={order.order_no}, product_price_id={value!r}"
            )
        return value

    def _load_order_metadata(self, order: OrderModel) -> dict[str, object]:
        """解析订单履约快照 JSON。"""

        if not order.extra_metadata:
            raise ValueError(
                "subscription_fulfillment: order extra_metadata missing: "
                f"order_no={order.order_no}, user_id={order.user_id}"
            )
        try:
            metadata = json.loads(order.extra_metadata)
        except json.JSONDecodeError as exc:
            raise ValueError(
                "subscription_fulfillment: invalid order extra_metadata json: "
                f"order_no={order.order_no}, user_id={order.user_id}"
            ) from exc
        if not isinstance(metadata, dict):
            raise ValueError(
                "subscription_fulfillment: extra_metadata must be object: "
                f"order_no={order.order_no}, user_id={order.user_id}"
            )
        return metadata


# 全局实例
subscription_service = SubscriptionService()
