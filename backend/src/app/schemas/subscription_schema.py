"""订阅相关请求与响应数据模型。"""

from typing import Literal

from pydantic import BaseModel, Field


class SubscriptionCheckoutPaymentChannelItem(BaseModel):
    """订阅方案下单可用支付渠道。"""

    payment_method: str = Field(..., description="支付方式")
    payment_method_name: str = Field(..., description="支付方式展示名")
    product_price_id: int = Field(..., description="购买选项 ID")
    currency: str = Field(..., description="货币类型")
    amount: int = Field(..., description="渠道金额，统一 6 位精度整数")


class SubscriptionCheckoutPlanItem(BaseModel):
    """客户端订阅方案配置。"""

    product_class: int = Field(..., description="商品类别")
    product_id: str = Field(..., description="订阅商品ID")
    product_name: str = Field(..., description="订阅商品名称")
    period: Literal["month", "quarter", "year", "lifetime"] = Field(
        ..., description="商业与权益周期"
    )
    auto_renew: bool = Field(..., description="是否由渠道自动续费")
    display_currency: str = Field(..., description="商品卡默认展示币种")
    display_amount: int = Field(
        ..., description="商品卡默认展示金额，统一 6 位精度整数"
    )
    daily_limit: int = Field(..., description="插件每日下载额度，-1 表示无限制")
    extension_daily_download_limit: int = Field(..., description="插件每日下载额度")
    payment_channels: list[SubscriptionCheckoutPaymentChannelItem] = Field(
        ..., description="该订阅方案支持的支付渠道列表"
    )


class SubscriptionCheckoutConfigListData(BaseModel):
    """客户端订阅方案配置列表 data。"""

    checkout_configs: list[SubscriptionCheckoutPlanItem]
    review_reward_enabled: bool = Field(..., description="是否开放好评赠送活动")
    review_reward_claimed_count: int = Field(
        ...,
        description=(
            "好评赠送领取状态（0 未领取 / 1 已领取）；账号、设备任一维度已有领取"
            "事实即按已领取返回"
        ),
    )


class SubscriptionCheckoutConfigListResponse(BaseModel):
    """客户端订阅方案配置列表响应。"""

    code: int = Field(..., description="业务响应码")
    data: SubscriptionCheckoutConfigListData = Field(..., description="订阅方案列表")
    msg: str = Field(..., description="响应消息")


class SubscriptionReviewRewardClaimData(BaseModel):
    """好评赠送领取结果 data。"""

    result: Literal["granted", "already_claimed"] = Field(
        ..., description="本次已赠送或此前已领取"
    )
    review_reward_claimed_count: int = Field(
        ..., description="领取状态（0 未领取 / 1 已领取）；领取成功后恒为 1"
    )


class SubscriptionReviewRewardClaimResponse(BaseModel):
    """好评赠送领取响应。"""

    code: int = Field(..., description="业务响应码")
    data: SubscriptionReviewRewardClaimData = Field(..., description="领取结果")
    msg: str = Field(..., description="响应消息")


class SubscriptionManagementData(BaseModel):
    """订阅渠道管理入口 data。"""

    url: str | None = Field(None, description="渠道 Web 管理入口；为空时使用客户端指引")


class SubscriptionManagementResponse(BaseModel):
    """订阅渠道管理入口响应。"""

    code: int = Field(..., description="业务响应码")
    data: SubscriptionManagementData = Field(..., description="渠道管理入口")
    msg: str = Field(..., description="响应消息")


class DailyQuotaStatus(BaseModel):
    """每日额度状态。"""

    use: int = Field(..., description="今日已用次数")
    remaining: int = Field(..., description="剩余额度，-1 表示无限制")
    limit: int = Field(..., description="每日额度上限，-1 表示无限制")


class SubscriptionStatusData(BaseModel):
    """订阅状态响应 data。"""

    status: str = Field(default="active", description="订阅状态，active 或 unavailable")
    period: str = Field(..., description="订阅周期")
    display_name: str = Field(..., description="订阅显示名称")
    expires_at: int | None = Field(None, description="过期时间（毫秒时间戳）")
    daily_limit: int = Field(..., description="每日下载限制（-1 表示无限制）")
    used: int = Field(..., description="今日已用次数")
    remaining: int = Field(..., description="剩余配额（-1 表示无限制）")
    extension_download: DailyQuotaStatus = Field(..., description="插件下载每日额度")
    reset_date: str = Field(..., description="重置日期（YYYY-MM-DD）")
    auto_renew: bool = Field(..., description="是否自动续费")
    cancel_at_period_end: bool = Field(..., description="是否已取消后续扣款")
    cancel_available: bool = Field(..., description="是否可由本站发起取消")
    cancelled_at: int | None = Field(None, description="本站确认取消时间")
    payment_method: str | None = Field(None, description="当前订阅支付渠道")


class SubscriptionStatusResponse(BaseModel):
    """订阅状态响应"""

    code: int = Field(..., description="业务响应码")
    data: SubscriptionStatusData = Field(..., description="订阅状态")
    msg: str = Field(..., description="响应消息")
