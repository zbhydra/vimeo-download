"""
Admin 管理员数据模型

管理后台的管理员账号表，密码使用 bcrypt 哈希存储。
通过 CLI 命令 `python scripts/create_admin.py` 创建管理员。
"""

from sqlalchemy import BigInteger, Boolean, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class AdminModel(BaseDBModel):
    """管理员表"""

    __tablename__ = "admins"
    __table_args__ = (
        Index("uk_admins_api_key_hash", "api_key_hash", unique=True),
    )  # 服务外部 API Key 鉴权按 SHA-256 hash 精确查询管理员

    admin_id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="管理员 ID"
    )
    username: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, comment="用户名"
    )
    password_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="密码 bcrypt 哈希"
    )
    api_key_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        comment="外部 API Key SHA-256 哈希",
    )
    api_key_prefix: Mapped[str | None] = mapped_column(
        String(16), nullable=True, comment="外部 API Key 展示前缀"
    )
    api_key_created_at: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, comment="外部 API Key 生成时间（毫秒时间戳）"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, comment="是否启用"
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

    def __repr__(self) -> str:
        return f"<Admin(admin_id={self.admin_id}, username='{self.username}')>"
