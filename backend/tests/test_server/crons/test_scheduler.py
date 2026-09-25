"""cron 调度器算法和生命周期测试。"""

import asyncio
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.crons.schedule import CRON_CHECK_INTERVAL_SECONDS, CronTaskSpec
from app.crons.scheduler import CronScheduler
from app.services.cron_task_cursor_service import CronTaskCursorSnapshot


async def _async_task() -> None:
    """测试用无参 async 任务。"""


def _interval_spec(interval_seconds: int = 60) -> CronTaskSpec:
    """构造 interval 测试任务。"""
    return CronTaskSpec(
        task_key="demo.interval",
        task=_async_task,
        kind="interval",
        interval_seconds=max(interval_seconds, CRON_CHECK_INTERVAL_SECONDS),
    )


def _daily_spec() -> CronTaskSpec:
    """构造 daily 测试任务。"""
    return CronTaskSpec(
        task_key="demo.daily",
        task=_async_task,
        kind="daily",
        daily_time="02:30:00",
    )


@dataclass
class _FakeCursorService:
    """调度器测试用游标服务替身。"""

    snapshot: CronTaskCursorSnapshot
    init_calls: int = 0
    load_calls: int = 0
    release_expired_calls: int = 0
    claim_calls: int = 0

    async def init_missing_cursors(self, initial_cursors: dict[str, int]) -> None:
        """记录初始化调用。"""
        assert initial_cursors
        self.init_calls += 1

    async def load_cursor_map(
        self,
        task_keys: list[str],
    ) -> dict[str, CronTaskCursorSnapshot]:
        """返回固定游标快照。"""
        self.load_calls += 1
        return {task_key: self.snapshot for task_key in task_keys}

    async def release_expired_running(
        self,
        *,
        now_sec: int,
        expire_seconds: int,
    ) -> int:
        """记录超时释放调用。"""
        assert now_sec > 0
        assert expire_seconds > 0
        self.release_expired_calls += 1
        return 0

    async def claim_trigger(
        self,
        *,
        task_key: str,
        trigger_at: int,
        running_at: int,
    ) -> bool:
        """记录领取调用。"""
        assert task_key
        assert trigger_at > 0
        assert running_at > 0
        self.claim_calls += 1
        return True

    async def release_running(
        self,
        *,
        task_key: str,
        running_at: int,
    ) -> bool:
        """调度器 stop 途中释放已领取占用时使用。"""
        assert task_key
        assert running_at > 0
        return True


def test_interval_due_trigger_uses_latest_window() -> None:
    """长时间停机后 interval 只补最近一个触发窗口。"""
    due = CronScheduler._resolve_interval_due_trigger_at(
        now_sec=1000,
        last_claimed_trigger_at=100,
        interval_seconds=60,
    )

    assert due == 1000


def test_interval_not_due_before_next_window() -> None:
    """未跨过完整 interval 窗口时不到期。"""
    due = CronScheduler._resolve_interval_due_trigger_at(
        now_sec=129,
        last_claimed_trigger_at=100,
        interval_seconds=60,
    )

    assert due is None


def test_daily_due_trigger_uses_server_local_calendar(monkeypatch) -> None:
    """daily 任务按服务器本地日历日锚点计算。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")
    spec = _daily_spec()
    now_sec = int(
        datetime(2026, 6, 13, 3, 0, 0, tzinfo=ZoneInfo("America/New_York")).timestamp()
    )
    yesterday_anchor = int(
        datetime(
            2026,
            6,
            12,
            2,
            30,
            0,
            tzinfo=ZoneInfo("America/New_York"),
        ).timestamp()
    )
    today_anchor = int(
        datetime(
            2026,
            6,
            13,
            2,
            30,
            0,
            tzinfo=ZoneInfo("America/New_York"),
        ).timestamp()
    )

    due = CronScheduler._resolve_due_trigger_at(
        spec=spec,
        now_sec=now_sec,
        last_claimed_trigger_at=yesterday_anchor,
    )

    assert due == today_anchor


def test_daily_before_today_anchor_uses_yesterday_candidate(monkeypatch) -> None:
    """当天 daily_time 前不会提前领取今日触发点。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")
    spec = _daily_spec()
    now_sec = int(
        datetime(2026, 6, 13, 1, 0, 0, tzinfo=ZoneInfo("America/New_York")).timestamp()
    )
    yesterday_anchor = int(
        datetime(
            2026,
            6,
            12,
            2,
            30,
            0,
            tzinfo=ZoneInfo("America/New_York"),
        ).timestamp()
    )

    due = CronScheduler._resolve_due_trigger_at(
        spec=spec,
        now_sec=now_sec,
        last_claimed_trigger_at=yesterday_anchor,
    )

    assert due is None


def test_daily_initial_cursor_uses_yesterday_local_anchor(monkeypatch) -> None:
    """daily 缺失游标初始化到服务器本地昨日锚点。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")
    spec = _daily_spec()
    now_sec = int(
        datetime(
            2026,
            6,
            13,
            12,
            0,
            0,
            tzinfo=ZoneInfo("America/New_York"),
        ).timestamp()
    )
    scheduler = CronScheduler([spec])
    expected = int(
        datetime(
            2026,
            6,
            12,
            2,
            30,
            0,
            tzinfo=ZoneInfo("America/New_York"),
        ).timestamp()
    )

    assert scheduler._build_initial_cursors(now_sec) == {"demo.daily": expected}


@pytest.mark.asyncio
async def test_scheduler_start_is_idempotent_and_stop_exits(monkeypatch) -> None:
    """重复 start 不会创建多个扫描循环，stop 可结束后台任务。"""
    fake_service = _FakeCursorService(
        snapshot=CronTaskCursorSnapshot(
            last_claimed_trigger_at=1_000,
            is_running=False,
            running_at=0,
        )
    )
    monkeypatch.setattr(
        "app.crons.scheduler.cron_task_cursor_service",
        fake_service,
    )
    monkeypatch.setattr("app.crons.scheduler.timestamp_now_seconds", lambda: 1_010)

    scheduler = CronScheduler([_interval_spec()], check_interval_seconds=3600)
    await scheduler.start()
    first_scan_task = scheduler._task
    await scheduler.start()

    assert scheduler._task is first_scan_task
    assert fake_service.init_calls == 1
    assert fake_service.load_calls == 1

    await scheduler.stop()

    assert scheduler._task is None
    assert scheduler._stop_event is None


@pytest.mark.asyncio
async def test_scheduler_scan_claims_due_task(monkeypatch) -> None:
    """单轮扫描会领取到期任务并启动执行 wrapper。"""
    fake_service = _FakeCursorService(
        snapshot=CronTaskCursorSnapshot(
            last_claimed_trigger_at=1_000,
            is_running=False,
            running_at=0,
        )
    )
    executed: list[tuple[str, int, int]] = []

    async def fake_execute_claimed_task(
        *,
        spec: CronTaskSpec,
        running_at: int,
        task_timeout_seconds: int,
    ) -> None:
        executed.append((spec.task_key, running_at, task_timeout_seconds))

    monkeypatch.setattr(
        "app.crons.scheduler.cron_task_cursor_service",
        fake_service,
    )
    monkeypatch.setattr("app.crons.scheduler.timestamp_now_seconds", lambda: 1_060)
    monkeypatch.setattr(
        "app.crons.scheduler.execute_claimed_task",
        fake_execute_claimed_task,
    )

    scheduler = CronScheduler([_interval_spec()], task_timeout_seconds=9)
    await scheduler._scan_once(asyncio.Event())
    await asyncio.gather(*scheduler._running_tasks)

    assert fake_service.claim_calls == 1
    assert executed == [("demo.interval", 1_060, 9)]
