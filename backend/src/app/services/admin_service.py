"""
Admin 管理员业务逻辑

负责管理员认证、Token 签发和续签。
密码使用 bcrypt（复用 crypto.py），存储在 admins 表。
"""

from typing import Optional

from sqlalchemy import select

from app.core.database import get_async_session
from app.models.admin_model import AdminModel
from app.utils.crypto import hash_password, verify_password
from app.utils.jwt import JwtData, JwtUnit
from app.utils.logger import logger
from app.utils.time import timestamp_now


class AdminService:
    """管理员服务"""

    async def get_by_username(self, username: str) -> Optional[AdminModel]:
        """根据用户名查询管理员"""
        async with get_async_session() as session:
            result = await session.execute(
                select(AdminModel).where(AdminModel.username == username)
            )
            return result.scalar_one_or_none()

    async def get_by_id(self, admin_id: int) -> Optional[AdminModel]:
        """根据管理员 ID 查询管理员。"""

        async with get_async_session() as session:
            result = await session.execute(
                select(AdminModel).where(AdminModel.admin_id == admin_id)
            )
            return result.scalar_one_or_none()

    async def authenticate(self, username: str, password: str) -> Optional[AdminModel]:
        """验证管理员凭据（用户名 + bcrypt 密码校验）"""
        admin = await self.get_by_username(username)
        if not admin:
            return None
        if not verify_password(password, admin.password_hash):
            return None
        return admin

    def create_token(self, admin: AdminModel) -> tuple[str, int]:
        """为管理员签发 JWT"""
        jwt_data = JwtData(user_id=admin.admin_id, email=admin.username)
        return JwtUnit.create_admin_token(jwt_data)

    def create_refresh_token(self, admin: AdminModel) -> tuple[str, int]:
        """为管理员签发 refresh token。"""

        jwt_data = JwtData(user_id=admin.admin_id, email=admin.username)
        return JwtUnit.create_admin_refresh_token(jwt_data)

    def create_token_pair(self, admin: AdminModel) -> tuple[str, str, int, int]:
        """为管理员签发 access token 和 refresh token。

        Returns:
            tuple[str, str, int, int]: access token、refresh token、
            access 过期时间、refresh 过期时间。
        """

        access_token, access_expires_at = self.create_token(admin)
        refresh_token, refresh_expires_at = self.create_refresh_token(admin)
        return access_token, refresh_token, access_expires_at, refresh_expires_at

    async def create_admin(self, username: str, password: str) -> AdminModel:
        """创建管理员（CLI 调用）"""
        password_hash = hash_password(password)
        admin = AdminModel(  # type: ignore[call-arg]
            username=username,
            password_hash=password_hash,
            created_at=timestamp_now(),
            updated_at=timestamp_now(),
        )
        async with get_async_session() as session:
            session.add(admin)
            await session.commit()
            await session.refresh(admin)
            logger.info(f"Admin created: {username} (id={admin.admin_id})")
            return admin


admin_service = AdminService()
