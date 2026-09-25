"""管理后台用户信息弹窗响应 Schema。

这些 schema 只服务 admin 只读排查界面，不包含密码、token、验证码等敏感字段。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AdminUserAccountStatus = Literal["normal", "locked", "deleted"]


class AdminUserBasicInfo(BaseModel):
    """用户基础信息。"""

    user_id: int = Field(..., description="用户 ID")
    email: str | None = Field(None, description="当前邮箱")
    full_name: str | None = Field(None, description="当前用户昵称")
    avatar_url: str | None = Field(None, description="当前头像 URL")
    register_source: str | None = Field(None, description="注册来源")
    register_method: str | None = Field(None, description="首次注册方式")
    register_user_agent: str | None = Field(None, description="注册 User-Agent")
    register_ip: str | None = Field(None, description="注册 IP")
    register_country: str | None = Field(None, description="注册 IP 归属地")
    last_login_at: int | None = Field(None, description="最后登录时间（毫秒时间戳）")
    last_login_ip: str | None = Field(None, description="最后登录 IP")
    last_login_country: str | None = Field(None, description="最后登录 IP 归属地")
    last_operation_ip: str | None = Field(None, description="最后操作 IP")
    last_operation_country: str | None = Field(None, description="最后操作 IP 归属地")
    login_count: int = Field(..., description="登录次数")
    locked_until: int | None = Field(None, description="锁定截止时间（毫秒时间戳）")
    is_del: bool = Field(..., description="是否已注销")
    account_status: AdminUserAccountStatus = Field(..., description="账号状态")
    created_at: int = Field(..., description="注册时间（毫秒时间戳）")
    updated_at: int = Field(..., description="更新时间（毫秒时间戳）")


class AdminUserCreditsInfo(BaseModel):
    """用户 Credits 信息。"""

    balance: int = Field(..., description="当前 Credits 余额")


class AdminUserSubscriptionInfo(BaseModel):
    """用户订阅信息。"""

    has_subscription: bool = Field(..., description="是否有有效订阅")
    expires_at: int | None = Field(None, description="订阅原始过期时间（毫秒时间戳）")


class AdminUserProfileData(BaseModel):
    """用户信息弹窗 profile 聚合响应。"""

    user: AdminUserBasicInfo = Field(..., description="用户基础信息")
    credits: AdminUserCreditsInfo = Field(..., description="Credits 信息")
    subscription: AdminUserSubscriptionInfo = Field(..., description="订阅信息")


class AdminUserDownloadRecordData(BaseModel):
    """用户最近下载记录行。"""

    id: int = Field(..., description="下载记录 ID")
    resource_key: str = Field(..., description="website 下载资源指纹")
    platform: str = Field(..., description="平台")
    canonical_link: str = Field(..., description="规范化链接")
    source_id: str = Field(..., description="资源 ID")
    filename: str | None = Field(None, description="文件名")
    size_bytes: int | None = Field(None, description="文件大小，字节")
    credits_cost: int = Field(..., description="本次实际扣除 Credits")
    created_at: int = Field(..., description="下载时间（毫秒时间戳）")


class AdminUserDownloadsPageData(BaseModel):
    """用户最近下载分页响应。"""

    rows: list[AdminUserDownloadRecordData] = Field(..., description="下载记录行")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="页码")
    page_size: int = Field(..., description="每页数量")


class AdminUserCreditRecordData(BaseModel):
    """用户积分流水记录行。"""

    id: int = Field(..., description="积分流水 ID")
    change_amount: int = Field(..., description="Credits 变化量")
    reason: str = Field(..., description="变更原因")
    resource_key: str | None = Field(None, description="website 下载资源指纹")
    metadata_json: str | None = Field(None, description="扩展 JSON 快照")
    created_at: int = Field(..., description="创建时间（毫秒时间戳）")


class AdminUserCreditsPageData(BaseModel):
    """用户积分流水分页响应。"""

    rows: list[AdminUserCreditRecordData] = Field(..., description="积分流水行")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="页码")
    page_size: int = Field(..., description="每页数量")


class AdminUserOrderRecordData(BaseModel):
    """用户订单记录行。"""

    id: int = Field(..., description="订单 ID")
    order_no: str = Field(..., description="订单号")
    user_id: int = Field(..., description="用户 ID")
    user_email: str = Field(..., description="用户当前邮箱")
    product_class: int = Field(..., description="商品类别")
    product_id: str = Field(..., description="商品 ID")
    product_name: str = Field(..., description="商品名称快照")
    amount: int = Field(..., description="订单金额，6 位精度整数")
    currency: str = Field(..., description="订单币种")
    order_status: int = Field(..., description="订单状态")
    callback_status: int = Field(..., description="履约回调状态")
    payment_method: str = Field(..., description="支付方式")
    payment_data: object | None = Field(None, description="支付入口数据")
    payment_channel_order_no: str = Field(..., description="支付渠道订单号")
    payment_transaction_id: str = Field(..., description="支付渠道交易流水 ID")
    payment_channel_uid: str = Field(..., description="支付渠道用户 ID")
    paid_amount: int | None = Field(None, description="渠道实付金额，6 位精度整数")
    paid_currency: str = Field(..., description="渠道实付币种")
    created_at: int = Field(..., description="创建时间（毫秒时间戳）")
    updated_at: int = Field(..., description="更新时间（毫秒时间戳）")
    paid_at: int | None = Field(None, description="支付时间（毫秒时间戳）")
    expired_at: int = Field(..., description="过期时间（毫秒时间戳）")
    client_ip: str = Field(..., description="下单客户端 IP")
    extra_metadata: object | None = Field(None, description="订单扩展元数据")


class AdminUserOrdersPageData(BaseModel):
    """用户订单分页响应。"""

    rows: list[AdminUserOrderRecordData] = Field(..., description="订单行")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="页码")
    page_size: int = Field(..., description="每页数量")
