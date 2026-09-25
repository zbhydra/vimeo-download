"""PayPal Checkout 支付 provider 测试。"""

import json
from dataclasses import dataclass, field

import httpx
import pytest
from fastapi import Request
from sqlalchemy import delete

from app.constants.order import OrderCreateParam, ProductClass
from app.constants.payment import PAYPAL_CURRENCY, PAYPAL_PAYMENT_METHOD
from app.core.database import get_async_session
from app.models.order_model import OrderModel
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.provider.payment.payment_base import PaymentProviderError, PaymentRequest
from app.provider.payment.paypal import (
    PAYPAL_APPROVED_EVENT,
    PAYPAL_CAPTURE_COMPLETED_EVENT,
    PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
    PayPalPaymentProvider,
    PayPalSubscriptionStatus,
)
from app.services.order_service import order_service


@dataclass
class _CleanupState:
    """记录本测试文件创建的数据，teardown 时统一删除。"""

    order_nos: list[str] = field(default_factory=list)
    user_ids: list[int] = field(default_factory=list)


class _FakeRedis:
    """PayPal 单元测试用 Redis 替身，只覆盖 token 缓存所需方法。"""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        """读取缓存 token。"""

        return self.values.get(key)

    async def set(self, key: str, value: str, *, ex: int) -> bool:
        """写入缓存 token 和 TTL。"""

        self.values[key] = value
        self.ttls[key] = ex
        return True


@pytest.fixture
async def paypal_payment_cleanup():
    """清理 PayPal payment 测试写入的数据。"""

    state = _CleanupState()
    yield state

    async with get_async_session() as db:
        if state.order_nos:
            await db.execute(
                delete(OrderModel).where(OrderModel.order_no.in_(state.order_nos))
            )
        if state.user_ids:
            await db.execute(
                delete(UserCreditLogModel).where(
                    UserCreditLogModel.user_id.in_(state.user_ids)
                )
            )
            await db.execute(
                delete(UserCreditAccountModel).where(
                    UserCreditAccountModel.user_id.in_(state.user_ids)
                )
            )
        await db.commit()


def _paypal_provider() -> PayPalPaymentProvider:
    """创建测试用 PayPal provider。"""

    return PayPalPaymentProvider(
        {
            "client_id": "client-id",
            "client_secret": "client-secret",
            "webhook_id": "webhook-id",
            "request_timeout_seconds": 3,
        }
    )


@pytest.mark.asyncio
async def test_subscription_management_returns_paypal_automatic_payments_page():
    """PayPal 管理入口固定返回官方 Automatic Payments 页面。"""

    url = await _paypal_provider().create_subscription_management_url(
        channel_uid="payer-id",
        return_url="https://example.com/pricing/",
    )

    assert url == "https://www.paypal.com/myaccount/autopay/"


def _install_subscription_status(monkeypatch, provider: PayPalPaymentProvider) -> None:
    """用确定的渠道查询结果替换 PayPal 外部出口。"""

    async def get_subscription_status(
        subscription_id: str,
    ) -> PayPalSubscriptionStatus:
        assert subscription_id == "PAYPAL-SUB-123"
        return PayPalSubscriptionStatus(
            subscription_id=subscription_id,
            status="ACTIVE",
            status_update_time=None,
            next_billing_time="2026-10-02T12:00:00Z",
            last_payment_time="2026-09-02T12:00:00Z",
        )

    monkeypatch.setattr(provider, "get_subscription_status", get_subscription_status)


def _paypal_order_response(order_no: str) -> dict[str, object]:
    """构造 PayPal create order 响应。"""

    return {
        "id": "PAYPAL-ORDER-123",
        "links": [
            {
                "rel": "approve",
                "href": (
                    "https://www.sandbox.paypal.com/checkoutnow?"
                    "token=PAYPAL-ORDER-123"
                ),
            }
        ],
        "purchase_units": [{"reference_id": order_no}],
    }


def _paypal_payer_action_order_response(order_no: str) -> dict[str, object]:
    """构造 PayPal 当前沙箱返回的 payer-action 跳转响应。"""

    return {
        "id": "PAYPAL-ORDER-123",
        "status": "PAYER_ACTION_REQUIRED",
        "links": [
            {
                "href": "https://api-m.sandbox.paypal.com/v2/checkout/orders/PAYPAL-ORDER-123",
                "rel": "self",
                "method": "GET",
            },
            {
                "href": (
                    "https://www.sandbox.paypal.com/checkoutnow?"
                    "token=PAYPAL-ORDER-123"
                ),
                "rel": "payer-action",
                "method": "GET",
            },
        ],
        "purchase_units": [{"reference_id": order_no}],
    }


def _paypal_subscription_response() -> dict[str, object]:
    """构造 PayPal create subscription 响应。"""

    return {
        "id": "PAYPAL-SUB-123",
        "status": "APPROVAL_PENDING",
        "links": [
            {
                "rel": "approve",
                "href": (
                    "https://www.sandbox.paypal.com/webapps/billing/"
                    "subscriptions?ba_token=BA-123"
                ),
            }
        ],
    }


def _paypal_capture_response(order_no: str) -> dict[str, object]:
    """构造 PayPal capture order 响应。"""

    return {
        "id": "PAYPAL-ORDER-123",
        "status": "COMPLETED",
        "payer": {"payer_id": "PAYER-123"},
        "purchase_units": [
            {
                "reference_id": order_no,
                "payments": {
                    "captures": [
                        {
                            "id": "CAPTURE-123",
                            "status": "COMPLETED",
                            "amount": {
                                "currency_code": PAYPAL_CURRENCY,
                                "value": "15.30",
                            },
                        }
                    ]
                },
            }
        ],
    }


def _paypal_subscription_sale_event(
    *,
    sale_id: str = "SALE-123",
    subscription_id: str = "PAYPAL-SUB-123",
    order_no: str = "ORDPAYPAL123",
) -> dict[str, object]:
    """构造 PayPal subscription sale completed webhook event。"""

    return {
        "event_type": PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
        "resource": {
            "id": sale_id,
            "billing_agreement_id": subscription_id,
            "custom_id": order_no,
            "amount": {
                "currency": PAYPAL_CURRENCY,
                "total": "15.30",
            },
            "payer": {
                "payer_info": {
                    "payer_id": "PAYER-123",
                },
            },
        },
    }


def _install_paypal_transport(monkeypatch, handler) -> None:
    """用 MockTransport 替换 PayPal provider 内部 HTTP 出站请求。"""

    real_async_client = httpx.AsyncClient

    def factory(**kwargs):
        return real_async_client(
            transport=httpx.MockTransport(handler),
            **kwargs,
        )

    monkeypatch.setattr("app.provider.payment.paypal.httpx.AsyncClient", factory)


def _install_fake_redis(
    monkeypatch, fake_redis: _FakeRedis | None = None
) -> _FakeRedis:
    """替换 PayPal provider 内部 Redis client。"""

    redis = fake_redis or _FakeRedis()

    async def fake_get_client():
        return redis

    monkeypatch.setattr(
        "app.provider.payment.paypal.redis_client.get_client",
        fake_get_client,
    )
    return redis


def _make_callback_request(body: bytes) -> Request:
    """构造一个仅携带 webhook body 的 FastAPI Request，用于 verify_callback 单元测试。

    签名校验由各测试 monkeypatch provider._verify_webhook_signature 跳过，
    因此 Request 不需要携带真实 PayPal webhook header。
    """

    request = Request({"type": "http", "method": "POST", "headers": []})
    request._body = body  # noqa: SLF001
    return request


def _bypass_callback_signature(
    monkeypatch,
    provider: PayPalPaymentProvider,
) -> None:
    """跳过 PayPal webhook 签名校验，便于聚焦测试 verify_callback 的协议层输出。"""

    async def noop_verify(request: Request, event: dict[str, object]) -> None:
        return None

    monkeypatch.setattr(provider, "_verify_webhook_signature", noop_verify)


def _paypal_oauth_response(token: str = "access-token") -> dict[str, object]:
    """构造 PayPal OAuth token 响应。"""

    return {
        "access_token": token,
        "expires_in": 3600,
    }


def test_paypal_amount_requires_usd_cent_precision():
    """PayPal USD 只接受可无损表示为两位小数的 6 位内部金额。"""

    provider = _paypal_provider()

    assert (
        provider._paypal_amount_value(
            15_300_000, order_no="ORDPAYPAL123"
        )  # noqa: SLF001
        == "15.30"
    )
    with pytest.raises(PaymentProviderError, match="2 decimal places"):
        provider._paypal_amount_value(
            15_301_000, order_no="ORDPAYPAL123"
        )  # noqa: SLF001
    with pytest.raises(PaymentProviderError, match="non-negative"):
        provider._paypal_amount_value(-10_000, order_no="ORDPAYPAL123")  # noqa: SLF001


def test_paypal_callback_amount_rejects_unrepresentable_values():
    """PayPal 回调金额解析不能静默截断超过内部精度或 USD 两位精度的金额。"""

    provider = _paypal_provider()

    assert provider._amount_from_paypal_value("15.30") == 15_300_000  # noqa: SLF001
    with pytest.raises(PaymentProviderError, match="exceeds 6 decimals"):
        provider._amount_from_paypal_value("1.2345678")  # noqa: SLF001
    with pytest.raises(PaymentProviderError, match="2 decimal places"):
        provider._amount_from_paypal_value("1.234567")  # noqa: SLF001


@pytest.mark.asyncio
async def test_create_payment_returns_unified_payment_url_and_channel_order_id(
    monkeypatch,
):
    """create_payment 返回统一 payment_url 和 channel_order_id。"""

    fake_redis = _install_fake_redis(monkeypatch)
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json=_paypal_oauth_response())
        if request.url.path == "/v2/checkout/orders":
            body = json.loads(request.content)
            assert body["intent"] == "CAPTURE"
            assert body["purchase_units"][0]["reference_id"] == "ORDPAYPAL123"
            assert body["purchase_units"][0]["amount"] == {
                "currency_code": PAYPAL_CURRENCY,
                "value": "15.30",
            }
            return httpx.Response(200, json=_paypal_order_response("ORDPAYPAL123"))
        raise AssertionError(f"Unexpected PayPal request: {request.url}")

    _install_paypal_transport(monkeypatch, handler)

    payment_data = await _paypal_provider().create_payment(
        PaymentRequest(
            order_no="ORDPAYPAL123",
            payment_method=PAYPAL_PAYMENT_METHOD,
            order_status=1,
            amount=15_300_000,
            currency=PAYPAL_CURRENCY,
            product_name="200 Credits",
            expired_at=4_102_444_800_000,
        )
    )

    assert calls == ["/v1/oauth2/token", "/v2/checkout/orders"]
    assert payment_data["channel_order_id"] == "PAYPAL-ORDER-123"
    assert payment_data["payment_url"] == (
        "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-123"
    )
    assert list(fake_redis.values.values()) == ["access-token"]
    assert list(fake_redis.ttls.values()) == [3540]


@pytest.mark.asyncio
async def test_create_payment_accepts_paypal_payer_action_link(monkeypatch):
    """create_payment 接受 PayPal Orders v2 当前返回的 payer-action 链接。"""

    _install_fake_redis(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json=_paypal_oauth_response())
        if request.url.path == "/v2/checkout/orders":
            return httpx.Response(
                200,
                json=_paypal_payer_action_order_response("ORDPAYPAL123"),
            )
        raise AssertionError(f"Unexpected PayPal request: {request.url}")

    _install_paypal_transport(monkeypatch, handler)

    payment_data = await _paypal_provider().create_payment(
        PaymentRequest(
            order_no="ORDPAYPAL123",
            payment_method=PAYPAL_PAYMENT_METHOD,
            order_status=1,
            amount=15_300_000,
            currency=PAYPAL_CURRENCY,
            product_name="200 Credits",
            expired_at=4_102_444_800_000,
        )
    )

    assert payment_data["payment_url"] == (
        "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-123"
    )


@pytest.mark.asyncio
async def test_create_auto_renew_payment_uses_paypal_subscription_plan(monkeypatch):
    """自动续费订单用 PayPal Billing Subscription，provider_sku 作为 plan_id。"""

    _install_fake_redis(monkeypatch)
    calls: list[tuple[str, dict[str, object]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json=_paypal_oauth_response())
        body = json.loads(request.content)
        calls.append((request.url.path, body))
        if request.url.path == "/v1/billing/subscriptions":
            assert body["plan_id"] == "P-5ML4271244454362WXNWU5NQ"
            assert body["custom_id"] == "ORDPAYPAL123"
            assert body["application_context"]["user_action"] == "SUBSCRIBE_NOW"
            assert body["application_context"]["shipping_preference"] == "NO_SHIPPING"
            return httpx.Response(200, json=_paypal_subscription_response())
        raise AssertionError(f"Unexpected PayPal request: {request.url}")

    _install_paypal_transport(monkeypatch, handler)

    payment_data = await _paypal_provider().create_payment(
        PaymentRequest(
            order_no="ORDPAYPAL123",
            payment_method=PAYPAL_PAYMENT_METHOD,
            order_status=1,
            amount=15_300_000,
            currency=PAYPAL_CURRENCY,
            product_name="Unlimited",
            expired_at=4_102_444_800_000,
            auto_renew=True,
            provider_sku="P-5ML4271244454362WXNWU5NQ",
        )
    )

    assert [path for path, _body in calls] == ["/v1/billing/subscriptions"]
    assert payment_data["channel_order_id"] == "PAYPAL-SUB-123"
    assert payment_data["paypal_subscription_id"] == "PAYPAL-SUB-123"
    assert payment_data["paypal_plan_id"] == "P-5ML4271244454362WXNWU5NQ"
    assert payment_data["payment_url"] == (
        "https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-123"
    )


@pytest.mark.parametrize("provider_sku", [None, "P-PLAN-123"])
def test_create_auto_renew_payment_requires_canonical_provider_sku(provider_sku):
    """PayPal 自动续费 SKU 必须符合官方 Plan ID 格式。"""

    with pytest.raises(PaymentProviderError, match="provider_sku invalid"):
        _paypal_provider()._validate_payment_request(  # noqa: SLF001
            PaymentRequest(
                order_no="ORDPAYPAL123",
                payment_method=PAYPAL_PAYMENT_METHOD,
                order_status=1,
                amount=15_300_000,
                currency=PAYPAL_CURRENCY,
                product_name="Unlimited",
                expired_at=4_102_444_800_000,
                auto_renew=True,
                provider_sku=provider_sku,
            )
        )


@pytest.mark.asyncio
async def test_create_payment_reuses_cached_paypal_access_token(monkeypatch):
    """create_payment 复用 Redis 中的 PayPal access token，避免重复 OAuth。"""

    provider = _paypal_provider()
    fake_redis = _install_fake_redis(monkeypatch)
    fake_redis.values[provider._access_token_cache_key()] = "cached-access-token"
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.url.path, request.headers.get("authorization", "")))
        if request.url.path == "/v2/checkout/orders":
            return httpx.Response(200, json=_paypal_order_response("ORDPAYPAL123"))
        raise AssertionError(f"Unexpected PayPal request: {request.url}")

    _install_paypal_transport(monkeypatch, handler)

    await provider.create_payment(
        PaymentRequest(
            order_no="ORDPAYPAL123",
            payment_method=PAYPAL_PAYMENT_METHOD,
            order_status=1,
            amount=15_300_000,
            currency=PAYPAL_CURRENCY,
            product_name="200 Credits",
            expired_at=4_102_444_800_000,
        )
    )

    assert calls == [("/v2/checkout/orders", "Bearer cached-access-token")]


@pytest.mark.asyncio
async def test_order_payment_data_save_snapshots_paypal_channel_order_id(
    paypal_payment_cleanup: _CleanupState,
):
    """保存支付入口数据时同步保存 PayPal 渠道订单号。"""

    order = await order_service.create_order(
        OrderCreateParam(
            user_id=9_900_000_001,
            product_class=ProductClass.RECHARGE.value,
            product_id="credit_200",
            product_name="200 Credits",
            amount=15_300_000,
            payment_method=PAYPAL_PAYMENT_METHOD,
            currency=PAYPAL_CURRENCY,
            extra_metadata=json.dumps(
                {"product_snapshot": {"credits_amount": 200}},
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )
    )
    paypal_payment_cleanup.order_nos.append(order.order_no)
    paypal_payment_cleanup.user_ids.append(order.user_id)

    saved = await order_service.save_order_payment_data(
        order_no=order.order_no,
        payment_data={
            "payment_url": "https://www.sandbox.paypal.com/checkoutnow?token=1",
            "channel_order_id": "PAYPAL-ORDER-123",
        },
    )
    updated_order = await order_service.get_order_by_no(order.order_no)

    assert saved is True
    assert updated_order is not None
    assert updated_order.payment_channel_order_no == "PAYPAL-ORDER-123"


@pytest.mark.asyncio
async def test_approved_webhook_captures_order_and_returns_success_result(
    monkeypatch,
):
    """CHECKOUT.ORDER.APPROVED webhook 内部 capture 后返回统一成功结果。"""

    _install_fake_redis(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json=_paypal_oauth_response())
        if request.url.path == "/v2/checkout/orders/PAYPAL-ORDER-123/capture":
            return httpx.Response(200, json=_paypal_capture_response("ORDPAYPAL123"))
        raise AssertionError(f"Unexpected PayPal request: {request.url}")

    _install_paypal_transport(monkeypatch, handler)

    async def fake_get_order_by_no(order_no: str):
        class FakeOrder:
            order_no = "ORDPAYPAL123"
            currency = PAYPAL_CURRENCY
            amount = 15_300_000

        assert order_no == "ORDPAYPAL123"
        return FakeOrder()

    monkeypatch.setattr(order_service, "get_order_by_no", fake_get_order_by_no)

    verified = await _paypal_provider()._handle_order_approved(  # noqa: SLF001
        {"id": "PAYPAL-ORDER-123"}
    )

    assert verified.valid is True
    assert verified.event == PAYPAL_APPROVED_EVENT
    assert verified.order_no == "ORDPAYPAL123"
    assert verified.channel_order_no == "PAYPAL-ORDER-123"
    assert verified.transaction_id == "CAPTURE-123"
    assert verified.amount == 15_300_000
    assert verified.currency == PAYPAL_CURRENCY


@pytest.mark.asyncio
async def test_capture_completed_webhook_uses_saved_paypal_order_id(monkeypatch):
    """PAYMENT.CAPTURE.COMPLETED 把 custom_id 解析为本地订单号，不携带续费引用。"""

    provider = _paypal_provider()
    _bypass_callback_signature(monkeypatch, provider)
    _install_subscription_status(monkeypatch, provider)

    event = {
        "event_type": PAYPAL_CAPTURE_COMPLETED_EVENT,
        "resource": {
            "id": "CAPTURE-123",
            "custom_id": "ORDPAYPAL123",
            "amount": {"currency_code": PAYPAL_CURRENCY, "value": "15.30"},
            "supplementary_data": {"related_ids": {"order_id": "PAYPAL-ORDER-123"}},
        },
    }

    verified = await provider.verify_callback(
        _make_callback_request(json.dumps(event).encode("utf-8"))
    )

    assert verified.valid is True
    assert verified.event == PAYPAL_CAPTURE_COMPLETED_EVENT
    assert verified.order_no == "ORDPAYPAL123"
    assert verified.channel_order_no == "PAYPAL-ORDER-123"
    assert verified.transaction_id == "CAPTURE-123"
    assert verified.recurring_reference.original_order_no is None


@pytest.mark.asyncio
async def test_subscription_sale_first_payment_keeps_subscription_id(monkeypatch):
    """订阅首期扣款 sale：sale id 作为 channel_order_no，携带首期订单号。"""

    provider = _paypal_provider()
    _bypass_callback_signature(monkeypatch, provider)
    _install_subscription_status(monkeypatch, provider)

    event = _paypal_subscription_sale_event()
    verified = await provider.verify_callback(
        _make_callback_request(json.dumps(event).encode("utf-8"))
    )

    assert verified.valid is True
    assert verified.event == PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT
    assert verified.order_no is None
    assert verified.channel_order_no == "SALE-123"
    assert verified.transaction_id == "SALE-123"
    assert verified.provider_data == {
        "paypal_subscription_id": "PAYPAL-SUB-123",
        "paypal_sale_id": "SALE-123",
        "is_recurring": True,
    }
    callback_metadata = json.loads(verified.extra_metadata or "{}")
    assert callback_metadata["provider_subscription"] == {
        "channel_subscription_id": "PAYPAL-SUB-123",
        "original_order_no": "ORDPAYPAL123",
        "start_at": 1_788_350_400_000,
        "expires_at": 1_790_942_400_000,
    }
    assert verified.recurring_reference.original_order_no == "ORDPAYPAL123"


@pytest.mark.asyncio
async def test_subscription_sale_recurring_payment_uses_sale_id(monkeypatch):
    """订阅续费扣款 sale：sale id 作为 channel_order_no，仍指向首期订单号。"""

    provider = _paypal_provider()
    _bypass_callback_signature(monkeypatch, provider)
    _install_subscription_status(monkeypatch, provider)

    event = _paypal_subscription_sale_event(sale_id="SALE-RENEWAL")
    verified = await provider.verify_callback(
        _make_callback_request(json.dumps(event).encode("utf-8"))
    )

    assert verified.valid is True
    assert verified.order_no is None
    assert verified.channel_order_no == "SALE-RENEWAL"
    assert verified.transaction_id == "SALE-RENEWAL"
    assert verified.provider_data == {
        "paypal_subscription_id": "PAYPAL-SUB-123",
        "paypal_sale_id": "SALE-RENEWAL",
        "is_recurring": True,
    }
    assert verified.recurring_reference.original_order_no == "ORDPAYPAL123"


@pytest.mark.asyncio
async def test_subscription_sale_duplicate_recurring_payment_uses_existing_order(
    monkeypatch,
):
    """重复的续费 sale webhook：provider 不判重，两次输出一致，去重交给 order_service。"""

    provider = _paypal_provider()
    _bypass_callback_signature(monkeypatch, provider)
    _install_subscription_status(monkeypatch, provider)

    request = _make_callback_request(
        json.dumps(_paypal_subscription_sale_event(sale_id="SALE-RENEWAL")).encode(
            "utf-8"
        )
    )

    first = await provider.verify_callback(request)
    second = await provider.verify_callback(request)

    assert first.order_no is None
    assert first.channel_order_no == "SALE-RENEWAL"
    assert first.provider_data == {
        "paypal_subscription_id": "PAYPAL-SUB-123",
        "paypal_sale_id": "SALE-RENEWAL",
        "is_recurring": True,
    }
    assert first.recurring_reference.original_order_no == "ORDPAYPAL123"
    assert (
        second.recurring_reference.original_order_no
        == first.recurring_reference.original_order_no
    )
    assert second.channel_order_no == first.channel_order_no


def test_provider_rejects_invalid_approval_host():
    """approval URL 必须来自配置的 PayPal checkout 域。"""

    with pytest.raises(PaymentProviderError, match="host mismatch"):
        _paypal_provider()._validate_approval_url(  # noqa: SLF001
            "https://evil.example.com/checkoutnow?token=PAYPAL-ORDER-123"
        )


def test_provider_accepts_minimal_sandbox_config():
    """测试服 PayPal 渠道配置只需要凭证、webhook id 和超时。"""

    provider = _paypal_provider()

    assert provider.config.environment == "sandbox"
    assert provider.config.api_base_url == "https://api-m.sandbox.paypal.com"
