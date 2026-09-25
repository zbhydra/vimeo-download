"""好评赠送领取事实表的 MySQL 数据模型。"""

from sqlalchemy import BigInteger, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserReviewRewardModel(BaseDBModel):
    """按作用域记录好评赠送领取事实，行数上界为账号数加设备数。

    账号与设备两个作用域各占一行、互不覆盖：判定是「任一维度已存在即不可再领」。
    uid 列必须区分大小写，否则默认排序规则会让不同作用域的哈希碰撞。
    """

    __tablename__ = "user_review_reward"

    uid: Mapped[str] = mapped_column(
        String(32, collation="utf8mb4_bin"),
        primary_key=True,
        comment="作用域 uid（sha256 前 32 位小写 hex），区分大小写",
    )
    ymd: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="领取日的业务时区 YYYYMMDD，仅供审计，不参与判定",
    )
    value: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment=(
            "带前缀原值（userid:123 / Device-Id:xxx），"
            "仅供人工排查与迁移核对，不参与业务查询"
        ),
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=timestamp_now,
        comment="创建时间（毫秒时间戳）",
    )
