"""订单 Feishu 告警工具测试。"""

import pytest

from app.constants.order import OrderStatus, ProductClass
from app.models.order_model import OrderModel
from app.utils import order_alarm_utils
from app.utils.time import timestamp_to_datetime_str


def _paid_order(
    *,
    amount: int = 850_000_000,
    currency: str = "USD",
    product_class: ProductClass = ProductClass.RECHARGE,
) -> OrderModel:
    """构造告警内容测试用已支付订单。"""
    return OrderModel(  # type: ignore[call-arg]
        id=1,
        order_no="ORD-ALARM-001",
        user_id=9001,
        product_class=product_class.value,
        product_id="credit_200",
        product_name="200 Credits",
        amount=amount,
        currency=currency,
        order_status=OrderStatus.PAID.value,
        payment_method="clink",
        payment_channel_order_no="clink-charge-001",
        payment_channel_uid="clink-user-001",
        paid_amount=amount,
        paid_currency=currency,
        paid_at=1_760_000_000_000,
        created_at=1_760_000_000_000,
        updated_at=1_760_000_000_000,
        expired_at=1_760_003_600_000,
    )


def test_build_purchase_success_content_contains_required_fields() -> None:
    """成功告警包含用户、时间、商品、金额和渠道。"""
    order = _paid_order(amount=12_990_000, currency="USD")
    content = order_alarm_utils._build_purchase_success_content(
        order,
        user_line="user_id=9001，email=buyer@example.com",
        fulfilled_at_ms=1_760_000_060_000,
    )

    assert content == "\n".join(
        [
            "付费订单履约成功",
            "用户：user_id=9001，email=buyer@example.com",
            f"支付时间：{timestamp_to_datetime_str(1_760_000_000_000)}",
            f"履约时间：{timestamp_to_datetime_str(1_760_000_060_000)}",
            "商品：200 Credits（RECHARGE / credit_200）",
            "金额：12.99 USD",
            "渠道：clink",
            "订单号：ORD-ALARM-001",
            "渠道订单号：clink-charge-001",
            "渠道用户：clink-user-001",
        ]
    )


def test_build_fulfillment_failed_content_contains_error_context() -> None:
    """失败告警包含履约错误与处理建议。"""
    order = _paid_order()
    content = order_alarm_utils._build_fulfillment_failed_content(
        order,
        user_line="user_id=9001",
        failed_at_ms=1_760_000_120_000,
        reason="ValueError",
        error_message="credits_amount missing",
    )

    assert "付费订单履约失败" in content
    assert "用户：user_id=9001" in content
    assert f"失败时间：{timestamp_to_datetime_str(1_760_000_120_000)}" in content
    assert "商品：200 Credits（RECHARGE / credit_200）" in content
    assert "金额：850 USD" in content
    assert "渠道：clink" in content
    assert "失败原因：ValueError" in content
    assert "错误信息：credits_amount missing" in content
    assert "处理建议：" in content


@pytest.mark.asyncio
async def test_send_order_purchase_success_alarm_calls_feishu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """成功告警走统一 Feishu 出口，并按订单号去重。"""
    calls: list[dict[str, object]] = []

    async def fake_order_user_line(user_id: int) -> str:
        return f"user_id={user_id}，email=buyer@example.com"

    async def fake_send_feishu_alarm(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(order_alarm_utils, "_order_user_line", fake_order_user_line)
    monkeypatch.setattr(order_alarm_utils, "send_feishu_alarm", fake_send_feishu_alarm)
    monkeypatch.setattr(order_alarm_utils, "timestamp_now", lambda: 1_760_000_060_000)

    await order_alarm_utils.send_order_purchase_success_alarm(_paid_order())

    assert calls[0]["title"] == "付费订单履约成功"
    assert calls[0]["dedup_key"] == "warning_order_purchase_success:ORD-ALARM-001"
    assert (
        calls[0]["dedup_seconds"]
        == order_alarm_utils.ORDER_PURCHASE_ALARM_DEDUP_SECONDS
    )
    assert "用户：user_id=9001，email=buyer@example.com" in str(calls[0]["content"])


@pytest.mark.asyncio
async def test_send_order_fulfillment_failed_alarm_calls_feishu(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """履约失败告警走统一 Feishu 出口，并按订单号去重。"""
    calls: list[dict[str, object]] = []

    async def fake_order_user_line(user_id: int) -> str:
        return f"user_id={user_id}"

    async def fake_send_feishu_alarm(**kwargs: object) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(order_alarm_utils, "_order_user_line", fake_order_user_line)
    monkeypatch.setattr(order_alarm_utils, "send_feishu_alarm", fake_send_feishu_alarm)
    monkeypatch.setattr(order_alarm_utils, "timestamp_now", lambda: 1_760_000_120_000)

    await order_alarm_utils.send_order_fulfillment_failed_alarm(
        _paid_order(),
        reason="timeout",
        error_message="timeout_seconds=10",
    )

    assert calls[0]["title"] == "付费订单履约失败"
    assert calls[0]["dedup_key"] == "warning_order_fulfillment_failed:ORD-ALARM-001"
    assert (
        calls[0]["dedup_seconds"]
        == order_alarm_utils.ORDER_FULFILLMENT_FAILED_ALARM_DEDUP_SECONDS
    )
    assert "失败原因：timeout" in str(calls[0]["content"])
