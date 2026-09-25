"""cron 框架维护类任务。"""

from app.utils.logger import logger
from app.utils.time import system_timezone, timestamp_now_seconds

MAINTENANCE_CRON_HEALTH_LOG_TASK_KEY = "maintenance.cron_health_log"


async def log_cron_health() -> None:
    """输出 cron 框架健康日志，不写业务 DB，不访问外部网络。"""
    logger.info(
        "cron_health_log task_key=%s system_timezone=%s timestamp_sec=%d",
        MAINTENANCE_CRON_HEALTH_LOG_TASK_KEY,
        system_timezone(),
        timestamp_now_seconds(),
    )
