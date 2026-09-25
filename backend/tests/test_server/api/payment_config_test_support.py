"""支付配置测试的只读辅助方法。"""

import pytest
from sqlalchemy import select

from app.core.database import get_async_session
from app.models.config_credit_product_model import ConfigCreditProductModel
from app.models.config_credit_product_price_model import ConfigCreditProductPriceModel
from app.models.config_payment_channel_model import ConfigPaymentChannelModel
from app.models.config_subscription_product_model import ConfigSubscriptionProductModel
from app.models.config_subscription_product_price_model import (
    ConfigSubscriptionProductPriceModel,
)
from app.constants.payment import CLINK_PAYMENT_METHOD, PAYPAL_CURRENCY
from app.services.credit_checkout_config_service import credit_checkout_config_service
from app.services.payment_config_service import payment_config_service


def clear_payment_config_test_caches() -> None:
    """清理支付配置缓存，避免只读测试相互影响。"""
    payment_config_service.clear_cache()
    credit_checkout_config_service.clear_cache()


async def get_clink_subscription_product_id() -> str:
    """读取启用的 Unlimited Clink 订阅商品 ID。"""
    async with get_async_session() as db:
        result = await db.execute(
            select(ConfigSubscriptionProductPriceModel.product_id)
            .join(
                ConfigSubscriptionProductModel,
                ConfigSubscriptionProductModel.product_id
                == ConfigSubscriptionProductPriceModel.product_id,
            )
            .join(
                ConfigPaymentChannelModel,
                ConfigPaymentChannelModel.channel_code
                == ConfigSubscriptionProductPriceModel.channel_code,
            )
            .where(
                ConfigSubscriptionProductPriceModel.channel_code
                == CLINK_PAYMENT_METHOD,
                ConfigSubscriptionProductPriceModel.currency == PAYPAL_CURRENCY,
                ConfigSubscriptionProductPriceModel.enabled.is_(True),
                ConfigSubscriptionProductModel.enabled.is_(True),
                ConfigPaymentChannelModel.enabled.is_(True),
                ConfigSubscriptionProductModel.product_id == "unlimited",
                ConfigSubscriptionProductModel.auto_renew.is_(False),
                ConfigSubscriptionProductModel.period == "month",
            )
            .order_by(ConfigSubscriptionProductModel.sort_order.asc())
            .limit(1)
        )
        product_id = result.scalar_one_or_none()
    if product_id is None:
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 缺少启用的 Unlimited Clink 订阅配置")
    payment_config_service.clear_cache()
    return product_id


async def get_clink_credit_product_id(
    *,
    product_id: str | None = None,
) -> str:
    """读取启用的 Clink Credits 商品 ID。"""
    async with get_async_session() as db:
        stmt = (
            select(ConfigCreditProductPriceModel.product_id)
            .join(
                ConfigCreditProductModel,
                ConfigCreditProductModel.product_id
                == ConfigCreditProductPriceModel.product_id,
            )
            .join(
                ConfigPaymentChannelModel,
                ConfigPaymentChannelModel.channel_code
                == ConfigCreditProductPriceModel.channel_code,
            )
            .where(
                ConfigCreditProductPriceModel.channel_code == CLINK_PAYMENT_METHOD,
                ConfigCreditProductPriceModel.currency == PAYPAL_CURRENCY,
                ConfigCreditProductPriceModel.enabled.is_(True),
                ConfigCreditProductModel.enabled.is_(True),
                ConfigPaymentChannelModel.enabled.is_(True),
            )
        )
        if product_id is not None:
            stmt = stmt.where(ConfigCreditProductPriceModel.product_id == product_id)
        result = await db.execute(
            stmt.order_by(ConfigCreditProductModel.sort_order.asc()).limit(1)
        )
        credit_product_id = result.scalar_one_or_none()
    if credit_product_id is None:
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 缺少启用的 Clink Credits 配置")
    credit_checkout_config_service.clear_cache()
    return credit_product_id
