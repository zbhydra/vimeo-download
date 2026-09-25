"""UserCreditService 离线结构测试。"""

from sqlalchemy.dialects import mysql
from sqlalchemy.dialects.mysql import insert as mysql_insert
import pytest

from app.constants.order import OrderCheckProductParam, ProductClass
from app.constants.payment import CLINK_PAYMENT_METHOD, PAYPAL_CURRENCY
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_credit_log_model import UserCreditLogModel
from app.services.credit_checkout_config_service import credit_checkout_config_service
from app.services.user_credit_service import user_credit_service
from tests.test_server.api.payment_config_test_support import (
    clear_payment_config_test_caches,
    get_clink_credit_product_id,
)


async def _credit_checkout_config(product_id: str):
    """读取真实 Credits checkout 配置。"""

    return await credit_checkout_config_service.get_credit_checkout_config(
        product_id=product_id,
        channel_code=CLINK_PAYMENT_METHOD,
    )


def test_user_credit_models_are_collected_by_metadata() -> None:
    """Credits 三张表必须被 Base.metadata 收集。"""

    from app.core.database import Base
    import app.models  # noqa: F401

    assert "user_credit_accounts" in Base.metadata.tables
    assert "user_credit_logs" in Base.metadata.tables
    assert "user_download_records" in Base.metadata.tables
    assert "config_credit_product" in Base.metadata.tables
    assert "config_credit_product_price" in Base.metadata.tables


def test_user_credit_log_has_no_dedupe_key_column() -> None:
    """Credits 流水只记录余额变化，不承担业务幂等。"""

    assert "dedupe_key" not in UserCreditLogModel.__table__.columns
    assert not UserCreditLogModel.__table__.indexes


def test_registration_bonus_insert_uses_database_metadata_column() -> None:
    """模型属性 metadata_json 必须编译为数据库 metadata 列。"""

    stmt = mysql_insert(UserCreditLogModel).values(
        user_id=1,
        change_amount=10,
        reason="registration_bonus",
        resource_key=None,
        metadata_json=None,
        created_at=1,
    )
    compiled = str(stmt.compile(dialect=mysql.dialect()))

    assert "INSERT INTO user_credit_logs" in compiled
    assert "metadata" in compiled
    assert "metadata_json" not in compiled


@pytest.fixture
async def credit_payment_config_ready():
    """隔离 Credits 服务只读配置测试的缓存。"""
    clear_payment_config_test_caches()
    yield
    clear_payment_config_test_caches()


@pytest.mark.asyncio
async def test_check_product_returns_recharge_order_snapshot_from_credit_config(
    credit_payment_config_ready,
):
    """Credits 商品校验返回订单创建所需的充值快照。"""

    product_id = await get_clink_credit_product_id()
    expected = await _credit_checkout_config(product_id)

    order_param = await user_credit_service.check_product(
        OrderCheckProductParam(
            user_id=123,
            product_class=ProductClass.RECHARGE.value,
            product_id=product_id,
            payment_method=CLINK_PAYMENT_METHOD,
            currency=PAYPAL_CURRENCY,
            amount=expected.price.amount,
            client_ip="127.0.0.1",
        )
    )

    assert order_param.user_id == 123
    assert order_param.product_class == ProductClass.RECHARGE.value
    assert order_param.product_id == product_id
    assert order_param.product_name == expected.product.name
    assert order_param.payment_method == CLINK_PAYMENT_METHOD
    assert order_param.currency == PAYPAL_CURRENCY
    assert order_param.client_ip == "127.0.0.1"
    assert order_param.auto_renew is False
    assert order_param.provider_sku == expected.price.provider_sku
    assert f'"credits_amount":{expected.product.credits_amount}' in (
        order_param.extra_metadata or ""
    )


@pytest.mark.asyncio
async def test_check_product_rejects_stale_credit_price(
    credit_payment_config_ready,
):
    """客户端提交旧 Credits 价格时返回 PAYMENT_PRICE_UPDATED。"""

    product_id = await get_clink_credit_product_id()
    expected = await _credit_checkout_config(product_id)

    with pytest.raises(AppCommonException) as exc_info:
        await user_credit_service.check_product(
            OrderCheckProductParam(
                user_id=123,
                product_class=ProductClass.RECHARGE.value,
                product_id=product_id,
                payment_method=CLINK_PAYMENT_METHOD,
                currency=PAYPAL_CURRENCY,
                amount=expected.price.amount + 1_000_000,
                client_ip="127.0.0.1",
            )
        )

    assert exc_info.value.code == CommonCode.PAYMENT_PRICE_UPDATED
    assert exc_info.value.data == {
        "product_id": product_id,
        "payment_method": CLINK_PAYMENT_METHOD,
        "currency": PAYPAL_CURRENCY,
        "amount": expected.price.amount,
    }
