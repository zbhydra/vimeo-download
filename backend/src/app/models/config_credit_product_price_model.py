"""Credits 积分包渠道价格配置表模型。"""

from sqlalchemy import BigInteger, Boolean, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class ConfigCreditProductPriceModel(BaseDBModel):
    """Credits 积分包在支付渠道下的价格配置表。"""

    __tablename__ = "config_credit_product_price"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "channel_code",
            name="uk_config_credit_product_price_product_channel",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="配置 ID"
    )
    product_id: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="Credits 商品标识"
    )
    channel_code: Mapped[str] = mapped_column(
        String(32), nullable=False, comment="支付渠道标识"
    )
    currency: Mapped[str] = mapped_column(String(8), nullable=False, comment="币种")
    amount: Mapped[int] = mapped_column(
        BigInteger, nullable=False, comment="渠道金额，统一 6 位精度整数"
    )
    provider_sku: Mapped[str | None] = mapped_column(
        String(128), nullable=True, comment="渠道侧商品或价格标识"
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, comment="是否启用"
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
