"""cron 内置任务注册表。"""

from app.crons.schedule import CronTaskSpec
from app.crons.task.maintenance import (
    MAINTENANCE_CRON_HEALTH_LOG_TASK_KEY,
    log_cron_health,
)
from app.crons.task.order_fulfillment import (
    ORDER_FULFILLMENT_COMPENSATION_TASK_KEY,
    compensate_paid_pending_subscription_orders,
)

_ONE_HOUR_SECONDS = 3600
_ONE_MINUTE_SECONDS = 60

# CRON_TASKS 是进程启动时注册到调度器的唯一任务列表。
CRON_TASKS: list[CronTaskSpec] = [
    CronTaskSpec(
        task_key=MAINTENANCE_CRON_HEALTH_LOG_TASK_KEY,
        task=log_cron_health,
        kind="interval",
        interval_seconds=_ONE_HOUR_SECONDS,
    ),
    CronTaskSpec(
        task_key=ORDER_FULFILLMENT_COMPENSATION_TASK_KEY,
        task=compensate_paid_pending_subscription_orders,
        kind="interval",
        interval_seconds=_ONE_MINUTE_SECONDS,
    ),
]
