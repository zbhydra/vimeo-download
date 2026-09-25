"""cron 框架稳定导出入口。"""

from app.crons.registry import CRON_TASKS
from app.crons.schedule import (
    CRON_CHECK_INTERVAL_SECONDS,
    CRON_SCAN_SHUTDOWN_GRACE_SECONDS,
    CRON_TASK_CANCEL_GRACE_SECONDS,
    CRON_TASK_SHUTDOWN_GRACE_SECONDS,
    CRON_TASK_TIMEOUT_SECONDS,
    CronTaskFunc,
    CronTaskKind,
    CronTaskSpec,
)
from app.crons.scheduler import CronScheduler

# 全局调度器由 FastAPI lifespan 统一启动和停止。
cron_scheduler = CronScheduler(CRON_TASKS)

__all__ = [
    "CRON_CHECK_INTERVAL_SECONDS",
    "CRON_SCAN_SHUTDOWN_GRACE_SECONDS",
    "CRON_TASK_CANCEL_GRACE_SECONDS",
    "CRON_TASK_SHUTDOWN_GRACE_SECONDS",
    "CRON_TASK_TIMEOUT_SECONDS",
    "CRON_TASKS",
    "CronScheduler",
    "CronTaskFunc",
    "CronTaskKind",
    "CronTaskSpec",
    "cron_scheduler",
]
