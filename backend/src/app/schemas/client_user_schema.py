"""客户端用户认证相关的数据模型"""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.schemas.subscription_schema import SubscriptionStatusData


class UserInfo(BaseModel):
    """用户信息"""

    user_id: int = Field(..., description="用户ID")
    email: str | None = Field(None, description="邮箱")
    full_name: str | None = Field(None, description="全名")
    avatar_url: str | None = Field(None, description="头像URL")
    created_at: int = Field(..., description="创建时间戳")
    credits_balance: int = Field(default=0, description="Credits 余额")


class CurrentUserInfo(UserInfo):
    """当前登录用户信息。"""

    subscription: SubscriptionStatusData = Field(..., description="当前订阅状态")


class CurrentUserInfoResponse(BaseModel):
    """当前登录用户响应。"""

    code: int = Field(..., description="业务响应码")
    data: CurrentUserInfo = Field(..., description="当前登录用户")
    msg: str = Field(..., description="响应消息")


class RegistrationContext(BaseModel):
    """首次注册归因；客户端自报字段只用于统计，不参与身份与权益判定。"""

    registration_entry: Literal["extension_v3"] | None = Field(
        None, description="首次注册入口，仅插件 v3 登录页传 extension_v3"
    )
    register_device_id: str | None = Field(
        None,
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        description="注册入口设备 ID；插件入口用插件设备，其余用网站设备",
    )
    first_opened_at: int | None = Field(
        None,
        ge=1_000_000_000_000,
        le=9_007_199_254_740_991,
        description="注册入口设备首次观测打开时间（毫秒时间戳）",
    )

    @model_validator(mode="after")
    def normalize_registration(self) -> "RegistrationContext":
        """设备与首次打开时间必须成对保存，缺少时不猜测另一端身份。"""
        if not (self.register_device_id and self.first_opened_at):
            self.register_device_id = None
            self.first_opened_at = None
        return self


class RegisterRequest(RegistrationContext):
    """注册请求"""

    email: EmailStr = Field(..., description="邮箱")
    password: str = Field(..., min_length=6, max_length=100, description="密码")
    full_name: str | None = Field(None, max_length=100, description="全名")


class LoginRequest(BaseModel):
    """登录请求"""

    email: EmailStr = Field(..., description="邮箱")
    password: str = Field(..., min_length=1, description="密码")


class LoginResponse(BaseModel):
    """登录响应"""

    access_token: str = Field(..., description="访问令牌")
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(..., description="访问令牌过期时间（秒）")
    user: UserInfo = Field(..., description="用户信息")


class LogoutResponse(BaseModel):
    """登出响应"""

    message: str = Field(default="注销成功", description="响应消息")


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求"""

    refresh_token: str = Field(..., description="刷新令牌")


class RefreshTokenResponse(BaseModel):
    """刷新令牌响应"""

    access_token: str = Field(..., description="新的访问令牌")
    refresh_token: str = Field(..., description="新的刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(..., description="访问令牌过期时间（秒）")


class SendEmailVerifyRequest(BaseModel):
    """发送邮箱验证码请求"""

    email: EmailStr = Field(..., description="邮箱地址")


class EmailVerifyLoginRequest(RegistrationContext):
    """邮箱验证码登录/注册请求"""

    email: EmailStr = Field(..., description="邮箱地址")
    code: str = Field(..., min_length=6, max_length=6, description="验证码")


class GoogleLoginRequest(RegistrationContext):
    """Google ID token 登录/注册请求"""

    credential: str = Field(
        ..., min_length=1, max_length=4096, description="Google ID token"
    )


class GoogleLoginCodeExchangeRequest(BaseModel):
    """Google redirect 登录一次性 code 换 token 请求"""

    code: str = Field(..., min_length=1, max_length=256, description="一次性登录 code")


class MessageResponse(BaseModel):
    """通用消息响应"""

    message: str = Field(..., description="响应消息")
