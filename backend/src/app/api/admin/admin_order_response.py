"""Admin 订单响应序列化工具。

订单管理页和通用用户信息弹窗都需要展示同一组订单只读字段。本模块只做
OrderModel -> JSON 友好 dict 的转换，避免两个 admin API 维护两份字段映射。
"""

from __future__ import annotations

import json

from app.models.order_model import OrderModel


def serialize_admin_order(order: OrderModel, user_email: str) -> dict[str, object]:
    """序列化订单给管理后台展示。"""
    return {
        "id": order.id,
        "order_no": order.order_no,
        "user_id": order.user_id,
        "user_email": user_email,
        "product_class": order.product_class,
        "product_id": order.product_id,
        "product_name": order.product_name,
        "amount": order.amount,
        "currency": order.currency,
        "order_status": order.order_status,
        "callback_status": order.callback_status,
        "payment_method": order.payment_method or "",
        "payment_data": decode_admin_json_value(order.payment_data),
        "payment_channel_order_no": order.payment_channel_order_no or "",
        "payment_transaction_id": order.payment_transaction_id or "",
        "payment_channel_uid": order.payment_channel_uid or "",
        "paid_amount": order.paid_amount,
        "paid_currency": order.paid_currency or "",
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "paid_at": order.paid_at,
        "expired_at": order.expired_at,
        "client_ip": order.client_ip or "",
        "extra_metadata": decode_admin_json_value(order.extra_metadata),
    }


def decode_admin_json_value(raw_value: str | None) -> object | None:
    """解析订单 JSON 字段；历史坏数据按原字符串回显。"""
    if not raw_value:
        return None
    try:
        parsed: object = json.loads(raw_value)
    except json.JSONDecodeError:
        return raw_value
    if isinstance(parsed, (dict, list, str, int, float, bool)) or parsed is None:
        return parsed
    return raw_value
