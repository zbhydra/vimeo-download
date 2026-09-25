"""ClinkBill Webhook 经真实 MySQL、Redis 和 OrderService 的幂等测试。

外部 Clink HTTP 使用明确响应的 MockTransport；PaymentService、OrderService、
MySQL、Redis 与订阅履约均使用生产实现。

Endpoint coverage:
POST /api/callback/clink/payment | Happy/replay: covered | Auth/invalid input:
test_server Provider tests | Other client-input boundaries: N/A (signed provider event)
| Side effect: orders and user_subscriptions asserted
| PIX 原币种对账、重复履约、两层检查失败与飞书不可用：真实数据断言
"""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
import hashlib
import hmac
import json
import time
from typing import cast
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.sql.elements import ColumnElement

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.constants.subscription import UNLIMITED_SUBSCRIPTION_PRODUCT_ID
from app.core.config import settings
from app.core.database import get_async_session, get_engine
from app.models.order_model import OrderModel
from app.models.subscription_model import UserSubscriptionModel
from app.provider.payment.clink import CLINK_PAYMENT_METHOD, ClinkPaymentProvider
from app.i18n.common_code import CommonCode
from app.services.config_payment_channel_service import config_payment_channel_service
from app.services.order_service import order_service
from app.services.payment_service import payment_service
from app.utils.time import timestamp_now

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_WEBHOOK_PATH = "/api/callback/clink/payment"
_WEBHOOK_KEY = "pytest-real-clink-webhook-key"
_AMOUNT = 12_340_000
_CURRENCY = "USD"
_DAY_MS = 86_400_000


@dataclass(frozen=True, slots=True)
class _CleanupState:
    """记录本测试创建的数据归属。"""

    test_run_id: str
    user_id: int


@dataclass(frozen=True, slots=True)
class _Channel:
    """PaymentService 构造 Provider 所需的只读渠道配置。"""

    channel_code: str
    config_json: str


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


@pytest.fixture
async def real_clink_schema_ready(real_mysql_ready: None) -> None:
    """检查 Clink 回调真实履约需要的 MySQL 表。"""

    required_tables = {"orders", "user_subscriptions"}
    missing = [
        name for name in sorted(required_tables) if not await _table_exists(name)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_clink_cleanup_state(
    real_clink_schema_ready: None,
    test_run_id: str,
) -> AsyncIterator[_CleanupState]:
    """分配唯一用户，并清理本测试创建的订阅和订单。"""

    state = _CleanupState(
        test_run_id=f"{test_run_id}{uuid4().hex[:10]}",
        user_id=9_700_000_000_000 + uuid4().int % 1_000_000_000_000,
    )
    try:
        yield state
    finally:
        async with get_async_session() as db:
            subscription_user_id = cast(
                ColumnElement[int], UserSubscriptionModel.user_id
            )
            await db.execute(
                delete(UserSubscriptionModel).where(
                    subscription_user_id == state.user_id
                )
            )
            await db.execute(
                delete(OrderModel).where(OrderModel.user_id == state.user_id)
            )
            await db.commit()


def _signed_headers(body: bytes, timestamp: int) -> dict[str, str]:
    """为原始 JSON body 生成 Clink HMAC header。"""

    signature = hmac.new(
        _WEBHOOK_KEY.encode("utf-8"),
        str(timestamp).encode("ascii") + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Clink-Timestamp": str(timestamp),
        "X-Clink-Signature": signature,
        "X-Clink-SignType": "SHA256",
    }


def _event(event_id: str, event_type: str, event_object: dict[str, object]) -> bytes:
    """序列化 canonical Clink event，供签名和发送共用同一 body。"""

    return json.dumps(
        {
            "id": event_id,
            "object": "event",
            "created": int(time.time() * 1000),
            "type": event_type,
            "data": {"object": event_object},
        },
        separators=(",", ":"),
    ).encode("utf-8")


async def _subscription(user_id: int) -> UserSubscriptionModel | None:
    """读取真实订阅履约结果。"""

    subscription_user_id = cast(ColumnElement[int], UserSubscriptionModel.user_id)
    async with get_async_session() as db:
        return await db.scalar(
            select(UserSubscriptionModel).where(subscription_user_id == user_id)
        )


async def _orders_for_channel(channel_order_no: str) -> list[OrderModel]:
    """读取指定 Clink 渠道流水对应的本地订单。"""

    async with get_async_session() as db:
        result = await db.scalars(
            select(OrderModel).where(
                OrderModel.payment_method == CLINK_PAYMENT_METHOD,
                OrderModel.payment_channel_order_no == channel_order_no,
            )
        )
        return list(result.all())


@pytest.mark.parametrize("failure", [None, "amount", "order", "feishu"])
async def test_real_clink_pix_callback_and_failure_alarm(
    real_async_client: httpx.AsyncClient,
    real_clink_cleanup_state: _CleanupState,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    failure: str | None,
) -> None:
    """真实回调核对 USD、履约和重放；两层检查失败均告警且不误付款。"""

    channel = await config_payment_channel_service.get_by_channel_code(
        CLINK_PAYMENT_METHOD
    )
    if channel is None:
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 缺少只读 Clink 渠道配置")
    provider = await payment_service.get_provider_for_existing_payment(
        CLINK_PAYMENT_METHOD
    )
    assert isinstance(provider, ClinkPaymentProvider)
    cleanup = real_clink_cleanup_state
    order_no = f"PIX{cleanup.test_run_id.upper()}"[:32]
    session_id = f"sess_{cleanup.test_run_id}"
    initial_status = (
        OrderStatus.CANCELLED.value if failure == "order" else OrderStatus.PENDING.value
    )
    await order_service.create(
        OrderModel(  # type: ignore[call-arg]
            order_no=order_no,
            user_id=cleanup.user_id,
            product_class=ProductClass.SUBSCRIPTION.value,
            product_id=UNLIMITED_SUBSCRIPTION_PRODUCT_ID,
            product_name=f"pytest-pix-{cleanup.test_run_id}",
            amount=9_990_000,
            currency="USD",
            order_status=initial_status,
            payment_method=CLINK_PAYMENT_METHOD,
            payment_data=json.dumps({"sessionId": session_id}),
            extra_metadata=json.dumps(
                {
                    "product_snapshot": {
                        "product_price_id": 999_002,
                        "auto_renew": False,
                        "period": "month",
                    }
                }
            ),
            expired_at=timestamp_now() + _DAY_MS,
        )
    )
    monkeypatch.setattr(settings, "root_path", str(tmp_path))
    monkeypatch.setattr(settings.feishu_alarm, "enabled", True)
    monkeypatch.setattr(
        settings.feishu_alarm, "webhook_url", "https://feishu.example.test/alarm"
    )
    alarms: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://feishu.example.test/alarm"
        alarms.append(json.loads(request.content)["content"]["text"])
        if failure == "feishu":
            raise httpx.ConnectError("pytest Feishu unavailable", request=request)
        return httpx.Response(200, json={"code": 0})

    original_client = httpx.AsyncClient

    def client_factory(*, timeout: float) -> httpx.AsyncClient:
        return original_client(timeout=timeout, transport=httpx.MockTransport(handler))

    monkeypatch.setattr("app.utils.feishu_utils.httpx.AsyncClient", client_factory)
    body = _event(
        f"event_{cleanup.test_run_id}",
        "order.succeeded",
        {
            "type": "onetime",
            "orderId": f"order_{cleanup.test_run_id}",
            "merchantReferenceId": order_no,
            "sessionId": session_id,
            "originalCurrency": "USD",
            "priceDataList": [
                {"unitAmount": "3.33", "quantity": 2, "currency": "USD"},
                {
                    "unitAmount": "2.33" if failure in {"amount", "feishu"} else "3.33",
                    "currency": "USD",
                },
            ],
            "amountTotal": 53.26,
            "paymentCurrency": "BRL",
        },
    )
    timestamp = int(time.time())
    headers = _signed_headers(body, timestamp)
    headers["X-Clink-Signature"] = hmac.new(
        provider.config.webhook_signing_key.encode(),
        str(timestamp).encode() + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    response = await real_async_client.post(
        _WEBHOOK_PATH, content=body, headers=headers
    )
    stored = await order_service.get_order_by_no(order_no)
    assert stored is not None
    if failure:
        assert response.status_code == 500
        assert response.json()["code"] == CommonCode.INTERNAL_SERVER_ERROR
        assert stored.order_status == initial_status
        assert stored.paid_amount is None
        assert await _subscription(cleanup.user_id) is None
        assert len(alarms) == 1
        assert order_no in alarms[0]
        assert ("not payable" if failure == "order" else "amount mismatch") in alarms[0]
    else:
        assert response.status_code == 200
        assert response.json()["code"] == 10000
        assert stored.order_status == OrderStatus.PAID.value
        assert stored.callback_status == CallbackStatus.SUCCESS.value
        assert stored.paid_amount == 9_990_000
        assert stored.paid_currency == "USD"
        metadata = json.loads(stored.extra_metadata or "{}")["payment_callback"]
        assert metadata["clink_payment_amount"] == 53.26
        assert metadata["clink_payment_currency"] == "BRL"
        before = await _subscription(cleanup.user_id)
        assert before is not None
        replay = await real_async_client.post(
            _WEBHOOK_PATH, content=body, headers=headers
        )
        assert replay.status_code == 200
        assert replay.json()["code"] == 10000
        assert replay.json()["data"]["idempotent"] is True
        after = await _subscription(cleanup.user_id)
        assert after is not None and after.expires_at == before.expires_at
        assert alarms == []


def _install_clink_boundaries(
    monkeypatch,
    order_no: str,
    session_id: str,
    *,
    period_start: int,
    period_end: int,
) -> None:
    """替换测试渠道配置读取与不可控 Clink HTTP 出口。"""

    channel = _Channel(
        channel_code=CLINK_PAYMENT_METHOD,
        config_json=json.dumps(
            {
                "environment": "sandbox",
                "request_timeout_seconds": 3,
                "secret_key": "pytest-real-clink-secret-key",
                "webhook_signing_key": _WEBHOOK_KEY,
            },
            separators=(",", ":"),
        ),
    )

    async def get_by_channel_code(channel_code: str) -> _Channel:
        assert channel_code == CLINK_PAYMENT_METHOD
        return channel

    async def list_enabled() -> list[_Channel]:
        return [channel]

    monkeypatch.setattr(
        config_payment_channel_service,
        "get_by_channel_code",
        get_by_channel_code,
    )
    monkeypatch.setattr(config_payment_channel_service, "list_enabled", list_enabled)

    original_client = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path.startswith("/api/subscription/")
        return httpx.Response(
            200,
            json={
                "code": 200,
                "data": {
                    "merchantReference": order_no,
                    "sessionId": session_id,
                    "recurringInvoiceItem": {
                        "periodStart": period_start,
                        "periodEnd": period_end,
                    },
                },
            },
        )

    def client_factory(*, timeout: float) -> httpx.AsyncClient:
        return original_client(
            timeout=timeout,
            transport=httpx.MockTransport(handler),
        )

    monkeypatch.setattr(
        "app.provider.payment.clink.httpx.AsyncClient",
        client_factory,
    )


async def test_real_clink_callback_replays_fulfill_each_charge_once(
    real_async_client: httpx.AsyncClient,
    real_redis_ready: None,
    real_clink_cleanup_state: _CleanupState,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """重复一次性 Order 和 Invoice 均只产生一次真实履约副作用。"""

    cleanup = real_clink_cleanup_state
    now_ms = timestamp_now()
    order_no = f"ORC{cleanup.test_run_id.upper()}"[:32]
    session_id = f"sess_{cleanup.test_run_id}"
    initial_channel_order_no = f"ord_{cleanup.test_run_id}"
    invoice_id = f"inv_{cleanup.test_run_id}"
    subscription_id = f"sub_{cleanup.test_run_id}"
    recurring_order_id = f"ordr_{cleanup.test_run_id}"
    order = OrderModel(  # type: ignore[call-arg]
        order_no=order_no,
        user_id=cleanup.user_id,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id=UNLIMITED_SUBSCRIPTION_PRODUCT_ID,
        product_name=f"pytest-clink-{cleanup.test_run_id}",
        amount=_AMOUNT,
        currency=_CURRENCY,
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.PENDING.value,
        payment_method=CLINK_PAYMENT_METHOD,
        payment_channel_order_no=initial_channel_order_no,
        paid_amount=_AMOUNT,
        paid_currency=_CURRENCY,
        paid_at=now_ms,
        payment_data=json.dumps({"sessionId": session_id}, separators=(",", ":")),
        expired_at=now_ms + _DAY_MS,
        extra_metadata=json.dumps(
            {
                "product_snapshot": {
                    "product_price_id": 999_002,
                    "auto_renew": True,
                    "period": "month",
                    "provider_sku": "prd_test:price_test",
                },
                "payment_callback": {
                    "provider_subscription": {
                        "channel_subscription_id": subscription_id,
                        "original_order_no": order_no,
                        "start_at": now_ms,
                        "expires_at": now_ms + 30 * _DAY_MS,
                    }
                },
                "test_run_id": cleanup.test_run_id,
            },
            separators=(",", ":"),
        ),
        created_at=now_ms,
        updated_at=now_ms,
    )
    stored_order = await order_service.create(order)
    assert await order_service.fulfill_paid_order(stored_order) is True
    renewal_period_end = now_ms + 60 * _DAY_MS
    _install_clink_boundaries(
        monkeypatch,
        order_no,
        session_id,
        period_start=now_ms + 30 * _DAY_MS,
        period_end=renewal_period_end,
    )

    timestamp = int(time.time())
    subscription_before = await _subscription(cleanup.user_id)
    assert subscription_before is not None
    assert subscription_before.expires_at is not None

    invoice_body = _event(
        f"event_invoice_{cleanup.test_run_id}",
        "invoice.paid",
        {
            "invoiceId": invoice_id,
            "subscriptionId": subscription_id,
            "orderId": recurring_order_id,
            "originalAmount": "12.34",
            "originalCurrency": _CURRENCY,
        },
    )
    invoice_headers = _signed_headers(invoice_body, timestamp)
    invoice_responses = await asyncio.gather(
        real_async_client.post(
            _WEBHOOK_PATH,
            content=invoice_body,
            headers=invoice_headers,
        ),
        real_async_client.post(
            _WEBHOOK_PATH,
            content=invoice_body,
            headers=invoice_headers,
        ),
    )

    assert all(response.status_code == 200 for response in invoice_responses)
    assert all(response.json()["code"] == 10000 for response in invoice_responses)
    renewal_orders = await _orders_for_channel(invoice_id)
    assert len(renewal_orders) == 1
    assert renewal_orders[0].order_status == OrderStatus.PAID.value
    assert renewal_orders[0].callback_status == CallbackStatus.SUCCESS.value
    assert renewal_orders[0].payment_transaction_id == recurring_order_id
    subscription_after = await _subscription(cleanup.user_id)
    assert subscription_after is not None
    assert subscription_after.expires_at is not None
    assert subscription_after.expires_at == renewal_period_end
