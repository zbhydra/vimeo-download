"""cron 任务规格校验测试。"""

import pytest

from app.crons.registry import CRON_TASKS
from app.crons.schedule import CRON_CHECK_INTERVAL_SECONDS, CronTaskSpec
from app.crons.scheduler import CronScheduler
from app.crons.task.maintenance import MAINTENANCE_CRON_HEALTH_LOG_TASK_KEY
from app.crons.task.order_fulfillment import ORDER_FULFILLMENT_COMPENSATION_TASK_KEY


async def _async_task() -> None:
    """测试用无参 async 任务。"""


def _sync_task() -> None:
    """测试用同步任务。"""


async def _async_task_with_arg(value: int) -> None:
    """测试用带参数 async 任务。"""
    assert value > 0


def test_interval_task_spec_accepts_valid_config() -> None:
    """合法 interval 配置可构造。"""
    spec = CronTaskSpec(
        task_key="demo.hourly",
        task=_async_task,
        kind="interval",
        interval_seconds=CRON_CHECK_INTERVAL_SECONDS,
    )

    assert spec.task_key == "demo.hourly"


def test_daily_task_spec_accepts_valid_config() -> None:
    """合法 daily 配置可构造并解析 daily_time。"""
    spec = CronTaskSpec(
        task_key="demo.daily",
        task=_async_task,
        kind="daily",
        daily_time="02:03:04",
    )

    assert spec.daily_time_parts() == (2, 3, 4)


def test_task_spec_rejects_sync_callable() -> None:
    """同步函数不能注册成 cron 任务。"""
    with pytest.raises(ValueError, match="async callable"):
        CronTaskSpec(
            task_key="demo.sync",
            task=_sync_task,  # type: ignore[arg-type]
            kind="interval",
            interval_seconds=CRON_CHECK_INTERVAL_SECONDS,
        )


def test_task_spec_rejects_callable_with_args() -> None:
    """cron 任务必须是无参 async 函数。"""
    with pytest.raises(ValueError, match="no-arg"):
        CronTaskSpec(
            task_key="demo.arg",
            task=_async_task_with_arg,  # type: ignore[arg-type]
            kind="interval",
            interval_seconds=CRON_CHECK_INTERVAL_SECONDS,
        )


def test_task_spec_rejects_invalid_task_key() -> None:
    """task_key 必须是 domain.action 格式。"""
    with pytest.raises(ValueError, match="task_key format"):
        CronTaskSpec(
            task_key="BadKey",
            task=_async_task,
            kind="interval",
            interval_seconds=CRON_CHECK_INTERVAL_SECONDS,
        )


def test_task_spec_rejects_short_interval() -> None:
    """interval 不能小于扫描周期。"""
    with pytest.raises(ValueError, match="invalid interval"):
        CronTaskSpec(
            task_key="demo.fast",
            task=_async_task,
            kind="interval",
            interval_seconds=CRON_CHECK_INTERVAL_SECONDS - 1,
        )


def test_task_spec_rejects_invalid_daily_time() -> None:
    """daily_time 必须是合法 HH:mm:ss。"""
    with pytest.raises(ValueError, match="invalid daily"):
        CronTaskSpec(
            task_key="demo.daily_bad",
            task=_async_task,
            kind="daily",
            daily_time="24:00:00",
        )


def test_scheduler_rejects_duplicate_task_key() -> None:
    """同一调度器内不能重复注册 task_key。"""
    spec = CronTaskSpec(
        task_key="demo.duplicate",
        task=_async_task,
        kind="interval",
        interval_seconds=CRON_CHECK_INTERVAL_SECONDS,
    )

    with pytest.raises(ValueError, match="duplicate cron task_key"):
        CronScheduler([spec, spec])


def test_registry_registers_maintenance_health_log() -> None:
    """注册表包含每小时维护日志任务。"""
    [spec] = [
        item
        for item in CRON_TASKS
        if item.task_key == MAINTENANCE_CRON_HEALTH_LOG_TASK_KEY
    ]

    assert spec.kind == "interval"
    assert spec.interval_seconds == 3600


def test_registry_registers_order_fulfillment_compensation() -> None:
    """注册表包含每分钟订单履约补偿任务。"""
    [spec] = [
        item
        for item in CRON_TASKS
        if item.task_key == ORDER_FULFILLMENT_COMPENSATION_TASK_KEY
    ]

    assert spec.kind == "interval"
    assert spec.interval_seconds == 60
