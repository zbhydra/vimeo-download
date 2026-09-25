"""订单自动续费运维脚本的共享查询与取消逻辑。

该模块只协调已有订单、支付配置和 provider：
1. 从指定订单的支付入口或回调快照提取渠道订阅句柄。
2. PayPal 查询 Billing Subscription 实时状态。
3. 取消时只调用渠道 API，不修改订单、退款或订阅权益到期时间。
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import cast

from app.constants.order import OrderStatus, ProductClass
from app.constants.payment import PAYPAL_PAYMENT_METHOD
from app.models.order_model import OrderModel
from app.provider.payment.payment_base import PaymentProviderError
from app.provider.payment.paypal import PayPalPaymentProvider
from app.services.order_service import order_service
from app.services.payment_service import payment_service

_PAYPAL_AUTO_RENEW_ACTIVE_STATUSES = {"ACTIVE"}
_PAYPAL_CANCEL_AVAILABLE_STATUSES = {"ACTIVE", "SUSPENDED"}
_PAYPAL_INACTIVE_STATUSES = {"CANCELLED", "EXPIRED"}


class OrderAutoRenewScriptError(RuntimeError):
    """订单续费运维脚本无法完成操作。"""


@dataclass(frozen=True, slots=True)
class OrderAutoRenewReference:
    """从本地订单快照解析出的渠道续费引用。"""

    order_no: str
    payment_method: str
    local_order_status: str
    auto_renew_order: bool
    channel_subscription_id: str | None
    channel_uid: str | None


@dataclass(frozen=True, slots=True)
class OrderAutoRenewStatus:
    """脚本输出的统一自动续费状态。"""

    order_no: str
    payment_method: str
    local_order_status: str
    auto_renew_order: bool
    channel_subscription_id: str | None
    channel_uid: str | None
    provider_status: str
    auto_renew_active: bool | None
    cancel_available: bool
    status_source: str
    status_update_time: str | None = None
    next_billing_time: str | None = None

    def to_dict(self) -> dict[str, object]:
        """转换为稳定的 JSON 输出对象。"""

        return asdict(self)


@dataclass(frozen=True, slots=True)
class OrderAutoRenewCancelResult:
    """渠道取消动作的统一结果。"""

    order_no: str
    payment_method: str
    channel_subscription_id: str
    result: str
    previous_provider_status: str
    provider_status: str

    def to_dict(self) -> dict[str, object]:
        """转换为稳定的 JSON 输出对象。"""

        return asdict(self)


async def query_order_auto_renew(order_no: str) -> OrderAutoRenewStatus:
    """按本地订单号查询自动续费状态。

    Args:
        order_no: 本地 orders.order_no。

    Returns:
        本地续费引用与渠道状态。
    """

    reference = await _load_order_reference(order_no)
    if not reference.auto_renew_order:
        return _status_without_provider(
            reference,
            provider_status="NOT_AUTO_RENEW_ORDER",
            auto_renew_active=False,
            status_source="local_order_snapshot",
        )

    if reference.payment_method == PAYPAL_PAYMENT_METHOD:
        subscription_id = _require_subscription_id(reference)
        provider = await payment_service.get_provider_for_existing_payment(
            reference.payment_method
        )
        if not isinstance(provider, PayPalPaymentProvider):
            raise OrderAutoRenewScriptError(
                "query_order_auto_renew: PayPal provider type mismatch: "
                f"order_no={reference.order_no}, provider={type(provider).__name__}"
            )
        provider_status = await provider.get_subscription_status(subscription_id)
        return OrderAutoRenewStatus(
            order_no=reference.order_no,
            payment_method=reference.payment_method,
            local_order_status=reference.local_order_status,
            auto_renew_order=True,
            channel_subscription_id=subscription_id,
            channel_uid=reference.channel_uid,
            provider_status=provider_status.status,
            auto_renew_active=(
                provider_status.status in _PAYPAL_AUTO_RENEW_ACTIVE_STATUSES
            ),
            cancel_available=(
                provider_status.status in _PAYPAL_CANCEL_AVAILABLE_STATUSES
            ),
            status_source="paypal_api",
            status_update_time=provider_status.status_update_time,
            next_billing_time=provider_status.next_billing_time,
        )

    raise OrderAutoRenewScriptError(
        "query_order_auto_renew: unsupported payment method: "
        f"order_no={reference.order_no}, payment_method={reference.payment_method}"
    )


async def cancel_order_auto_renew(order_no: str) -> OrderAutoRenewCancelResult:
    """按本地订单号取消渠道后续自动扣款。

    Args:
        order_no: 本地 orders.order_no。

    Returns:
        渠道取消结果；不会修改本地订单与订阅权益。
    """

    current = await query_order_auto_renew(order_no)
    if not current.auto_renew_order:
        raise OrderAutoRenewScriptError(
            "cancel_order_auto_renew: order is not an auto-renew order: "
            f"order_no={current.order_no}, payment_method={current.payment_method}"
        )
    subscription_id = current.channel_subscription_id
    if not subscription_id:
        raise OrderAutoRenewScriptError(
            "cancel_order_auto_renew: channel subscription id missing: "
            f"order_no={current.order_no}, payment_method={current.payment_method}"
        )

    provider = await payment_service.get_provider_for_existing_payment(
        current.payment_method
    )
    if isinstance(provider, PayPalPaymentProvider):
        if current.provider_status in _PAYPAL_INACTIVE_STATUSES:
            return OrderAutoRenewCancelResult(
                order_no=current.order_no,
                payment_method=current.payment_method,
                channel_subscription_id=subscription_id,
                result="already_inactive",
                previous_provider_status=current.provider_status,
                provider_status=current.provider_status,
            )
        if not current.cancel_available:
            raise OrderAutoRenewScriptError(
                "cancel_order_auto_renew: PayPal subscription status cannot be "
                "cancelled: "
                f"order_no={current.order_no}, subscription_id={subscription_id}, "
                f"provider_status={current.provider_status}"
            )
        await provider.cancel_subscription(
            subscription_id,
            reason=f"Cancelled by operator for local order {current.order_no}",
        )
        updated = await provider.get_subscription_status(subscription_id)
        result = (
            "cancelled"
            if updated.status in _PAYPAL_INACTIVE_STATUSES
            else "cancel_requested"
        )
        return OrderAutoRenewCancelResult(
            order_no=current.order_no,
            payment_method=current.payment_method,
            channel_subscription_id=subscription_id,
            result=result,
            previous_provider_status=current.provider_status,
            provider_status=updated.status,
        )

    raise OrderAutoRenewScriptError(
        "cancel_order_auto_renew: provider type is unsupported: "
        f"order_no={current.order_no}, provider={type(provider).__name__}"
    )


async def _load_order_reference(order_no: str) -> OrderAutoRenewReference:
    """读取订单并提取自动续费句柄。"""

    normalized_order_no = order_no.strip()
    if not normalized_order_no:
        raise OrderAutoRenewScriptError(
            "load_order_auto_renew_reference: order_no is empty"
        )
    order = await order_service.get_order_by_no(normalized_order_no)
    if order is None:
        raise OrderAutoRenewScriptError(
            "load_order_auto_renew_reference: order not found: "
            f"order_no={normalized_order_no}"
        )
    if order.product_class != ProductClass.SUBSCRIPTION.value:
        raise OrderAutoRenewScriptError(
            "load_order_auto_renew_reference: order is not a subscription order: "
            f"order_no={order.order_no}, product_class={order.product_class}"
        )
    return _reference_from_order(order)


def _reference_from_order(order: OrderModel) -> OrderAutoRenewReference:
    """从一条订阅订单解析渠道自动续费引用。"""

    payment_method = (order.payment_method or "").strip()
    payment_data = _load_json_object(
        order.payment_data,
        context=f"order_no={order.order_no}, field=payment_data",
    )
    metadata = _load_json_object(
        order.extra_metadata,
        context=f"order_no={order.order_no}, field=extra_metadata",
    )
    callback = _object_value(metadata, "payment_callback") or metadata
    snapshot = _object_value(metadata, "product_snapshot")
    snapshot_metadata = _object_value(snapshot, "metadata")
    snapshot_auto_renew = _bool_value(snapshot_metadata, "auto_renew") is True

    subscription_id: str | None = None
    callback_is_recurring = _bool_value(callback, "is_recurring") is True
    if payment_method == PAYPAL_PAYMENT_METHOD:
        subscription_id = _string_value(payment_data, "paypal_subscription_id")
        if subscription_id is None and _string_value(
            payment_data,
            "paypal_plan_id",
        ):
            subscription_id = _string_value(payment_data, "channel_order_id")
        subscription_id = subscription_id or _string_value(
            callback,
            "paypal_subscription_id",
        )

    return OrderAutoRenewReference(
        order_no=order.order_no,
        payment_method=payment_method,
        local_order_status=_order_status_name(order.order_status),
        auto_renew_order=(
            snapshot_auto_renew
            or callback_is_recurring
            or (payment_method == PAYPAL_PAYMENT_METHOD and subscription_id is not None)
        ),
        channel_subscription_id=subscription_id,
        channel_uid=(
            order.payment_channel_uid.strip() if order.payment_channel_uid else None
        ),
    )


def _load_json_object(raw: str | None, *, context: str) -> dict[str, object]:
    """解析订单 JSON 快照；空值返回空对象，坏数据直接阻止渠道操作。"""

    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise OrderAutoRenewScriptError(
            f"load_order_auto_renew_reference: invalid JSON: {context}, error={exc}"
        ) from exc
    if not isinstance(parsed, dict):
        raise OrderAutoRenewScriptError(
            "load_order_auto_renew_reference: JSON value is not an object: "
            f"{context}, actual_type={type(parsed).__name__}"
        )
    return cast(dict[str, object], parsed)


def _object_value(
    data: dict[str, object] | None,
    field: str,
) -> dict[str, object] | None:
    """读取 JSON 对象字段。"""

    if data is None:
        return None
    value = data.get(field)
    if not isinstance(value, dict):
        return None
    return cast(dict[str, object], value)


def _string_value(data: dict[str, object] | None, field: str) -> str | None:
    """读取非空 JSON 字符串字段。"""

    if data is None:
        return None
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def _bool_value(data: dict[str, object] | None, field: str) -> bool | None:
    """读取 JSON 布尔字段。"""

    if data is None:
        return None
    value = data.get(field)
    return value if isinstance(value, bool) else None


def _order_status_name(value: int) -> str:
    """把本地订单状态值转换为稳定名称。"""

    try:
        return OrderStatus(value).name
    except ValueError:
        return f"UNKNOWN({value})"


def _require_subscription_id(reference: OrderAutoRenewReference) -> str:
    """读取渠道订阅句柄，缺失时给出可定位错误。"""

    if reference.channel_subscription_id:
        return reference.channel_subscription_id
    raise OrderAutoRenewScriptError(
        "query_order_auto_renew: channel subscription id missing: "
        f"order_no={reference.order_no}, payment_method={reference.payment_method}, "
        f"local_order_status={reference.local_order_status}"
    )


def _status_without_provider(
    reference: OrderAutoRenewReference,
    *,
    provider_status: str,
    auto_renew_active: bool | None,
    status_source: str,
) -> OrderAutoRenewStatus:
    """构造无需或无法请求渠道时的状态。"""

    return OrderAutoRenewStatus(
        order_no=reference.order_no,
        payment_method=reference.payment_method,
        local_order_status=reference.local_order_status,
        auto_renew_order=reference.auto_renew_order,
        channel_subscription_id=reference.channel_subscription_id,
        channel_uid=reference.channel_uid,
        provider_status=provider_status,
        auto_renew_active=auto_renew_active,
        cancel_available=(
            reference.auto_renew_order and reference.channel_subscription_id is not None
        ),
        status_source=status_source,
    )


def format_json(data: dict[str, object]) -> str:
    """生成脚本统一的可读 JSON 输出。"""

    return json.dumps(data, ensure_ascii=False, indent=2)


def format_script_error(exc: Exception) -> str:
    """保留 provider 的详细上下文并统一脚本错误前缀。"""

    if isinstance(exc, (OrderAutoRenewScriptError, PaymentProviderError)):
        return str(exc)
    return f"unexpected {type(exc).__name__}: {exc}"
