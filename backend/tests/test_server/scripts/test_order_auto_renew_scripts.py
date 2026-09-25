"""订单自动续费查询/取消脚本及其渠道请求合同测试。"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from scripts import _order_auto_renew

import app.provider.payment.paypal as paypal_module
from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.constants.payment import PAYPAL_PAYMENT_METHOD
from app.models.order_model import OrderModel
from app.provider.payment.payment_base import PaymentProviderError
from app.provider.payment.paypal import PayPalPaymentProvider
from app.services.config_payment_channel_service import (
    ConfigPaymentChannelRow,
    config_payment_channel_service,
)
from app.services.payment_service import payment_service


class _FakeRedis:
    """PayPal OAuth 测试使用的最小 token 缓存。"""

    def __init__(self, token: str) -> None:
        self.token = token

    async def get(self, key: str) -> str:
        """所有 PayPal token key 都返回固定测试 token。"""

        return self.token


def _paypal_provider() -> PayPalPaymentProvider:
    """创建不含真实密钥的 PayPal provider。"""

    return PayPalPaymentProvider(
        {
            "client_id": "client-id",
            "client_secret": "client-secret",
            "webhook_id": "webhook-id",
            "environment": "sandbox",
            "request_timeout_seconds": 3,
        }
    )


def _install_http_transport(
    monkeypatch: pytest.MonkeyPatch,
    module: object,
    handler: httpx.MockTransport,
) -> None:
    """把 provider 的外部 HTTP 出口替换为固定响应 transport。"""

    real_async_client = httpx.AsyncClient

    def factory(**kwargs: object) -> httpx.AsyncClient:
        return real_async_client(transport=handler, **kwargs)

    monkeypatch.setattr(module.httpx, "AsyncClient", factory)  # type: ignore[attr-defined]


def _subscription_order(
    *,
    order_no: str,
    payment_method: str,
    payment_data: str | None,
    extra_metadata: str,
    channel_order_no: str | None = None,
    channel_uid: str | None = None,
) -> OrderModel:
    """构造只用于快照解析的订阅订单。"""

    return OrderModel(  # type: ignore[call-arg]
        id=1,
        order_no=order_no,
        user_id=101,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id="unlimited",
        product_name="Unlimited",
        amount=12_990_000,
        currency="USD",
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.SUCCESS.value,
        payment_method=payment_method,
        payment_data=payment_data,
        payment_channel_order_no=channel_order_no,
        payment_channel_uid=channel_uid,
        expired_at=4_102_444_800_000,
        extra_metadata=extra_metadata,
    )


@pytest.mark.asyncio
async def test_paypal_subscription_status_uses_billing_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """PayPal 查询必须返回 Billing Subscription 的实时关键字段。"""

    provider = _paypal_provider()
    fake_redis = _FakeRedis("cached-access-token")

    async def get_fake_redis() -> _FakeRedis:
        return fake_redis

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/v1/billing/subscriptions/I-SUB-123"
        assert request.headers["authorization"] == "Bearer cached-access-token"
        return httpx.Response(
            200,
            json={
                "id": "I-SUB-123",
                "status": "ACTIVE",
                "status_update_time": "2026-08-14T10:00:00Z",
                "billing_info": {
                    "next_billing_time": "2026-09-14T10:00:00Z",
                },
            },
        )

    monkeypatch.setattr(paypal_module.redis_client, "get_client", get_fake_redis)
    _install_http_transport(
        monkeypatch,
        paypal_module,
        httpx.MockTransport(handler),
    )

    status = await provider.get_subscription_status(" I-SUB-123 ")

    assert status.subscription_id == "I-SUB-123"
    assert status.status == "ACTIVE"
    assert status.status_update_time == "2026-08-14T10:00:00Z"
    assert status.next_billing_time == "2026-09-14T10:00:00Z"


@pytest.mark.asyncio
async def test_existing_payment_provider_reads_channel_without_enabled_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """停止新销售的渠道仍可为历史订单构造查询/取消 provider。"""

    async def get_by_channel_code(
        channel_code: str,
    ) -> ConfigPaymentChannelRow:
        assert channel_code == PAYPAL_PAYMENT_METHOD
        return ConfigPaymentChannelRow(
            channel_code=PAYPAL_PAYMENT_METHOD,
            channel_name="PayPal disabled for new sales",
            config_json=json.dumps(
                {
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                    "webhook_id": "webhook-id",
                    "environment": "sandbox",
                    "request_timeout_seconds": 3,
                }
            ),
        )

    monkeypatch.setattr(
        config_payment_channel_service,
        "get_by_channel_code",
        get_by_channel_code,
    )

    provider = await payment_service.get_provider_for_existing_payment(
        PAYPAL_PAYMENT_METHOD
    )

    assert isinstance(provider, PayPalPaymentProvider)


@pytest.mark.asyncio
async def test_paypal_cancel_subscription_posts_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """PayPal 取消必须调用 Billing Subscription cancel 且携带原因。"""

    provider = _paypal_provider()
    fake_redis = _FakeRedis("cached-access-token")

    async def get_fake_redis() -> _FakeRedis:
        return fake_redis

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/v1/billing/subscriptions/I-SUB-123/cancel"
        assert request.headers["authorization"] == "Bearer cached-access-token"
        assert json.loads(request.content) == {"reason": "Operator requested"}
        return httpx.Response(204)

    monkeypatch.setattr(paypal_module.redis_client, "get_client", get_fake_redis)
    _install_http_transport(
        monkeypatch,
        paypal_module,
        httpx.MockTransport(handler),
    )

    await provider.cancel_subscription(
        "I-SUB-123",
        reason="Operator requested",
    )


@pytest.mark.asyncio
async def test_paypal_cancel_subscription_reports_provider_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """PayPal 拒绝取消时必须保留 endpoint、状态码和响应内容。"""

    provider = _paypal_provider()
    fake_redis = _FakeRedis("cached-access-token")

    async def get_fake_redis() -> _FakeRedis:
        return fake_redis

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"name": "UNPROCESSABLE_ENTITY"})

    monkeypatch.setattr(paypal_module.redis_client, "get_client", get_fake_redis)
    _install_http_transport(
        monkeypatch,
        paypal_module,
        httpx.MockTransport(handler),
    )

    with pytest.raises(
        PaymentProviderError,
        match=r"status=422.*UNPROCESSABLE_ENTITY",
    ):
        await provider.cancel_subscription(
            "I-SUB-123",
            reason="Operator requested",
        )


def test_paypal_initial_order_reference_uses_payment_data_subscription_id() -> None:
    """PayPal 首单从创建支付时保存的 payment_data 读取长期订阅 ID。"""

    order = _subscription_order(
        order_no="ORD-PAYPAL-INITIAL",
        payment_method=PAYPAL_PAYMENT_METHOD,
        payment_data=json.dumps(
            {
                "channel_order_id": "I-SUB-INITIAL",
                "paypal_subscription_id": "I-SUB-INITIAL",
                "paypal_plan_id": "P-PLAN-123",
            }
        ),
        extra_metadata=json.dumps(
            {
                "product_snapshot": {
                    "metadata": {"auto_renew": True},
                }
            }
        ),
        channel_order_no="SALE-FIRST",
    )

    reference = _order_auto_renew._reference_from_order(order)  # noqa: SLF001

    assert reference.auto_renew_order is True
    assert reference.channel_subscription_id == "I-SUB-INITIAL"


def test_paypal_renewal_order_reference_uses_callback_subscription_id() -> None:
    """PayPal 续费单从回调快照读取长期订阅 ID，不把 sale id 当订阅 ID。"""

    order = _subscription_order(
        order_no="ORD-PAYPAL-RENEWAL",
        payment_method=PAYPAL_PAYMENT_METHOD,
        payment_data=None,
        extra_metadata=json.dumps(
            {
                "product_snapshot": {
                    "metadata": {"auto_renew": True},
                },
                "payment_callback": {
                    "paypal_subscription_id": "I-SUB-RENEWAL",
                    "paypal_sale_id": "SALE-RENEWAL",
                    "is_recurring": True,
                },
            }
        ),
        channel_order_no="SALE-RENEWAL",
    )

    reference = _order_auto_renew._reference_from_order(order)  # noqa: SLF001

    assert reference.channel_subscription_id == "I-SUB-RENEWAL"


@pytest.mark.parametrize(
    "script_name",
    ("query_order_auto_renew.py", "cancel_order_auto_renew.py"),
)
def test_order_auto_renew_script_help_runs(script_name: str) -> None:
    """两个脚本都应能从 backend 根目录直接启动并显示帮助。"""

    backend_root = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        [sys.executable, str(backend_root / "scripts" / script_name), "--help"],
        cwd=backend_root,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert "订单号" in result.stdout
    assert "Traceback" not in result.stderr
