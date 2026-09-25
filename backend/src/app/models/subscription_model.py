"""用户订阅数据模型"""

from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserSubscriptionModel(BaseDBModel):
    """用户订阅表"""

    __tablename__ = "user_subscriptions"

    user_id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=False, comment="用户 ID"
    )
    product_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None, comment="当前权益商品标识"
    )
    product_price_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, default=None, comment="当前生效购买选项 ID"
    )
    auto_renew: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True, default=None, comment="购买时续费方式快照"
    )
    period: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default=None, comment="商业周期快照"
    )
    payment_method: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None, comment="当前订阅支付渠道"
    )
    original_order_no: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None, comment="自动续费本地首单号"
    )
    channel_subscription_id: Mapped[str | None] = mapped_column(
        String(256), nullable=True, default=None, comment="渠道订阅协议或取消句柄"
    )
    channel_uid: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None, comment="渠道付款用户标识"
    )
    start_at: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        default=None,
        comment="当前订阅账期开始（毫秒时间戳，仅展示）",
    )
    cancelled_at: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        default=None,
        comment="本站确认取消时间（毫秒时间戳）",
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
    # MySQL upsert 按 Model 列顺序生成更新项，唯一时间真相必须最后写入。
    expires_at: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="订阅过期时间(毫秒时间戳)",
    )

    def __repr__(self) -> str:
        return (
            f"<UserSubscription(user_id={self.user_id}, "
            f"expires_at={self.expires_at})>"
        )
