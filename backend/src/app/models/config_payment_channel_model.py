"""支付渠道配置表模型。"""

from typing import Optional

from sqlalchemy import BigInteger, Boolean, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class ConfigPaymentChannelModel(BaseDBModel):
    """支付渠道配置表。"""

    __tablename__ = "config_payment_channel"
    __table_args__ = (
        UniqueConstraint(
            "channel_code",
            name="uk_config_payment_channel_channel_code",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="配置 ID"
    )
    channel_code: Mapped[str] = mapped_column(
        String(32), nullable=False, comment="支付渠道标识"
    )
    channel_name: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="支付渠道名称"
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, comment="是否启用"
    )
    config_json: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="渠道配置 JSON"
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
