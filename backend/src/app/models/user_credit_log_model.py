"""用户 Credits 余额变更流水模型。

流水只记录每一次余额变化；重复业务事件由对应业务表或订单状态处理。
"""

from typing import Optional

from sqlalchemy import CHAR, BigInteger, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserCreditLogModel(BaseDBModel):
    """用户 Credits 余额变更流水。"""

    __tablename__ = "user_credit_logs"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="流水 ID",
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="用户 ID",
    )
    change_amount: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Credits 变化量，正数为获得，负数为消耗",
    )
    reason: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="变更原因",
    )
    resource_key: Mapped[Optional[str]] = mapped_column(
        CHAR(32),
        nullable=True,
        comment="website 下载资源指纹，MD5 hex",
    )
    metadata_json: Mapped[Optional[str]] = mapped_column(
        "metadata",
        Text,
        nullable=True,
        comment="扩展 JSON 快照",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )
