"""
用户认证相关的共享数据模型（Protocol/DTO）
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class CaptchaResponse(BaseModel):
    """验证码响应"""

    captcha_id: str = Field(..., description="验证码ID")
    image_data: str = Field(..., description="Base64编码的图片数据")


class LoginRequest(BaseModel):
    """登录请求"""

    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")
    captcha_id: str = Field(..., description="验证码ID")
    captcha_text: str = Field(..., description="验证码文本")
    remember_me: bool = Field(default=False, description="记住我")


class UserResponse(BaseModel):
    """用户响应"""

    id: int = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
    email: Optional[str] = Field(None, description="邮箱")
    full_name: Optional[str] = Field(None, description="全名")
    is_superuser: bool = Field(default=False, description="是否超级用户")
    is_active: bool = Field(default=True, description="是否活跃")
    permissions: List[str] = Field(default_factory=list, description="权限列表")
    last_login_at: Optional[int] = Field(None, description="最后登录时间")
    login_count: int = Field(default=0, description="登录次数")
    created_at: int = Field(..., description="创建时间")
    updated_at: int = Field(..., description="更新时间")


class LoginResponse(BaseModel):
    """登录响应"""

    access_token: str = Field(..., description="访问令牌")
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(..., description="访问令牌过期时间（秒）")
    user: "UserResponse" = Field(..., description="用户信息")


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求"""

    refresh_token: str = Field(..., description="刷新令牌")


class RefreshTokenResponse(BaseModel):
    """刷新令牌响应"""

    access_token: str = Field(..., description="新的访问令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(..., description="访问令牌过期时间（秒）")


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""

    old_password: str = Field(..., description="旧密码", min_length=1)
    new_password: str = Field(..., description="新密码", min_length=6)


class ChangePasswordResponse(BaseModel):
    """修改密码响应"""

    message: str = Field(default="密码修改成功", description="响应消息")


class LogoutResponse(BaseModel):
    """登出响应"""

    message: str = Field(default="注销成功", description="响应消息")
