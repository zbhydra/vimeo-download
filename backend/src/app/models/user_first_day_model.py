"""首次下载日事实表的 MySQL 数据模型。"""

from sqlalchemy import BigInteger, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserFirstDayModel(BaseDBModel):
    """按作用域记录首次下载的业务日期，行数上界为账号数加设备数。"""

    __tablename__ = "user_first_day"

    uid: Mapped[str] = mapped_column(
        String(32, collation="utf8mb4_bin"),
        primary_key=True,
        comment="作用域 uid（sha256 前 32 位小写 hex），区分大小写",
    )
    ymd: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="首个下载日的业务时区 YYYYMMDD，判定列"
    )
    value: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment="带前缀原值（userid:123 / Device-Id:xxx），仅供人工排查，不参与业务查询",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=timestamp_now,
        comment="创建时间（毫秒时间戳）",
    )
