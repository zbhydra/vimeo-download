"""代理池配置模型。

该表只保存 Admin 维护的原始代理配置，不参与代理消费、连通性检查或健康调度。
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, CHAR, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class ProxyPoolEntryModel(BaseDBModel):
    """代理池中的一条动态或静态代理配置。"""

    __tablename__ = "proxy_pool_entries"

    proxy_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="代理配置 ID，自增主键",
    )
    name: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment="Admin 展示名",
    )
    proxy_type: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="代理记录类型：1=动态，2=静态",
    )
    protocol: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="原始代理协议文本",
    )
    dynamic_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="动态代理来源地址",
    )
    host: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="静态代理主机",
    )
    port: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="静态代理端口",
    )
    username: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="静态代理用户名",
    )
    password: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="静态代理密码",
    )
    country_code: Mapped[str | None] = mapped_column(
        CHAR(2),
        nullable=True,
        comment="人工填写国家码",
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        server_default=text("1"),
        nullable=False,
        comment="是否启用",
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
