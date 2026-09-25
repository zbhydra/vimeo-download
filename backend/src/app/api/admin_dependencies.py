"""
Admin 管理后台鉴权依赖。

本文件提供两类鉴权：
1. `get_admin_user()`：业务服务器管理接口使用，解码 access JWT 后回查管理员表。
2. `get_admin_jwt_only()`：节点本地管理接口使用，只验签 access JWT，不访问 DB/Redis。
"""

from dataclasses import dataclass
from typing import Optional

from fastapi import Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.constants.auth import TokenType
from app.exceptions.common_exception import UserAuthFailedException
from app.utils.jwt import JwtUnit

security = HTTPBearer(auto_error=False)


@dataclass
class AdminContext:
    """管理员上下文"""

    #: admin 表主键，节点本地 JWT-only 模式来自 token.user_id。
    admin_id: int
    #: 管理员展示名；节点本地 JWT-only 模式来自 token.email。
    username: str
    #: 原始 admin access JWT，用于透传或审计。
    token: str


async def get_admin_jwt_only(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> AdminContext:
    """
    只依赖 JWT 的节点本地 admin 鉴权。

    校验流程：
    1. 从 Authorization: Bearer 读取 token。
    2. `JwtUnit.decode_token()` 验签、校验算法和 exp。
    3. 要求 type=ADMIN_ACCESS、user_id>0、jti 非空。

    本依赖禁止回查管理员表、禁止访问 Redis，download role 可安全使用。
    """
    if credentials is None:
        raise UserAuthFailedException("Missing admin access token")

    token = credentials.credentials
    jwt_data = JwtUnit.decode_token(token)
    if not jwt_data:
        raise UserAuthFailedException("Invalid admin access token")
    if jwt_data.type != TokenType.ADMIN_ACCESS:
        raise UserAuthFailedException("Invalid admin token type")
    if jwt_data.exp <= 0:
        raise UserAuthFailedException("Invalid admin token exp")
    if jwt_data.user_id <= 0:
        raise UserAuthFailedException("Invalid admin user_id")
    if not jwt_data.jti.strip():
        raise UserAuthFailedException("Invalid admin token jti")

    return AdminContext(
        admin_id=jwt_data.user_id,
        username=jwt_data.email,
        token=token,
    )


async def get_admin_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> AdminContext:
    """
    验证管理员 Token 并返回 AdminContext

    校验流程：
    1. 解码 JWT 签名和过期时间
    2. 校验 token type == ADMIN_ACCESS
    """
    if credentials is None:
        raise UserAuthFailedException("Missing admin access token")

    token = credentials.credentials
    jwt_data = JwtUnit.decode_token(token)

    if not jwt_data:
        raise UserAuthFailedException("Invalid admin access token")

    if jwt_data.type != TokenType.ADMIN_ACCESS:
        raise UserAuthFailedException("Invalid admin token type")

    from app.services.admin_service import admin_service

    admin = await admin_service.get_by_id(jwt_data.user_id)
    if not admin or not admin.is_active:
        raise UserAuthFailedException("Admin not found or inactive")

    return AdminContext(
        admin_id=admin.admin_id,
        username=admin.username,
        token=token,
    )
