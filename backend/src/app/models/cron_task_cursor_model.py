"""定时任务领取游标模型。

本表保存每个 cron 任务最近一次领取的触发点，以及当前 worker 的运行占用。
调度器依赖单行条件 UPDATE 完成多进程抢占，不在低基数字段上额外加索引。
"""

from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel


class CronTaskCursorModel(BaseDBModel):
    """cron 任务触发游标和运行占用。"""

    __tablename__ = "cron_task_cursor"

    task_key: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        comment="任务唯一键，格式为 domain.action",
    )
    last_claimed_trigger_at: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="最近一次领取的触发点，秒级 Unix 时间戳",
    )
    is_running: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="是否有 worker 正在执行",
    )
    running_at: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        nullable=False,
        comment="本次占用开始时间，秒级 Unix 时间戳",
    )
