"""订阅销售目录过滤与存量权益 real 测试。

真实资源依赖：
- MySQL: users / user_subscriptions / config_subscription_product /
  config_subscription_product_price / config_payment_channel
- Redis: 用户 access token 白名单

覆盖 checkout 目录对无可用渠道商品的隐藏，以及停售年卡价格行后
年卡存量用户权益仍可读取。
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

import pytest
from sqlalchemy import delete, text

from app.constants.auth import TokenType
from app.constants.subscription import SubscriptionPeriodEnum
from app.core.database import get_async_session, get_engine
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_model import UserModel
from app.services.payment_config_service import payment_config_service
from app.services.user_service import UserService
from app.services.user_token_service import user_token_service
from app.utils.jwt import JwtData, JwtUnit
from app.utils.time import timestamp_now

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_DAY_MS = 24 * 60 * 60 * 1000
_YEAR_PRODUCT_ID = "unlimited_year"


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的真实测试用户。"""

    users: list[int] = field(default_factory=list)


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _delete_status_test_user(user_id: int) -> None:
    """按 token、订阅、用户顺序清理测试数据。"""

    await user_token_service.revoke_all_user_tokens(user_id)
    async with get_async_session() as db:
        await db.execute(
            delete(UserSubscriptionModel).where(
                UserSubscriptionModel.user_id == user_id  # type: ignore[arg-type]
            )
        )
        await db.execute(delete(UserModel).where(UserModel.user_id == user_id))
        await db.commit()


@pytest.fixture
async def real_checkout_config_schema_ready(real_mysql_ready) -> None:
    """检查销售目录 real 测试需要的真实表。"""

    required_tables = {
        "users",
        "user_subscriptions",
        "config_payment_channel",
        "config_subscription_product",
        "config_subscription_product_price",
    }
    missing = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_checkout_config_cleanup_state(
    real_checkout_config_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的真实测试数据。"""

    state = _CleanupState()
    try:
        yield state
    finally:
        for user_id in state.users:
            await _delete_status_test_user(user_id)


async def _create_user_and_headers(
    label: str,
    state: _CleanupState,
    make_test_email: Callable[[str], str],
) -> tuple[UserModel, dict[str, str]]:
    """创建真实用户并写入 Redis token 白名单，返回鉴权请求头。"""

    email = make_test_email(label)
    user = await UserService().create_user_without_password(email=email)
    state.users.append(user.user_id)
    token, expires_at = JwtUnit.create_access_token(
        JwtData(user_id=user.user_id, email=email)
    )
    await user_token_service.store_token(
        token,
        user.user_id,
        TokenType.USER_ACCESS,
        expires_at,
    )
    return user, {"Authorization": f"Bearer {token}"}


def _sellable_periods() -> set[str]:
    """返回可销售周期字面量，与枚举合同保持单一来源。"""

    return {
        period.value
        for period in SubscriptionPeriodEnum
        if period != SubscriptionPeriodEnum.NONE
    }


async def test_real_checkout_configs_hide_products_without_available_channel(
    real_checkout_config_schema_ready,
) -> None:
    """无任何可用渠道价格的商品不进入 checkout 目录，其余商品保留。"""

    snapshot = await payment_config_service.get_snapshot()
    products_with_channel = {price.product_id for price in snapshot.prices.values()}
    expected_ids = {
        product.product_id
        for product in snapshot.products.values()
        if product.period in _sellable_periods()
        and product.product_id in products_with_channel
    }

    plans = await payment_config_service.list_subscription_checkout_configs()
    plan_ids = {plan.product.product_id for plan in plans}

    assert plan_ids == expected_ids
    assert all(plan.payment_channels for plan in plans)
    if (
        _YEAR_PRODUCT_ID in snapshot.products
        and _YEAR_PRODUCT_ID not in products_with_channel
    ):
        # 本地配置已停售年卡价格行：年卡商品保持启用但不进销售目录。
        assert _YEAR_PRODUCT_ID not in plan_ids


async def test_real_checkout_configs_api_returns_only_plans_with_channels(
    real_async_client,
    real_checkout_config_schema_ready,
) -> None:
    """checkout 配置接口不返回空支付渠道的订阅方案。"""

    response = await real_async_client.get("/api/client/subscription/checkout-configs")
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    checkout_configs = body["data"]["checkout_configs"]
    assert checkout_configs
    assert all(config["payment_channels"] for config in checkout_configs)


async def test_real_off_sale_year_product_keeps_legacy_entitlement_readable(
    real_async_client,
    make_test_email: Callable[[str], str],
    real_checkout_config_cleanup_state: _CleanupState,
) -> None:
    """停售年卡价格行后，年卡存量用户订阅状态仍按原商品读取。"""

    user, headers = await _create_user_and_headers(
        "year-legacy",
        real_checkout_config_cleanup_state,
        make_test_email,
    )
    original_expires_at = timestamp_now() + 30 * _DAY_MS
    async with get_async_session() as db:
        db.add(
            UserSubscriptionModel(  # type: ignore[call-arg]
                user_id=user.user_id,
                product_id=_YEAR_PRODUCT_ID,
                product_price_id=None,
                auto_renew=False,
                period="year",
                payment_method="paypal",
                expires_at=original_expires_at,
            )
        )
        await db.commit()

    products = await payment_config_service.list_subscription_products()
    year_product = next(
        product for product in products if product.product_id == _YEAR_PRODUCT_ID
    )

    response = await real_async_client.get(
        "/api/client/subscription/status",
        headers=headers,
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["period"] == "year"
    assert body["data"]["display_name"] == year_product.name
    assert body["data"]["expires_at"] == original_expires_at
