"""
User 数据模型
"""

from typing import Optional

from app.constants.auth import UserLoginStatus
from app.schemas.client_user_schema import UserInfo
from sqlalchemy import BigInteger, Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserModel(BaseDBModel):
    """业务用户表"""

    __tablename__ = "users"
    __table_args__ = (
        # Telegram 单平台身份链已移除：列与历史值保留惰性，由人工执行结构同步时删除。
        {"info": {"schema_sync_drop_columns": ("tg_user_id",)}},
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    email: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=True, comment="邮箱（登录用）"
    )
    password_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="密码哈希 (bcrypt)"
    )
    full_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, comment="全名"
    )
    avatar_url: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="头像URL"
    )
    register_source: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True, comment="注册来源（extension/web）"
    )
    register_device_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="首次注册入口设备 ID（网站或插件），仅用于归因",
    )
    first_opened_at: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="注册设备首次观测打开时间（客户端毫秒时间戳）",
    )
    register_method: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        default=None,
        comment="首次注册方式（google/email_code）",
    )
    register_user_agent: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True, comment="注册时 User-Agent"
    )
    register_ip: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, comment="注册时IP"
    )
    register_country: Mapped[Optional[str]] = mapped_column(
        String(8), nullable=True, comment="注册时国家/地区"
    )
    is_del: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否注销"
    )
    last_login_at: Mapped[Optional[int]] = mapped_column(
        BigInteger, nullable=True, comment="最后登录时间(毫秒时间戳)"
    )
    last_login_ip: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, comment="最后登录IP"
    )
    last_login_country: Mapped[Optional[str]] = mapped_column(
        String(8), nullable=True, comment="最后登录国家/地区"
    )
    last_operation_ip: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, comment="最后操作IP"
    )
    last_operation_country: Mapped[Optional[str]] = mapped_column(
        String(8), nullable=True, comment="最后操作国家/地区"
    )
    login_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="登录次数"
    )
    locked_until: Mapped[Optional[int]] = mapped_column(
        BigInteger, nullable=True, comment="锁定截止时间(毫秒时间戳)"
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
        return f"<User(user_id={self.user_id}, email='{self.email}')>"

    def is_locked(self) -> bool:
        """检查用户是否被锁定"""
        if not self.locked_until:
            return False
        return self.locked_until > timestamp_now()

    def to_user_info(self) -> UserInfo:
        """转换为用户信息"""
        return UserInfo(
            user_id=self.user_id,
            email=self.email,
            full_name=self.full_name,
            avatar_url=self.avatar_url,
            created_at=self.created_at,
        )

    def user_status(self) -> UserLoginStatus:
        """检查用户状态"""
        if self.is_locked():
            return UserLoginStatus.LOCKED
        if self.is_del:
            return UserLoginStatus.DELETED
        return UserLoginStatus.OK
