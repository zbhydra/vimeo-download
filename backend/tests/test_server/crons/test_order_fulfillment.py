"""订单履约补偿 cron 测试。"""

from dataclasses import dataclass, field

import pytest

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.crons.task import order_fulfillment
from app.crons.task.order_fulfillment import (
    ORDER_FULFILLMENT_COMPENSATION_BATCH_LIMIT,
    ORDER_FULFILLMENT_COMPENSATION_STALE_MS,
    compensate_paid_pending_subscription_orders,
)
from app.models.order_model import OrderModel


def _paid_pending_subscription_order(order_no: str = "ORD-CRON-001") -> OrderModel:
    """构造待补偿订阅订单对象。"""
    return OrderModel(  # type: ignore[call-arg]
        id=1,
        order_no=order_no,
        user_id=9001,
        product_class=ProductClass.SUBSCRIPTION.value,
        product_id="unlimited",
        product_name="monthly",
        amount=950_000_000,
        currency="XTR",
        order_status=OrderStatus.PAID.value,
        callback_status=CallbackStatus.PENDING.value,
        payment_method="telegram_stars",
        paid_amount=950_000_000,
        paid_currency="XTR",
        created_at=99_000,
        updated_at=99_000,
        paid_at=99_000,
        expired_at=199_000,
    )


@dataclass
class _FakeOrderService:
    """履约补偿测试用订单服务替身。"""

    orders: list[OrderModel]
    result: bool | Exception = True
    fulfilled_order_nos: list[str] = field(default_factory=list)

    async def order_lists(self, **kwargs) -> list[OrderModel]:
        """记录补偿扫描参数并返回固定订单。"""
        assert kwargs["limit"] == ORDER_FULFILLMENT_COMPENSATION_BATCH_LIMIT
        assert kwargs["order_by"] == "updated_at_asc"
        assert kwargs["order_statuses"] == [OrderStatus.PAID]
        assert kwargs["callback_statuses"] == [
            CallbackStatus.PENDING,
            CallbackStatus.FAILED,
        ]
        assert kwargs["product_classes"] == [
            ProductClass.SUBSCRIPTION,
            ProductClass.RECHARGE,
        ]
        return self.orders

    async def fulfill_paid_order(self, order: OrderModel) -> bool:
        """记录履约订单，并按测试场景返回或抛错。"""
        self.fulfilled_order_nos.append(order.order_no)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.mark.asyncio
async def test_cron_scans_stale_paid_pending_subscription_orders(
    monkeypatch,
) -> None:
    """滞留订阅订单扫描条件必须走通用 order_lists。"""
    calls: list[dict[str, object]] = []

    async def fake_order_lists(**kwargs) -> list[OrderModel]:
        calls.append(kwargs)
        return []

    monkeypatch.setattr(order_fulfillment, "timestamp_now", lambda: 120_000)
    monkeypatch.setattr(
        order_fulfillment.order_service, "order_lists", fake_order_lists
    )

    await compensate_paid_pending_subscription_orders()

    assert calls == [
        {
            "order_statuses": [OrderStatus.PAID],
            "callback_statuses": [CallbackStatus.PENDING, CallbackStatus.FAILED],
            "product_classes": [ProductClass.SUBSCRIPTION, ProductClass.RECHARGE],
            "updated_before_ms": (120_000 - ORDER_FULFILLMENT_COMPENSATION_STALE_MS),
            "limit": ORDER_FULFILLMENT_COMPENSATION_BATCH_LIMIT,
            "order_by": "updated_at_asc",
        }
    ]


@pytest.mark.asyncio
async def test_cron_fulfills_stale_paid_pending_subscription_order(
    monkeypatch,
) -> None:
    """扫描到的滞留订阅订单会调用订单侧履约补偿。"""
    order = _paid_pending_subscription_order()
    fake_order_service = _FakeOrderService([order])
    monkeypatch.setattr(order_fulfillment, "order_service", fake_order_service)

    await compensate_paid_pending_subscription_orders()

    assert fake_order_service.fulfilled_order_nos == [order.order_no]


@pytest.mark.asyncio
async def test_cron_counts_unfulfilled_order_as_skipped(
    monkeypatch,
) -> None:
    """订单侧未完成履约时，cron 不再直接改订单状态。"""
    order = _paid_pending_subscription_order()
    fake_order_service = _FakeOrderService([order], result=False)
    monkeypatch.setattr(order_fulfillment, "order_service", fake_order_service)

    await compensate_paid_pending_subscription_orders()

    assert fake_order_service.fulfilled_order_nos == [order.order_no]


@pytest.mark.asyncio
async def test_cron_keeps_order_pending_after_runtime_fulfillment_error(
    monkeypatch,
) -> None:
    """运行时异常只记录日志，订单保持 PENDING 等下轮重试。"""
    order = _paid_pending_subscription_order()
    fake_order_service = _FakeOrderService([order], result=RuntimeError("db timeout"))
    monkeypatch.setattr(order_fulfillment, "order_service", fake_order_service)

    await compensate_paid_pending_subscription_orders()

    assert fake_order_service.fulfilled_order_nos == [order.order_no]
