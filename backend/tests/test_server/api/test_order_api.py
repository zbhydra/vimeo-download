"""订单 API 测试。

创建 Telegram invoice 的购买链路由 integration/real 测试直连 Telegram 验收。
"""

import json
from dataclasses import dataclass, field
import uuid

import pytest
from sqlalchemy import delete, func, select

from app.api.user_dependencies import UserContext, get_current_user
from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.core.database import get_async_session
from app.i18n.common_code import CommonCode
from app.main import app
from app.models.order_model import OrderModel
from app.constants.payment import CLINK_PAYMENT_METHOD, PAYPAL_CURRENCY
from app.provider.payment.payment_base import PaymentRequest
from app.services.credit_checkout_config_service import credit_checkout_config_service
from app.services.order_service import order_service
from app.services.payment_config_service import (
    PaymentChannelConfig,
    PaymentConfigSnapshot,
    SubscriptionProductConfig,
    SubscriptionProductPriceConfig,
    payment_config_service,
)
from app.services.payment_service import payment_service
from app.utils.time import timestamp_now
from tests.test_server.api.payment_config_test_support import (
    clear_payment_config_test_caches,
    get_clink_credit_product_id,
    get_clink_subscription_product_id,
)


_ORDER_CREATE_PATH = "/api/client/order/create"
_ORDER_STATUS_PATH = "/api/client/order/status/{order_no}"
_ORDER_LIST_PATH = "/api/client/order/list"
_ORDER_UNFINISHED_PATH = "/api/client/order/unfinished"
_ORDER_CANCEL_PATH = "/api/client/order/cancel"


@dataclass
class _CleanupState:
    """记录本文件写入的数据。"""

    order_nos: list[str] = field(default_factory=list)
    user_ids: list[int] = field(default_factory=list)


@pytest.fixture
async def order_api_cleanup():
    """清理订单 API 测试数据。"""
    state = _CleanupState()
    clear_payment_config_test_caches()

    yield state

    async with get_async_session() as db:
        if state.order_nos:
            await db.execute(
                delete(OrderModel).where(OrderModel.order_no.in_(state.order_nos))
            )
        if state.user_ids:
            await db.execute(
                delete(OrderModel).where(OrderModel.user_id.in_(state.user_ids))
            )
        await db.commit()
    clear_payment_config_test_caches()
    app.dependency_overrides.pop(get_current_user, None)


def _test_user_id(cleanup: _CleanupState) -> int:
    """生成测试用户 ID。"""
    user_id = 9_100_000_000 + uuid.uuid4().int % 1_000_000
    cleanup.user_ids.append(user_id)
    return user_id


def _install_user_override(user_id: int, *, language: str = "zh-CN") -> None:
    """覆盖用户认证依赖，避免真实 token 影响 API 行为测试。"""

    async def override_user() -> UserContext:
        return UserContext(
            user_id=user_id,
            token="pytest-token",
            device_id="pytest-device",
            language=language,
            ip="127.0.0.1",
        )

    app.dependency_overrides[get_current_user] = override_user


async def _subscription_order_payload(product_id: str) -> dict[str, object]:
    """按真实订阅配置生成创建订单请求体。"""

    checkout_config = await payment_config_service.get_subscription_checkout_config(
        product_id=product_id,
        channel_code=CLINK_PAYMENT_METHOD,
        auto_renew=False,
        period="month",
    )
    return {
        "product_class": ProductClass.SUBSCRIPTION.value,
        "product_id": checkout_config.product.product_id,
        "payment_method": checkout_config.channel.channel_code,
        "currency": checkout_config.price.currency,
        "amount": checkout_config.price.amount,
        "auto_renew": checkout_config.product.auto_renew,
        "period": checkout_config.product.period,
    }


async def _credit_order_payload(product_id: str) -> dict[str, object]:
    """按真实 Credits 配置生成创建订单请求体。"""

    checkout_config = await credit_checkout_config_service.get_credit_checkout_config(
        product_id=product_id,
        channel_code=CLINK_PAYMENT_METHOD,
    )
    return {
        "product_class": ProductClass.RECHARGE.value,
        "product_id": checkout_config.product.product_id,
        "payment_method": checkout_config.channel.channel_code,
        "currency": checkout_config.price.currency,
        "amount": checkout_config.price.amount,
    }


def _stale_order_payload(payload: dict[str, object]) -> dict[str, object]:
    """把真实价格请求体改成过期价格。"""

    return {
        **payload,
        "amount": int(payload["amount"]) + 1_000_000,
    }


class _FakePaymentProvider:
    """避免订单 API 单测真实请求支付网关。"""

    async def create_payment(self, request: PaymentRequest) -> dict[str, object]:
        """返回稳定的测试支付入口。"""
        return {"url": f"https://pay.example.com/pytest/{request.order_no}"}


def _install_fake_payment_provider(monkeypatch) -> None:
    """把订单创建链路的 provider 替换成 fake provider。"""

    async def fake_get_provider(payment_method: str) -> _FakePaymentProvider:
        assert payment_method == CLINK_PAYMENT_METHOD
        return _FakePaymentProvider()

    monkeypatch.setattr(payment_service, "get_provider", fake_get_provider)


def _openapi_success_schema(path: str, method: str) -> dict:
    """读取 OpenAPI 中指定路由的 200 响应 schema。"""
    return app.openapi()["paths"][path][method]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]


def _schema_ref_name(schema: dict) -> str:
    """读取 OpenAPI schema 的组件引用名。"""
    ref = schema["$ref"]
    return ref.rsplit("/", 1)[-1]


def _order_response_data_schema(path: str, method: str) -> dict:
    """读取订单接口外层响应中的 data schema。"""
    schema_name = _schema_ref_name(_openapi_success_schema(path, method))
    data_schema = app.openapi()["components"]["schemas"][schema_name]["properties"][
        "data"
    ]
    data_schema_name = _schema_ref_name(data_schema)
    return app.openapi()["components"]["schemas"][data_schema_name]


def test_order_routes_expose_wrapped_response_models_in_openapi():
    """订单接口 OpenAPI 挂真实 ResponseUtils 外层响应模型。"""
    assert _schema_ref_name(_openapi_success_schema(_ORDER_CREATE_PATH, "post")) == (
        "CreateOrderApiResponse"
    )
    assert _schema_ref_name(_openapi_success_schema(_ORDER_STATUS_PATH, "get")) == (
        "OrderStatusApiResponse"
    )
    assert _schema_ref_name(_openapi_success_schema(_ORDER_LIST_PATH, "get")) == (
        "OrderListApiResponse"
    )
    assert _schema_ref_name(_openapi_success_schema(_ORDER_UNFINISHED_PATH, "get")) == (
        "UnfinishedOrderListApiResponse"
    )
    assert _schema_ref_name(_openapi_success_schema(_ORDER_CANCEL_PATH, "post")) == (
        "CancelOrderApiResponse"
    )


def test_order_status_schema_exposes_integer_status_fields():
    """订单状态响应 schema 暴露整型状态字段和可空支付字段。"""
    create_schema = _order_response_data_schema(_ORDER_CREATE_PATH, "post")
    assert create_schema["properties"]["support_mail"]["type"] == "string"

    status_schema = _order_response_data_schema(_ORDER_STATUS_PATH, "get")
    properties = status_schema["properties"]

    assert properties["order_status"]["type"] == "integer"
    assert properties["callback_status"]["type"] == "integer"
    assert {"type": "null"} in properties["payment_method"]["anyOf"]
    assert {"type": "null"} in properties["paid_at"]["anyOf"]
    assert properties["product_class"]["type"] == "integer"
    assert properties["product_id"]["type"] == "string"
    assert properties["expired_at"]["type"] == "integer"

    list_schema = _order_response_data_schema(_ORDER_LIST_PATH, "get")
    order_item_schema = list_schema["properties"]["orders"]["items"]
    assert _schema_ref_name(order_item_schema) == "OrderStatusResponse"

    unfinished_schema = _order_response_data_schema(_ORDER_UNFINISHED_PATH, "get")
    unfinished_item_schema = unfinished_schema["properties"]["orders"]["items"]
    assert _schema_ref_name(unfinished_item_schema) == "UnfinishedOrderResponse"


@pytest.mark.asyncio
async def test_create_order_rejects_stale_client_price(
    async_client,
    order_api_cleanup: _CleanupState,
):
    """客户端价格过期时返回 PAYMENT_PRICE_UPDATED，不创建订单。"""
    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)
    product_id = await get_clink_subscription_product_id()
    payload = await _subscription_order_payload(product_id)

    response = await async_client.post(
        _ORDER_CREATE_PATH,
        json=_stale_order_payload(payload),
        headers={
            "Authorization": "Bearer pytest-token",
            "Accept-Language": "zh-CN",
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == CommonCode.PAYMENT_PRICE_UPDATED.value
    assert body["msg"] == "价格已更新"
    assert body["data"] == {
        "product_id": product_id,
        "payment_method": CLINK_PAYMENT_METHOD,
        "currency": payload["currency"],
        "amount": payload["amount"],
    }

    async with get_async_session() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(OrderModel)
            .where(OrderModel.user_id == user_id)
        )
    assert count == 0


@pytest.mark.asyncio
async def test_create_order_rejects_invalid_paypal_config_before_insert(
    async_client,
    monkeypatch,
    order_api_cleanup: _CleanupState,
):
    """伪造非法 PayPal 配置下单必须在持久化订单前返回价格更新。"""

    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)
    product = SubscriptionProductConfig(
        product_id="unlimited",
        name="Unlimited",
        period="month",
        auto_renew=True,
        display_currency="USD",
        display_amount=9_990_000,
        sort_order=1,
        metadata={"daily_limit": -1},
    )
    channel = PaymentChannelConfig("paypal", "PayPal", {})
    price = SubscriptionProductPriceConfig(
        id=1,
        product_id=product.product_id,
        channel_code=channel.channel_code,
        auto_renew_supported=True,
        currency="EUR",
        amount=9_990_000,
        provider_sku="P-INVALID",
    )

    async def fake_snapshot(*, force_refresh: bool = False):
        assert force_refresh is False
        return PaymentConfigSnapshot(
            products={product.product_id: product},
            channels={channel.channel_code: channel},
            prices={(product.product_id, channel.channel_code): price},
            loaded_at=1,
        )

    monkeypatch.setattr(payment_config_service, "get_snapshot", fake_snapshot)

    response = await async_client.post(
        _ORDER_CREATE_PATH,
        json={
            "product_class": ProductClass.SUBSCRIPTION.value,
            "product_id": product.product_id,
            "payment_method": channel.channel_code,
            "currency": price.currency,
            "amount": price.amount,
            "auto_renew": product.auto_renew,
            "period": product.period,
        },
        headers={"Authorization": "Bearer pytest-token"},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == CommonCode.PAYMENT_PRICE_UPDATED.value
    async with get_async_session() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(OrderModel)
            .where(OrderModel.user_id == user_id)
        )
    assert count == 0


@pytest.mark.asyncio
async def test_create_credit_order_rejects_stale_client_price(
    async_client,
    order_api_cleanup: _CleanupState,
):
    """Credits 客户端价格过期时返回 PAYMENT_PRICE_UPDATED，不创建订单。"""

    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)
    product_id = await get_clink_credit_product_id()
    payload = await _credit_order_payload(product_id)

    response = await async_client.post(
        _ORDER_CREATE_PATH,
        json=_stale_order_payload(payload),
        headers={
            "Authorization": "Bearer pytest-token",
            "Accept-Language": "zh-CN",
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == CommonCode.PAYMENT_PRICE_UPDATED.value
    assert body["msg"] == "价格已更新"
    assert body["data"] == {
        "product_id": product_id,
        "payment_method": CLINK_PAYMENT_METHOD,
        "currency": payload["currency"],
        "amount": payload["amount"],
    }

    async with get_async_session() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(OrderModel)
            .where(OrderModel.user_id == user_id)
        )
    assert count == 0


@pytest.mark.asyncio
async def test_create_credit_order_snapshots_client_language(
    async_client,
    monkeypatch,
    order_api_cleanup: _CleanupState,
):
    """创建 Credits 订单时记录语言并返回公共支持邮箱。"""

    async def fake_config_public_get(c_key: str, *, force_refresh: bool = False):
        assert c_key == "support_mail"
        assert force_refresh is False
        return "zbhydra115@gmail.com"

    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id, language="es-ES")
    _install_fake_payment_provider(monkeypatch)
    monkeypatch.setattr(
        "app.api.client.order_client.config_public_service.get",
        fake_config_public_get,
    )
    product_id = await get_clink_credit_product_id()
    payload = await _credit_order_payload(product_id)

    response = await async_client.post(
        _ORDER_CREATE_PATH,
        json=payload,
        headers={
            "Authorization": "Bearer pytest-token",
            "Accept-Language": "es-ES",
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["support_mail"] == "zbhydra115@gmail.com"
    order_no = str(body["data"]["order_no"])
    order_api_cleanup.order_nos.append(order_no)

    async with get_async_session() as db:
        order = await db.scalar(
            select(OrderModel).where(OrderModel.order_no == order_no)
        )
    assert order is not None
    metadata = json.loads(order.extra_metadata or "{}")
    assert metadata["client_language"] == "es-ES"
    assert metadata["product_snapshot"]["credits_amount"] > 0


@pytest.mark.asyncio
async def test_list_orders_accepts_string_paid_status(
    async_client,
    order_api_cleanup: _CleanupState,
):
    """订单列表接口接受客户端字符串状态筛选。"""
    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)
    order_no = f"ORDAPI{uuid.uuid4().hex[:20].upper()}"
    order_api_cleanup.order_nos.append(order_no)

    async with get_async_session() as db:
        db.add(
            OrderModel(  # type: ignore[call-arg]
                order_no=order_no,
                user_id=user_id,
                product_class=ProductClass.SUBSCRIPTION.value,
                product_id="unlimited",
                product_name="monthly",
                amount=950_000_000,
                currency=PAYPAL_CURRENCY,
                order_status=OrderStatus.PAID.value,
                callback_status=CallbackStatus.SUCCESS.value,
                payment_method=CLINK_PAYMENT_METHOD,
                expired_at=1_900_000_000_000,
            )
        )
        await db.commit()

    response = await async_client.get(
        _ORDER_LIST_PATH,
        params={"status": "paid"},
        headers={"Authorization": "Bearer pytest-token"},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    assert [item["order_no"] for item in body["data"]["orders"]] == [order_no]
    order_item = body["data"]["orders"][0]
    assert isinstance(order_item["order_status"], int)
    assert isinstance(order_item["callback_status"], int)
    assert order_item["paid_at"] is None


@pytest.mark.asyncio
async def test_list_orders_rejects_invalid_status_as_bad_request(
    async_client,
    order_api_cleanup: _CleanupState,
):
    """订单列表非法状态参数返回业务错误，不升级成 500。"""
    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)

    response = await async_client.get(
        _ORDER_LIST_PATH,
        params={"status": "bad_status"},
        headers={
            "Authorization": "Bearer pytest-token",
            "Accept-Language": "zh-CN",
        },
    )
    body = response.json()

    assert response.status_code == 400
    assert body["code"] == CommonCode.INVALID_REQUEST.value
    assert body["data"] == {
        "location": "order_list",
        "field": "status",
        "status": "bad_status",
    }


@pytest.mark.asyncio
async def test_unfinished_orders_returns_visible_pending_payment_entries(
    async_client,
    order_api_cleanup: _CleanupState,
):
    """未完成订单列表只返回当前用户 30 分钟窗口内可继续支付的订单。"""
    user_id = _test_user_id(order_api_cleanup)
    other_user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)
    now_ms = timestamp_now()
    visible_order_no = f"ORDVIS{uuid.uuid4().hex[:18].upper()}"
    expired_order_no = f"ORDEXP{uuid.uuid4().hex[:18].upper()}"
    missing_payment_data_order_no = f"ORDNOPAY{uuid.uuid4().hex[:16].upper()}"
    other_user_order_no = f"ORDOTHER{uuid.uuid4().hex[:16].upper()}"
    order_api_cleanup.order_nos.extend(
        [
            visible_order_no,
            expired_order_no,
            missing_payment_data_order_no,
            other_user_order_no,
        ]
    )

    async with get_async_session() as db:
        db.add_all(
            [
                OrderModel(  # type: ignore[call-arg]
                    order_no=visible_order_no,
                    user_id=user_id,
                    product_class=ProductClass.SUBSCRIPTION.value,
                    product_id="unlimited",
                    product_name="Unlimited",
                    amount=950_000_000,
                    currency=PAYPAL_CURRENCY,
                    order_status=OrderStatus.PENDING.value,
                    callback_status=CallbackStatus.NOT_CALLED.value,
                    payment_method=CLINK_PAYMENT_METHOD,
                    payment_data='{"url":"https://pay.example.com/$visible_invoice"}',
                    expired_at=now_ms + 1_800_000,
                ),
                OrderModel(  # type: ignore[call-arg]
                    order_no=expired_order_no,
                    user_id=user_id,
                    product_class=ProductClass.SUBSCRIPTION.value,
                    product_id="unlimited",
                    product_name="Expired",
                    amount=950_000_000,
                    currency=PAYPAL_CURRENCY,
                    order_status=OrderStatus.PENDING.value,
                    callback_status=CallbackStatus.NOT_CALLED.value,
                    payment_method=CLINK_PAYMENT_METHOD,
                    payment_data='{"url":"https://pay.example.com/$expired_invoice"}',
                    expired_at=now_ms - 1,
                ),
                OrderModel(  # type: ignore[call-arg]
                    order_no=missing_payment_data_order_no,
                    user_id=user_id,
                    product_class=ProductClass.SUBSCRIPTION.value,
                    product_id="unlimited",
                    product_name="Missing payment data",
                    amount=950_000_000,
                    currency=PAYPAL_CURRENCY,
                    order_status=OrderStatus.PENDING.value,
                    callback_status=CallbackStatus.NOT_CALLED.value,
                    payment_method=CLINK_PAYMENT_METHOD,
                    expired_at=now_ms + 1_800_000,
                ),
                OrderModel(  # type: ignore[call-arg]
                    order_no=other_user_order_no,
                    user_id=other_user_id,
                    product_class=ProductClass.SUBSCRIPTION.value,
                    product_id="unlimited",
                    product_name="Other user",
                    amount=950_000_000,
                    currency=PAYPAL_CURRENCY,
                    order_status=OrderStatus.PENDING.value,
                    callback_status=CallbackStatus.NOT_CALLED.value,
                    payment_method=CLINK_PAYMENT_METHOD,
                    payment_data='{"url":"https://pay.example.com/$other_invoice"}',
                    expired_at=now_ms + 1_800_000,
                ),
            ]
        )
        await db.commit()

    response = await async_client.get(
        _ORDER_UNFINISHED_PATH,
        headers={"Authorization": "Bearer pytest-token"},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"]["total"] == 1
    assert body["data"]["orders"] == [
        {
            "order_no": visible_order_no,
            "product_class": ProductClass.SUBSCRIPTION.value,
            "product_id": "unlimited",
            "product_name": "Unlimited",
            "amount": 950_000_000,
            "currency": PAYPAL_CURRENCY,
            "order_status": OrderStatus.PENDING.value,
            "callback_status": CallbackStatus.NOT_CALLED.value,
            "payment_method": CLINK_PAYMENT_METHOD,
            "paid_at": None,
            "created_at": body["data"]["orders"][0]["created_at"],
            "expired_at": now_ms + 1_800_000,
            "payment_data": {"url": "https://pay.example.com/$visible_invoice"},
        }
    ]


@pytest.mark.asyncio
async def test_cancel_pending_order_marks_current_user_order_cancelled(
    async_client,
    order_api_cleanup: _CleanupState,
):
    """当前用户可以取消自己的 pending 订单。"""
    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)
    order_no = f"ORDCANCEL{uuid.uuid4().hex[:15].upper()}"
    order_api_cleanup.order_nos.append(order_no)

    async with get_async_session() as db:
        db.add(
            OrderModel(  # type: ignore[call-arg]
                order_no=order_no,
                user_id=user_id,
                product_class=ProductClass.SUBSCRIPTION.value,
                product_id="unlimited",
                product_name="Monthly",
                amount=950_000_000,
                currency=PAYPAL_CURRENCY,
                order_status=OrderStatus.PENDING.value,
                callback_status=CallbackStatus.NOT_CALLED.value,
                payment_method=CLINK_PAYMENT_METHOD,
                payment_data='{"url":"https://pay.example.com/$cancel_invoice"}',
                expired_at=timestamp_now() + 1_800_000,
            )
        )
        await db.commit()

    response = await async_client.post(
        _ORDER_CANCEL_PATH,
        json={"order_no": order_no},
        headers={"Authorization": "Bearer pytest-token"},
    )
    body = response.json()
    cancelled_order = await order_service.get_order_by_no(order_no)

    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == {
        "order_no": order_no,
        "order_status": OrderStatus.CANCELLED.value,
    }
    assert cancelled_order is not None
    assert cancelled_order.order_status == OrderStatus.CANCELLED.value


@pytest.mark.asyncio
async def test_cancel_paid_order_returns_order_cannot_cancel(
    async_client,
    order_api_cleanup: _CleanupState,
):
    """已支付订单不能被客户端取消。"""
    user_id = _test_user_id(order_api_cleanup)
    _install_user_override(user_id)
    order_no = f"ORDPAID{uuid.uuid4().hex[:18].upper()}"
    order_api_cleanup.order_nos.append(order_no)

    async with get_async_session() as db:
        db.add(
            OrderModel(  # type: ignore[call-arg]
                order_no=order_no,
                user_id=user_id,
                product_class=ProductClass.SUBSCRIPTION.value,
                product_id="unlimited",
                product_name="Monthly",
                amount=950_000_000,
                currency=PAYPAL_CURRENCY,
                order_status=OrderStatus.PAID.value,
                callback_status=CallbackStatus.SUCCESS.value,
                payment_method=CLINK_PAYMENT_METHOD,
                expired_at=timestamp_now() + 1_800_000,
            )
        )
        await db.commit()

    response = await async_client.post(
        _ORDER_CANCEL_PATH,
        json={"order_no": order_no},
        headers={"Authorization": "Bearer pytest-token", "Accept-Language": "zh-CN"},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == CommonCode.ORDER_CANNOT_CANCEL.value
    assert body["msg"] == "当前状态无法取消订单"
    assert body["data"] == {
        "order_no": order_no,
        "order_status": OrderStatus.PAID.value,
    }
