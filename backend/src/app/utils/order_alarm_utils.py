"""订单 Feishu 告警调度工具。

订单支付履约链路只负责调度告警任务：
    - 履约成功后异步发送一条付费订单成功告警。
    - 履约失败或超时后异步发送一条失败告警。
    - 告警失败只记录日志，不影响支付、履约和补偿任务。
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Coroutine
from decimal import Decimal

from sqlalchemy import select

from app.constants.order import ProductClass
from app.core.database import get_async_session
from app.models.order_model import OrderModel
from app.models.user_model import UserModel
from app.utils.feishu_utils import send_feishu_alarm
from app.utils.logger import logger
from app.utils.money import NORMALIZED_AMOUNT_FACTOR
from app.utils.time import timestamp_now, timestamp_to_datetime_str

ORDER_PURCHASE_ALARM_DEDUP_SECONDS = 86_400
ORDER_FULFILLMENT_FAILED_ALARM_DEDUP_SECONDS = 86_400


def schedule_order_purchase_success_alarm(order: OrderModel) -> None:
    """后台调度付费订单履约成功 Feishu 告警。"""
    if _skip_alarm_schedule_in_pytest():
        return

    async def _send() -> None:
        try:
            await send_order_purchase_success_alarm(order)
        except Exception as alarm_exc:
            logger.error(
                "order purchase success Feishu alarm failed "
                "order_no=%s user_id=%s error=%s",
                order.order_no,
                order.user_id,
                alarm_exc,
                exc_info=True,
            )

    _create_alarm_task(_send(), order_no=order.order_no, alarm_type="purchase_success")


def schedule_order_fulfillment_failed_alarm(
    order: OrderModel,
    *,
    reason: str,
    error_message: str,
) -> None:
    """后台调度付费订单履约失败 Feishu 告警。"""
    if _skip_alarm_schedule_in_pytest():
        return

    async def _send() -> None:
        try:
            await send_order_fulfillment_failed_alarm(
                order,
                reason=reason,
                error_message=error_message,
            )
        except Exception as alarm_exc:
            logger.error(
                "order fulfillment failed Feishu alarm failed "
                "order_no=%s user_id=%s reason=%s error=%s",
                order.order_no,
                order.user_id,
                reason,
                alarm_exc,
                exc_info=True,
            )

    _create_alarm_task(
        _send(),
        order_no=order.order_no,
        alarm_type="fulfillment_failed",
    )


async def send_order_purchase_success_alarm(order: OrderModel) -> None:
    """发送付费订单履约成功 Feishu 告警。"""
    user_line = await _order_user_line(order.user_id)
    await send_feishu_alarm(
        title="付费订单履约成功",
        content=_build_purchase_success_content(
            order,
            user_line=user_line,
            fulfilled_at_ms=timestamp_now(),
        ),
        dedup_key=f"warning_order_purchase_success:{order.order_no}",
        dedup_seconds=ORDER_PURCHASE_ALARM_DEDUP_SECONDS,
    )


async def send_order_fulfillment_failed_alarm(
    order: OrderModel,
    *,
    reason: str,
    error_message: str,
) -> None:
    """发送付费订单履约失败 Feishu 告警。"""
    user_line = await _order_user_line(order.user_id)
    await send_feishu_alarm(
        title="付费订单履约失败",
        content=_build_fulfillment_failed_content(
            order,
            user_line=user_line,
            failed_at_ms=timestamp_now(),
            reason=reason,
            error_message=error_message,
        ),
        dedup_key=f"warning_order_fulfillment_failed:{order.order_no}",
        dedup_seconds=ORDER_FULFILLMENT_FAILED_ALARM_DEDUP_SECONDS,
    )


def _create_alarm_task(
    coroutine: Coroutine[object, object, None],
    *,
    order_no: str,
    alarm_type: str,
) -> None:
    """创建后台告警任务；无事件循环时只记日志。"""
    try:
        asyncio.get_running_loop().create_task(coroutine)
    except RuntimeError:
        coroutine.close()
        logger.error(
            "order Feishu alarm skipped because no running loop "
            "order_no=%s alarm_type=%s",
            order_no,
            alarm_type,
        )


def _skip_alarm_schedule_in_pytest() -> bool:
    """pytest 中跳过真实调度，避免本地配置误发真实 Feishu。"""
    return os.environ.get("PYTEST_RUNNING") == "true"


async def _order_user_line(user_id: int) -> str:
    """读取订单用户的告警展示行；用户缺失时仍保留 user_id。"""
    async with get_async_session() as db:
        user = await db.scalar(select(UserModel).where(UserModel.user_id == user_id))
    if not user:
        return f"user_id={user_id}（用户记录不存在）"

    parts = [f"user_id={user.user_id}"]
    if user.email:
        parts.append(f"email={user.email}")
    if user.full_name:
        parts.append(f"name={user.full_name}")
    return "，".join(parts)


def _build_purchase_success_content(
    order: OrderModel,
    *,
    user_line: str,
    fulfilled_at_ms: int,
) -> str:
    """构造履约成功告警正文。"""
    lines = [
        "付费订单履约成功",
        f"用户：{user_line}",
        f"支付时间：{_format_timestamp(order.paid_at)}",
        f"履约时间：{_format_timestamp(fulfilled_at_ms)}",
        f"商品：{order.product_name}（{_product_class_label(order)} / {order.product_id}）",
        f"金额：{_format_order_amount(order)}",
        f"渠道：{order.payment_method or '-'}",
        f"订单号：{order.order_no}",
    ]
    _append_optional_channel_lines(lines, order)
    return "\n".join(lines)


def _build_fulfillment_failed_content(
    order: OrderModel,
    *,
    user_line: str,
    failed_at_ms: int,
    reason: str,
    error_message: str,
) -> str:
    """构造履约失败告警正文。"""
    lines = [
        "付费订单履约失败",
        f"用户：{user_line}",
        f"支付时间：{_format_timestamp(order.paid_at)}",
        f"失败时间：{_format_timestamp(failed_at_ms)}",
        f"商品：{order.product_name}（{_product_class_label(order)} / {order.product_id}）",
        f"金额：{_format_order_amount(order)}",
        f"渠道：{order.payment_method or '-'}",
        f"订单号：{order.order_no}",
    ]
    _append_optional_channel_lines(lines, order)
    lines.extend(
        [
            f"失败原因：{reason}",
            f"错误信息：{error_message}",
            "处理建议：检查订单快照、用户权益记录和支付回调日志；必要时修复数据后等待补偿任务重试",
        ]
    )
    return "\n".join(lines)


def _append_optional_channel_lines(lines: list[str], order: OrderModel) -> None:
    """补充渠道流水与渠道用户，缺失时不占行。"""
    if order.payment_channel_order_no:
        lines.append(f"渠道订单号：{order.payment_channel_order_no}")
    if order.payment_channel_uid:
        lines.append(f"渠道用户：{order.payment_channel_uid}")


def _format_timestamp(value: int | None) -> str:
    """把毫秒时间戳转成告警里的可读时间。"""
    if value is None:
        return "-"
    return timestamp_to_datetime_str(value)


def _format_order_amount(order: OrderModel) -> str:
    """按订单 6 位精度金额格式化展示。"""
    amount = Decimal(order.amount) / Decimal(NORMALIZED_AMOUNT_FACTOR)
    amount_text = format(amount, "f")
    if "." in amount_text:
        amount_text = amount_text.rstrip("0").rstrip(".")
    return f"{amount_text or '0'} {order.currency}"


def _product_class_label(order: OrderModel) -> str:
    """返回稳定的商品类别标签，未知枚举保留原始值。"""
    try:
        return ProductClass(order.product_class).name
    except ValueError:
        return f"UNKNOWN({order.product_class})"
