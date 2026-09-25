"""业务回调日志数据模型"""

from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class CallbackLogModel(BaseDBModel):
    """业务回调日志表"""

    __tablename__ = "callback_logs"

    # 主键
    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="日志ID"
    )

    # 订单关联
    order_id: Mapped[int] = mapped_column(
        BigInteger, nullable=False, index=True, comment="订单ID"
    )
    order_no: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True, comment="订单号"
    )

    # 回调信息
    callback_url: Mapped[Optional[str]] = mapped_column(
        String(512), comment="回调地址（记录用）"
    )
    request_body: Mapped[Optional[str]] = mapped_column(Text, comment="请求体（JSON）")
    response_body: Mapped[Optional[str]] = mapped_column(Text, comment="响应体")

    # 状态
    http_status: Mapped[Optional[int]] = mapped_column(Integer, comment="HTTP状态码")
    callback_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="回调状态",
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, comment="错误信息")

    # 时间戳
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )

    # 索引
    __table_args__ = (Index("idx_callback_status", "callback_status"),)

    def __repr__(self) -> str:
        return (
            f"<CallbackLog(id={self.id}, order_no='{self.order_no}', "
            f"callback_status='{self.callback_status}')>"
        )
