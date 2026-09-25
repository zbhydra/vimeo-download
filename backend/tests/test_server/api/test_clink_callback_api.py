"""ClinkBill Webhook 路由编排测试。"""

from dataclasses import dataclass
import json

import pytest

from app.api.callback import clink_callback as clink_callback_api
from app.constants.order import PaymentCallbackResult
from app.core.config import settings
from app.provider.payment.clink import (
    CLINK_INVOICE_PAID_EVENT,
    CLINK_ORDER_SUCCEEDED_EVENT,
    CLINK_PAYMENT_METHOD,
)
from app.provider.payment.payment_base import CallbackVerificationResult

_WEBHOOK_PATH = "/api/callback/clink/payment"


@pytest.fixture(autouse=True)
def _use_tmp_log_root(monkeypatch, tmp_path) -> None:
    """避免路由测试把原始回调写入项目日志目录。"""

    monkeypatch.setattr(settings, "root_path", str(tmp_path))


@dataclass
class _FakeProvider:
    """返回预设 Clink 验证结果。"""

    result: CallbackVerificationResult
    calls: int = 0

    async def verify_callback(self, request) -> CallbackVerificationResult:
        """记录路由调用并返回验证结果。"""

        await request.body()
        self.calls += 1
        return self.result


def _install_provider(monkeypatch, provider: _FakeProvider) -> None:
    """替换历史渠道配置 Provider 构造出口。"""

    async def get_provider(payment_method: str) -> _FakeProvider:
        assert payment_method == CLINK_PAYMENT_METHOD
        return provider

    monkeypatch.setattr(
        clink_callback_api.payment_service,
        "get_provider_for_existing_payment",
        get_provider,
    )


@pytest.mark.asyncio
async def test_invoice_paid_routes_to_order_service(async_client, monkeypatch):
    """已验证 Invoice 只由路由交给统一 OrderService。"""

    verified = CallbackVerificationResult(
        valid=True,
        processed=True,
        event=CLINK_INVOICE_PAID_EVENT,
        channel_order_no="inv_test",
        amount=12_345_678,
        currency="USD",
    )
    provider = _FakeProvider(verified)
    _install_provider(monkeypatch, provider)
    calls: list[tuple[str, CallbackVerificationResult]] = []

    async def handle_payment_callback(
        *, payment_method: str, callback: CallbackVerificationResult
    ) -> PaymentCallbackResult:
        calls.append((payment_method, callback))
        return PaymentCallbackResult(
            order_no="ORDER-RENEWAL-1",
            idempotent=True,
            callback_triggered=False,
        )

    monkeypatch.setattr(
        clink_callback_api.order_service,
        "handle_payment_callback",
        handle_payment_callback,
    )
    response = await async_client.post(_WEBHOOK_PATH, content=b"{}")

    assert response.status_code == 200
    assert response.json()["code"] == 10000
    assert response.json()["data"] == {
        "processed": True,
        "event": CLINK_INVOICE_PAID_EVENT,
        "order_no": "ORDER-RENEWAL-1",
        "idempotent": True,
    }
    assert provider.calls == 1
    assert calls == [(CLINK_PAYMENT_METHOD, verified)]


@pytest.mark.asyncio
async def test_recurring_order_is_acknowledged_without_order_service(
    async_client,
    monkeypatch,
):
    """recurring order.succeeded 返回 2xx，但不进入履约。"""

    provider = _FakeProvider(
        CallbackVerificationResult(
            valid=True,
            processed=False,
            event=CLINK_ORDER_SUCCEEDED_EVENT,
        )
    )
    _install_provider(monkeypatch, provider)
    calls = 0

    async def handle_payment_callback(**_kwargs: object) -> PaymentCallbackResult:
        nonlocal calls
        calls += 1
        raise AssertionError("recurring order must not be fulfilled")

    monkeypatch.setattr(
        clink_callback_api.order_service,
        "handle_payment_callback",
        handle_payment_callback,
    )
    response = await async_client.post(_WEBHOOK_PATH, content=b"{}")

    assert response.status_code == 200
    assert response.json()["code"] == 10000
    assert response.json()["data"] == {
        "processed": False,
        "event": CLINK_ORDER_SUCCEEDED_EVENT,
    }
    assert calls == 0


@pytest.mark.asyncio
async def test_unsupported_event_is_logged_and_acknowledged(
    async_client,
    monkeypatch,
    tmp_path,
):
    """未支持事件记录原始请求并返回明确的 200 响应。"""

    provider = _FakeProvider(
        CallbackVerificationResult(
            valid=True,
            processed=False,
            event="subscription.created",
            provider_data={"reason": "unsupported_event"},
        )
    )
    _install_provider(monkeypatch, provider)
    payload = {"id": "event_test_1", "type": "subscription.created"}

    response = await async_client.post(
        _WEBHOOK_PATH,
        json=payload,
        headers={
            "x-clink-signature": "pytest-signature",
            "x-clink-timestamp": "1788368400",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "code": 10000,
        "data": {
            "processed": False,
            "event": "subscription.created",
            "reason": "unsupported_event",
        },
        "msg": "success",
    }
    log_files = list((tmp_path / "log" / "payment" / "clink").glob("*.log"))
    assert len(log_files) == 1
    entry = json.loads(log_files[0].read_text(encoding="utf-8"))
    assert json.loads(entry["body"]) == payload
    assert entry["headers"]["x-clink-timestamp"] == "1788368400"
    assert "x-clink-signature" not in entry["headers"]
