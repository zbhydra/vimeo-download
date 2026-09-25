"""Credits 积分包可购买配置 API 测试。"""

import pytest

from app.constants.order import ProductClass
from app.constants.payment import CLINK_PAYMENT_METHOD, PAYPAL_CURRENCY
from tests.test_server.api.payment_config_test_support import (
    clear_payment_config_test_caches,
    get_clink_credit_product_id,
)


@pytest.fixture
async def credit_checkout_config_ready():
    """隔离 Credits 配置 API 只读测试的缓存。"""
    clear_payment_config_test_caches()
    yield
    clear_payment_config_test_caches()


@pytest.mark.asyncio
async def test_credit_checkout_configs_returns_supported_prices(
    async_client,
    credit_checkout_config_ready,
):
    """可购买 Credits 配置接口按积分包聚合支付渠道价格。"""
    product_id = await get_clink_credit_product_id()

    response = await async_client.get("/api/client/credit/checkout-configs")
    body = response.json()
    plans = [
        item
        for item in body["data"]["checkout_configs"]
        if item["product_id"] == product_id
    ]

    assert response.status_code == 200
    assert body["code"] == 10000
    assert len(plans) == 1
    plan = plans[0]
    assert plan["product_class"] == ProductClass.RECHARGE.value
    assert plan["product_id"] == product_id
    assert plan["credits_amount"] > 0
    assert "payment_method" not in plan
    clink_channels = [
        channel
        for channel in plan["payment_channels"]
        if channel["payment_method"] == CLINK_PAYMENT_METHOD
    ]
    assert len(clink_channels) == 1
    assert clink_channels[0]["currency"] == PAYPAL_CURRENCY
    assert clink_channels[0]["amount"] > 0
