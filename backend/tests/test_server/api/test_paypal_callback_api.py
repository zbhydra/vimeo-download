"""PayPal webhook API 路由级测试。"""

from dataclasses import dataclass, field
import json

import pytest

from app.api.callback import paypal_callback as paypal_callback_api
from app.constants.order import PaymentCallbackResult
from app.constants.payment import PAYPAL_CURRENCY, PAYPAL_PAYMENT_METHOD
from app.core.config import settings
from app.provider.payment.payment_base import CallbackVerificationResult
from app.provider.payment.paypal import PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT

_WEBHOOK_PATH = "/api/callback/paypal/payment"
_EXPECTED_TRANSMISSION_SIG = "pytest-paypal-signature"


@dataclass
class _ProviderCall:
    """记录 API 传给 fake provider 的 Request 快照。"""

    body: dict[str, object]
    transmission_sig: str | None


@dataclass
class _FakeProvider:
    """验证路由传入的 Request，并返回指定验签结果。"""

    expected_body: dict[str, object]
    result: CallbackVerificationResult
    calls: list[_ProviderCall] = field(default_factory=list)

    async def verify_callback(self, request):
        """断言 provider 收到真实 Request header/body。"""

        body = await request.json()
        transmission_sig = request.headers.get("paypal-transmission-sig")
        self.calls.append(
            _ProviderCall(
                body=body,
                transmission_sig=transmission_sig,
            )
        )
        if body != self.expected_body:
            raise AssertionError(f"Unexpected provider body: {body}")
        return self.result


@dataclass
class _HandlePaymentCallbackCall:
    """记录路由传给 handle_payment_callback 的关键参数。"""

    payment_method: str
    order_no: str | None
    channel_order_no: str | None


def _paypal_sale_payload() -> dict[str, object]:
    """构造 PayPal subscription sale webhook payload。"""

    return {
        "event_type": PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
        "resource": {
            "id": "SALE-RENEWAL",
            "billing_agreement_id": "PAYPAL-SUB-123",
            "amount": {
                "currency": PAYPAL_CURRENCY,
                "total": "15.30",
            },
        },
    }


def _install_fake_provider(monkeypatch, provider: _FakeProvider) -> None:
    """把 payment_service.get_provider 替换为 fake provider。"""

    async def fake_get_provider(payment_method: str) -> _FakeProvider:
        assert payment_method == PAYPAL_PAYMENT_METHOD
        return provider

    monkeypatch.setattr(
        paypal_callback_api.payment_service,
        "get_provider",
        fake_get_provider,
    )


def _install_handle_payment_callback_recorder(
    monkeypatch,
    *,
    result_order_no: str,
    idempotent: bool = False,
    callback_triggered: bool = True,
) -> list[_HandlePaymentCallbackCall]:
    """记录 handle_payment_callback 调用，避免触发真实订单履约。

    路由测试聚焦路由职责：验证 callback 正确调用 handle_payment_callback 并透传
    Provider 验签结果；续费派单、并发收敛、履约等业务逻辑由 order_service 单元测试覆盖。
    """

    calls: list[_HandlePaymentCallbackCall] = []

    async def fake_handle_payment_callback(
        *,
        payment_method: str,
        callback: CallbackVerificationResult,
    ) -> PaymentCallbackResult:
        calls.append(
            _HandlePaymentCallbackCall(
                payment_method=payment_method,
                order_no=callback.order_no,
                channel_order_no=callback.channel_order_no,
            )
        )
        return PaymentCallbackResult(
            order_no=result_order_no,
            idempotent=idempotent,
            callback_triggered=callback_triggered,
        )

    monkeypatch.setattr(
        paypal_callback_api.order_service,
        "handle_payment_callback",
        fake_handle_payment_callback,
    )
    return calls


def _paypal_webhook_headers() -> dict[str, str]:
    """构造 PayPal webhook 测试 header。"""

    return {
        "paypal-transmission-sig": _EXPECTED_TRANSMISSION_SIG,
        "paypal-transmission-id": "pytest-transmission-id",
        "paypal-transmission-time": "2026-06-30T00:00:00Z",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api-m.sandbox.paypal.com/certs/test",
    }


def _read_raw_log_entries(tmp_path) -> list[dict[str, object]]:
    """读取 PayPal raw callback 日志。"""

    log_files = list((tmp_path / "log" / "payment" / "paypal").glob("*.log"))
    assert len(log_files) == 1
    return [
        json.loads(line)
        for line in log_files[0].read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _capture_info_logs(monkeypatch) -> list[str]:
    """截获路由 info 日志，便于验证耗时字段合同。"""

    messages: list[str] = []

    def capture(message: object, *args: object, **_kwargs: object) -> None:
        rendered = str(message) % args if args else str(message)
        messages.append(rendered)

    monkeypatch.setattr(paypal_callback_api.logger, "info", capture)
    return messages


@pytest.mark.asyncio
async def test_recurring_subscription_sale_creates_local_renewal_order(
    async_client,
    monkeypatch,
    tmp_path,
):
    """PayPal 后续自动扣款经 API 路由交给 handle_payment_callback 处理续费。"""

    monkeypatch.setattr(settings, "root_path", str(tmp_path))
    payload = _paypal_sale_payload()
    extra_metadata = json.dumps(
        {
            "paypal_subscription_id": "PAYPAL-SUB-123",
            "paypal_sale_id": "SALE-RENEWAL",
            "is_recurring": True,
        },
        ensure_ascii=False,
    )
    provider = _FakeProvider(
        expected_body=payload,
        result=CallbackVerificationResult(
            valid=True,
            processed=True,
            event=PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
            order_no="ORDER_SUCCESS",
            channel_order_no="SALE-RENEWAL",
            channel_uid="PAYER-123",
            amount=15_300_000,
            currency=PAYPAL_CURRENCY,
            transaction_id="SALE-RENEWAL",
            extra_metadata=extra_metadata,
            provider_data={
                "paypal_subscription_id": "PAYPAL-SUB-123",
                "paypal_sale_id": "SALE-RENEWAL",
                "is_recurring": True,
            },
        ),
    )
    _install_fake_provider(monkeypatch, provider)
    # 续费场景下 order_service 内部派生本地续费订单，这里仅模拟其返回结果。
    handle_calls = _install_handle_payment_callback_recorder(
        monkeypatch,
        result_order_no="ORDER_RENEWAL_LOCAL",
    )
    info_logs = _capture_info_logs(monkeypatch)

    response = await async_client.post(
        _WEBHOOK_PATH,
        json=payload,
        headers=_paypal_webhook_headers(),
    )

    assert response.status_code == 200
    assert response.json() == {
        "code": 10000,
        "data": {
            "processed": True,
            "event": PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
            "order_no": "ORDER_RENEWAL_LOCAL",
            "idempotent": False,
        },
        "msg": "success",
    }
    assert provider.calls == [
        _ProviderCall(
            body=payload,
            transmission_sig=_EXPECTED_TRANSMISSION_SIG,
        )
    ]
    # 续费场景：callback 携带首期本地订单号 + 本次扣款流水号，
    # 续费派单由 handle_payment_callback 内部完成。
    assert handle_calls == [
        _HandlePaymentCallbackCall(
            payment_method=PAYPAL_PAYMENT_METHOD,
            order_no="ORDER_SUCCESS",
            channel_order_no="SALE-RENEWAL",
        )
    ]

    raw_entries = _read_raw_log_entries(tmp_path)
    assert raw_entries[0]["path"] == _WEBHOOK_PATH
    assert json.loads(raw_entries[0]["body"]) == payload
    assert "paypal-transmission-sig" not in raw_entries[0]["headers"]
    assert _EXPECTED_TRANSMISSION_SIG not in json.dumps(
        raw_entries,
        ensure_ascii=False,
    )
    timing_logs = [message for message in info_logs if "verify_duration_ms=" in message]
    assert len(timing_logs) == 1
    assert "handle_payment_callback_duration_ms=" in timing_logs[0]
    assert "total_duration_ms=" in timing_logs[0]


@pytest.mark.asyncio
async def test_first_subscription_sale_uses_original_order(
    async_client,
    monkeypatch,
    tmp_path,
):
    """PayPal 首期订阅扣款经 API 路由交给 handle_payment_callback 处理首单。"""

    monkeypatch.setattr(settings, "root_path", str(tmp_path))
    payload = _paypal_sale_payload()
    provider = _FakeProvider(
        expected_body=payload,
        result=CallbackVerificationResult(
            valid=True,
            processed=True,
            event=PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
            order_no="ORDER_SUCCESS",
            channel_order_no="PAYPAL-SUB-123",
            channel_uid="PAYER-123",
            amount=15_300_000,
            currency=PAYPAL_CURRENCY,
            transaction_id="SALE-FIRST",
            extra_metadata='{"paypal_sale_id":"SALE-FIRST","is_recurring":false}',
            provider_data={
                "paypal_subscription_id": "PAYPAL-SUB-123",
                "paypal_sale_id": "SALE-FIRST",
                "is_recurring": False,
            },
        ),
    )
    _install_fake_provider(monkeypatch, provider)
    handle_calls = _install_handle_payment_callback_recorder(
        monkeypatch,
        result_order_no="ORDER_SUCCESS",
    )

    response = await async_client.post(
        _WEBHOOK_PATH,
        json=payload,
        headers=_paypal_webhook_headers(),
    )

    assert response.status_code == 200
    assert response.json()["data"]["order_no"] == "ORDER_SUCCESS"
    # 首期场景：callback 直接携带首单订单号与渠道协议号。
    assert handle_calls == [
        _HandlePaymentCallbackCall(
            payment_method=PAYPAL_PAYMENT_METHOD,
            order_no="ORDER_SUCCESS",
            channel_order_no="PAYPAL-SUB-123",
        )
    ]


@pytest.mark.asyncio
async def test_invalid_callback_logs_verify_duration_without_local_processing(
    async_client,
    monkeypatch,
    tmp_path,
):
    """验签未通过时只记录验签阶段耗时，不进入本地订单处理。"""

    monkeypatch.setattr(settings, "root_path", str(tmp_path))
    payload = _paypal_sale_payload()
    provider = _FakeProvider(
        expected_body=payload,
        result=CallbackVerificationResult(
            valid=False,
            processed=False,
            event=PAYPAL_SUBSCRIPTION_SALE_COMPLETED_EVENT,
        ),
    )
    _install_fake_provider(monkeypatch, provider)
    handle_calls = _install_handle_payment_callback_recorder(
        monkeypatch,
        result_order_no="UNREACHABLE",
    )
    info_logs = _capture_info_logs(monkeypatch)

    response = await async_client.post(
        _WEBHOOK_PATH,
        json=payload,
        headers=_paypal_webhook_headers(),
    )

    assert response.status_code == 200
    assert handle_calls == []
    timing_logs = [message for message in info_logs if "verify_duration_ms=" in message]
    assert len(timing_logs) == 1
    assert "handle_payment_callback_duration_ms=" not in timing_logs[0]
    assert "total_duration_ms=" in timing_logs[0]
