"""订单数据模型"""

from sqlalchemy import BigInteger, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.order import OrderStatus, CallbackStatus
from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class OrderModel(BaseDBModel):
    """订单表"""

    __tablename__ = "orders"
    __table_args__ = (
        # 支付 webhook 按渠道与渠道流水精确查重，收敛续费单并发建单竞态。
        Index(
            "idx_orders_payment_method_payment_channel_order_no",
            "payment_method",
            "payment_channel_order_no",
        ),
    )

    # 主键
    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="订单ID"
    )
    order_no: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, comment="订单号（业务唯一标识）"
    )

    # 用户信息
    user_id: Mapped[int] = mapped_column(
        BigInteger, nullable=False, index=True, comment="用户ID"
    )

    # 商品信息
    product_class: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="商品类别（枚举值）"
    )
    product_id: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="商品ID（业务系统定义）"
    )
    product_name: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="商品名称（快照）"
    )

    # 金额信息
    amount: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        comment="订单金额，统一 6 位精度整数",
    )
    currency: Mapped[str] = mapped_column(
        String(8), nullable=False, default="USD", comment="货币类型"
    )

    # 状态信息
    order_status: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=OrderStatus.PENDING.value,
        comment="订单状态",
    )
    callback_status: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=CallbackStatus.NOT_CALLED.value,
        comment="业务回调状态",
    )

    # 支付信息
    payment_method: Mapped[str | None] = mapped_column(String(32), comment="支付方式")
    payment_data: Mapped[str | None] = mapped_column(
        Text, comment="支付入口数据（JSON）"
    )
    payment_channel_order_no: Mapped[str | None] = mapped_column(
        String(256), comment="支付渠道订单号"
    )
    payment_transaction_id: Mapped[str | None] = mapped_column(
        String(256), comment="支付渠道交易流水 ID"
    )
    payment_channel_uid: Mapped[str | None] = mapped_column(
        String(64), comment="支付渠道 UID"
    )
    paid_amount: Mapped[int | None] = mapped_column(
        BigInteger, comment="渠道回调支付金额，统一 6 位精度整数"
    )
    paid_currency: Mapped[str | None] = mapped_column(
        String(8), comment="渠道回调支付币种"
    )

    # 时间戳（毫秒）
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
    paid_at: Mapped[int | None] = mapped_column(
        BigInteger, comment="支付时间（毫秒时间戳）"
    )
    expired_at: Mapped[int] = mapped_column(
        BigInteger, nullable=False, comment="订单过期时间（毫秒时间戳）"
    )

    # 其他
    client_ip: Mapped[str | None] = mapped_column(String(64), comment="客户端IP")
    extra_metadata: Mapped[str | None] = mapped_column(
        Text, comment="扩展元数据（JSON）"
    )

    def __repr__(self) -> str:
        return (
            f"<Order(id={self.id}, order_no='{self.order_no}', "
            f"user_id={self.user_id}, order_status='{self.order_status}')>"
        )
