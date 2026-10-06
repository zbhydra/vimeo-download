"""ClinkBill Provider 请求映射、验签与支付对账测试。"""

from dataclasses import dataclass
import hashlib
import hmac
import json
import time

import httpx
import pytest
from starlette.requests import Request

from app.core.config import settings
from app.provider.payment.clink import (
    CLINK_INVOICE_PAID_EVENT,
    CLINK_ORDER_SUCCEEDED_EVENT,
    CLINK_PAYMENT_METHOD,
    ClinkPaymentProvider,
)
from app.provider.payment.payment_base import PaymentProviderError, PaymentRequest
from app.services.config_payment_channel_service import config_payment_channel_service
from app.services.order_service import order_service
from app.services.payment_service import payment_service

_WEBHOOK_KEY = "pytest-webhook-key"


@dataclass
class _Order:
    """Provider 对账所需的最小本地订单快照。"""

    order_no: str = "ORDER-CLINK-1"
    payment_method: str = CLINK_PAYMENT_METHOD
    payment_data: str = '{"sessionId":"sess_test"}'
    amount: int = 12_345_678
    currency: str = "USD"


@dataclass
class _Channel:
    """历史渠道配置读取所需的最小快照。"""

    config_json: str


def _provider() -> ClinkPaymentProvider:
    """构造不含真实密钥的 Sandbox Provider。"""

    return ClinkPaymentProvider(
        {
            "environment": "sandbox",
            "request_timeout_seconds": 3,
            "secret_key": "pytest-secret-key",
            "webhook_signing_key": _WEBHOOK_KEY,
        }
    )


def _payment_request(
    *, auto_renew: bool, provider_sku: str | None = None
) -> PaymentRequest:
    """构造 Clink Session 测试请求。"""

    return PaymentRequest(
        order_no="ORDER-CLINK-1",
        payment_method=CLINK_PAYMENT_METHOD,
        order_status=1,
        amount=12_345_678,
        currency="usd",
        product_name="Pro Plan",
        expired_at=4_102_444_800_000,
        user_id=987654,
        auto_renew=auto_renew,
        provider_sku=provider_sku,
    )


def _install_transport(monkeypatch, handler) -> None:
    """替换 Clink 外部 HTTP 出口。"""

    original_client = httpx.AsyncClient

    def client_factory(*, timeout: float) -> httpx.AsyncClient:
        return original_client(
            timeout=timeout,
            transport=httpx.MockTransport(handler),
        )

    monkeypatch.setattr(
        "app.provider.payment.clink.httpx.AsyncClient",
        client_factory,
    )


def _callback_request(
    payload: dict[str, object],
    *,
    timestamp: int | None = None,
    sign_type: str = "SHA256",
    signing_body: bytes | None = None,
) -> Request:
    """构造带真实原始 body HMAC 的 ASGI Request。"""

    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    signed_body = body if signing_body is None else signing_body
    timestamp_value = timestamp if timestamp is not None else int(time.time())
    signature = hmac.new(
        _WEBHOOK_KEY.encode("utf-8"),
        str(timestamp_value).encode("ascii") + b"." + signed_body,
        hashlib.sha256,
    ).hexdigest()
    sent = False

    async def receive() -> dict[str, object]:
        nonlocal sent
        if sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/callback/clink/payment",
            "headers": [
                (b"x-clink-timestamp", str(timestamp_value).encode("ascii")),
                (b"x-clink-signature", signature.encode("ascii")),
                (b"x-clink-signtype", sign_type.encode("ascii")),
            ],
        },
        receive,
    )


def _event(event_type: str, event_object: dict[str, object]) -> dict[str, object]:
    """构造 canonical Clink event envelope。"""

    return {
        "id": "event_test_1",
        "object": "event",
        "created": int(time.time() * 1000),
        "type": event_type,
        "data": {"object": event_object},
    }


def _one_time_order() -> dict[str, object]:
    """构造一次性支付成功对象。"""

    return {
        "type": "onetime",
        "orderId": "ord_clink_1",
        "merchantReferenceId": "ORDER-CLINK-1",
        "sessionId": "sess_test",
        "originalCurrency": "USD",
        "priceDataList": [{"unitAmount": 12.345678, "quantity": 1, "currency": "USD"}],
        "amountTotal": 12.345678,
        "paymentCurrency": "USD",
    }


@pytest.mark.asyncio
async def test_subscription_management_creates_customer_portal_session(monkeypatch):
    """管理入口按 customerId 创建 Clink Customer Portal Session。"""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/billing/session"
        assert json.loads(request.content) == {
            "customerId": "customer_test",
            "returnUrl": "https://example.com/ext-pricing/",
        }
        return httpx.Response(
            200,
            json={"code": 200, "data": {"url": "https://uat-portal.clinkbill.com/s/1"}},
        )

    _install_transport(monkeypatch, handler)
    url = await _provider().create_subscription_management_url(
        channel_uid="customer_test",
        return_url="https://example.com/ext-pricing/",
    )

    assert url == "https://uat-portal.clinkbill.com/s/1"


@pytest.mark.asyncio
async def test_subscription_management_rejects_other_environment_portal(monkeypatch):
    """Sandbox Provider 不接受 Live Customer Portal URL。"""

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"code": 200, "data": {"url": "https://portal.clinkbill.com/s/1"}},
        )

    _install_transport(monkeypatch, handler)

    with pytest.raises(PaymentProviderError, match="host mismatch"):
        await _provider().create_subscription_management_url(
            channel_uid="customer_test",
            return_url="https://example.com/ext-pricing/",
        )


@pytest.mark.asyncio
async def test_historical_disabled_channel_still_builds_clink_provider(monkeypatch):
    """历史订单直接按 channel_code 读取非缓存配置，不要求渠道仍启用。"""

    async def get_channel(channel_code: str) -> _Channel:
        assert channel_code == CLINK_PAYMENT_METHOD
        return _Channel(
            json.dumps(
                {
                    "environment": "sandbox",
                    "request_timeout_seconds": 3,
                    "secret_key": "pytest-secret-key",
                    "webhook_signing_key": _WEBHOOK_KEY,
                }
            )
        )

    monkeypatch.setattr(
        config_payment_channel_service,
        "get_by_channel_code",
        get_channel,
    )
    provider = await payment_service.get_provider_for_existing_payment(
        CLINK_PAYMENT_METHOD
    )

    assert isinstance(provider, ClinkPaymentProvider)


@pytest.mark.asyncio
async def test_create_one_time_session_maps_six_decimal_amount(monkeypatch):
    """一次性 Session 发送 priceDataList，并解析 Hosted Checkout 响应。"""

    monkeypatch.setattr(
        settings.app,
        "public_website_base_url",
        "https://telegramdownloadmedia.com",
    )
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "code": 200,
                "msg": "success",
                "data": {
                    "sessionId": "sess_test",
                    "url": "https://uat-checkout.clinkbill.com/pay/token",
                },
            },
        )

    _install_transport(monkeypatch, handler)
    result = await _provider().create_payment(_payment_request(auto_renew=False))
    payload = json.loads(requests[0].content)

    assert requests[0].url.path == "/api/checkout/session"
    assert requests[0].headers["x-api-key"] == "pytest-secret-key"
    assert int(requests[0].headers["x-timestamp"]) > 0
    assert payload["referenceCustomerId"] == "987654"
    assert payload["merchantReferenceId"] == "ORDER-CLINK-1"
    assert payload["originalAmount"] == 12.345678
    assert payload["originalCurrency"] == "USD"
    assert payload["successUrl"] == (
        "https://telegramdownloadmedia.com/clink/success/?order_no=ORDER-CLINK-1"
    )
    assert payload["cancelUrl"] == (
        "https://telegramdownloadmedia.com/clink/cancel/?order_no=ORDER-CLINK-1"
    )
    assert payload["priceDataList"] == [
        {
            "name": "Pro Plan",
            "quantity": 1,
            "unitAmount": 12.345678,
            "currency": "USD",
        }
    ]
    assert "productId" not in payload
    assert result == {
        "sessionId": "sess_test",
        "checkoutUrl": "https://uat-checkout.clinkbill.com/pay/token",
        "payment_url": "https://uat-checkout.clinkbill.com/pay/token",
        "url": "https://uat-checkout.clinkbill.com/pay/token",
    }


@pytest.mark.asyncio
async def test_create_recurring_session_uses_product_and_price(monkeypatch):
    """自动续费 Session 只发送 provider_sku 中的 Product/Price。"""

    payloads: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payloads.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "code": 200,
                "data": {
                    "sessionId": "sess_test",
                    "url": "https://uat-checkout.clinkbill.com/pay/token",
                },
            },
        )

    _install_transport(monkeypatch, handler)
    await _provider().create_payment(
        _payment_request(auto_renew=True, provider_sku="prd_test:price_test")
    )

    assert payloads[0]["productId"] == "prd_test"
    assert payloads[0]["priceId"] == "price_test"
    assert "priceDataList" not in payloads[0]


@pytest.mark.asyncio
async def test_clink_api_error_does_not_expose_secrets(monkeypatch):
    """Clink 非 2xx 错误不回显密钥或上游消息。"""

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            json={
                "code": 401,
                "msg": "pytest-secret-key pytest-webhook-key",
            },
        )

    _install_transport(monkeypatch, handler)
    with pytest.raises(PaymentProviderError) as caught:
        await _provider().create_payment(_payment_request(auto_renew=False))

    message = str(caught.value)
    assert "pytest-secret-key" not in message
    assert "pytest-webhook-key" not in message
    assert "status=401, code=401" in message


@pytest.mark.asyncio
async def test_signed_one_time_order_is_reconciled(monkeypatch):
    """有效原始 body HMAC 后核对 Session、渠道、金额和币种。"""

    async def get_order(order_no: str) -> _Order:
        assert order_no == "ORDER-CLINK-1"
        return _Order()

    monkeypatch.setattr(order_service, "get_order_by_no", get_order)
    verified = await _provider().verify_callback(
        _callback_request(_event(CLINK_ORDER_SUCCEEDED_EVENT, _one_time_order()))
    )

    assert verified.valid is True
    assert verified.processed is True
    assert verified.order_no == "ORDER-CLINK-1"
    assert verified.channel_order_no == "ord_clink_1"
    assert verified.amount == 12_345_678
    assert verified.currency == "USD"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sign_type", "timestamp", "signing_body", "message"),
    [
        ("MD5", None, None, "SignType"),
        ("SHA256", 1, None, "300 second"),
        ("SHA256", None, b"tampered", "signature mismatch"),
    ],
)
async def test_webhook_rejects_invalid_signature_contract(
    sign_type: str,
    timestamp: int | None,
    signing_body: bytes | None,
    message: str,
):
    """错误 SignType、过期时间戳和被篡改 body 均拒绝。"""

    request = _callback_request(
        _event(CLINK_ORDER_SUCCEEDED_EVENT, _one_time_order()),
        sign_type=sign_type,
        timestamp=timestamp,
        signing_body=signing_body,
    )
    with pytest.raises(PaymentProviderError, match=message):
        await _provider().verify_callback(request)


@pytest.mark.asyncio
async def test_recurring_order_succeeded_is_acknowledged_without_fulfillment():
    """recurring Order 验签后标记为未处理，履约只认 Invoice。"""

    verified = await _provider().verify_callback(
        _callback_request(
            _event(
                CLINK_ORDER_SUCCEEDED_EVENT,
                {"type": "recurring"},
            )
        )
    )

    assert verified.valid is True
    assert verified.processed is False


@pytest.mark.asyncio
async def test_signed_unsupported_event_is_acknowledged_without_fulfillment():
    """已验签但未支持的事件返回明确忽略结果。"""

    verified = await _provider().verify_callback(
        _callback_request(_event("subscription.created", {}))
    )

    assert verified.valid is True
    assert verified.processed is False
    assert verified.event == "subscription.created"
    assert verified.provider_data == {
        "clink_event_id": "event_test_1",
        "reason": "unsupported_event",
    }


@pytest.mark.asyncio
async def test_invoice_paid_uses_subscription_double_reference(monkeypatch):
    """Invoice 查询 Subscription 双引用，并用 invoiceId 映射幂等流水。"""

    async def get_order(order_no: str) -> _Order:
        assert order_no == "ORDER-CLINK-1"
        return _Order()

    monkeypatch.setattr(order_service, "get_order_by_no", get_order)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/subscription/sub_test"
        return httpx.Response(
            200,
            json={
                "code": 200,
                "data": {
                    "merchantReference": "ORDER-CLINK-1",
                    "sessionId": "sess_test",
                    "customerId": "customer_test",
                    "recurringInvoiceItem": {
                        "periodStart": "2026-09-02T12:00:00Z",
                        "periodEnd": "2026-10-02T12:00:00Z",
                    },
                },
            },
        )

    _install_transport(monkeypatch, handler)
    verified = await _provider().verify_callback(
        _callback_request(
            _event(
                CLINK_INVOICE_PAID_EVENT,
                {
                    "invoiceId": "inv_test",
                    "subscriptionId": "sub_test",
                    "orderId": "ord_recurring_test",
                    "originalAmount": "12.345678",
                    "originalCurrency": "USD",
                },
            )
        )
    )

    assert verified.channel_order_no == "inv_test"
    assert verified.channel_uid == "customer_test"
    assert verified.transaction_id == "ord_recurring_test"
    assert verified.recurring_reference.original_order_no == "ORDER-CLINK-1"
    assert verified.provider_data == {
        "clink_event_id": "event_test_1",
        "clink_invoice_id": "inv_test",
        "clink_subscription_id": "sub_test",
        "clink_order_id": "ord_recurring_test",
        "clink_session_id": "sess_test",
        "is_recurring": True,
        "provider_subscription": {
            "channel_subscription_id": "sub_test",
            "original_order_no": "ORDER-CLINK-1",
            "start_at": 1_788_350_400_000,
            "expires_at": 1_790_942_400_000,
        },
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("sessionId", "sess_other", "session mismatch"),
        (
            "priceDataList",
            [{"unitAmount": 10, "quantity": 1, "currency": "USD"}],
            "amount mismatch",
        ),
        ("originalCurrency", "EUR", "currency mismatch"),
        ("priceDataList", [], "non-empty list"),
        ("priceDataList", [None], "item must be object"),
        (
            "priceDataList",
            [{"unitAmount": 12.345678, "quantity": True, "currency": "USD"}],
            "quantity must be positive integer",
        ),
        (
            "priceDataList",
            [{"unitAmount": "NaN", "currency": "USD"}],
            "amount must be finite",
        ),
    ],
)
async def test_one_time_order_rejects_reconciliation_mismatch(
    monkeypatch,
    field: str,
    value: object,
    message: str,
):
    """一次性 Order 任一对账字段不一致即拒绝。"""

    async def get_order(_order_no: str) -> _Order:
        return _Order()

    monkeypatch.setattr(order_service, "get_order_by_no", get_order)
    event_object = _one_time_order()
    event_object[field] = value

    with pytest.raises(PaymentProviderError, match=message):
        await _provider().verify_callback(
            _callback_request(_event(CLINK_ORDER_SUCCEEDED_EVENT, event_object))
        )
