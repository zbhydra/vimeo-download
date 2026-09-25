"""订阅可购买配置 API 测试。"""

import pytest

from app.constants.order import ProductClass
from app.api.client.subscription_client import _serialize_checkout_plans
from app.services.payment_config_service import (
    PaymentChannelConfig,
    SubscriptionCheckoutPaymentChannelConfig,
    SubscriptionCheckoutPlanConfig,
    SubscriptionProductConfig,
    SubscriptionProductPriceConfig,
)
from tests.test_server.api.payment_config_test_support import (
    clear_payment_config_test_caches,
)


@pytest.fixture
async def subscription_checkout_config_ready():
    """隔离订阅配置 API 只读测试的缓存。"""
    clear_payment_config_test_caches()
    yield
    clear_payment_config_test_caches()


@pytest.mark.asyncio
async def test_subscription_checkout_configs_returns_supported_prices(
    async_client,
    subscription_checkout_config_ready,
):
    """可购买订阅配置接口按排序暴露月、季、终生三档订阅购买项。"""
    response = await async_client.get("/api/client/subscription/checkout-configs")
    body = response.json()
    plans = body["data"]["checkout_configs"]

    assert response.status_code == 200
    assert body["code"] == 10000
    if not plans:
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 订阅商品展示配置尚未初始化")
    assert [plan["product_id"] for plan in plans] == [
        "unlimited",
        "unlimited_quarter",
        "unlimited_lifetime",
    ]
    plan = plans[0]
    assert plan["product_class"] == ProductClass.SUBSCRIPTION.value
    assert plan["product_id"] == "unlimited"
    assert plan["product_name"] == "Unlimited"
    assert plan["daily_limit"] == -1
    assert plan["extension_daily_download_limit"] == -1
    assert "web_daily_download_limit" not in plan
    assert "web_daily_play_limit" not in plan
    assert len(plan["payment_channels"]) >= 1
    assert all(channel["payment_method"] for channel in plan["payment_channels"])
    assert all(channel["product_price_id"] > 0 for channel in plan["payment_channels"])
    assert plan["period"] == "month"
    assert plan["auto_renew"] is False
    assert plan["display_currency"]
    assert plan["display_amount"] >= 0
    clink = next(
        channel
        for channel in plan["payment_channels"]
        if channel["payment_method"] == "clink"
    )
    assert "auto_renew" not in clink
    assert "period" not in clink
    assert "provider_sku" not in clink
    assert "payment_method" not in plans[0]


def test_serialize_checkout_renders_plan_and_channel_fields():
    """序列化保留商品默认展示配置，并把渠道价格映射为协议字段。"""

    product = SubscriptionProductConfig(
        product_id="unlimited",
        name="Unlimited",
        period="lifetime",
        auto_renew=False,
        display_currency="USD",
        display_amount=99_900_000,
        sort_order=1,
        metadata={"daily_limit": -1},
    )
    channel_config = PaymentChannelConfig(
        channel_code="paypal",
        channel_name="PayPal",
        config={},
    )
    price = SubscriptionProductPriceConfig(
        id=42,
        product_id="unlimited",
        channel_code="paypal",
        auto_renew_supported=False,
        currency="USD",
        amount=99_900_000,
        provider_sku=None,
    )

    plans = _serialize_checkout_plans(
        [
            SubscriptionCheckoutPlanConfig(
                product=product,
                payment_channels=(
                    SubscriptionCheckoutPaymentChannelConfig(
                        channel=channel_config,
                        price=price,
                    ),
                ),
            )
        ]
    )

    assert plans[0]["period"] == "lifetime"
    assert plans[0]["auto_renew"] is False
    assert plans[0]["display_currency"] == "USD"
    assert plans[0]["display_amount"] == 99_900_000
    assert plans[0]["payment_channels"] == [
        {
            "payment_method": "paypal",
            "payment_method_name": "PayPal",
            "product_price_id": 42,
            "currency": "USD",
            "amount": 99_900_000,
        }
    ]
