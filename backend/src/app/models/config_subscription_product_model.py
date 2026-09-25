"""订阅商品配置表模型。"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class ConfigSubscriptionProductModel(BaseDBModel):
    """订阅商品配置表。"""

    __tablename__ = "config_subscription_product"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            name="uk_config_subscription_product_product_id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="配置 ID"
    )
    product_id: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="商品标识，业务唯一"
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False, comment="商品名称")
    period: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="none",
        server_default=text("'none'"),
        comment="商业与权益周期",
    )
    duration_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="已废弃，仅用于旧版本回滚兼容",
    )
    auto_renew: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("0"),
        comment="当前销售模式是否由渠道自动续费",
    )
    display_currency: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="USD",
        server_default=text("'USD'"),
        comment="商品卡默认展示币种",
    )
    display_amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default=text("0"),
        comment="商品卡默认展示金额，统一 6 位精度整数",
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, comment="是否启用"
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="排序值，越小越靠前"
    )
    metadata_json: Mapped[str | None] = mapped_column(
        "metadata", Text, nullable=True, comment="扩展配置 JSON"
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
