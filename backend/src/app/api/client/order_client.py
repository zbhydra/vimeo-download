"""订单管理 API - 客户端接口。

创建订单流程：
1. payment_service.is_supported_method 确认支付入口已实现。
2. order_service.check_product 按 product_class 分发业务校验。
3. order_service.create_order 写入商品、渠道、金额快照。
4. payment_service.get_provider 按 payment_method 创建支付 provider。
5. provider.create_payment 创建支付数据并原样返回给前端。
"""

from fastapi import APIRouter, Depends

from app.api.user_dependencies import UserContext, get_current_user
from app.constants.order import OrderCheckProductParam, OrderStatus
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.payment.payment_base import PaymentProviderError, PaymentRequest
from app.schemas.order_schema import (
    CancelOrderApiResponse,
    CancelOrderRequest,
    CreateOrderApiResponse,
    CreateOrderRequest,
    OrderListApiResponse,
    OrderStatusApiResponse,
    UnfinishedOrderListApiResponse,
)
from app.services.config_public_service import config_public_service
from app.services.order_service import order_service
from app.services.payment_service import payment_service
from app.utils.response import ResponseUtils
from app.utils.time import timestamp_now

router = APIRouter(prefix="/order", tags=["订单管理"])

_SUPPORT_MAIL_CONFIG_KEY = "support_mail"


@router.post("/create", response_model=CreateOrderApiResponse)
async def create_order(
    data: CreateOrderRequest,
    current_user: UserContext = Depends(get_current_user),
):
    """创建订单

    请求体:
    - product_class: 商品类别（枚举值，1=订阅，2=充值...）
    - product_id: 商品ID（业务系统定义，如 "unlimited", "credit_50"）
    - payment_method: 支付方式，对应配置表 channel_code
    - amount: 订单金额，统一 6 位精度整数
    - currency: 货币类型

    响应:
    - order_no: 订单号
    - amount: 订单金额，统一 6 位精度整数
    - currency: 货币类型
    - expired_at: 过期时间（毫秒时间戳）
    - payment_data: 支付渠道返回数据
    """

    payment_method = data.payment_method.strip()
    if not payment_service.is_supported_method(payment_method):
        raise AppCommonException(
            CommonCode.PAYMENT_UNSUPPORTED_METHOD,
            ext_msg=(
                "order_create: unsupported payment method before order creation: "
                f"payment_method={payment_method}, product_class={data.product_class}, "
                f"product_id={data.product_id}"
            ),
            data={"payment_method": payment_method},
        )

    create_param = await order_service.check_product(
        OrderCheckProductParam(
            user_id=current_user.user_id,
            product_class=data.product_class,
            product_id=data.product_id,
            payment_method=payment_method,
            currency=data.currency,
            amount=data.amount,
            auto_renew=data.auto_renew,
            period=data.period,
            client_ip=current_user.ip or current_user.device_id,
            language=current_user.language,
        )
    )
    order = await order_service.create_order(create_param)
    provider = await payment_service.get_provider(payment_method)

    try:
        payment_data = await provider.create_payment(
            PaymentRequest(
                order_no=order.order_no,
                payment_method=order.payment_method or "",
                order_status=order.order_status,
                amount=order.amount,
                currency=order.currency,
                product_name=order.product_name,
                expired_at=order.expired_at,
                client_ip=current_user.ip or current_user.device_id,
                user_id=order.user_id,
                auto_renew=create_param.auto_renew,
                provider_sku=create_param.provider_sku,
            )
        )
    except PaymentProviderError as exc:
        raise AppCommonException(
            CommonCode.PAYMENT_GATEWAY_ERROR,
            ext_msg=f"order_create: payment gateway failed: {exc}",
        ) from exc
    payment_data_saved = await order_service.save_order_payment_data(
        order_no=order.order_no,
        payment_data=payment_data,
    )
    if not payment_data_saved:
        raise AppCommonException(
            CommonCode.PAYMENT_GATEWAY_ERROR,
            ext_msg=(
                "order_create: payment data save failed after gateway success: "
                f"order_no={order.order_no}, payment_method={payment_method}"
            ),
        )

    raw_support_mail = await config_public_service.get(_SUPPORT_MAIL_CONFIG_KEY)
    support_mail = raw_support_mail.strip() if isinstance(raw_support_mail, str) else ""
    return ResponseUtils.ok(
        {
            "order_no": order.order_no,
            "amount": order.amount,
            "currency": order.currency,
            "expired_at": order.expired_at,
            "support_mail": support_mail,
            "payment_data": payment_data,
        }
    )


@router.get("/status/{order_no}", response_model=OrderStatusApiResponse)
async def get_order_status(
    order_no: str,
    current_user: UserContext = Depends(get_current_user),
):
    """查询订单状态（客户端轮询接口）

    响应:
    - order_no: 订单号
    - product_name: 商品名称
    - amount: 订单金额，统一 6 位精度整数
    - currency: 货币
    - order_status: 订单状态
    - callback_status: 回调状态
    - payment_method: 支付方式
    - paid_at: 支付时间
    - created_at: 创建时间
    """
    order = await order_service.get_order_by_no(order_no)

    if not order:
        return ResponseUtils.error(CommonCode.ORDER_NOT_FOUND)

    # 权限检查：只能查询自己的订单
    if order.user_id != current_user.user_id:
        return ResponseUtils.error(CommonCode.ORDER_NOT_FOUND)

    return ResponseUtils.ok(
        {
            "order_no": order.order_no,
            "product_class": order.product_class,
            "product_id": order.product_id,
            "product_name": order.product_name,
            "amount": order.amount,
            "currency": order.currency,
            "order_status": order.order_status,
            "callback_status": order.callback_status,
            "payment_method": order.payment_method,
            "paid_at": order.paid_at,
            "created_at": order.created_at,
            "expired_at": order.expired_at,
        }
    )


@router.get("/list", response_model=OrderListApiResponse)
async def list_orders(
    status: str = None,
    offset: int = 0,
    limit: int = 20,
    current_user: UserContext = Depends(get_current_user),
):
    """获取订单列表

    参数:
    - status: 订单状态（可选）
    - offset: 偏移量
    - limit: 限制数量
    """
    try:
        normalized_status = _parse_order_status_filter(status)
        orders = await order_service.order_lists(
            user_ids=[current_user.user_id],
            order_statuses=[normalized_status] if normalized_status else None,
            offset=offset,
            limit=limit,
        )
    except ValueError as exc:
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=f"order_list: invalid status parameter: status={status!r}, error={exc}",
            data={"location": "order_list", "field": "status", "status": status},
        ) from exc

    order_list = [
        {
            "order_no": o.order_no,
            "product_class": o.product_class,
            "product_id": o.product_id,
            "product_name": o.product_name,
            "amount": o.amount,
            "currency": o.currency,
            "order_status": o.order_status,
            "callback_status": o.callback_status,
            "payment_method": o.payment_method,
            "paid_at": o.paid_at,
            "created_at": o.created_at,
            "expired_at": o.expired_at,
        }
        for o in orders
    ]

    return ResponseUtils.ok(
        {
            "orders": order_list,
            "total": len(order_list),
            "offset": offset,
            "limit": limit,
        }
    )


@router.get("/unfinished", response_model=UnfinishedOrderListApiResponse)
async def list_unfinished_orders(
    current_user: UserContext = Depends(get_current_user),
):
    """获取当前用户可继续支付的未完成订单。

    只返回 30 分钟可见窗口内的 pending 订单；过期订单仍可被支付回调完成，
    但不再出现在客户端继续支付列表。
    """
    orders = await order_service.order_lists(
        user_ids=[current_user.user_id],
        order_statuses=[OrderStatus.PENDING],
        expires_after_ms=timestamp_now(),
        has_payment_data=True,
        limit=10,
    )
    order_list = []
    for o in orders:
        payment_data = order_service.decode_order_payment_data(
            o.payment_data,
            context=f"order_unfinished: order_no={o.order_no}",
        )
        if payment_data is None:
            continue
        order_list.append(
            {
                "order_no": o.order_no,
                "product_class": o.product_class,
                "product_id": o.product_id,
                "product_name": o.product_name,
                "amount": o.amount,
                "currency": o.currency,
                "order_status": o.order_status,
                "callback_status": o.callback_status,
                "payment_method": o.payment_method,
                "paid_at": o.paid_at,
                "created_at": o.created_at,
                "expired_at": o.expired_at,
                "payment_data": payment_data,
            }
        )

    return ResponseUtils.ok(
        {
            "orders": order_list,
            "total": len(order_list),
        }
    )


@router.post("/cancel", response_model=CancelOrderApiResponse)
async def cancel_order(
    data: CancelOrderRequest,
    current_user: UserContext = Depends(get_current_user),
):
    """取消当前用户的待支付订单。"""
    order_no = data.order_no.strip()
    if not order_no:
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg="order_cancel: order_no is empty after strip",
            data={"field": "order_no"},
        )

    order = await order_service.cancel_user_order(
        order_no=order_no,
        user_id=current_user.user_id,
    )
    return ResponseUtils.ok(
        {
            "order_no": order.order_no,
            "order_status": order.order_status,
        }
    )


def _parse_order_status_filter(status: str | None) -> OrderStatus | None:
    """解析客户端订单状态筛选参数。"""
    if status is None:
        return None
    status_text = status.strip()
    if not status_text:
        return None
    try:
        if status_text.isdecimal():
            return OrderStatus(int(status_text))
        return OrderStatus[status_text.upper()]
    except (KeyError, ValueError) as exc:
        allowed_names = ",".join(item.name.lower() for item in OrderStatus)
        allowed_values = ",".join(str(item.value) for item in OrderStatus)
        raise ValueError(
            f"invalid order status: status={status!r}, allowed={allowed_names}, "
            f"allowed_values={allowed_values}"
        ) from exc
