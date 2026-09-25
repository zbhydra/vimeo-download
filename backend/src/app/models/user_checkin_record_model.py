"""用户签到领取审计明细模型。

本表只做审计记录，不参与领取状态判断。
"""

from sqlalchemy import BigInteger, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserCheckinRecordModel(BaseDBModel):
    """用户签到成功审计记录。"""

    __tablename__ = "user_checkin_records"
    __table_args__ = (Index("idx_user_checkin_record_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="签到记录 ID",
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="用户 ID",
    )
    claimed_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="领取发生时间（毫秒时间戳）",
    )
    day_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="活动第几天，范围 1..14",
    )
    reward_credits: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="当天发放 Credits，6 或 3",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )
