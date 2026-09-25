"""User 数据库操作类（Service）"""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.constants.client_product import ClientProductEnum
from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_model import UserModel
from app.schemas.client_user_schema import UserInfo
from app.services.base_service import BaseService
from app.services.user_checkin_service import user_checkin_service
from app.services.user_credit_service import user_credit_service
from app.services.user_ip_register_service import user_ip_register_service
from app.utils.crypto import hash_password
from app.utils.logger import logger
from app.utils.time import timestamp_now

REGISTRATION_BONUS_CREDITS = 10
REGISTRATION_BONUS_REASON = "registration_bonus"


def normalize_user_email(email: str) -> str:
    """规范化用户邮箱，登录归属只做 trim 和小写，不做服务商专属 alias 折叠。"""
    return email.strip().lower()


class UserService(BaseService[UserModel]):
    """用户数据库操作类。"""

    primary_key_field = "user_id"

    def __init__(self) -> None:
        super().__init__(UserModel)

    async def create_user(
        self,
        email: str,
        password: str,
        full_name: str | None = None,
        avatar_url: str | None = None,
        register_source: ClientProductEnum | None = None,
        register_method: str | None = None,
        register_user_agent: str | None = None,
        register_ip: str | None = None,
        register_country: str | None = None,
        register_device_id: str | None = None,
        first_opened_at: int | None = None,
    ) -> UserModel:
        """创建用户"""
        password_hash = hash_password(password)
        user = UserModel(  # type: ignore[call-arg]
            email=normalize_user_email(email),
            password_hash=password_hash,
            full_name=full_name,
            avatar_url=avatar_url,
            register_source=register_source.value if register_source else None,
            register_method=register_method,
            register_user_agent=register_user_agent,
            register_ip=register_ip,
            register_country=register_country,
            register_device_id=register_device_id,
            first_opened_at=first_opened_at,
            is_del=False,
            created_at=timestamp_now(),
            updated_at=timestamp_now(),
        )
        return await self.create(user)

    async def create_user_without_password(
        self,
        email: str,
        full_name: str | None = None,
        avatar_url: str | None = None,
        register_source: ClientProductEnum | None = None,
        register_method: str | None = None,
        register_user_agent: str | None = None,
        register_ip: str | None = None,
        register_country: str | None = None,
        register_device_id: str | None = None,
        first_opened_at: int | None = None,
    ) -> UserModel:
        """创建无密码用户（用于邮箱验证码登录）"""
        user = UserModel(  # type: ignore[call-arg]
            email=normalize_user_email(email),
            password_hash="!NOLOGIN!",  # magic password
            full_name=full_name,
            avatar_url=avatar_url,
            register_source=register_source.value if register_source else None,
            register_method=register_method,
            register_user_agent=register_user_agent,
            register_ip=register_ip,
            register_country=register_country,
            register_device_id=register_device_id,
            first_opened_at=first_opened_at,
            is_del=False,
            created_at=timestamp_now(),
            updated_at=timestamp_now(),
        )
        return await self.create(user)

    async def create_user_with_registration_bonus(
        self,
        email: str,
        password: str,
        full_name: str | None = None,
        avatar_url: str | None = None,
        register_source: ClientProductEnum | None = None,
        register_method: str | None = None,
        register_user_agent: str | None = None,
        register_ip: str | None = None,
        register_country: str | None = None,
        register_device_id: str | None = None,
        first_opened_at: int | None = None,
    ) -> UserModel:
        """创建密码用户，并按 IP 注册权益风控决定是否赠送权益。"""
        bonus_allowed = await user_ip_register_service.is_registration_bonus_allowed(
            register_ip
        )
        user = await self.create_user(
            email=email,
            password=password,
            full_name=full_name,
            avatar_url=avatar_url,
            register_source=register_source,
            register_method=register_method,
            register_user_agent=register_user_agent,
            register_ip=register_ip,
            register_country=register_country,
            register_device_id=register_device_id,
            first_opened_at=first_opened_at,
        )
        await user_ip_register_service.record_register_best_effort(
            user_id=user.user_id,
            ip_address=register_ip,
        )
        if bonus_allowed:
            await self._add_registration_credits(user.user_id)
        else:
            await user_checkin_service.create_expired_campaign(user.user_id)
        return user

    async def create_user_without_password_with_registration_bonus(
        self,
        email: str,
        full_name: str | None = None,
        avatar_url: str | None = None,
        register_source: ClientProductEnum | None = None,
        register_method: str | None = None,
        register_user_agent: str | None = None,
        register_ip: str | None = None,
        register_country: str | None = None,
        register_device_id: str | None = None,
        first_opened_at: int | None = None,
    ) -> UserModel:
        """创建无密码用户，并按 IP 注册权益风控决定是否赠送权益。"""
        bonus_allowed = await user_ip_register_service.is_registration_bonus_allowed(
            register_ip
        )
        user = await self.create_user_without_password(
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            register_source=register_source,
            register_method=register_method,
            register_user_agent=register_user_agent,
            register_ip=register_ip,
            register_country=register_country,
            register_device_id=register_device_id,
            first_opened_at=first_opened_at,
        )
        await user_ip_register_service.record_register_best_effort(
            user_id=user.user_id,
            ip_address=register_ip,
        )
        if bonus_allowed:
            await self._add_registration_credits(user.user_id)
        else:
            await user_checkin_service.create_expired_campaign(user.user_id)
        return user

    async def _add_registration_credits(self, user_id: int) -> None:
        """为用户赠送注册 Credits，失败只记录日志，不影响注册结果。"""
        try:
            await user_credit_service.add_balance(
                user_id=user_id,
                amount=REGISTRATION_BONUS_CREDITS,
                reason=REGISTRATION_BONUS_REASON,
            )
            logger.info(f"Registration Credits granted for user {user_id}")
        except Exception as e:
            logger.error(
                "user_service._add_registration_credits: failed to grant "
                "registration Credits, user_id=%s, error=%s",
                user_id,
                e,
                exc_info=True,
            )

    async def get_user_by_email(self, email: str) -> UserModel | None:
        """根据邮箱获取用户"""
        normalized_email = normalize_user_email(email)
        async with get_async_session() as db:
            stmt = select(UserModel).where(UserModel.email == normalized_email)
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def build_client_user_info(self, user: UserModel) -> UserInfo:
        """构建客户端用户信息，并补齐 Credits 余额。"""
        info = user.to_user_info()
        info.credits_balance = await user_credit_service.get_balance(user.user_id)
        return info

    async def get_or_create_external_login_user(
        self,
        *,
        email: str,
        full_name: str | None,
        avatar_url: str | None,
        register_source: ClientProductEnum,
        register_method: str,
        register_user_agent: str | None,
        register_ip: str | None,
        register_country: str | None,
        register_device_id: str | None = None,
        first_opened_at: int | None = None,
    ) -> UserModel:
        """按第三方可信邮箱查找或创建本系统用户。"""
        user = await self.get_user_by_email(email)
        if user:
            return user

        try:
            user = await self.create_user_without_password_with_registration_bonus(
                email=email,
                full_name=full_name,
                avatar_url=avatar_url,
                register_source=register_source,
                register_method=register_method,
                register_user_agent=register_user_agent,
                register_ip=register_ip,
                register_country=register_country,
                register_device_id=register_device_id,
                first_opened_at=first_opened_at,
            )
            logger.info(
                "New user created via external login: "
                f"email={email}, register_method={register_method}"
            )
        except IntegrityError:
            # 同邮箱并发首次登录时，唯一约束获胜的一方负责创建，当前请求重查复用。
            user = await self.get_user_by_email(email)
            if not user:
                logger.error(
                    "External login user missing after IntegrityError: "
                    f"email={email}, register_method={register_method}"
                )
                raise AppCommonException(
                    code=CommonCode.INTERNAL_SERVER_ERROR,
                    ext_msg=(
                        "user.external_login_create: user missing after unique "
                        f"conflict: email={email}, register_method={register_method}"
                    ),
                )

        return user

    async def user_lists(
        self,
        *,
        user_ids: Sequence[int] | None = None,
        email_like: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[UserModel]:
        """按用户 ID 或当前邮箱包含搜索用户。"""
        if offset < 0:
            raise ValueError(f"user_lists invalid offset: offset={offset}")
        if limit <= 0:
            raise ValueError(f"user_lists invalid limit: limit={limit}")

        stmt = select(UserModel)
        if user_ids is not None:
            stmt = stmt.where(UserModel.user_id.in_(user_ids))
        if email_like:
            normalized_email_like = normalize_user_email(email_like)
            stmt = stmt.where(
                UserModel.email.contains(normalized_email_like, autoescape=True)
            )

        async with get_async_session() as db:
            result = await db.execute(
                stmt.order_by(UserModel.user_id.desc()).offset(offset).limit(limit)
            )
            return list(result.scalars().all())

    async def user_info(self, user_id: int) -> UserModel | None:
        """按用户 ID 读取单个用户，不存在返回 ``None``。"""
        users = await self.user_lists(user_ids=[user_id], limit=1)
        return users[0] if users else None

    async def update_login_info(
        self,
        user_id: int,
        login_ip: str | None = None,
        login_country: str | None = None,
    ) -> bool:
        """更新用户登录信息"""
        async with get_async_session() as db:
            try:
                stmt = select(UserModel).where(UserModel.user_id == user_id)
                result = await db.execute(stmt)
                user = result.scalar_one_or_none()

                if user:
                    user.last_login_at = timestamp_now()
                    user.login_count += 1
                    user.last_login_ip = login_ip
                    user.last_login_country = login_country
                    user.updated_at = timestamp_now()
                    await db.commit()
                    return True
                return False
            except Exception:
                await db.rollback()
                raise

    async def increment_failed_attempts(self, user_id: int) -> bool:
        """增加用户失败登录次数"""
        # TODO::
        return True

        # async with get_async_session() as db:
        #     try:
        #         stmt = select(UserModel).where(UserModel.user_id == user_id)
        #         result = await db.execute(stmt)
        #         user = result.scalar_one_or_none()

        #         if user:
        #             user.updated_at = timestamp_now()
        #             await db.commit()
        #             return True
        #         return False
        #     except Exception:
        #         await db.rollback()
        #         raise

    async def lock_user_until(self, user_id: int, lock_until: int) -> bool:
        """锁定用户直到指定时间"""
        async with get_async_session() as db:
            try:
                stmt = select(UserModel).where(UserModel.user_id == user_id)
                result = await db.execute(stmt)
                user = result.scalar_one_or_none()

                if user:
                    user.locked_until = lock_until
                    user.updated_at = timestamp_now()
                    await db.commit()
                    return True
                return False
            except Exception:
                await db.rollback()
                raise

    async def unlock_user(self, user_id: int) -> bool:
        """解锁用户"""
        async with get_async_session() as db:
            try:
                stmt = select(UserModel).where(UserModel.user_id == user_id)
                result = await db.execute(stmt)
                user = result.scalar_one_or_none()

                if user:
                    user.locked_until = None
                    user.updated_at = timestamp_now()
                    await db.commit()
                    return True
                return False
            except Exception:
                await db.rollback()
                raise

    async def update_last_operation(
        self, user_id: int, ip: str | None = None, country: str | None = None
    ) -> bool:
        """更新用户最后操作 IP 和国家"""
        async with get_async_session() as db:
            try:
                stmt = select(UserModel).where(UserModel.user_id == user_id)
                result = await db.execute(stmt)
                user = result.scalar_one_or_none()

                if user:
                    user.last_operation_ip = ip
                    user.last_operation_country = country
                    user.updated_at = timestamp_now()
                    await db.commit()
                    return True
                return False
            except Exception:
                await db.rollback()
                raise


user_service = UserService()
