"""系统数据配置表模型。

system_data 用于保存后台可编辑的运行时配置。data_value 使用 MySQL JSON
列，避免再为不同业务配置扩展多张窄表。
"""

from __future__ import annotations

from typing import TypeAlias

from sqlalchemy import BigInteger, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now

JsonValue: TypeAlias = (
    str | int | float | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
)


class SystemDataModel(BaseDBModel):
    """后台可编辑系统数据配置。"""

    __tablename__ = "system_data"

    data_key: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        nullable=False,
        comment="系统数据键",
    )
    data_value: Mapped[JsonValue] = mapped_column(
        JSON,
        nullable=False,
        comment="系统数据值（JSON）",
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
