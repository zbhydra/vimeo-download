"""用户注册 IP 记录模型。

本表是权益风控辅助表，只用于按 IP 统计近期注册数量；记录允许被清理，
不参与用户主流程强一致性判断。
"""

from sqlalchemy import BigInteger, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserIpRegisterModel(BaseDBModel):
    """用户注册 IP 记录。"""

    __tablename__ = "user_ip_registers"
    __table_args__ = (
        Index(
            "idx_user_ip_registers_ip_address",
            "ip_address",
        ),  # 服务注册前按 IP 统计窗口内注册数
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=False,
        comment="用户 ID",
    )
    ip_address: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="注册时客户端 IP",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )
