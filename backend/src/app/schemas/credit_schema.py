"""Credits 购买相关数据模型。"""

from pydantic import BaseModel, Field


class CreditCheckoutPaymentChannelResponse(BaseModel):
    """Credits 积分包下单可用支付渠道。"""

    payment_method: str = Field(..., description="支付方式")
    payment_method_name: str | None = Field(default=None, description="支付方式展示名")
    currency: str = Field(..., description="渠道币种")
    amount: int = Field(..., description="渠道金额，统一 6 位精度整数")
    provider_sku: str | None = Field(default=None, description="渠道侧商品标识")


class CreditCheckoutConfigResponse(BaseModel):
    """客户端 Credits 积分包配置。"""

    product_class: int = Field(..., description="商品类别，Credits 充值固定为 2")
    product_id: str = Field(..., description="Credits 商品 ID")
    product_name: str = Field(..., description="Credits 商品名称")
    credits_amount: int = Field(..., description="支付成功后到账 Credits 数量")
    display_currency: str = Field(..., description="用户可见展示币种")
    display_amount: int = Field(..., description="用户可见展示金额，统一 6 位精度整数")
    payment_channels: list[CreditCheckoutPaymentChannelResponse] = Field(
        ..., description="该 Credits 商品支持的支付渠道列表"
    )


class CreditCheckoutConfigListResponse(BaseModel):
    """客户端 Credits 积分包配置列表响应。"""

    checkout_configs: list[CreditCheckoutConfigResponse]
