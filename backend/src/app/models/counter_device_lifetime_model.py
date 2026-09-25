"""设备永久累计 Counter 的 MySQL 数据模型。"""

from sqlalchemy import BigInteger, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class CounterDeviceLifetimeModel(BaseDBModel):
    """按设备和 Counter ID 唯一的永久累计值。"""

    __tablename__ = "counter_device_lifetime"
    __table_args__ = (
        UniqueConstraint(
            "device_id",
            "counter_id",
            name="uk_counter_device_lifetime_device_id_counter_id",
        ),  # counter_device_service.add/get_list 按设备和 Counter 查询
    )

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="记录 ID"
    )
    device_id: Mapped[str] = mapped_column(
        String(64, collation="utf8mb4_bin"),
        nullable=False,
        comment="设备 ID，区分大小写",
    )
    counter_id: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="固定 Counter ID"
    )
    value: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0", comment="永久累计值"
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=timestamp_now,
        comment="创建时间（毫秒时间戳）",
    )
    updated_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=timestamp_now,
        comment="更新时间（毫秒时间戳）",
    )
