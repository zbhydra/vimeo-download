"""用户 website Credits 下载记录模型。

本表只记录 website Credits 下载，用于同一用户同一资源 6 小时内免重复扣费。
extension 下载继续走每日次数规则，不写入本表。
"""

from typing import Optional

from sqlalchemy import CHAR, BigInteger, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserDownloadRecordModel(BaseDBModel):
    """用户 website Credits 下载记录。"""

    __tablename__ = "user_download_records"
    __table_args__ = (
        # 服务 U2 查询：WHERE user_id = ? AND resource_key = ? ORDER BY created_at DESC。
        Index("idx_user_download_resource", "user_id", "resource_key"),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="下载记录 ID",
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="用户 ID",
    )
    resource_key: Mapped[str] = mapped_column(
        CHAR(32),
        nullable=False,
        comment="website 下载资源指纹，MD5 hex",
    )
    platform: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="平台",
    )
    canonical_link: Mapped[str] = mapped_column(
        String(2048),
        nullable=False,
        comment="规范化链接",
    )
    source_id: Mapped[str] = mapped_column(
        String(256),
        nullable=False,
        comment="资源 ID",
    )
    filename: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="文件名",
    )
    size_bytes: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
        comment="文件大小，字节",
    )
    credits_cost: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="本次实际扣除 Credits，免扣为 0",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )
