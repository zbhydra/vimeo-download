"""App 版本发布记录模型。

保存各平台各分发渠道的版本发布条目，供 client 匿名查询最新版本与
external 发布端点入库；唯一键防止同渠道重复发布同一 version_code。
"""

from sqlalchemy import BigInteger, Boolean, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class AppReleaseModel(BaseDBModel):
    """App 版本发布记录。"""

    __tablename__ = "app_release"
    __table_args__ = (
        UniqueConstraint(
            "platform",
            "channel",
            "version_code",
            name="uk_app_release_platform_channel_version_code",
        ),  # 发布端点防重复入库；client 查询按 platform+channel 取最大 version_code
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="记录 ID",
    )
    platform: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        comment="平台标识，如 android",
    )
    channel: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        comment="分发渠道，direct（侧载）/ play（Google Play）",
    )
    version_code: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="版本号比较基准，单调递增",
    )
    version_name: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="展示版本名，如 0.2.0",
    )
    download_url: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
        comment="APK 下载 URL，仅 direct 渠道使用",
    )
    release_notes: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="更新说明，V1 单语英文",
    )
    forced: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="强制更新标记，V1 只存不用",
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="是否启用；False 时客户端版本检查不返回该条",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )
