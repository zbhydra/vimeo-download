"""
Admin 管理后台请求/响应 Schema
"""

from pydantic import BaseModel, Field


# ========== 认证相关 ==========


class AdminCaptchaResponse(BaseModel):
    """验证码响应"""

    captcha_id: str = Field(..., description="验证码 ID")
    image_base64: str = Field(
        ..., description="Base64 编码的验证码图片（含 data:image/png;base64, 前缀）"
    )


class AdminLoginRequest(BaseModel):
    """管理员登录请求"""

    username: str = Field(..., min_length=1, max_length=64, description="用户名")
    password: str = Field(..., min_length=1, description="密码")
    captcha_id: str = Field(..., description="验证码 ID")
    captcha_code: str = Field(..., min_length=4, max_length=4, description="验证码")


class AdminLoginResponse(BaseModel):
    """管理员登录响应"""

    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    expires_in: int = Field(..., description="Access Token 有效期（秒）")
    refresh_expires_in: int = Field(..., description="Refresh Token 有效期（秒）")


class AdminRefreshRequest(BaseModel):
    """管理员 Token 续签请求"""

    refresh_token: str = Field(..., min_length=1, description="管理员 refresh token")


class AdminRefreshResponse(BaseModel):
    """管理员 Token 续签响应"""

    access_token: str = Field(..., description="新 JWT access token")
    refresh_token: str = Field(..., description="新 JWT refresh token")
    expires_in: int = Field(..., description="Access Token 有效期（秒）")
    refresh_expires_in: int = Field(..., description="Refresh Token 有效期（秒）")
