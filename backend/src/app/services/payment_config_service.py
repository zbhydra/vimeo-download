"""支付配置读取服务。

流程：
1. 从 config_subscription_product、config_payment_channel、
   config_subscription_product_price 加载启用配置。
2. 生成只读内存快照，并缓存 3 分钟。
3. 对外提供订阅商品、渠道和价格的当前配置快照。
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

from app.constants.config_cache import (
    CONFIG_CACHE_TTL_MS as DEFAULT_CONFIG_CACHE_TTL_MS,
    CONFIG_CACHE_TTL_SECONDS as DEFAULT_CONFIG_CACHE_TTL_SECONDS,
)
from app.constants.payment import (
    DISPLAY_PRICE_CHANNEL_CODE,
    PAYPAL_CURRENCY,
    PAYPAL_PAYMENT_METHOD,
    PAYPAL_USD_AMOUNT_UNIT,
    payment_currency_matches_channel,
)
from app.constants.subscription import SubscriptionPeriodEnum
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.config_payment_channel_service import (
    config_payment_channel_service,
)
from app.services.config_subscription_product_price_service import (
    config_subscription_product_price_service,
)
from app.services.config_subscription_product_service import (
    config_subscription_product_service,
)
from app.utils.money import normalize_currency, validate_normalized_amount
from app.utils.time import timestamp_now

PAYMENT_CONFIG_CACHE_TTL_SECONDS = DEFAULT_CONFIG_CACHE_TTL_SECONDS
PAYMENT_CONFIG_CACHE_TTL_MS = DEFAULT_CONFIG_CACHE_TTL_MS


@dataclass(frozen=True, slots=True)
class SubscriptionProductConfig:
    """订阅商品配置。"""

    product_id: str
    name: str
    period: str
    auto_renew: bool
    display_currency: str
    display_amount: int
    sort_order: int
    metadata: dict[str, Any]


@dataclass(frozen=True, slots=True)
class PaymentChannelConfig:
    """支付渠道配置。"""

    channel_code: str
    channel_name: str
    config: dict[str, Any]


@dataclass(frozen=True, slots=True)
class SubscriptionProductPriceConfig:
    """订阅商品在指定渠道下的价格配置。"""

    id: int
    product_id: str
    channel_code: str
    auto_renew_supported: bool
    currency: str
    amount: int
    provider_sku: str | None


@dataclass(frozen=True, slots=True)
class SubscriptionCheckoutPaymentChannelConfig:
    """订阅方案下可展示给客户端的支付渠道价格。"""

    channel: PaymentChannelConfig
    price: SubscriptionProductPriceConfig


@dataclass(frozen=True, slots=True)
class SubscriptionCheckoutChannelConfig:
    """下单验价使用的单渠道商品、渠道和价格配置组合。"""

    product: SubscriptionProductConfig
    channel: PaymentChannelConfig
    price: SubscriptionProductPriceConfig


@dataclass(frozen=True, slots=True)
class SubscriptionCheckoutPlanConfig:
    """客户端可购买订阅方案及其支付渠道列表。"""

    product: SubscriptionProductConfig
    payment_channels: tuple[SubscriptionCheckoutPaymentChannelConfig, ...]


@dataclass(frozen=True, slots=True)
class PaymentConfigSnapshot:
    """支付配置内存快照。"""

    products: dict[str, SubscriptionProductConfig]
    channels: dict[str, PaymentChannelConfig]
    prices: dict[tuple[str, str], SubscriptionProductPriceConfig]
    loaded_at: int


class PaymentConfigService:
    """支付配置读取服务。"""

    def clear_cache(self) -> None:
        """清空三张配置表 service 的内存缓存。"""

        config_subscription_product_service.clear_cache()
        config_payment_channel_service.clear_cache()
        config_subscription_product_price_service.clear_cache()

    async def get_snapshot(
        self,
        *,
        force_refresh: bool = False,
    ) -> PaymentConfigSnapshot:
        """获取当前支付配置快照。

        Args:
            force_refresh: True 表示绕过 3 分钟内存缓存，直接从数据库重载。

        Returns:
            PaymentConfigSnapshot: 只包含启用商品、启用渠道和可用价格。
        """

        return await self._load_snapshot(force_refresh=force_refresh)

    async def list_subscription_products(
        self,
        *,
        force_refresh: bool = False,
    ) -> list[SubscriptionProductConfig]:
        """只读取订阅商品配置，供账户/额度状态这类非下单链路使用。

        状态接口不需要支付渠道和渠道价格，避免某条支付配置异常拖垮登录态、
        Credits 等正常业务。
        """

        product_rows = await config_subscription_product_service.list_enabled(
            force_refresh=force_refresh,
        )
        products = [
            SubscriptionProductConfig(
                product_id=self._normalize_code(row.product_id),
                name=row.name,
                period=row.period.strip().lower(),
                auto_renew=row.auto_renew,
                display_currency=normalize_currency(row.display_currency),
                display_amount=row.display_amount,
                sort_order=row.sort_order,
                metadata=self._load_json_object(
                    row.metadata_json,
                    context=(
                        "payment_config: invalid product metadata json: "
                        f"product_id={row.product_id}"
                    ),
                ),
            )
            for row in product_rows
        ]
        for product in products:
            self._assert_product_display_amount_valid(product)
        return sorted(products, key=self._product_sort_key)

    async def list_subscription_checkout_configs(
        self,
        *,
        channel_code: str | None = None,
    ) -> list[SubscriptionCheckoutPlanConfig]:
        """列出当前可下单的订阅方案。

        Args:
            channel_code: 支付渠道标识。为空时返回所有启用渠道下的价格。

        Returns:
            list[SubscriptionCheckoutPlanConfig]: 按商品排序后的订阅方案列表。
        """

        snapshot = await self.get_snapshot()
        normalized_channel_code = (
            self._normalize_code(channel_code) if channel_code else None
        )
        channel_groups: dict[str, list[SubscriptionCheckoutPaymentChannelConfig]] = {}

        for price in snapshot.prices.values():
            if (
                normalized_channel_code is not None
                and price.channel_code != normalized_channel_code
            ):
                continue
            product = snapshot.products.get(price.product_id)
            channel = snapshot.channels.get(price.channel_code)
            if product is None or channel is None:
                continue
            channel_groups.setdefault(product.product_id, []).append(
                SubscriptionCheckoutPaymentChannelConfig(
                    channel=channel,
                    price=price,
                )
            )

        # 销售目录只收录可下单周期；没有任何可用渠道价格的商品整体隐藏，
        # 取代旧的“空渠道商品仍展示禁用卡片”约定。权益查询不受此过滤影响。
        sellable_periods = {
            period.value
            for period in SubscriptionPeriodEnum
            if period != SubscriptionPeriodEnum.NONE
        }
        plans: list[SubscriptionCheckoutPlanConfig] = []
        for product in snapshot.products.values():
            if product.period not in sellable_periods:
                continue
            payment_channels = channel_groups.get(product.product_id, [])
            if not payment_channels:
                continue
            plans.append(
                SubscriptionCheckoutPlanConfig(
                    product=product,
                    payment_channels=tuple(
                        sorted(
                            payment_channels,
                            key=lambda item: item.channel.channel_code,
                        )
                    ),
                )
            )

        return sorted(plans, key=lambda item: self._product_sort_key(item.product))

    async def get_subscription_checkout_config(
        self,
        *,
        product_id: str,
        channel_code: str,
        auto_renew: bool,
        period: str,
    ) -> SubscriptionCheckoutChannelConfig:
        """获取指定商品和渠道的下单配置。

        Args:
            product_id: 订阅商品标识。
            channel_code: 支付渠道标识。
            auto_renew: 是否由渠道自动续费。
            period: 商业与权益周期。

        Raises:
            AppCommonException: 商品、渠道或价格不可用时返回 PAYMENT_PRICE_UPDATED。
        """

        normalized_product_id = self._normalize_code(product_id)
        normalized_channel_code = self._normalize_code(channel_code)
        snapshot = await self.get_snapshot()

        product = snapshot.products.get(normalized_product_id)
        channel = snapshot.channels.get(normalized_channel_code)
        price = snapshot.prices.get((normalized_product_id, normalized_channel_code))
        if (
            product is None
            or channel is None
            or price is None
            or product.auto_renew != auto_renew
            or product.period != period
            or not self._is_price_available(product, price)
        ):
            raise AppCommonException(
                CommonCode.PAYMENT_PRICE_UPDATED,
                ext_msg=(
                    "payment_config: checkout config unavailable: "
                    f"product_id={normalized_product_id}, "
                    f"channel_code={normalized_channel_code}, "
                    f"auto_renew={auto_renew}, period={period}"
                ),
                data={
                    "product_id": normalized_product_id,
                    "payment_method": normalized_channel_code,
                },
            )

        return SubscriptionCheckoutChannelConfig(
            product=product,
            channel=channel,
            price=price,
        )

    async def _load_snapshot(
        self,
        *,
        force_refresh: bool = False,
    ) -> PaymentConfigSnapshot:
        """从数据库加载启用配置并生成快照。"""

        product_rows = await config_subscription_product_service.list_enabled(
            force_refresh=force_refresh,
        )
        channel_rows = await config_payment_channel_service.list_enabled(
            force_refresh=force_refresh,
        )
        price_rows = await config_subscription_product_price_service.list_enabled(
            force_refresh=force_refresh,
        )

        products = {
            self._normalize_code(row.product_id): SubscriptionProductConfig(
                product_id=self._normalize_code(row.product_id),
                name=row.name,
                period=row.period.strip().lower(),
                auto_renew=row.auto_renew,
                display_currency=normalize_currency(row.display_currency),
                display_amount=row.display_amount,
                sort_order=row.sort_order,
                metadata=self._load_json_object(
                    row.metadata_json,
                    context=(
                        "payment_config: invalid product metadata json: "
                        f"product_id={row.product_id}"
                    ),
                ),
            )
            for row in product_rows
        }
        for product in products.values():
            self._assert_product_display_amount_valid(product)
        channels = {
            self._normalize_code(row.channel_code): PaymentChannelConfig(
                channel_code=self._normalize_code(row.channel_code),
                channel_name=row.channel_name,
                config=self._load_json_object(
                    row.config_json,
                    context=(
                        "payment_config: invalid channel config json: "
                        f"channel_code={row.channel_code}"
                    ),
                ),
            )
            for row in channel_rows
        }

        prices: dict[tuple[str, str], SubscriptionProductPriceConfig] = {}
        for row in price_rows:
            product_id = self._normalize_code(row.product_id)
            channel_code = self._normalize_code(row.channel_code)
            if product_id not in products or channel_code not in channels:
                continue

            currency = normalize_currency(row.currency)
            price = SubscriptionProductPriceConfig(
                id=row.id,
                product_id=product_id,
                channel_code=channel_code,
                auto_renew_supported=row.auto_renew_supported,
                currency=currency,
                amount=row.amount,
                provider_sku=row.provider_sku,
            )
            if not self._is_price_available(products[product_id], price):
                continue
            self._assert_config_amount_valid(
                product_id=product_id,
                channel_code=channel_code,
                currency=currency,
                amount=row.amount,
            )
            prices[(product_id, channel_code)] = price

        return PaymentConfigSnapshot(
            products=products,
            channels=channels,
            prices=prices,
            loaded_at=timestamp_now(),
        )

    def _normalize_code(self, value: str) -> str:
        """规范化配置标识。"""

        return value.strip()

    def _load_json_object(self, raw: str | None, *, context: str) -> dict[str, Any]:
        """读取 JSON 对象配置，空值视为 {}。"""

        if raw is None or not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=context,
            ) from exc
        if not isinstance(parsed, dict):
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=f"{context}: expected object",
            )
        return parsed

    def _assert_config_amount_valid(
        self,
        *,
        product_id: str,
        channel_code: str,
        currency: str,
        amount: int,
    ) -> None:
        """确认配置表金额是合法的 6 位精度整数。"""

        try:
            validate_normalized_amount(amount)
        except (TypeError, ValueError) as exc:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "payment_config: invalid config amount: "
                    f"product_id={product_id}, channel_code={channel_code}, "
                    f"currency={currency}, amount={amount}, error={exc}"
                ),
            ) from exc
        self._assert_provider_amount_representable(
            product_id=product_id,
            channel_code=channel_code,
            currency=currency,
            amount=amount,
        )

    def _assert_product_display_amount_valid(
        self,
        product: SubscriptionProductConfig,
    ) -> None:
        """确认订阅商品默认展示价配置有效。"""

        self._assert_config_amount_valid(
            product_id=product.product_id,
            channel_code=DISPLAY_PRICE_CHANNEL_CODE,
            currency=product.display_currency,
            amount=product.display_amount,
        )

    def _is_price_available(
        self,
        product: SubscriptionProductConfig,
        price: SubscriptionProductPriceConfig,
    ) -> bool:
        """按商品当前模式判断渠道价格是否可用于新订单。"""

        if not payment_currency_matches_channel(price.channel_code, price.currency):
            return False
        if not product.auto_renew:
            return True
        return price.auto_renew_supported

    def _assert_provider_amount_representable(
        self,
        *,
        product_id: str,
        channel_code: str,
        currency: str,
        amount: int,
    ) -> None:
        """确认渠道金额可以被支付 provider 无损表示。"""

        if channel_code == DISPLAY_PRICE_CHANNEL_CODE:
            return
        if amount <= 0:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "payment_config: config amount must be positive: "
                    f"product_id={product_id}, channel_code={channel_code}, "
                    f"currency={currency}, amount={amount}"
                ),
            )
        if (
            channel_code == PAYPAL_PAYMENT_METHOD
            and currency == PAYPAL_CURRENCY
            and amount % PAYPAL_USD_AMOUNT_UNIT != 0
        ):
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "payment_config: paypal USD amount must have 2 decimal places: "
                    f"product_id={product_id}, amount={amount}"
                ),
            )

    def _product_sort_key(
        self,
        product: SubscriptionProductConfig,
    ) -> tuple[int, str]:
        """生成订阅方案排序键。"""

        return product.sort_order, product.product_id


payment_config_service = PaymentConfigService()
