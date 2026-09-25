"""用户注册 IP 权益风控服务。

流程：
1. 从 config_public 读取 `registration_ip_benefit_guard`。
2. 注册前按 IP 和配置窗口统计近期注册数，决定是否发放注册权益。
3. 注册后尽量写入辅助记录；失败只记日志，不影响注册主流程。
"""

from collections.abc import Mapping, Sequence
from typing import Literal, cast

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import Select, delete, func, select, update
from sqlalchemy.engine import CursorResult

from app.core.database import get_async_session
from app.models.user_ip_register_model import UserIpRegisterModel
from app.services.config_public_service import config_public_service
from app.utils.logger import logger
from app.utils.time import timestamp_now

REGISTRATION_IP_BENEFIT_GUARD_KEY = "registration_ip_benefit_guard"

UserIpRegisterListOrder = Literal[
    "created_at_desc",
    "created_at_asc",
    "user_id_desc",
    "user_id_asc",
]


class RegistrationIpBenefitGuardConfig(BaseModel):
    """config_public.registration_ip_benefit_guard 的结构。"""

    model_config = ConfigDict(extra="ignore")

    window_seconds: int = Field(..., ge=1, description="统计窗口秒数")
    max_registrations: int = Field(..., ge=1, description="窗口内允许发权益的注册数")


class UserIpRegisterService:
    """用户注册 IP 记录服务。"""

    async def is_registration_bonus_allowed(self, ip_address: str | None) -> bool:
        """判断当前 IP 本次注册是否可领取注册权益。"""

        normalized_ip = self._normalize_ip(ip_address)
        if normalized_ip is None:
            return True

        guard_config = await self._load_guard_config()
        if guard_config is None:
            return True

        window_start_ms = timestamp_now() - guard_config.window_seconds * 1000
        registrations = await self.count_recent_registers(
            ip_address=normalized_ip,
            created_after_ms=window_start_ms,
        )
        return registrations < guard_config.max_registrations

    async def record_register_best_effort(
        self,
        *,
        user_id: int,
        ip_address: str | None,
    ) -> None:
        """注册后尽量记录 IP；辅助表失败不影响用户注册成功。"""

        normalized_ip = self._normalize_ip(ip_address)
        if normalized_ip is None:
            return

        try:
            await self.user_ip_register_create(
                user_id=user_id,
                ip_address=normalized_ip,
            )
        except Exception:
            logger.error(
                "user_ip_register_service.record_register_best_effort: "
                "insert failed, user_id=%s, ip_address=%s",
                user_id,
                normalized_ip,
                exc_info=True,
            )

    async def _load_guard_config(
        self,
    ) -> RegistrationIpBenefitGuardConfig | None:
        """读取 IP 注册权益风控配置；缺失或非法时关闭风控。"""

        raw_config = await config_public_service.get(REGISTRATION_IP_BENEFIT_GUARD_KEY)
        if raw_config is None:
            return None

        try:
            return RegistrationIpBenefitGuardConfig.model_validate(raw_config)
        except ValidationError:
            logger.error(
                "user_ip_register_service._load_guard_config: invalid config, "
                "c_key=%s, raw_config=%r",
                REGISTRATION_IP_BENEFIT_GUARD_KEY,
                raw_config,
                exc_info=True,
            )
            return None

    async def user_ip_register_create(
        self,
        *,
        user_id: int,
        ip_address: str,
    ) -> UserIpRegisterModel:
        """新增一条用户注册 IP 记录。"""

        now_ms = timestamp_now()
        item = UserIpRegisterModel(  # type: ignore[call-arg]
            user_id=user_id,
            ip_address=ip_address,
            created_at=now_ms,
        )
        async with get_async_session() as db:
            db.add(item)
            await db.commit()
            await db.refresh(item)
            return item

    async def count_recent_registers(
        self,
        *,
        ip_address: str,
        created_after_ms: int,
    ) -> int:
        """统计某个 IP 在时间窗口内的注册记录数。"""

        async with get_async_session() as db:
            result = await db.execute(
                select(func.count())
                .select_from(UserIpRegisterModel)
                .where(
                    UserIpRegisterModel.ip_address == ip_address,
                    UserIpRegisterModel.created_at >= created_after_ms,
                )
            )
            return int(result.scalar_one())

    async def user_ip_register_lists(
        self,
        *,
        user_ids: Sequence[int] | None = None,
        ip_addresses: Sequence[str] | None = None,
        created_after_ms: int | None = None,
        created_before_ms: int | None = None,
        offset: int = 0,
        limit: int = 100,
        order_by: UserIpRegisterListOrder = "created_at_desc",
    ) -> list[UserIpRegisterModel]:
        """查询用户注册 IP 记录。"""

        stmt = self._apply_user_ip_register_filters(
            select(UserIpRegisterModel),
            user_ids=user_ids,
            ip_addresses=ip_addresses,
            created_after_ms=created_after_ms,
            created_before_ms=created_before_ms,
        )
        if order_by == "created_at_asc":
            stmt = stmt.order_by(UserIpRegisterModel.created_at.asc())
        elif order_by == "user_id_desc":
            stmt = stmt.order_by(UserIpRegisterModel.user_id.desc())
        elif order_by == "user_id_asc":
            stmt = stmt.order_by(UserIpRegisterModel.user_id.asc())
        else:
            stmt = stmt.order_by(UserIpRegisterModel.created_at.desc())
        stmt = stmt.offset(offset).limit(limit)

        async with get_async_session() as db:
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def user_ip_register_info(
        self,
        user_id: int,
    ) -> UserIpRegisterModel | None:
        """按用户 ID 读取注册 IP 记录。"""

        rows = await self.user_ip_register_lists(user_ids=[user_id], limit=1)
        return rows[0] if rows else None

    async def user_ip_register_update(
        self,
        user_id: int,
        fields: Mapping[str, object | None],
    ) -> bool:
        """更新注册 IP 记录，值为 None 的字段不更新。"""

        values = {key: value for key, value in fields.items() if value is not None}
        if not values:
            return False

        async with get_async_session() as db:
            result = cast(
                CursorResult[object],
                await db.execute(
                    update(UserIpRegisterModel)
                    .where(UserIpRegisterModel.user_id == user_id)
                    .values(**values)
                ),
            )
            await db.commit()
            return result.rowcount == 1

    async def user_ip_register_del(self, user_ids: Sequence[int]) -> int:
        """按用户 ID 批量删除注册 IP 记录。"""

        if not user_ids:
            return 0

        async with get_async_session() as db:
            result = cast(
                CursorResult[object],
                await db.execute(
                    delete(UserIpRegisterModel).where(
                        UserIpRegisterModel.user_id.in_(user_ids)
                    )
                ),
            )
            await db.commit()
            return int(result.rowcount or 0)

    def _apply_user_ip_register_filters(
        self,
        stmt: Select[tuple[UserIpRegisterModel]],
        *,
        user_ids: Sequence[int] | None,
        ip_addresses: Sequence[str] | None,
        created_after_ms: int | None,
        created_before_ms: int | None,
    ) -> Select[tuple[UserIpRegisterModel]]:
        """应用注册 IP 记录查询条件。"""

        if user_ids is not None:
            stmt = stmt.where(UserIpRegisterModel.user_id.in_(user_ids))
        if ip_addresses is not None:
            stmt = stmt.where(UserIpRegisterModel.ip_address.in_(ip_addresses))
        if created_after_ms is not None:
            stmt = stmt.where(UserIpRegisterModel.created_at >= created_after_ms)
        if created_before_ms is not None:
            stmt = stmt.where(UserIpRegisterModel.created_at <= created_before_ms)
        return stmt

    def _normalize_ip(self, ip_address: str | None) -> str | None:
        """清理 IP 字符串；空 IP 不参与风控。"""

        if ip_address is None:
            return None
        value = ip_address.strip()
        return value or None


user_ip_register_service = UserIpRegisterService()
