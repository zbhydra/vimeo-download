"""PayPal Checkout 支付 provider。

职责：
1. 用本地订单快照创建 PayPal Orders v2 订单或 Billing Subscription。
2. 校验 PayPal webhook 签名。
3. 在 webhook 收到一次性订单或订阅扣款成功时返回订单成功结果。
"""

import hashlib
import json
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

import httpx
from fastapi import Request

from app.constants.order import OrderStatus
from app.constants.payment import (
    PAYPAL_PAYMENT_METHOD,
    PAYPAL_USD_AMOUNT_UNIT,
    payment_currency_matches_channel,
    recurring_provider_sku_parts,
)
from app.core.config import settings
from app.core.redis import redis_client
from app.provider.payment.payment_base import (
    CallbackVerificationResult,
    PaymentBase,
    PaymentProviderError,
    PaymentRequest,
    RecurringPaymentReference,
)
from app.utils.logger import logger
from app.utils.money import NORMALIZED_AMOUNT_FACTOR
from app.utils.redis_key import build_redis_key
from app.utils.time import parse_timestamp_input, timestamp_now

PAYPAL_APPROVED_EVENT = "CHECKOUT.ORDER.APPROVED"
PAYPAL_CAPTURE_COMPLETED_EVENT = "PAYMENT.CAPTURE.COMPLETED"
PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT = "PAYMENT.SALE.COMPLETED"
_PAYPAL_ACCESS_TOKEN_CACHE_PREFIX = "payment:paypal:access_token"
_PAYPAL_ACCESS_TOKEN_CACHE_SAFETY_SECONDS = 60
_PAYPAL_APPROVAL_LINK_RELS = {"payer-action", "approve"}
_PAYPAL_API_BASE_URL_BY_ENVIRONMENT = {
    "sandbox": "https://api-m.sandbox.paypal.com",
    "live": "https://api-m.paypal.com",
}
_PAYPAL_AUTOMATIC_PAYMENTS_URL = "https://www.paypal.com/myaccount/autopay/"


@dataclass(frozen=True, slots=True)
class PayPalProviderConfig:
    """PayPal provider 运行配置。"""

    client_id: str
    client_secret: str
    webhook_id: str
    environment: str
    api_base_url: str
    request_timeout_seconds: float


@dataclass(frozen=True, slots=True)
class PayPalCaptureResult:
    """PayPal capture 后提取出的支付成功快照。"""

    paypal_order_id: str
    capture_id: str
    # 主动付款 capture 时由 webhook invoice_id/custom_id 携带；续费 sale 场景为 None。
    order_no: str | None
    amount: int
    currency: str
    payer_id: str | None
    raw_data: dict[str, object]


@dataclass(frozen=True, slots=True)
class PayPalSubscriptionSaleResult:
    """PayPal 订阅扣款 webhook 提取出的支付成功快照。"""

    subscription_id: str
    sale_id: str
    # 续费 sale 携带的首期本地订单号，由 OrderService 定位续费单；首期可能为 None。
    original_order_no: str | None
    amount: int
    currency: str
    payer_id: str | None
    raw_data: dict[str, object]


@dataclass(frozen=True, slots=True)
class PayPalSubscriptionStatus:
    """PayPal Billing Subscription 的运维查询结果。"""

    subscription_id: str
    status: str
    status_update_time: str | None
    next_billing_time: str | None
    last_payment_time: str | None


class PayPalPaymentProvider(PaymentBase):
    """PayPal Checkout 支付 provider。"""

    provider_name = PAYPAL_PAYMENT_METHOD

    def __init__(self, config: dict[str, object] | None = None) -> None:
        self.config = self._parse_provider_config(config)

    @staticmethod
    def _parse_provider_config(
        config: dict[str, object] | None,
        *,
        context: str = "paypal.parse_provider_config",
    ) -> PayPalProviderConfig:
        """从渠道配置 JSON 解析 PayPal provider 所需字段。"""

        if config is None:
            raise PaymentProviderError(
                f"{context}: paypal config must be object, got null"
            )
        if not isinstance(config, dict):
            raise PaymentProviderError(
                f"{context}: paypal config must be object, got {type(config).__name__}"
            )

        environment = PayPalPaymentProvider._optional_environment(
            config, context=context
        )
        return PayPalProviderConfig(
            client_id=PayPalPaymentProvider._required_string_field(
                config, "client_id", context=context
            ),
            client_secret=PayPalPaymentProvider._required_string_field(
                config, "client_secret", context=context
            ),
            webhook_id=PayPalPaymentProvider._required_string_field(
                config, "webhook_id", context=context
            ),
            environment=environment,
            api_base_url=_PAYPAL_API_BASE_URL_BY_ENVIRONMENT[environment],
            request_timeout_seconds=PayPalPaymentProvider._required_positive_timeout(
                config, "request_timeout_seconds", context=context
            ),
        )

    @staticmethod
    def _required_string_field(
        config: dict[str, object],
        field: str,
        *,
        context: str,
    ) -> str:
        """读取必填字符串字段。"""

        value = config.get(field)
        if not isinstance(value, str) or not value.strip():
            raise PaymentProviderError(
                f"{context}: paypal config field {field} must be a non-empty string"
            )
        return value.strip()

    @staticmethod
    def _normalize_required_http_url(
        value: str,
        field: str,
        *,
        context: str,
    ) -> str:
        """规范化必填 HTTP/HTTPS URL。"""

        normalized = value.rstrip("/")
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise PaymentProviderError(
                f"{context}: paypal config field {field} must be an http or https URL"
            )
        return normalized

    @staticmethod
    def _optional_environment(
        config: dict[str, object],
        *,
        context: str,
    ) -> str:
        """读取 PayPal 环境，默认 sandbox 方便测试服先跑通。"""

        value = config.get("environment", "sandbox")
        if not isinstance(value, str) or value.strip() not in {
            "sandbox",
            "live",
        }:
            raise PaymentProviderError(
                f"{context}: paypal config field environment must be sandbox or live"
            )
        return value.strip()

    @staticmethod
    def _required_positive_timeout(
        config: dict[str, object],
        field: str,
        *,
        context: str,
    ) -> float:
        """读取必填正数超时时间。"""

        value = config.get(field)
        if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
            raise PaymentProviderError(
                f"{context}: paypal config field {field} must be a positive number"
            )
        return float(value)

    async def create_payment(self, request: PaymentRequest) -> dict[str, object]:
        """创建 PayPal 订单或订阅并返回 approval URL。"""

        self._validate_payment_request(request)
        token = await self._get_access_token()
        if request.auto_renew:
            return await self._create_subscription_payment(request, token)

        return await self._create_checkout_order_payment(request, token)

    async def create_subscription_management_url(
        self,
        *,
        channel_uid: str | None,
        return_url: str,
    ) -> str | None:
        """返回 PayPal Automatic Payments 官方入口。"""

        return _PAYPAL_AUTOMATIC_PAYMENTS_URL

    async def get_subscription_status(
        self,
        subscription_id: str,
    ) -> PayPalSubscriptionStatus:
        """从 PayPal 查询 Billing Subscription 的实时状态。

        Args:
            subscription_id: PayPal Billing Subscription ID。

        Returns:
            只包含续费运维需要字段的状态快照。
        """

        normalized_id = self._required_subscription_id(
            subscription_id,
            context="paypal.get_subscription_status",
        )
        token = await self._get_access_token()
        data = await self._get_paypal_json(
            f"/v1/billing/subscriptions/{normalized_id}",
            access_token=token,
            context="paypal.get_subscription_status",
        )
        billing_info = self._optional_object_field(data, "billing_info")
        last_payment = (
            self._optional_object_field(billing_info, "last_payment")
            if billing_info
            else None
        )
        return PayPalSubscriptionStatus(
            subscription_id=self._string_field(data, "id"),
            status=self._string_field(data, "status").upper(),
            status_update_time=self._optional_string_field(
                data,
                "status_update_time",
            ),
            next_billing_time=(
                self._optional_string_field(billing_info, "next_billing_time")
                if billing_info
                else None
            ),
            last_payment_time=(
                self._optional_string_field(last_payment, "time")
                if last_payment
                else None
            ),
        )

    async def cancel_subscription(
        self,
        subscription_id: str,
        *,
        reason: str,
    ) -> None:
        """取消 PayPal Billing Subscription 的后续自动扣款。

        Args:
            subscription_id: PayPal Billing Subscription ID。
            reason: 写入 PayPal 的取消原因。
        """

        normalized_id = self._required_subscription_id(
            subscription_id,
            context="paypal.cancel_subscription",
        )
        normalized_reason = reason.strip()
        if not normalized_reason:
            raise PaymentProviderError(
                "paypal.cancel_subscription: cancellation reason is empty: "
                f"subscription_id={normalized_id}"
            )

        token = await self._get_access_token()
        await self._post_paypal_without_response(
            f"/v1/billing/subscriptions/{normalized_id}/cancel",
            {"reason": normalized_reason},
            access_token=token,
            context="paypal.cancel_subscription",
        )

    async def _create_checkout_order_payment(
        self,
        request: PaymentRequest,
        token: str,
    ) -> dict[str, object]:
        """创建 PayPal Orders v2 一次性支付入口。"""

        payload = self._create_order_payload(request)
        data = await self._post_paypal_json(
            "/v2/checkout/orders",
            payload,
            access_token=token,
            context="paypal.create_order",
        )
        paypal_order_id = self._string_field(data, "id")
        approval_url = self._approval_url(data)
        return {
            "payment_url": approval_url,
            "approval_url": approval_url,
            "channel_order_id": paypal_order_id,
            "paypal_order_id": paypal_order_id,
        }

    async def _create_subscription_payment(
        self,
        request: PaymentRequest,
        token: str,
    ) -> dict[str, object]:
        """创建 PayPal Billing Subscription 自动续费入口。"""

        payload = self._create_subscription_payload(request)
        data = await self._post_paypal_json(
            "/v1/billing/subscriptions",
            payload,
            access_token=token,
            context="paypal.create_subscription",
        )
        paypal_subscription_id = self._string_field(data, "id")
        approval_url = self._approval_url(data)
        return {
            "payment_url": approval_url,
            "approval_url": approval_url,
            "channel_order_id": paypal_subscription_id,
            "paypal_subscription_id": paypal_subscription_id,
            "paypal_plan_id": request.provider_sku,
        }

    def recurring_payment_reference(
        self,
        *,
        order_no: str | None,
        is_recurring: bool,
    ) -> RecurringPaymentReference:
        """把 PayPal subscription sale 的本地首单号转换为统一续费引用。"""

        if not is_recurring:
            return super().recurring_payment_reference(
                order_no=order_no,
                is_recurring=is_recurring,
            )
        return RecurringPaymentReference(original_order_no=order_no)

    async def verify_callback(self, request: Request) -> CallbackVerificationResult:
        """校验 PayPal webhook 签名并转换为统一支付结果。"""

        body = await request.body()
        event = self._load_webhook_event(body)
        event_type = self._string_field(event, "event_type")
        resource = self._object_field(event, "resource")
        await self._verify_webhook_signature(request, event)

        if event_type == PAYPAL_APPROVED_EVENT:
            return await self._handle_order_approved(resource)
        if event_type == PAYPAL_CAPTURE_COMPLETED_EVENT:
            return self._handle_capture_completed(resource, event)
        if event_type == PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT:
            return await self._handle_subscription_sale_completed(resource, event)

        return CallbackVerificationResult(
            valid=False,
            processed=False,
            event=event_type,
            provider_data={"ignored": True},
        )

    async def capture_order(self, paypal_order_id: str) -> PayPalCaptureResult:
        """服务端 capture 已 approved 的 PayPal order。"""

        start_time = time.perf_counter()
        token = await self._get_access_token()
        data = await self._post_paypal_json(
            f"/v2/checkout/orders/{paypal_order_id}/capture",
            {},
            access_token=token,
            context="paypal.capture_order",
        )
        capture_result = self._capture_result_from_order(data)
        logger.info(
            "paypal_order_capture_finished: paypal_order_id=%s, order_no=%s, "
            "capture_id=%s, duration_ms=%.2f",
            capture_result.paypal_order_id,
            capture_result.order_no,
            capture_result.capture_id,
            self._elapsed_ms(start_time),
        )
        return capture_result

    def _validate_payment_request(self, request: PaymentRequest) -> None:
        """确认订单快照可用于创建 PayPal Checkout 订单。"""

        if request.payment_method != PAYPAL_PAYMENT_METHOD:
            raise PaymentProviderError(
                "PayPal create order payment method mismatch: "
                f"order_no={request.order_no}, payment_method={request.payment_method}"
            )
        if not payment_currency_matches_channel(
            request.payment_method, request.currency
        ):
            raise PaymentProviderError(
                "PayPal create order currency mismatch: "
                f"order_no={request.order_no}, currency={request.currency}"
            )
        if request.order_status != OrderStatus.PENDING.value:
            raise PaymentProviderError(
                "PayPal create order is not pending: "
                f"order_no={request.order_no}, status={request.order_status}"
            )
        if request.expired_at <= timestamp_now():
            raise PaymentProviderError(
                f"PayPal create order expired: order_no={request.order_no}"
            )
        if (
            request.auto_renew
            and recurring_provider_sku_parts(
                request.payment_method, request.provider_sku
            )
            is None
        ):
            raise PaymentProviderError(
                "PayPal create subscription provider_sku invalid: "
                f"order_no={request.order_no}"
            )
        self._paypal_amount_value(request.amount, order_no=request.order_no)

    def _assert_paypal_usd_amount(self, amount: int, *, context: str) -> None:
        """确认内部 6 位金额可以无损表示为 PayPal USD 两位小数。"""

        if amount < 0:
            raise PaymentProviderError(
                f"{context}: PayPal amount must be non-negative: amount={amount}"
            )
        if amount % PAYPAL_USD_AMOUNT_UNIT != 0:
            raise PaymentProviderError(
                f"{context}: PayPal USD amount requires 2 decimal places: "
                f"amount={amount}"
            )

    def _create_order_payload(self, request: PaymentRequest) -> dict[str, object]:
        """生成 PayPal Orders v2 create payload。"""

        return {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": request.order_no,
                    "custom_id": request.order_no,
                    "description": request.product_name,
                    "amount": {
                        "currency_code": request.currency,
                        "value": self._paypal_amount_value(
                            request.amount,
                            order_no=request.order_no,
                        ),
                    },
                }
            ],
            "payment_source": {
                "paypal": {
                    "experience_context": {
                        "payment_method_preference": "IMMEDIATE_PAYMENT_REQUIRED",
                        "brand_name": "Vimeo Downloader",
                        "locale": "en-US",
                        "landing_page": "LOGIN",
                        "shipping_preference": "NO_SHIPPING",
                        "user_action": "PAY_NOW",
                        "return_url": self._website_paypal_return_url(
                            "success",
                            request.order_no,
                        ),
                        "cancel_url": self._website_paypal_return_url(
                            "cancel",
                            request.order_no,
                        ),
                    }
                }
            },
        }

    def _create_subscription_payload(
        self,
        request: PaymentRequest,
    ) -> dict[str, object]:
        """生成 PayPal Billing Subscription create payload。"""

        sku_parts = recurring_provider_sku_parts(
            request.payment_method, request.provider_sku
        )
        if sku_parts is None:
            raise PaymentProviderError(
                "paypal._create_subscription_payload: provider_sku invalid: "
                f"order_no={request.order_no}"
            )
        plan_id = sku_parts[0]
        return {
            "plan_id": plan_id,
            "custom_id": request.order_no,
            "application_context": {
                "brand_name": "Vimeo Downloader",
                "locale": "en-US",
                "shipping_preference": "NO_SHIPPING",
                "user_action": "SUBSCRIBE_NOW",
                "payment_method": {
                    "payer_selected": "PAYPAL",
                    "payee_preferred": "IMMEDIATE_PAYMENT_REQUIRED",
                },
                "return_url": self._website_paypal_return_url(
                    "success",
                    request.order_no,
                ),
                "cancel_url": self._website_paypal_return_url(
                    "cancel",
                    request.order_no,
                ),
            },
        }

    def _website_paypal_return_url(self, result: str, order_no: str) -> str:
        """生成 PayPal 跳回 website 的结果页 URL。"""

        base_url = self._normalize_required_http_url(
            settings.app.public_website_base_url,
            "app.public_website_base_url",
            context="paypal._website_paypal_return_url",
        )
        return f"{base_url}/paypal/{result}/?order_no={order_no}"

    def _paypal_amount_value(self, amount: int, *, order_no: str) -> str:
        """把 6 位精度 USD 金额转换为 PayPal 要求的两位小数字符串。"""

        self._assert_paypal_usd_amount(
            amount,
            context=f"paypal._paypal_amount_value: order_no={order_no}",
        )
        return str(
            (Decimal(amount) / Decimal(NORMALIZED_AMOUNT_FACTOR)).quantize(
                Decimal("0.01")
            )
        )

    async def _handle_order_approved(
        self,
        resource: dict[str, object],
    ) -> CallbackVerificationResult:
        """处理 PayPal order approved webhook：内部 capture 后返回支付成功结果。"""

        paypal_order_id = self._string_field(resource, "id")
        capture_result = await self.capture_order(paypal_order_id)
        return self._verification_result_from_capture(
            PAYPAL_APPROVED_EVENT,
            capture_result,
        )

    def _handle_capture_completed(
        self,
        resource: dict[str, object],
        event: dict[str, object],
    ) -> CallbackVerificationResult:
        """处理 PayPal capture completed webhook 兜底通知。"""

        paypal_order_id = self._paypal_order_id_from_capture_resource(resource)
        amount = self._object_field(resource, "amount")
        currency = self._string_field(amount, "currency_code")
        paid_amount = self._amount_from_paypal_value(
            self._string_field(amount, "value")
        )
        capture_id = self._string_field(resource, "id")
        capture_result = PayPalCaptureResult(
            paypal_order_id=paypal_order_id,
            capture_id=capture_id,
            order_no=self._order_no_from_capture_resource(resource),
            amount=paid_amount,
            currency=currency,
            payer_id=None,
            raw_data=event,
        )
        return self._verification_result_from_capture(
            PAYPAL_CAPTURE_COMPLETED_EVENT,
            capture_result,
        )

    async def _handle_subscription_sale_completed(
        self,
        resource: dict[str, object],
        event: dict[str, object],
    ) -> CallbackVerificationResult:
        """处理 PayPal subscription sale completed webhook。"""

        sale_result = self._subscription_sale_result_from_resource(
            resource,
            event,
        )
        status = await self.get_subscription_status(sale_result.subscription_id)
        if not status.next_billing_time:
            raise PaymentProviderError(
                "paypal.subscription_sale: subscription expiration missing after query: "
                f"subscription_id={sale_result.subscription_id}, sale_id={sale_result.sale_id}"
            )
        return self._verification_result_from_subscription_sale(sale_result, status)

    def _verification_result_from_capture(
        self,
        event_name: str,
        capture_result: PayPalCaptureResult,
    ) -> CallbackVerificationResult:
        """把 PayPal capture 结果转换为统一订单成功参数。"""

        return CallbackVerificationResult(
            valid=True,
            processed=True,
            event=event_name,
            order_no=capture_result.order_no,
            channel_order_no=capture_result.paypal_order_id,
            channel_uid=capture_result.payer_id,
            amount=capture_result.amount,
            currency=capture_result.currency,
            transaction_id=capture_result.capture_id,
            extra_metadata=json.dumps(
                capture_result.raw_data,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            provider_data={
                "paypal_order_id": capture_result.paypal_order_id,
                "capture_id": capture_result.capture_id,
            },
        )

    def _verification_result_from_subscription_sale(
        self,
        sale_result: PayPalSubscriptionSaleResult,
        status: PayPalSubscriptionStatus,
    ) -> CallbackVerificationResult:
        """把 PayPal 订阅扣款结果转换为统一订单成功参数。"""

        return CallbackVerificationResult(
            valid=True,
            processed=True,
            event=PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
            order_no=None,
            channel_order_no=sale_result.sale_id,
            channel_uid=sale_result.payer_id,
            amount=sale_result.amount,
            currency=sale_result.currency,
            transaction_id=sale_result.sale_id,
            extra_metadata=json.dumps(
                {
                    "paypal_event": sale_result.raw_data,
                    "paypal_subscription_id": sale_result.subscription_id,
                    "paypal_sale_id": sale_result.sale_id,
                    "is_recurring": True,
                    "provider_subscription": {
                        "channel_subscription_id": sale_result.subscription_id,
                        "original_order_no": sale_result.original_order_no,
                        "start_at": (
                            parse_timestamp_input(status.last_payment_time)
                            if status.last_payment_time
                            else None
                        ),
                        "expires_at": parse_timestamp_input(status.next_billing_time),
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            provider_data={
                "paypal_subscription_id": sale_result.subscription_id,
                "paypal_sale_id": sale_result.sale_id,
                "is_recurring": True,
            },
            recurring_reference=self.recurring_payment_reference(
                order_no=sale_result.original_order_no,
                is_recurring=True,
            ),
        )

    def _capture_result_from_order(
        self,
        data: dict[str, object],
    ) -> PayPalCaptureResult:
        """从 PayPal capture order 响应里提取本地需要的支付成功字段。"""

        paypal_order_id = self._string_field(data, "id")
        purchase_unit = self._first_object(data, "purchase_units")
        order_no = self._string_field(purchase_unit, "reference_id")
        payments = self._object_field(purchase_unit, "payments")
        capture = self._first_object(payments, "captures")
        capture_id = self._string_field(capture, "id")
        amount = self._object_field(capture, "amount")
        currency = self._string_field(amount, "currency_code")
        paid_amount = self._amount_from_paypal_value(
            self._string_field(amount, "value")
        )
        payer = self._optional_object_field(data, "payer")
        payer_id = self._optional_string_field(payer, "payer_id") if payer else None

        return PayPalCaptureResult(
            paypal_order_id=paypal_order_id,
            capture_id=capture_id,
            order_no=order_no,
            amount=paid_amount,
            currency=currency,
            payer_id=payer_id,
            raw_data=data,
        )

    def _subscription_sale_result_from_resource(
        self,
        resource: dict[str, object],
        event: dict[str, object],
    ) -> PayPalSubscriptionSaleResult:
        """从 PayPal subscription sale webhook 里提取本地支付成功字段。"""

        sale_id = self._string_field(resource, "id")
        subscription_id = self._subscription_id_from_sale_resource(resource)
        amount, currency = self._sale_amount_from_resource(resource)
        payer_id = self._payer_id_from_sale_resource(resource)
        return PayPalSubscriptionSaleResult(
            subscription_id=subscription_id,
            sale_id=sale_id,
            original_order_no=self._order_no_from_subscription_sale_resource(resource),
            amount=amount,
            currency=currency,
            payer_id=payer_id,
            raw_data=event,
        )

    def _order_no_from_capture_resource(
        self,
        resource: dict[str, object],
    ) -> str | None:
        """从 capture webhook 读取创建主动付款时写入的本地订单号。"""

        return self._optional_string_field(
            resource,
            "invoice_id",
        ) or self._optional_string_field(resource, "custom_id")

    def _paypal_order_id_from_capture_resource(
        self,
        resource: dict[str, object],
    ) -> str:
        """从 capture completed webhook 读取 PayPal order id。"""

        supplementary = self._optional_object_field(resource, "supplementary_data")
        related_ids = (
            self._optional_object_field(supplementary, "related_ids")
            if supplementary
            else None
        )
        order_id = (
            self._optional_string_field(related_ids, "order_id")
            if related_ids
            else None
        )
        if not order_id:
            raise PaymentProviderError(
                "PayPal capture completed order id missing: "
                f"capture_id={self._optional_string_field(resource, 'id')}"
            )
        return order_id

    def _subscription_id_from_sale_resource(
        self,
        resource: dict[str, object],
    ) -> str:
        """从 subscription sale webhook 读取 PayPal subscription id。"""

        subscription_id = self._optional_string_field(
            resource,
            "billing_agreement_id",
        ) or self._optional_string_field(resource, "subscription_id")
        if subscription_id:
            return subscription_id

        supplementary = self._optional_object_field(resource, "supplementary_data")
        related_ids = (
            self._optional_object_field(supplementary, "related_ids")
            if supplementary
            else None
        )
        subscription_id = (
            self._optional_string_field(related_ids, "subscription_id")
            if related_ids
            else None
        )
        if subscription_id:
            return subscription_id

        raise PaymentProviderError(
            "PayPal subscription sale subscription id missing: "
            f"sale_id={self._optional_string_field(resource, 'id')}"
        )

    def _order_no_from_subscription_sale_resource(
        self,
        resource: dict[str, object],
    ) -> str | None:
        """从 subscription sale webhook 读取创建订阅时写入的本地订单号。"""

        return (
            self._optional_string_field(resource, "custom_id")
            or self._optional_string_field(resource, "custom")
            or self._optional_string_field(resource, "invoice_number")
        )

    def _sale_amount_from_resource(
        self,
        resource: dict[str, object],
    ) -> tuple[int, str]:
        """读取 PayPal sale webhook 的金额，兼容 v1/v2 字段命名。"""

        amount = self._object_field(resource, "amount")
        currency = self._optional_string_field(
            amount,
            "currency_code",
        ) or self._optional_string_field(amount, "currency")
        value = self._optional_string_field(
            amount,
            "value",
        ) or self._optional_string_field(amount, "total")
        if not currency or not value:
            raise PaymentProviderError(
                "PayPal subscription sale amount missing: "
                f"sale_id={self._optional_string_field(resource, 'id')}, "
                f"amount={amount}"
            )
        return self._amount_from_paypal_value(value), currency

    def _payer_id_from_sale_resource(
        self,
        resource: dict[str, object],
    ) -> str | None:
        """从 sale webhook 尽力读取 payer id，缺失不影响履约。"""

        payer = self._optional_object_field(resource, "payer")
        payer_info = self._optional_object_field(payer, "payer_info") if payer else None
        return (
            self._optional_string_field(payer_info, "payer_id") if payer_info else None
        ) or self._optional_string_field(resource, "payer_id")

    def _amount_from_paypal_value(self, value: str) -> int:
        """把 PayPal 小数字符串金额转换为 6 位精度内部金额。"""

        try:
            amount_decimal = Decimal(value)
        except InvalidOperation as exc:
            raise PaymentProviderError(
                f"PayPal amount value invalid: value={value!r}"
            ) from exc
        normalized = amount_decimal * Decimal(NORMALIZED_AMOUNT_FACTOR)
        if normalized != normalized.to_integral_value():
            raise PaymentProviderError(
                f"PayPal amount value exceeds 6 decimals: value={value!r}"
            )
        amount = int(normalized)
        self._assert_paypal_usd_amount(
            amount,
            context=f"paypal._amount_from_paypal_value: value={value!r}",
        )
        return amount

    async def _get_access_token(self) -> str:
        """读取 PayPal REST access token，优先使用 Redis 跨节点缓存。"""

        start_time = time.perf_counter()
        cached_token = await self._get_cached_access_token()
        if cached_token:
            logger.info(
                "paypal_oauth_token_ready: source=redis, environment=%s, "
                "duration_ms=%.2f",
                self.config.environment,
                self._elapsed_ms(start_time),
            )
            return cached_token

        url = f"{self.config.api_base_url}/v1/oauth2/token"
        try:
            async with httpx.AsyncClient(
                timeout=self.config.request_timeout_seconds
            ) as client:
                response = await client.post(
                    url,
                    data={"grant_type": "client_credentials"},
                    auth=(self.config.client_id, self.config.client_secret),
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise PaymentProviderError(
                f"PayPal OAuth request failed: endpoint={url}, error={exc}"
            ) from exc

        data = self._paypal_response_json(
            response,
            context="paypal.oauth",
            safe_endpoint=url,
        )
        access_token = self._string_field(data, "access_token")
        expires_in = self._optional_positive_int_field(data, "expires_in")
        cache_ttl_seconds = (
            await self._set_cached_access_token(access_token, expires_in)
            if expires_in is not None
            else 0
        )
        logger.info(
            "paypal_oauth_token_ready: source=paypal, environment=%s, "
            "duration_ms=%.2f, cache_ttl_seconds=%s",
            self.config.environment,
            self._elapsed_ms(start_time),
            cache_ttl_seconds,
        )
        return access_token

    async def _get_cached_access_token(self) -> str | None:
        """从 Redis 读取 PayPal access token；Redis 故障时退回实时 OAuth。"""

        cache_key = self._access_token_cache_key()
        try:
            redis = await redis_client.get_client()
            cached_token = await redis.get(cache_key)
        except Exception:
            logger.error(
                "paypal_access_token_cache_get_failed: key=%s",
                cache_key,
                exc_info=True,
            )
            return None

        if isinstance(cached_token, str) and cached_token.strip():
            return cached_token.strip()
        return None

    async def _set_cached_access_token(
        self,
        access_token: str,
        expires_in: int,
    ) -> int:
        """把 PayPal access token 写入 Redis；失败不影响本次支付。"""

        cache_ttl_seconds = expires_in - _PAYPAL_ACCESS_TOKEN_CACHE_SAFETY_SECONDS
        if cache_ttl_seconds <= 0:
            return 0

        cache_key = self._access_token_cache_key()
        try:
            redis = await redis_client.get_client()
            await redis.set(cache_key, access_token, ex=cache_ttl_seconds)
        except Exception:
            logger.error(
                "paypal_access_token_cache_set_failed: key=%s, ttl_seconds=%s",
                cache_key,
                cache_ttl_seconds,
                exc_info=True,
            )
            return 0
        return cache_ttl_seconds

    def _access_token_cache_key(self) -> str:
        """构建 PayPal OAuth token Redis key。"""

        credential_fingerprint = hashlib.sha256(
            f"{self.config.environment}:{self.config.client_id}".encode("utf-8")
        ).hexdigest()[:24]
        return build_redis_key(
            f"{_PAYPAL_ACCESS_TOKEN_CACHE_PREFIX}:{credential_fingerprint}"
        )

    async def _post_paypal_json(
        self,
        path: str,
        payload: dict[str, object],
        *,
        access_token: str,
        context: str,
    ) -> dict[str, object]:
        """调用 PayPal JSON POST API。"""

        url = f"{self.config.api_base_url}{path}"
        start_time = time.perf_counter()
        try:
            async with httpx.AsyncClient(
                timeout=self.config.request_timeout_seconds
            ) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {access_token}",
                    },
                )
        except httpx.HTTPError as exc:
            raise PaymentProviderError(
                f"PayPal API {context} request failed: endpoint={url}, error={exc}"
            ) from exc
        logger.info(
            "paypal_api_post_finished: context=%s, path=%s, status=%s, "
            "duration_ms=%.2f",
            context,
            path,
            response.status_code,
            self._elapsed_ms(start_time),
        )
        return self._paypal_response_json(
            response,
            context=context,
            safe_endpoint=url,
        )

    async def _get_paypal_json(
        self,
        path: str,
        *,
        access_token: str,
        context: str,
    ) -> dict[str, object]:
        """调用 PayPal JSON GET API。"""

        url = f"{self.config.api_base_url}{path}"
        try:
            async with httpx.AsyncClient(
                timeout=self.config.request_timeout_seconds
            ) as client:
                response = await client.get(
                    url,
                    headers={
                        "Accept": "application/json",
                        "Authorization": f"Bearer {access_token}",
                    },
                )
        except httpx.HTTPError as exc:
            raise PaymentProviderError(
                f"PayPal API {context} request failed: endpoint={url}, error={exc}"
            ) from exc

        return self._paypal_response_json(
            response,
            context=context,
            safe_endpoint=url,
        )

    async def _post_paypal_without_response(
        self,
        path: str,
        payload: dict[str, object],
        *,
        access_token: str,
        context: str,
    ) -> None:
        """调用成功时不返回 JSON 的 PayPal POST API。"""

        url = f"{self.config.api_base_url}{path}"
        try:
            async with httpx.AsyncClient(
                timeout=self.config.request_timeout_seconds
            ) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {access_token}",
                    },
                )
        except httpx.HTTPError as exc:
            raise PaymentProviderError(
                f"PayPal API {context} request failed: endpoint={url}, error={exc}"
            ) from exc

        if response.status_code >= 400:
            raise PaymentProviderError(
                f"PayPal API {context} HTTP failed: endpoint={url}, "
                f"status={response.status_code}, body={response.text[:500]}"
            )

    def _required_subscription_id(self, value: str, *, context: str) -> str:
        """规范化脚本传入的 PayPal Billing Subscription ID。"""

        normalized = value.strip()
        if not normalized:
            raise PaymentProviderError(f"{context}: PayPal subscription_id is empty")
        return normalized

    async def _verify_webhook_signature(
        self,
        request: Request,
        event: dict[str, object],
    ) -> None:
        """调用 PayPal verify-webhook-signature 校验 webhook 来源。"""

        start_time = time.perf_counter()
        token = await self._get_access_token()
        headers = request.headers
        payload: dict[str, object] = {
            "auth_algo": self._required_header(headers.get("paypal-auth-algo")),
            "cert_url": self._required_header(headers.get("paypal-cert-url")),
            "transmission_id": self._required_header(
                headers.get("paypal-transmission-id")
            ),
            "transmission_sig": self._required_header(
                headers.get("paypal-transmission-sig")
            ),
            "transmission_time": self._required_header(
                headers.get("paypal-transmission-time")
            ),
            "webhook_id": self.config.webhook_id,
            "webhook_event": event,
        }
        data = await self._post_paypal_json(
            "/v1/notifications/verify-webhook-signature",
            payload,
            access_token=token,
            context="paypal.verify_webhook_signature",
        )
        status = self._string_field(data, "verification_status")
        if status != "SUCCESS":
            raise PaymentProviderError(
                "PayPal webhook signature verification failed: "
                f"verification_status={status}"
            )
        logger.info(
            "paypal_webhook_signature_verified: event=%s, duration_ms=%.2f",
            self._optional_string_field(event, "event_type") or "unknown",
            self._elapsed_ms(start_time),
        )

    def _load_webhook_event(self, body: bytes) -> dict[str, object]:
        """解析 PayPal webhook JSON。"""

        try:
            data = json.loads(body)
        except json.JSONDecodeError as exc:
            raise PaymentProviderError("PayPal webhook body is invalid JSON") from exc
        if not isinstance(data, dict):
            raise PaymentProviderError(
                f"PayPal webhook event must be object, got {type(data).__name__}"
            )
        return data

    def _approval_url(self, data: dict[str, object]) -> str:
        """从 create order 响应读取 PayPal 买家付款跳转 URL。"""

        links = data.get("links")
        if not isinstance(links, list):
            raise PaymentProviderError(f"PayPal create order links missing: {data}")
        for item in links:
            if (
                not isinstance(item, dict)
                or item.get("rel") not in _PAYPAL_APPROVAL_LINK_RELS
            ):
                continue
            href = item.get("href")
            if not isinstance(href, str) or not href.strip():
                continue
            return self._validate_approval_url(href.strip())
        raise PaymentProviderError(f"PayPal payment action link missing: {data}")

    def _validate_approval_url(self, value: str) -> str:
        """确认 approval URL 来自 PayPal 官方域名。"""

        parsed = urlparse(value)
        hostname = parsed.hostname.lower() if parsed.hostname else ""
        if parsed.scheme != "https" or not (
            hostname == "paypal.com" or hostname.endswith(".paypal.com")
        ):
            raise PaymentProviderError(
                "PayPal approve link host mismatch: "
                f"actual={parsed.scheme}://{parsed.netloc}"
            )
        return value

    def _paypal_response_json(
        self,
        response: httpx.Response,
        *,
        context: str,
        safe_endpoint: str,
    ) -> dict[str, object]:
        """解析 PayPal HTTP JSON 响应并转换错误。"""

        if response.status_code >= 400:
            raise PaymentProviderError(
                f"PayPal API {context} HTTP failed: endpoint={safe_endpoint}, "
                f"status={response.status_code}, body={response.text[:500]}"
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise PaymentProviderError(
                f"PayPal API {context} returned invalid JSON: "
                f"endpoint={safe_endpoint}, body={response.text[:500]}"
            ) from exc
        if not isinstance(data, dict):
            raise PaymentProviderError(
                f"PayPal API {context} response must be object: "
                f"endpoint={safe_endpoint}"
            )
        return data

    def _required_header(self, value: str | None) -> str:
        """读取 PayPal webhook 必填 header。"""

        if value is None or not value.strip():
            raise PaymentProviderError("PayPal webhook signature header missing")
        return value.strip()

    def _string_field(self, data: dict[str, object], field: str) -> str:
        """读取必填字符串字段。"""

        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            raise PaymentProviderError(f"PayPal field {field} missing or invalid")
        return value.strip()

    def _optional_positive_int_field(
        self,
        data: dict[str, object],
        field: str,
    ) -> int | None:
        """读取可选正整数字段。"""

        value = data.get(field)
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            return None
        return value

    def _optional_string_field(
        self,
        data: dict[str, object] | None,
        field: str,
    ) -> str | None:
        """读取可选字符串字段。"""

        if data is None:
            return None
        value = data.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None

    def _object_field(self, data: dict[str, object], field: str) -> dict[str, object]:
        """读取必填对象字段。"""

        value = data.get(field)
        if not isinstance(value, dict):
            raise PaymentProviderError(f"PayPal field {field} must be object")
        return value

    def _optional_object_field(
        self,
        data: dict[str, object] | None,
        field: str,
    ) -> dict[str, object] | None:
        """读取可选对象字段。"""

        if data is None:
            return None
        value = data.get(field)
        if isinstance(value, dict):
            return value
        return None

    def _first_object(self, data: dict[str, object], field: str) -> dict[str, object]:
        """读取数组字段里的第一个对象。"""

        value = data.get(field)
        if not isinstance(value, list) or not value or not isinstance(value[0], dict):
            raise PaymentProviderError(f"PayPal field {field} must contain object")
        return value[0]

    def _elapsed_ms(self, start_time: float) -> float:
        """计算单段 PayPal 处理耗时，统一以毫秒输出。"""

        return (time.perf_counter() - start_time) * 1000
