"""cron 执行器测试。"""

import asyncio
import logging

import pytest

from app.crons.executor import execute_claimed_task
from app.crons.schedule import CRON_CHECK_INTERVAL_SECONDS, CronTaskSpec
from app.crons.task.maintenance import log_cron_health


class _FakeCursorService:
    """执行器测试用游标释放替身。"""

    def __init__(self) -> None:
        """初始化释放记录。"""
        self.released: list[tuple[str, int]] = []

    async def release_running(
        self,
        *,
        task_key: str,
        running_at: int,
    ) -> bool:
        """记录释放参数。"""
        self.released.append((task_key, running_at))
        return True


def _spec(task) -> CronTaskSpec:
    """构造 executor 测试任务规格。"""
    return CronTaskSpec(
        task_key="demo.executor",
        task=task,
        kind="interval",
        interval_seconds=CRON_CHECK_INTERVAL_SECONDS,
    )


@pytest.mark.asyncio
async def test_executor_releases_running_after_success(monkeypatch) -> None:
    """任务成功后会释放 running_at 占用。"""
    fake_service = _FakeCursorService()
    called = False

    async def task() -> None:
        nonlocal called
        called = True

    monkeypatch.setattr(
        "app.crons.executor.cron_task_cursor_service",
        fake_service,
    )

    await execute_claimed_task(
        spec=_spec(task),
        running_at=123,
        task_timeout_seconds=5,
    )

    assert called is True
    assert fake_service.released == [("demo.executor", 123)]


@pytest.mark.asyncio
async def test_executor_cancels_timeout_task_and_releases(monkeypatch) -> None:
    """任务超时后会 cancel 业务协程并释放占用。"""
    fake_service = _FakeCursorService()
    cancelled = asyncio.Event()

    async def task() -> None:
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            cancelled.set()
            raise

    monkeypatch.setattr(
        "app.crons.executor.cron_task_cursor_service",
        fake_service,
    )

    await execute_claimed_task(
        spec=_spec(task),
        running_at=456,
        task_timeout_seconds=0.01,
    )
    await asyncio.wait_for(cancelled.wait(), timeout=1)

    assert fake_service.released == [("demo.executor", 456)]


@pytest.mark.asyncio
async def test_maintenance_health_log_is_structured(caplog) -> None:
    """维护日志任务只输出包含 task_key、时区和秒级时间戳的结构化日志。"""
    caplog.set_level(logging.INFO, logger="server")

    await log_cron_health()

    assert "cron_health_log" in caplog.text
    assert "task_key=maintenance.cron_health_log" in caplog.text
    assert "system_timezone=" in caplog.text
    assert "timestamp_sec=" in caplog.text
