"""
User 认证服务
"""

from dataclasses import dataclass

from app.constants.auth import TokenType
from app.core.config import settings
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_model import UserModel
from app.services.user_service import user_service
from app.services.user_token_service import (
    user_token_service,
)
from app.utils.crypto import verify_password
from app.utils.jwt import JwtData, JwtUnit


@dataclass(frozen=True)
class UserAuthTokenBundle:
    """已签发并登记到服务端白名单的用户 token。"""

    access_token: str
    refresh_token: str
    expires_in: int


class UserAuthService:
    """用户认证服务类"""

    def __init__(self) -> None:
        self.settings = settings
        self.max_login_attempts = self.settings.auth.max_login_attempts
        self.lock_duration_minutes = self.settings.auth.lock_duration_minutes
        self.user_ops = user_service
        self.token_ops = user_token_service

    async def authenticate_user(
        self,
        email: str,
        password: str,
    ) -> UserModel | None:
        """验证用户凭据"""
        user = await self.user_ops.get_user_by_email(email)

        if not user:
            return None

        if not verify_password(password, user.password_hash):
            return None

        return user

    async def create_user_session(
        self,
        user: UserModel,
        access_token: str,
        refresh_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """
        创建用户 Token（替代原来的 Session）

        注意：ip_address 和 user_agent 参数保留以兼容接口，但不再存储
        """

        jwt_data = JwtUnit.decode_token(access_token)
        refresh_jwt_data = JwtUnit.decode_token(refresh_token)
        if not jwt_data or not refresh_jwt_data:
            return False

        success = True

        if jwt_data.exp:
            success &= await self.token_ops.store_token(
                access_token,
                user.user_id,
                TokenType.USER_ACCESS,
                jwt_data.exp,
            )

        if refresh_jwt_data.exp:
            success &= await self.token_ops.store_token(
                refresh_token,
                user.user_id,
                TokenType.USER_REFRESH,
                refresh_jwt_data.exp,
            )

        return success

    async def update_user_login_info(
        self,
        user: UserModel,
        login_ip: str | None = None,
        login_country: str | None = None,
    ) -> bool:
        """更新用户登录信息"""
        return await self.user_ops.update_login_info(
            user.user_id, login_ip=login_ip, login_country=login_country
        )

    async def update_failed_login(self, email: str) -> UserModel | None:
        """更新失败登录信息"""
        user = await self.user_ops.get_user_by_email(email)

        if not user:
            return None

        # Note: increment_failed_attempts is a stub that always returns True
        # The failed_login_attempts field is not implemented in UserModel
        await self.user_ops.increment_failed_attempts(user.user_id)

        return user

    def create_tokens_for_user(
        self,
        user: UserModel,
    ) -> tuple[str, str, int]:
        """
        为用户创建访问令牌和刷新令牌

        Args:
            user: 用户对象

        Returns:
            Tuple[str, str, int]: (access_token, refresh_token, expires_in)
        """
        # 创建访问令牌（使用 userid 字段）
        access_token, _access_expires_at = JwtUnit.create_access_token(
            data=JwtData(
                user_id=user.user_id,
                email=user.email,
            )
        )

        # 创建刷新令牌（使用 userid 字段）
        refresh_token, _refresh_expires_at = JwtUnit.create_refresh_token(
            data=JwtData(
                user_id=user.user_id,
                email=user.email,
            )
        )

        expires_in = self.settings.auth.access_token_expire

        return access_token, refresh_token, expires_in

    async def issue_registered_tokens_for_user(
        self,
        user: UserModel,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
        operation: str,
    ) -> UserAuthTokenBundle:
        """签发用户 token，并写入服务端 token 白名单。"""
        access_token, refresh_token, expires_in = self.create_tokens_for_user(user)
        session_created = await self.create_user_session(
            user,
            access_token,
            refresh_token,
            ip_address,
            user_agent,
        )
        if not session_created:
            raise AppCommonException(
                code=CommonCode.INTERNAL_SERVER_ERROR,
                ext_msg=(
                    "user_auth.issue_registered_tokens: failed to store tokens: "
                    f"operation={operation}, user_id={user.user_id}"
                ),
            )

        return UserAuthTokenBundle(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
        )


# 全局认证服务实例
user_auth_service = UserAuthService()
