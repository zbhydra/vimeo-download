"""Credits 积分包 checkout 配置聚合服务。

流程：
1. 从 config_credit_product、config_credit_product_price、config_payment_channel
   加载启用配置。
2. 生成只读内存快照，并复用配置表 service 的 3 分钟缓存。
3. 对客户端返回积分包展示价，对订单校验返回单商品单渠道快照。
"""

from dataclasses import dataclass
import json
from typing import Any

from app.constants.payment import (
    DISPLAY_PRICE_CHANNEL_CODE,
    PAYPAL_CURRENCY,
    PAYPAL_PAYMENT_METHOD,
    PAYPAL_USD_AMOUNT_UNIT,
)
from app.core.singleton import singleton
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.config_credit_product_price_service import (
    config_credit_product_price_service,
)
from app.services.config_credit_product_service import config_credit_product_service
from app.services.config_payment_channel_service import (
    config_payment_channel_service,
)
from app.utils.money import normalize_currency, validate_normalized_amount
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class CreditProductConfig:
    """Credits 积分包商品配置。"""

    product_id: str
    name: str
    credits_amount: int
    display_currency: str
    display_amount: int
    sort_order: int
    metadata: dict[str, Any]


@dataclass(frozen=True, slots=True)
class CreditPaymentChannelConfig:
    """Credits 支付渠道配置。"""

    channel_code: str
    channel_name: str
    config: dict[str, Any]


@dataclass(frozen=True, slots=True)
class CreditProductPriceConfig:
    """Credits 积分包在指定渠道下的价格配置。"""

    product_id: str
    channel_code: str
    currency: str
    amount: int
    provider_sku: str | None


@dataclass(frozen=True, slots=True)
class CreditCheckoutPaymentChannelConfig:
    """Credits 商品下可展示给客户端的支付渠道价格。"""

    channel: CreditPaymentChannelConfig
    price: CreditProductPriceConfig


@dataclass(frozen=True, slots=True)
class CreditCheckoutChannelConfig:
    """下单验价使用的单渠道商品、渠道和价格配置组合。"""

    product: CreditProductConfig
    channel: CreditPaymentChannelConfig
    price: CreditProductPriceConfig


@dataclass(frozen=True, slots=True)
class CreditCheckoutPlanConfig:
    """客户端可购买 Credits 积分包及其支付渠道列表。"""

    product: CreditProductConfig
    payment_channels: tuple[CreditCheckoutPaymentChannelConfig, ...]


@dataclass(frozen=True, slots=True)
class CreditCheckoutConfigSnapshot:
    """Credits checkout 配置内存快照。"""

    products: dict[str, CreditProductConfig]
    channels: dict[str, CreditPaymentChannelConfig]
    prices: dict[tuple[str, str], CreditProductPriceConfig]
    loaded_at: int


@singleton
class CreditCheckoutConfigService:
    """Credits checkout 配置读取服务。"""

    def clear_cache(self) -> None:
        """清空 Credits checkout 依赖的三张配置表缓存。"""

        config_credit_product_service.clear_cache()
        config_payment_channel_service.clear_cache()
        config_credit_product_price_service.clear_cache()

    async def get_snapshot(
        self,
        *,
        force_refresh: bool = False,
    ) -> CreditCheckoutConfigSnapshot:
        """获取当前 Credits checkout 配置快照。

        Args:
            force_refresh: True 表示绕过 3 分钟内存缓存，直接从数据库重载。

        Returns:
            CreditCheckoutConfigSnapshot: 只包含启用商品、启用渠道和可用价格。
        """

        return await self._load_snapshot(force_refresh=force_refresh)

    async def list_credit_checkout_configs(
        self,
        *,
        channel_code: str | None = None,
    ) -> list[CreditCheckoutPlanConfig]:
        """列出当前可下单的 Credits 积分包。

        Args:
            channel_code: 支付渠道标识。为空时返回所有启用渠道下的价格。

        Returns:
            list[CreditCheckoutPlanConfig]: 按商品排序后的 Credits 积分包列表。
        """

        snapshot = await self.get_snapshot()
        normalized_channel_code = (
            self._normalize_code(channel_code) if channel_code else None
        )
        channel_groups: dict[str, list[CreditCheckoutPaymentChannelConfig]] = {}

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
                CreditCheckoutPaymentChannelConfig(channel=channel, price=price)
            )

        plans: list[CreditCheckoutPlanConfig] = []
        for product in snapshot.products.values():
            payment_channels = channel_groups.get(product.product_id, [])
            plans.append(
                CreditCheckoutPlanConfig(
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

    async def get_credit_checkout_config(
        self,
        *,
        product_id: str,
        channel_code: str,
    ) -> CreditCheckoutChannelConfig:
        """获取指定 Credits 商品和渠道的下单配置。

        Args:
            product_id: Credits 商品标识。
            channel_code: 支付渠道标识。

        Raises:
            AppCommonException: 商品、渠道或价格不可用时返回 PAYMENT_PRICE_UPDATED。
        """

        normalized_product_id = self._normalize_code(product_id)
        normalized_channel_code = self._normalize_code(channel_code)
        snapshot = await self.get_snapshot()

        product = snapshot.products.get(normalized_product_id)
        channel = snapshot.channels.get(normalized_channel_code)
        price = snapshot.prices.get((normalized_product_id, normalized_channel_code))
        if product is None or channel is None or price is None:
            latest_channels = self._latest_supported_payment_channels(
                snapshot,
                product_id=normalized_product_id,
            )
            raise AppCommonException(
                CommonCode.PAYMENT_PRICE_UPDATED,
                ext_msg=(
                    "credit_checkout_config: checkout config unavailable: "
                    f"product_id={normalized_product_id}, "
                    f"channel_code={normalized_channel_code}"
                ),
                data={
                    "product_id": normalized_product_id,
                    "payment_method": normalized_channel_code,
                    "payment_channels": latest_channels,
                },
            )

        return CreditCheckoutChannelConfig(
            product=product,
            channel=channel,
            price=price,
        )

    async def _load_snapshot(
        self,
        *,
        force_refresh: bool = False,
    ) -> CreditCheckoutConfigSnapshot:
        """从数据库加载启用配置并生成 Credits checkout 快照。"""

        product_rows = await config_credit_product_service.list_enabled(
            force_refresh=force_refresh,
        )
        channel_rows = await config_payment_channel_service.list_enabled(
            force_refresh=force_refresh,
        )
        price_rows = await config_credit_product_price_service.list_enabled(
            force_refresh=force_refresh,
        )

        products = {
            self._normalize_code(row.product_id): CreditProductConfig(
                product_id=self._normalize_code(row.product_id),
                name=row.name,
                credits_amount=row.credits_amount,
                display_currency=normalize_currency(row.display_currency),
                display_amount=row.display_amount,
                sort_order=row.sort_order,
                metadata=self._load_json_object(
                    row.metadata_json,
                    context=(
                        "credit_checkout_config: invalid product metadata json: "
                        f"product_id={row.product_id}"
                    ),
                ),
            )
            for row in product_rows
        }
        for product in products.values():
            self._assert_product_valid(product)

        channels = {
            self._normalize_code(row.channel_code): CreditPaymentChannelConfig(
                channel_code=self._normalize_code(row.channel_code),
                channel_name=row.channel_name,
                config=self._load_json_object(
                    row.config_json,
                    context=(
                        "credit_checkout_config: invalid channel config json: "
                        f"channel_code={row.channel_code}"
                    ),
                ),
            )
            for row in channel_rows
        }

        prices: dict[tuple[str, str], CreditProductPriceConfig] = {}
        for row in price_rows:
            product_id = self._normalize_code(row.product_id)
            channel_code = self._normalize_code(row.channel_code)
            if product_id not in products or channel_code not in channels:
                continue

            currency = normalize_currency(row.currency)
            self._assert_config_amount_valid(
                product_id=product_id,
                channel_code=channel_code,
                currency=currency,
                amount=row.amount,
            )
            prices[(product_id, channel_code)] = CreditProductPriceConfig(
                product_id=product_id,
                channel_code=channel_code,
                currency=currency,
                amount=row.amount,
                provider_sku=row.provider_sku,
            )

        return CreditCheckoutConfigSnapshot(
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
                    "credit_checkout_config: invalid config amount: "
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
                    "credit_checkout_config: config amount must be positive: "
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
                    "credit_checkout_config: paypal USD amount must have "
                    "2 decimal places: "
                    f"product_id={product_id}, amount={amount}"
                ),
            )

    def _assert_product_valid(self, product: CreditProductConfig) -> None:
        """确认 Credits 商品展示价和到账数量配置有效。"""

        if product.credits_amount <= 0:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "credit_checkout_config: credits_amount must be positive: "
                    f"product_id={product.product_id}, "
                    f"credits_amount={product.credits_amount}"
                ),
            )
        self._assert_config_amount_valid(
            product_id=product.product_id,
            channel_code=DISPLAY_PRICE_CHANNEL_CODE,
            currency=product.display_currency,
            amount=product.display_amount,
        )

    def _product_sort_key(self, product: CreditProductConfig) -> tuple[int, str]:
        """生成 Credits 积分包排序键。"""

        return product.sort_order, product.product_id

    def _latest_supported_payment_channels(
        self,
        snapshot: CreditCheckoutConfigSnapshot,
        *,
        product_id: str,
    ) -> list[dict[str, object]]:
        """返回商品当前仍可用且已有 provider 的渠道价格列表。"""

        from app.services.payment_service import payment_service

        latest_channels: list[dict[str, object]] = []
        for (price_product_id, channel_code), price in snapshot.prices.items():
            if price_product_id != product_id:
                continue
            channel = snapshot.channels.get(channel_code)
            if channel is None or not payment_service.is_supported_method(channel_code):
                continue
            latest_channels.append(
                {
                    "payment_method": channel.channel_code,
                    "payment_method_name": channel.channel_name,
                    "currency": price.currency,
                    "amount": price.amount,
                    "provider_sku": price.provider_sku,
                }
            )

        return sorted(
            latest_channels,
            key=lambda item: str(item["payment_method"]),
        )


credit_checkout_config_service = CreditCheckoutConfigService()
