"""用户签到活动主记录查询服务。"""

from collections.abc import Sequence

from sqlalchemy import Select, select

from app.core.database import get_async_session
from app.models.user_checkin_campaign_model import UserCheckinCampaignModel
from app.services.base_service import BaseService


class UserCheckinCampaignService(BaseService[UserCheckinCampaignModel]):
    """用户签到活动主记录服务。"""

    primary_key_field = "id"

    def __init__(self) -> None:
        super().__init__(UserCheckinCampaignModel)

    async def user_checkin_campaign_lists(
        self,
        *,
        campaign_ids: Sequence[int] | None = None,
        user_ids: Sequence[int] | None = None,
        start_ats: Sequence[int] | None = None,
        end_ats: Sequence[int] | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[UserCheckinCampaignModel]:
        """按用户和时间戳条件查询签到活动列表。"""
        if offset < 0:
            raise ValueError(
                f"user_checkin_campaign_lists invalid offset: offset={offset}"
            )
        if limit <= 0:
            raise ValueError(
                f"user_checkin_campaign_lists invalid limit: limit={limit}"
            )

        stmt: Select[tuple[UserCheckinCampaignModel]] = select(UserCheckinCampaignModel)
        if campaign_ids is not None:
            stmt = stmt.where(UserCheckinCampaignModel.id.in_(campaign_ids))
        if user_ids is not None:
            stmt = stmt.where(UserCheckinCampaignModel.user_id.in_(user_ids))
        if start_ats is not None:
            stmt = stmt.where(UserCheckinCampaignModel.start_at.in_(start_ats))
        if end_ats is not None:
            stmt = stmt.where(UserCheckinCampaignModel.end_at.in_(end_ats))

        async with get_async_session() as db:
            result = await db.execute(
                stmt.order_by(UserCheckinCampaignModel.id.desc())
                .offset(offset)
                .limit(limit)
            )
            return list(result.scalars().all())

    async def user_checkin_campaign_info(
        self,
        campaign_id: int,
    ) -> UserCheckinCampaignModel | None:
        """按活动 ID 获取一条签到活动记录。"""
        campaigns = await self.user_checkin_campaign_lists(
            campaign_ids=[campaign_id],
            limit=1,
        )
        return campaigns[0] if campaigns else None


user_checkin_campaign_service = UserCheckinCampaignService()
