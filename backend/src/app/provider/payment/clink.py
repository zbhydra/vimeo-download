"""ClinkBill Hosted Checkout Provider。

负责创建一次性或自动续费 Session，并把已验签 Webhook 映射到统一支付结果。
"""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import hashlib
import hmac
import json
import time
from typing import cast
from urllib.parse import quote, urlencode, urlsplit

import httpx
from fastapi import Request

from app.constants.payment import CLINK_PAYMENT_METHOD, recurring_provider_sku_parts
from app.core.config import settings
from app.provider.payment.payment_base import (
    CallbackVerificationResult,
    PaymentBase,
    PaymentProviderError,
    PaymentRequest,
    RecurringPaymentReference,
)
from app.services.order_service import order_service
from app.utils.money import (
    NORMALIZED_AMOUNT_FACTOR,
    format_normalized_amount,
    normalize_currency,
)
from app.utils.time import timestamp_now
from app.utils.time import parse_timestamp_input

CLINK_ORDER_SUCCEEDED_EVENT = "order.succeeded"
CLINK_INVOICE_PAID_EVENT = "invoice.paid"
_API_BASE_URLS = {
    "sandbox": "https://uat-api.clinkbill.com/api",
    "live": "https://api.clinkbill.com/api",
}
_CHECKOUT_HOSTS = {
    "sandbox": "uat-checkout.clinkbill.com",
    "live": "checkout.clinkbill.com",
}
_PORTAL_HOSTS = {
    "sandbox": "uat-portal.clinkbill.com",
    "live": "portal.clinkbill.com",
}
_WEBHOOK_TOLERANCE_SECONDS = 300


@dataclass(frozen=True, slots=True)
class ClinkProviderConfig:
    """ClinkBill 渠道配置。"""

    environment: str
    api_base_url: str
    request_timeout_seconds: float
    secret_key: str
    webhook_signing_key: str


class ClinkPaymentProvider(PaymentBase):
    """ClinkBill Hosted Checkout 支付 Provider。"""

    provider_name = CLINK_PAYMENT_METHOD

    def __init__(self, config: dict[str, object] | None = None) -> None:
        self.config = self._parse_config(config)

    async def create_payment(self, request: PaymentRequest) -> dict[str, object]:
        """创建 Hosted Checkout Session。"""

        payload = self._checkout_payload(request)
        response = await self._request_json(
            "POST",
            "/checkout/session",
            payload=payload,
            context=f"clink.create_payment: order_no={request.order_no}",
        )
        data = self._object_field(response, "data", context="clink.create_payment")
        session_id = self._string_field(
            data,
            "sessionId",
            context=f"clink.create_payment: order_no={request.order_no}",
        )
        checkout_url = self._string_field(
            data, "url", context=f"clink.create_payment: order_no={request.order_no}"
        )
        self._validate_checkout_url(checkout_url, request.order_no)
        return {
            "sessionId": session_id,
            "checkoutUrl": checkout_url,
            "payment_url": checkout_url,
            "url": checkout_url,
        }

    async def create_subscription_management_url(
        self,
        *,
        channel_uid: str | None,
        return_url: str,
    ) -> str | None:
        """创建 ClinkBill Customer Portal Session。"""

        if not channel_uid:
            raise PaymentProviderError(
                "clink.create_subscription_management_url: customerId missing"
            )
        response = await self._request_json(
            "POST",
            "/billing/session",
            payload={"customerId": channel_uid, "returnUrl": return_url},
            context=(
                "clink.create_subscription_management_url: "
                f"customer_id={channel_uid}"
            ),
        )
        data = self._object_field(
            response,
            "data",
            context="clink.create_subscription_management_url",
        )
        portal_url = self._string_field(
            data,
            "url",
            context="clink.create_subscription_management_url",
        )
        self._validate_hosted_url(
            portal_url,
            expected_host=_PORTAL_HOSTS[self.config.environment],
            context=(
                "clink.create_subscription_management_url: "
                f"customer_id={channel_uid}"
            ),
        )
        return portal_url

    async def verify_callback(self, request: Request) -> CallbackVerificationResult:
        """按原始请求体验签并核对支付成功事件。"""

        body = await request.body()
        self._verify_signature(request, body)
        event = self._load_event(body)
        event_id = self._string_field(event, "id", context="clink.webhook")
        if not event_id.startswith("event_"):
            raise PaymentProviderError(
                f"clink.webhook: event id is not canonical: event_id={event_id}"
            )
        if event.get("object") != "event":
            raise PaymentProviderError(
                f"clink.webhook: object must be event: event_id={event_id}"
            )
        created = event.get("created")
        if type(created) is not int or created < 1_000_000_000_000:
            raise PaymentProviderError(
                f"clink.webhook: created must be milliseconds: event_id={event_id}"
            )
        event_type = self._string_field(
            event, "type", context=f"clink.webhook: event_id={event_id}"
        )
        if event_type not in {
            CLINK_ORDER_SUCCEEDED_EVENT,
            CLINK_INVOICE_PAID_EVENT,
        }:
            return CallbackVerificationResult(
                valid=True,
                processed=False,
                event=event_type,
                provider_data={
                    "clink_event_id": event_id,
                    "reason": "unsupported_event",
                },
            )
        data = self._object_field(
            event, "data", context=f"clink.webhook: event_id={event_id}"
        )
        event_object = self._object_field(
            data, "object", context=f"clink.webhook: event_id={event_id}"
        )
        if event_type == CLINK_ORDER_SUCCEEDED_EVENT:
            return await self._verify_order_succeeded(event_id, event_object)
        return await self._verify_invoice_paid(event_id, event_object)

    def _checkout_payload(self, request: PaymentRequest) -> dict[str, object]:
        """按本地订单快照生成 Clink Session 请求。"""

        if request.user_id is None or type(request.user_id) is not int:
            raise PaymentProviderError(
                "clink.create_payment: user_id missing: " f"order_no={request.order_no}"
            )
        amount = float(format_normalized_amount(request.amount))
        currency = normalize_currency(request.currency)
        payload: dict[str, object] = {
            "referenceCustomerId": str(request.user_id),
            "merchantReferenceId": request.order_no,
            "originalAmount": amount,
            "originalCurrency": currency,
            "uiMode": "hostedPage",
            "successUrl": self._website_return_url("success", request.order_no),
            "cancelUrl": self._website_return_url("cancel", request.order_no),
            "metadata": {"order_no": request.order_no},
        }
        if request.auto_renew:
            product_id, price_id = self._recurring_sku(request)
            payload.update({"productId": product_id, "priceId": price_id})
        else:
            payload["priceDataList"] = [
                {
                    "name": request.product_name,
                    "quantity": 1,
                    "unitAmount": amount,
                    "currency": currency,
                }
            ]
        return payload

    async def _verify_order_succeeded(
        self,
        event_id: str,
        event_object: dict[str, object],
    ) -> CallbackVerificationResult:
        """核对一次性 Order；recurring Order 仅确认接收。"""

        order_type = self._string_field(
            event_object, "type", context=f"clink.order_succeeded: event_id={event_id}"
        )
        if order_type == "recurring":
            return CallbackVerificationResult(
                valid=True,
                processed=False,
                event=CLINK_ORDER_SUCCEEDED_EVENT,
                provider_data={"clink_event_id": event_id, "is_recurring": True},
            )
        if order_type != "onetime":
            raise PaymentProviderError(
                "clink.order_succeeded: unsupported order type: "
                f"event_id={event_id}, order_type={order_type}"
            )

        order_no = self._string_field(
            event_object,
            "merchantReferenceId",
            context=f"clink.order_succeeded: event_id={event_id}",
        )
        clink_order_id = self._string_field(
            event_object,
            "orderId",
            context=f"clink.order_succeeded: event_id={event_id}",
        )
        session_id = self._string_field(
            event_object,
            "sessionId",
            context=f"clink.order_succeeded: event_id={event_id}",
        )
        context = (
            f"clink.order_succeeded: event_id={event_id}, order_id={clink_order_id}"
        )
        currency = normalize_currency(
            self._string_field(
                event_object,
                "originalCurrency",
                context=context,
            )
        )
        # 对账使用商品原币种定价，支付总额可能已由 Clink 换汇。
        items = event_object.get("priceDataList")
        if not isinstance(items, list) or not items:
            raise PaymentProviderError(
                f"{context}: priceDataList must be non-empty list"
            )
        amount = 0
        for index, item in enumerate(items):
            item_context = f"{context}, priceDataList[{index}]"
            if not isinstance(item, dict):
                raise PaymentProviderError(f"{item_context}: item must be object")
            item_currency = normalize_currency(
                self._string_field(item, "currency", context=item_context)
            )
            if item_currency != currency:
                raise PaymentProviderError(
                    f"{item_context}: currency mismatch: "
                    f"original_currency={currency}, item_currency={item_currency}"
                )
            quantity = item.get("quantity", 1)
            if type(quantity) is not int or quantity <= 0:
                raise PaymentProviderError(
                    f"{item_context}: quantity must be positive integer"
                )
            amount += (
                self._normalized_amount(item.get("unitAmount"), context=item_context)
                * quantity
            )
        await self._validate_local_order(
            order_no=order_no,
            session_id=session_id,
            amount=amount,
            currency=currency,
            context=(
                "clink.order_succeeded: "
                f"event_id={event_id}, order_id={clink_order_id}"
            ),
        )
        provider_data = {
            "clink_event_id": event_id,
            "clink_order_id": clink_order_id,
            "clink_session_id": session_id,
            "is_recurring": False,
            "clink_payment_amount": event_object.get("amountTotal"),
            "clink_payment_currency": event_object.get("paymentCurrency"),
        }
        return CallbackVerificationResult(
            valid=True,
            processed=True,
            event=CLINK_ORDER_SUCCEEDED_EVENT,
            order_no=order_no,
            channel_order_no=clink_order_id,
            amount=amount,
            currency=currency,
            transaction_id=clink_order_id,
            extra_metadata=self._metadata_json(provider_data),
            provider_data=provider_data,
        )

    async def _verify_invoice_paid(
        self,
        event_id: str,
        invoice: dict[str, object],
    ) -> CallbackVerificationResult:
        """查询 Subscription 双引用并核对自动续费 Invoice。"""

        invoice_id = self._string_field(
            invoice, "invoiceId", context=f"clink.invoice_paid: event_id={event_id}"
        )
        subscription_id = self._string_field(
            invoice,
            "subscriptionId",
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        clink_order_id = self._string_field(
            invoice,
            "orderId",
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        amount = self._normalized_amount(
            invoice.get("originalAmount"),
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        currency = normalize_currency(
            self._string_field(
                invoice,
                "originalCurrency",
                context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
            )
        )
        subscription_response = await self._request_json(
            "GET",
            f"/subscription/{quote(subscription_id, safe='')}",
            context=(
                "clink.invoice_paid.subscription: "
                f"event_id={event_id}, invoice_id={invoice_id}, "
                f"subscription_id={subscription_id}"
            ),
        )
        subscription = self._object_field(
            subscription_response,
            "data",
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        original_order_no = self._string_field(
            subscription,
            "merchantReference",
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        session_id = self._string_field(
            subscription,
            "sessionId",
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        customer_id = self._string_field(
            subscription,
            "customerId",
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        recurring_item = self._object_field(
            subscription,
            "recurringInvoiceItem",
            context=f"clink.invoice_paid: event_id={event_id}, invoice_id={invoice_id}",
        )
        period_end = recurring_item.get("periodEnd")
        if type(period_end) not in {str, int}:
            raise PaymentProviderError(
                "clink.invoice_paid: subscription expiration missing: "
                f"event_id={event_id}, subscription_id={subscription_id}"
            )
        await self._validate_local_order(
            order_no=original_order_no,
            session_id=session_id,
            amount=amount,
            currency=currency,
            context=(
                "clink.invoice_paid: "
                f"event_id={event_id}, invoice_id={invoice_id}, "
                f"subscription_id={subscription_id}, order_id={clink_order_id}"
            ),
        )
        provider_data = {
            "clink_event_id": event_id,
            "clink_invoice_id": invoice_id,
            "clink_subscription_id": subscription_id,
            "clink_order_id": clink_order_id,
            "clink_session_id": session_id,
            "is_recurring": True,
            "provider_subscription": {
                "channel_subscription_id": subscription_id,
                "original_order_no": original_order_no,
                "start_at": (
                    parse_timestamp_input(recurring_item["periodStart"])
                    if type(recurring_item.get("periodStart")) in {str, int}
                    else None
                ),
                "expires_at": parse_timestamp_input(period_end),
            },
        }
        return CallbackVerificationResult(
            valid=True,
            processed=True,
            event=CLINK_INVOICE_PAID_EVENT,
            channel_order_no=invoice_id,
            channel_uid=customer_id,
            amount=amount,
            currency=currency,
            transaction_id=clink_order_id,
            extra_metadata=self._metadata_json(provider_data),
            provider_data=provider_data,
            recurring_reference=RecurringPaymentReference(
                original_order_no=original_order_no
            ),
        )

    async def _validate_local_order(
        self,
        *,
        order_no: str,
        session_id: str,
        amount: int,
        currency: str,
        context: str,
    ) -> None:
        """核对本地订单渠道、Session、金额和币种。"""

        order = await order_service.get_order_by_no(order_no)
        if order is None:
            raise PaymentProviderError(
                f"{context}: local order missing: order_no={order_no}"
            )
        if order.payment_method != CLINK_PAYMENT_METHOD:
            raise PaymentProviderError(
                f"{context}: payment method mismatch: order_no={order_no}, "
                f"payment_method={order.payment_method}"
            )
        payment_data = self._load_object_json(
            order.payment_data,
            context=f"{context}: order_no={order_no}",
        )
        local_session_id = payment_data.get("sessionId")
        if local_session_id != session_id:
            raise PaymentProviderError(
                f"{context}: session mismatch: order_no={order_no}, "
                f"session_id={session_id}"
            )
        if order.amount != amount:
            raise PaymentProviderError(
                f"{context}: amount mismatch: order_no={order_no}, paid_amount={amount}"
            )
        if normalize_currency(order.currency) != currency:
            raise PaymentProviderError(
                f"{context}: currency mismatch: order_no={order_no}, "
                f"paid_currency={currency}"
            )

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, object] | None = None,
        context: str,
    ) -> dict[str, object]:
        """调用 Clink JSON API，只在错误中保留安全上下文。"""

        url = f"{self.config.api_base_url}{path}"
        try:
            async with httpx.AsyncClient(
                timeout=self.config.request_timeout_seconds
            ) as client:
                response = await client.request(
                    method,
                    url,
                    json=payload,
                    headers={
                        "X-API-Key": self.config.secret_key,
                        "X-Timestamp": str(timestamp_now()),
                        "Content-Type": "application/json",
                    },
                )
        except httpx.HTTPError as exc:
            raise PaymentProviderError(
                f"{context}: Clink request failed: path={path}, "
                f"error={type(exc).__name__}"
            ) from exc
        try:
            raw_data = response.json()
        except json.JSONDecodeError as exc:
            raise PaymentProviderError(
                f"{context}: Clink response is not JSON: path={path}, "
                f"status={response.status_code}"
            ) from exc
        if not isinstance(raw_data, dict):
            raise PaymentProviderError(
                f"{context}: Clink response must be object: path={path}, "
                f"status={response.status_code}"
            )
        data = cast(dict[str, object], raw_data)
        code = data.get("code")
        if not 200 <= response.status_code < 300 or code != 200:
            raise PaymentProviderError(
                f"{context}: Clink API rejected request: path={path}, "
                f"status={response.status_code}, code={code}"
            )
        return data

    def _verify_signature(self, request: Request, body: bytes) -> None:
        """验证 SignType、时间窗和原始 body HMAC。"""

        sign_type = request.headers.get("x-clink-signtype")
        timestamp_value = request.headers.get("x-clink-timestamp")
        signature = request.headers.get("x-clink-signature")
        if sign_type != "SHA256":
            raise PaymentProviderError("clink.webhook: X-Clink-SignType must be SHA256")
        try:
            timestamp = int(timestamp_value or "")
        except ValueError as exc:
            raise PaymentProviderError(
                "clink.webhook: X-Clink-Timestamp must be integer"
            ) from exc
        timestamp_seconds = (
            timestamp / 1000 if timestamp >= 100_000_000_000 else timestamp
        )
        if abs(time.time() - timestamp_seconds) > _WEBHOOK_TOLERANCE_SECONDS:
            raise PaymentProviderError(
                "clink.webhook: timestamp outside 300 second window"
            )
        expected = hmac.new(
            self.config.webhook_signing_key.encode("utf-8"),
            str(timestamp_value).encode("ascii") + b"." + body,
            hashlib.sha256,
        ).hexdigest()
        if not signature or not hmac.compare_digest(expected, signature.lower()):
            raise PaymentProviderError("clink.webhook: signature mismatch")

    @staticmethod
    def _parse_config(config: dict[str, object] | None) -> ClinkProviderConfig:
        """解析 ClinkBill 渠道配置，不在错误中回显密钥。"""

        if config is None:
            raise PaymentProviderError("clink.parse_config: config must be object")
        environment = ClinkPaymentProvider._string_field(
            config, "environment", context="clink.parse_config"
        )
        if environment not in _API_BASE_URLS:
            raise PaymentProviderError(
                "clink.parse_config: environment must be sandbox or live"
            )
        timeout = config.get("request_timeout_seconds")
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, int | float)
            or timeout <= 0
        ):
            raise PaymentProviderError(
                "clink.parse_config: request_timeout_seconds must be positive"
            )
        return ClinkProviderConfig(
            environment=environment,
            api_base_url=_API_BASE_URLS[environment],
            request_timeout_seconds=float(timeout),
            secret_key=ClinkPaymentProvider._string_field(
                config, "secret_key", context="clink.parse_config"
            ),
            webhook_signing_key=ClinkPaymentProvider._string_field(
                config, "webhook_signing_key", context="clink.parse_config"
            ),
        )

    @staticmethod
    def _string_field(data: dict[str, object], field: str, *, context: str) -> str:
        """读取必填非空字符串。"""

        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            raise PaymentProviderError(
                f"{context}: field {field} must be a non-empty string"
            )
        return value.strip()

    @staticmethod
    def _object_field(
        data: dict[str, object], field: str, *, context: str
    ) -> dict[str, object]:
        """读取必填 JSON 对象。"""

        value = data.get(field)
        if not isinstance(value, dict):
            raise PaymentProviderError(f"{context}: field {field} must be object")
        return cast(dict[str, object], value)

    @staticmethod
    def _load_event(body: bytes) -> dict[str, object]:
        """验签后解析 canonical event 对象。"""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise PaymentProviderError("clink.webhook: body is invalid JSON") from exc
        if not isinstance(data, dict):
            raise PaymentProviderError("clink.webhook: body must be object")
        return cast(dict[str, object], data)

    @staticmethod
    def _load_object_json(value: str | None, *, context: str) -> dict[str, object]:
        """解析订单支付入口 JSON。"""

        if not value:
            raise PaymentProviderError(f"{context}: payment_data missing")
        try:
            data = json.loads(value)
        except json.JSONDecodeError as exc:
            raise PaymentProviderError(
                f"{context}: payment_data is invalid JSON"
            ) from exc
        if not isinstance(data, dict):
            raise PaymentProviderError(f"{context}: payment_data must be object")
        return cast(dict[str, object], data)

    @staticmethod
    def _normalized_amount(value: object, *, context: str) -> int:
        """把 Clink 主币种金额严格转换为项目 6 位精度整数。"""

        if isinstance(value, bool) or not isinstance(value, int | float | str):
            raise PaymentProviderError(f"{context}: amount must be decimal")
        try:
            normalized = Decimal(str(value)) * Decimal(NORMALIZED_AMOUNT_FACTOR)
        except InvalidOperation as exc:
            raise PaymentProviderError(f"{context}: amount must be decimal") from exc
        if not normalized.is_finite():
            raise PaymentProviderError(f"{context}: amount must be finite")
        integral = normalized.to_integral_value()
        if normalized != integral or integral <= 0:
            raise PaymentProviderError(
                f"{context}: amount must be positive with at most 6 decimals"
            )
        return int(integral)

    @staticmethod
    def _metadata_json(data: dict[str, object]) -> str:
        """序列化已核对的 Clink 标识。"""

        return json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    def _recurring_sku(self, request: PaymentRequest) -> tuple[str, str]:
        """拆分 Clink recurring `<productId>:<priceId>`。"""

        parts = recurring_provider_sku_parts(
            request.payment_method, request.provider_sku
        )
        if parts is None:
            raise PaymentProviderError(
                "clink.create_payment: recurring provider_sku must be "
                f"<productId>:<priceId>: order_no={request.order_no}"
            )
        return parts[0], parts[1]

    def _website_return_url(self, result: str, order_no: str) -> str:
        """生成服务端配置的网站结算返回地址。"""

        base_url = settings.app.public_website_base_url.strip().rstrip("/")
        parsed = urlsplit(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise PaymentProviderError(
                "clink.create_payment: app.public_website_base_url is invalid"
            )
        return f"{base_url}/clink/{result}/?{urlencode({'order_no': order_no})}"

    def _validate_checkout_url(self, value: str, order_no: str) -> None:
        """只把当前环境的 Clink Hosted Checkout URL 返回客户端。"""

        self._validate_hosted_url(
            value,
            expected_host=_CHECKOUT_HOSTS[self.config.environment],
            context=f"clink.create_payment: order_no={order_no}",
        )

    def _validate_hosted_url(
        self,
        value: str,
        *,
        expected_host: str,
        context: str,
    ) -> None:
        """只允许当前环境的 Clink HTTPS Hosted 页面。"""

        parsed = urlsplit(value)
        if parsed.scheme != "https" or parsed.hostname != expected_host:
            raise PaymentProviderError(
                f"{context}: hosted URL host mismatch: expected_host={expected_host}"
            )
