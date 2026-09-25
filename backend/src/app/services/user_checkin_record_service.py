"""用户签到成功明细查询服务。"""

from collections.abc import Sequence

from sqlalchemy import Select, select

from app.core.database import get_async_session
from app.models.user_checkin_record_model import UserCheckinRecordModel
from app.services.base_service import BaseService


class UserCheckinRecordService(BaseService[UserCheckinRecordModel]):
    """用户签到成功明细服务。"""

    primary_key_field = "id"

    def __init__(self) -> None:
        super().__init__(UserCheckinRecordModel)

    async def user_checkin_record_lists(
        self,
        *,
        record_ids: Sequence[int] | None = None,
        user_ids: Sequence[int] | None = None,
        claimed_at_start: int | None = None,
        claimed_at_end: int | None = None,
        day_indexes: Sequence[int] | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[UserCheckinRecordModel]:
        """按用户、领取时间范围或活动日查询签到明细列表。"""
        if offset < 0:
            raise ValueError(
                f"user_checkin_record_lists invalid offset: offset={offset}"
            )
        if limit <= 0:
            raise ValueError(f"user_checkin_record_lists invalid limit: limit={limit}")

        stmt: Select[tuple[UserCheckinRecordModel]] = select(UserCheckinRecordModel)
        if record_ids is not None:
            stmt = stmt.where(UserCheckinRecordModel.id.in_(record_ids))
        if user_ids is not None:
            stmt = stmt.where(UserCheckinRecordModel.user_id.in_(user_ids))
        if claimed_at_start is not None:
            stmt = stmt.where(UserCheckinRecordModel.claimed_at >= claimed_at_start)
        if claimed_at_end is not None:
            stmt = stmt.where(UserCheckinRecordModel.claimed_at < claimed_at_end)
        if day_indexes is not None:
            stmt = stmt.where(UserCheckinRecordModel.day_index.in_(day_indexes))

        async with get_async_session() as db:
            result = await db.execute(
                stmt.order_by(UserCheckinRecordModel.id.desc())
                .offset(offset)
                .limit(limit)
            )
            return list(result.scalars().all())

    async def user_checkin_record_info(
        self,
        record_id: int,
    ) -> UserCheckinRecordModel | None:
        """按签到记录 ID 获取一条明细。"""
        records = await self.user_checkin_record_lists(
            record_ids=[record_id],
            limit=1,
        )
        return records[0] if records else None


user_checkin_record_service = UserCheckinRecordService()
