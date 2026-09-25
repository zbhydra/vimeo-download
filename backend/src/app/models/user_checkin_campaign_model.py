"""用户签到活动主记录模型。

本表用自增 ID 承载一轮签到活动，`user_id` 只做查询索引，方便以后支持
新的签到活动轮次。
"""

from sqlalchemy import BigInteger, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserCheckinCampaignModel(BaseDBModel):
    """用户一轮签到活动记录。"""

    __tablename__ = "user_checkin_campaigns"
    __table_args__ = (Index("idx_user_checkin_campaign_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="签到活动 ID",
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="用户 ID",
    )
    start_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="活动开始时间（毫秒时间戳，后端默认业务时区当天 00:00）",
    )
    end_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="活动结束时间（毫秒时间戳，后端默认业务时区结束日 23:59:59.999）",
    )
    last_claim_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        comment="最近一次签到领取发生时间（毫秒时间戳，未领取为 0）",
    )
    total_claim_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="成功签到天数，仅用于展示和统计",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )
    updated_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="更新时间（毫秒时间戳）",
    )
