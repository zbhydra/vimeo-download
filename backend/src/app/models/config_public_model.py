"""公共配置表模型。"""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel


class ConfigPublicModel(BaseDBModel):
    """公共配置表。"""

    __tablename__ = "config_public"

    c_key: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        nullable=False,
        comment="配置键",
    )
    g_value: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="配置值（JSON）",
    )
