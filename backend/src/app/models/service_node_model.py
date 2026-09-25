"""服务节点控制面模型。

本表只在 business role 的业务数据库中使用。download role 不导入本模块，
也不配置业务数据库 node_id；节点身份由业务服务器 `service_nodes.node_id`
统一管理。静态状态字段默认值由数据库和 ORM server_default 共同表达，
时间字段由写入服务显式传入 Unix 秒，避免 ORM 与建表 SQL 产生双重口径。
"""

from typing import Optional

from sqlalchemy import BigInteger, Boolean, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel


class ServiceNodeModel(BaseDBModel):
    """业务节点和下载节点统一建模表。"""

    __tablename__ = "service_nodes"
    __table_args__ = (
        # session 统计链路已移除：列与历史值由人工执行结构同步时删除。
        {"info": {"schema_sync_drop_columns": ("session_count",)}},
    )

    node_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True,
        comment="节点 ID，自增主键",
    )
    node_type: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="节点类型：1=business，2=download",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="节点展示名",
    )
    region: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="节点地区",
    )
    public_base_url: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="客户端访问节点 parse-v2/download-v2 的基础地址",
    )
    internal_base_url: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="业务服务器健康检查访问节点的基础地址",
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        server_default=text("1"),
        nullable=False,
        comment="管理员控制的启用状态",
    )
    status: Mapped[int] = mapped_column(
        Integer,
        server_default=text("1"),
        nullable=False,
        comment="历史调度状态：1=启用，3=停用；由 enabled 自动派生",
    )
    weight: Mapped[int] = mapped_column(
        Integer,
        server_default=text("100"),
        nullable=False,
        comment="节点加权随机权重",
    )
    last_health_status: Mapped[int] = mapped_column(
        Integer,
        server_default=text("0"),
        nullable=False,
        comment="最近健康状态：0=unknown，1=healthy，2=unhealthy",
    )
    last_health_at: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
        comment="最近健康检查 Unix 秒时间戳",
    )
    last_error: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="最近健康检查错误",
    )
    version: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="节点上报的版本",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="创建时间（Unix 秒时间戳）",
    )
    updated_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="更新时间（Unix 秒时间戳）",
    )
