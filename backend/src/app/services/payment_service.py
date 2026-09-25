"""支付 provider 服务。

根据 `config_payment_channel.channel_code` 找到渠道配置，并把
`config_json` 传给对应 provider 构造方法。
"""

import json
from typing import Any

from app.constants.payment import CLINK_PAYMENT_METHOD, PAYPAL_PAYMENT_METHOD
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.payment.payment_base import PaymentBase, PaymentProviderError
from app.provider.payment.clink import ClinkPaymentProvider
from app.provider.payment.paypal import PayPalPaymentProvider
from app.services.config_payment_channel_service import (
    config_payment_channel_service,
)


class PaymentService:
    """支付 provider 服务。"""

    async def get_provider(self, payment_method: str) -> PaymentBase:
        """读取渠道配置并创建支付 provider。"""
        channel_code = payment_method.strip()
        self._assert_supported_method(channel_code)

        channel_config = await self._get_channel_config(channel_code)
        return self._create_provider(channel_code, channel_config)

    async def get_provider_for_existing_payment(
        self,
        payment_method: str,
    ) -> PaymentBase:
        """为历史支付操作读取 provider，包括已停止新销售的渠道。

        Args:
            payment_method: 历史订单保存的支付渠道编码。

        Returns:
            使用数据库中最新渠道凭据构造的 provider。
        """

        channel_code = payment_method.strip()
        self._assert_supported_method(channel_code)
        channel = await config_payment_channel_service.get_by_channel_code(channel_code)
        if channel is None:
            raise AppCommonException(
                CommonCode.PAYMENT_UNSUPPORTED_METHOD,
                ext_msg=(
                    "payment_service: historical payment channel config missing: "
                    f"channel_code={channel_code}"
                ),
            )
        channel_config = self._load_config_json(channel.config_json, channel_code)
        return self._create_provider(channel_code, channel_config)

    def _create_provider(
        self,
        channel_code: str,
        channel_config: dict[str, Any],
    ) -> PaymentBase:
        """用已解析渠道配置构造对应 provider。"""

        try:
            if channel_code == CLINK_PAYMENT_METHOD:
                return ClinkPaymentProvider(channel_config)
            return PayPalPaymentProvider(channel_config)
        except PaymentProviderError as exc:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=str(exc),
            ) from exc

    def is_supported_method(self, payment_method: str) -> bool:
        """判断支付方式是否已有 provider 实现。

        `config_payment_channel` 里若仍残留已下线渠道的行，这里返回 False，
        历史订单按「渠道不支持」失败，不做补偿。
        """
        return payment_method.strip() in {
            PAYPAL_PAYMENT_METHOD,
            CLINK_PAYMENT_METHOD,
        }

    def _assert_supported_method(self, channel_code: str) -> None:
        """拒绝没有 provider 实现的支付渠道。"""

        if not self.is_supported_method(channel_code):
            raise AppCommonException(
                CommonCode.PAYMENT_UNSUPPORTED_METHOD,
                ext_msg=f"payment_service: unsupported payment_method={channel_code}",
            )

    async def _get_channel_config(self, channel_code: str) -> dict[str, Any]:
        """从启用渠道配置里读取 provider config。"""
        channels = await config_payment_channel_service.list_enabled()
        for channel in channels:
            if channel.channel_code.strip() == channel_code:
                return self._load_config_json(channel.config_json, channel_code)

        raise AppCommonException(
            CommonCode.PAYMENT_UNSUPPORTED_METHOD,
            ext_msg=f"payment_service: payment channel disabled: {channel_code}",
        )

    def _load_config_json(self, raw: str | None, channel_code: str) -> dict[str, Any]:
        """解析 config_payment_channel.config_json。"""
        if raw is None or not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "payment_service: invalid payment channel config json: "
                    f"channel_code={channel_code}"
                ),
            ) from exc
        if not isinstance(parsed, dict):
            raise AppCommonException(
                CommonCode.PAYMENT_GATEWAY_ERROR,
                ext_msg=(
                    "payment_service: payment channel config must be object: "
                    f"channel_code={channel_code}"
                ),
            )
        return parsed


payment_service = PaymentService()
