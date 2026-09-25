"""Admin 订单只读查询 API。

提供订单列表筛选和订单详情查看能力。邮箱搜索保持两段查询：先查
`users.email` 得到 user_id，再用订单 service 查询 `orders`。
"""

from __future__ import annotations

from typing import Annotated, TypedDict

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse

from app.api.admin.admin_order_response import serialize_admin_order
from app.api.admin_dependencies import AdminContext, get_admin_user
from app.constants.order import CallbackStatus, OrderStatus
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.order_model import OrderModel
from app.services.order_service import order_service
from app.services.user_service import user_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/orders", tags=["admin-orders"])

OrderNoPath = Annotated[
    str,
    Path(min_length=1, max_length=64, description="订单号"),
]


class _OrderQuery(TypedDict, total=False):
    """订单 service 查询条件。"""

    order_no_like: str
    user_ids: list[int]
    payment_channel_order_no_like: str
    payment_transaction_id_like: str
    order_statuses: list[OrderStatus]
    callback_statuses: list[CallbackStatus]
    product_ids: list[str]
    payment_methods: list[str]
    created_after_ms: int
    created_before_ms: int


@router.get("")
async def list_admin_orders(
    page: int = Query(default=1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(default=50, ge=1, le=100, description="每页数量"),
    order_no: str | None = Query(default=None, max_length=64, description="订单号包含"),
    user_id: int | None = Query(default=None, ge=1, description="用户 ID"),
    user_email: str | None = Query(
        default=None,
        max_length=128,
        description="用户当前邮箱包含",
    ),
    payment_channel_order_no: str | None = Query(
        default=None,
        max_length=256,
        description="支付渠道订单号包含",
    ),
    payment_transaction_id: str | None = Query(
        default=None,
        max_length=256,
        description="支付渠道交易流水 ID 包含",
    ),
    order_status: int | None = Query(default=None, description="订单状态"),
    callback_status: int | None = Query(default=None, description="履约回调状态"),
    product_id: str | None = Query(default=None, max_length=64, description="商品 ID"),
    payment_method: str | None = Query(
        default=None,
        max_length=32,
        description="支付方式",
    ),
    created_from_ms: int | None = Query(
        default=None,
        ge=0,
        description="创建时间起点，毫秒时间戳",
    ),
    created_to_ms: int | None = Query(
        default=None,
        ge=0,
        description="创建时间终点，毫秒时间戳",
    ),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """查询订单列表。"""
    query = await _build_order_query(
        order_no=order_no,
        user_id=user_id,
        user_email=user_email,
        payment_channel_order_no=payment_channel_order_no,
        payment_transaction_id=payment_transaction_id,
        order_status=order_status,
        callback_status=callback_status,
        product_id=product_id,
        payment_method=payment_method,
        created_from_ms=created_from_ms,
        created_to_ms=created_to_ms,
    )
    if query is None:
        return ResponseUtils.ok(
            {
                "rows": [],
                "total": 0,
                "page": page,
                "page_size": page_size,
            }
        )

    offset = (page - 1) * page_size
    orders = await order_service.order_lists(
        **query,
        offset=offset,
        limit=page_size,
        order_by="created_at_desc",
    )
    total = await order_service.count_orders(**query)
    user_email_by_id = await _load_user_email_map(orders)

    return ResponseUtils.ok(
        {
            "rows": [
                serialize_admin_order(order, user_email_by_id.get(order.user_id, ""))
                for order in orders
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@router.get("/{order_no}")
async def get_admin_order_detail(
    order_no: OrderNoPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """查询订单详情。"""
    normalized_order_no = order_no.strip()
    if not normalized_order_no:
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg="admin_order_detail: order_no is empty after strip",
            data={"field": "order_no"},
        )

    order = await order_service.get_order_by_no(normalized_order_no)
    if not order:
        raise AppCommonException(
            CommonCode.ORDER_NOT_FOUND,
            ext_msg=f"admin_order_detail: order not found: order_no={normalized_order_no}",
            data={"order_no": normalized_order_no},
        )

    user_email_by_id = await _load_user_email_map([order])
    return ResponseUtils.ok(
        serialize_admin_order(order, user_email_by_id.get(order.user_id, ""))
    )


async def _build_order_query(
    *,
    order_no: str | None,
    user_id: int | None,
    user_email: str | None,
    payment_channel_order_no: str | None,
    payment_transaction_id: str | None,
    order_status: int | None,
    callback_status: int | None,
    product_id: str | None,
    payment_method: str | None,
    created_from_ms: int | None,
    created_to_ms: int | None,
) -> _OrderQuery | None:
    """把 admin 查询参数转换为订单 service 条件；None 表示必定无结果。"""
    if (
        created_from_ms is not None
        and created_to_ms is not None
        and created_from_ms > created_to_ms
    ):
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=(
                "admin_order_list: invalid created range: "
                f"created_from_ms={created_from_ms}, created_to_ms={created_to_ms}"
            ),
            data={"field": "created_range"},
        )

    filter_user_ids = await _resolve_filter_user_ids(
        user_id, _normalize_text(user_email)
    )
    if filter_user_ids == []:
        return None

    query: _OrderQuery = {}
    normalized_order_no = _normalize_text(order_no)
    if normalized_order_no:
        query["order_no_like"] = normalized_order_no
    if filter_user_ids is not None:
        query["user_ids"] = filter_user_ids
    normalized_channel_order_no = _normalize_text(payment_channel_order_no)
    if normalized_channel_order_no:
        query["payment_channel_order_no_like"] = normalized_channel_order_no
    normalized_transaction_id = _normalize_text(payment_transaction_id)
    if normalized_transaction_id:
        query["payment_transaction_id_like"] = normalized_transaction_id
    if order_status is not None:
        query["order_statuses"] = [_parse_order_status(order_status)]
    if callback_status is not None:
        query["callback_statuses"] = [_parse_callback_status(callback_status)]
    normalized_product_id = _normalize_text(product_id)
    if normalized_product_id:
        query["product_ids"] = [normalized_product_id]
    normalized_payment_method = _normalize_text(payment_method)
    if normalized_payment_method:
        query["payment_methods"] = [normalized_payment_method]
    if created_from_ms is not None:
        query["created_after_ms"] = created_from_ms
    if created_to_ms is not None:
        query["created_before_ms"] = created_to_ms
    return query


async def _resolve_filter_user_ids(
    user_id: int | None,
    user_email: str | None,
) -> list[int] | None:
    """用当前邮箱搜索 user_id；同时传 user_id 时取交集。"""
    if not user_email:
        return [user_id] if user_id is not None else None

    users = await user_service.user_lists(email_like=user_email, limit=1000)
    email_user_ids = {user.user_id for user in users}
    if user_id is not None:
        return [user_id] if user_id in email_user_ids else []
    return sorted(email_user_ids)


async def _load_user_email_map(orders: list[OrderModel]) -> dict[int, str]:
    """批量读取订单关联用户当前邮箱。"""
    user_ids = sorted({order.user_id for order in orders})
    if not user_ids:
        return {}

    users = await user_service.user_lists(user_ids=user_ids, limit=len(user_ids))
    return {user.user_id: user.email or "" for user in users}


def _parse_order_status(value: int) -> OrderStatus:
    """解析订单状态并给出可定位错误。"""
    try:
        return OrderStatus(value)
    except ValueError as exc:
        allowed_values = ",".join(str(status.value) for status in OrderStatus)
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=(
                "admin_order_list: invalid order_status: "
                f"order_status={value}, allowed_values={allowed_values}"
            ),
            data={"field": "order_status", "value": value},
        ) from exc


def _parse_callback_status(value: int) -> CallbackStatus:
    """解析回调状态并给出可定位错误。"""
    try:
        return CallbackStatus(value)
    except ValueError as exc:
        allowed_values = ",".join(str(status.value) for status in CallbackStatus)
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=(
                "admin_order_list: invalid callback_status: "
                f"callback_status={value}, allowed_values={allowed_values}"
            ),
            data={"field": "callback_status", "value": value},
        ) from exc


def _normalize_text(value: str | None) -> str | None:
    """清理查询字符串，空字符串视为未传。"""
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


__all__ = ["router"]
