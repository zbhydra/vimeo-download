"""订单相关 Pydantic Schema。

客户端下单只提交商品标识、支付方式和当前界面看到的价格；商品名称和最终
金额快照统一由后端配置表确认后写入订单。

接口契约重点：
1. 订单状态和回调状态直接返回数据库里的整型枚举值。
2. `payment_data` 是支付渠道专属 JSON；Clink 当前返回 `{"url": str}`。
3. `payment_method` 和 `paid_at` 来自订单实际支付进度，未支付订单允许为空。
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class CreateOrderRequest(BaseModel):
    """创建订单请求"""

    product_class: int = Field(..., ge=1, le=10, description="商品类别（枚举值）")
    product_id: str = Field(
        ..., min_length=1, max_length=64, description="商品ID（业务系统定义）"
    )
    payment_method: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="支付方式，对应配置表 channel_code",
    )
    amount: int = Field(..., ge=0, description="订单金额，统一 6 位精度整数")
    currency: str = Field(..., min_length=1, max_length=8, description="货币类型")
    auto_renew: bool = Field(default=False, description="是否由渠道自动续费")
    period: Literal["none", "month", "quarter", "year", "lifetime"] = Field(
        default="none", description="商业与权益周期"
    )


class CreateOrderResponse(BaseModel):
    """创建订单响应"""

    order_no: str = Field(..., description="订单号")
    amount: int = Field(..., description="订单金额，统一 6 位精度整数")
    currency: str = Field(..., description="货币类型")
    expired_at: int = Field(..., description="过期时间（毫秒时间戳）")
    support_mail: str = Field(..., description="当前订单支付等待页使用的支持邮箱")
    payment_data: dict[str, Any] = Field(
        ...,
        description="支付渠道专属 JSON；Clink 当前为包含 url 的对象",
    )


class CreateOrderApiResponse(BaseModel):
    """创建订单接口外层响应。"""

    code: int = Field(..., description="业务响应码")
    data: CreateOrderResponse = Field(..., description="创建订单响应数据")
    msg: str = Field(..., description="响应消息")


class OrderStatusResponse(BaseModel):
    """订单状态响应"""

    order_no: str = Field(..., description="订单号")
    product_class: int = Field(..., description="商品类别整型枚举值")
    product_id: str = Field(..., description="商品 ID")
    product_name: str = Field(..., description="商品名称快照")
    amount: int = Field(..., description="订单金额，统一 6 位精度整数")
    currency: str = Field(..., description="货币类型")
    order_status: int = Field(..., description="订单状态整型枚举值")
    callback_status: int = Field(..., description="业务回调状态整型枚举值")
    payment_method: str | None = Field(
        default=None,
        description="支付方式；未选择或历史订单允许为空",
    )
    paid_at: int | None = Field(
        default=None,
        description="支付完成时间（毫秒时间戳）；未支付时为空",
    )
    created_at: int = Field(..., description="创建时间（毫秒时间戳）")
    expired_at: int = Field(..., description="订单过期时间（毫秒时间戳）")


class UnfinishedOrderResponse(OrderStatusResponse):
    """客户端可继续支付的未完成订单响应。"""

    payment_data: dict[str, Any] = Field(
        ...,
        description="创建支付入口时保存的渠道专属 JSON；Clink 当前为包含 url 的对象",
    )


class OrderStatusApiResponse(BaseModel):
    """订单状态接口外层响应。"""

    code: int = Field(..., description="业务响应码")
    data: OrderStatusResponse = Field(..., description="订单状态响应数据")
    msg: str = Field(..., description="响应消息")


class OrderListResponse(BaseModel):
    """订单列表响应"""

    orders: list[OrderStatusResponse] = Field(..., description="订单列表")
    total: int = Field(..., description="订单总数")
    offset: int = Field(..., description="分页偏移")
    limit: int = Field(..., description="分页数量")


class OrderListApiResponse(BaseModel):
    """订单列表接口外层响应。"""

    code: int = Field(..., description="业务响应码")
    data: OrderListResponse = Field(..., description="订单列表响应数据")
    msg: str = Field(..., description="响应消息")


class UnfinishedOrderListResponse(BaseModel):
    """未完成订单列表响应。"""

    orders: list[UnfinishedOrderResponse] = Field(..., description="可继续支付订单列表")
    total: int = Field(..., description="订单总数")


class UnfinishedOrderListApiResponse(BaseModel):
    """未完成订单列表接口外层响应。"""

    code: int = Field(..., description="业务响应码")
    data: UnfinishedOrderListResponse = Field(..., description="未完成订单列表响应数据")
    msg: str = Field(..., description="响应消息")


class CancelOrderRequest(BaseModel):
    """取消订单请求。"""

    order_no: str = Field(..., min_length=1, max_length=32, description="订单号")


class CancelOrderResponse(BaseModel):
    """取消订单响应。"""

    order_no: str = Field(..., description="订单号")
    order_status: int = Field(..., description="取消后的订单状态")


class CancelOrderApiResponse(BaseModel):
    """取消订单接口外层响应。"""

    code: int = Field(..., description="业务响应码")
    data: CancelOrderResponse = Field(..., description="取消订单响应数据")
    msg: str = Field(..., description="响应消息")
