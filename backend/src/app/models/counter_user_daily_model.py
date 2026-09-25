"""用户自然日 Counter 的 MySQL 数据模型。"""

from sqlalchemy import BigInteger, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class CounterUserDailyModel(BaseDBModel):
    """按用户、业务自然日和 Counter ID 唯一的累计值。"""

    __tablename__ = "counter_user_daily"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "ymd",
            "counter_id",
            name="uk_counter_user_daily_user_id_ymd_counter_id",
        ),  # counter_service.add/get_list 查询
    )

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="记录 ID"
    )
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False, comment="用户 ID")
    counter_id: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="固定 Counter ID"
    )
    ymd: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="业务时区自然日（YYYYMMDD）"
    )
    value: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default="0",
        comment="当前自然日累计值",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=timestamp_now,
        comment="创建时间（毫秒时间戳）",
    )
    updated_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=timestamp_now,
        comment="更新时间（毫秒时间戳）",
    )
