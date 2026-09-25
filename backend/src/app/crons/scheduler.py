"""cron 扫描调度器。

CronScheduler 串联任务注册表、MySQL 游标和执行器：启动时初始化缺失游标并
首轮扫描，运行中周期领取到期任务，关闭时停止领取并等待 wrapper 释放占用。
"""

import asyncio
from datetime import date, datetime, timedelta

from app.crons.executor import execute_claimed_task
from app.crons.schedule import (
    CRON_CHECK_INTERVAL_SECONDS,
    CRON_SCAN_SHUTDOWN_GRACE_SECONDS,
    CRON_TASK_CANCEL_GRACE_SECONDS,
    CRON_TASK_SHUTDOWN_GRACE_SECONDS,
    CRON_TASK_TIMEOUT_SECONDS,
    CronTaskSpec,
)
from app.services.cron_task_cursor_service import cron_task_cursor_service
from app.utils.logger import logger
from app.utils.time import system_timezone, timestamp_now_seconds


class CronScheduler:
    """服务端 cron 调度器。"""

    def __init__(
        self,
        tasks: list[CronTaskSpec],
        *,
        check_interval_seconds: int = CRON_CHECK_INTERVAL_SECONDS,
        task_timeout_seconds: int = CRON_TASK_TIMEOUT_SECONDS,
    ) -> None:
        """保存任务注册快照，并校验调度器级别约束。"""
        if not isinstance(check_interval_seconds, int) or check_interval_seconds <= 0:
            raise ValueError("check_interval_seconds must be greater than 0")
        if not isinstance(task_timeout_seconds, int) or task_timeout_seconds <= 0:
            raise ValueError("task_timeout_seconds must be greater than 0")

        task_keys = [spec.task_key for spec in tasks]
        duplicate_task_keys = sorted(
            task_key for task_key in set(task_keys) if task_keys.count(task_key) > 1
        )
        if duplicate_task_keys:
            raise ValueError(f"duplicate cron task_key: {duplicate_task_keys}")

        self._tasks = list(tasks)
        self._check_interval_seconds = check_interval_seconds
        self._task_timeout_seconds = task_timeout_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop_event: asyncio.Event | None = None
        self._running_tasks: set[asyncio.Task[None]] = set()
        self._cursors_initialized = False

    async def start(self) -> None:
        """启动后台扫描；已运行时保持幂等。"""
        if self._task is not None:
            if not self._task.done():
                return

            finished_task = self._task
            self._task = None
            self._stop_event = None
            self._consume_scan_task_result(finished_task)

        stop_event = asyncio.Event()
        self._stop_event = stop_event
        try:
            if not self._cursors_initialized:
                await self._init_missing_cursors()
                self._cursors_initialized = True
            await self._scan_once(stop_event, raise_on_setup_error=True)
        except Exception:
            self._stop_event = None
            raise

        if stop_event.is_set():
            self._stop_event = None
            return

        self._task = asyncio.create_task(self._run(stop_event))
        self._task.add_done_callback(self._on_scan_task_done)

    async def stop(self) -> None:
        """停止扫描任务，并等待本进程已启动的执行 wrapper 释放占用。"""
        scan_task = self._task
        stop_event = self._stop_event

        if stop_event is not None:
            stop_event.set()

        if scan_task is not None:
            done, pending = await asyncio.wait(
                {scan_task},
                timeout=CRON_SCAN_SHUTDOWN_GRACE_SECONDS,
            )
            for task in done:
                self._consume_scan_task_result(task)
            if pending:
                scan_task.cancel()
                cancelled_done, still_pending = await asyncio.wait(
                    pending,
                    timeout=CRON_TASK_CANCEL_GRACE_SECONDS,
                )
                for task in cancelled_done:
                    self._consume_scan_task_result(task)
                for task in still_pending:
                    logger.warning("定时任务扫描任务取消超时 task=%s", task)

        running_tasks = set(self._running_tasks)
        if running_tasks:
            done, pending = await asyncio.wait(
                running_tasks,
                timeout=CRON_TASK_SHUTDOWN_GRACE_SECONDS,
            )
            for task in done:
                self._consume_execution_task_result(task)
            for task in pending:
                task.cancel()
            if pending:
                cancelled_done, still_pending = await asyncio.wait(
                    pending,
                    timeout=CRON_TASK_CANCEL_GRACE_SECONDS,
                )
                for task in cancelled_done:
                    self._consume_execution_task_result(task)
                for task in still_pending:
                    logger.warning("定时任务执行 wrapper 取消超时 task=%s", task)

        self._running_tasks = set()
        self._task = None
        self._stop_event = None

    async def _run(self, stop_event: asyncio.Event) -> None:
        """按扫描间隔循环执行扫描。"""
        try:
            while not stop_event.is_set():
                try:
                    await asyncio.wait_for(
                        stop_event.wait(),
                        timeout=self._check_interval_seconds,
                    )
                    return
                except asyncio.TimeoutError:
                    await self._scan_once(stop_event)
        except Exception:
            logger.exception("定时任务扫描任务异常退出")

    async def _scan_once(
        self,
        stop_event: asyncio.Event,
        *,
        raise_on_setup_error: bool = False,
    ) -> None:
        """执行单轮释放、读取、领取和 wrapper 启动。"""
        now_sec = timestamp_now_seconds()

        try:
            released_count = await cron_task_cursor_service.release_expired_running(
                now_sec=now_sec,
                expire_seconds=self._task_timeout_seconds,
            )
            if released_count:
                logger.warning("释放超时定时任务占用 count=%d", released_count)
        except Exception:
            logger.exception("释放超时定时任务占用失败")

        try:
            cursor_map = await cron_task_cursor_service.load_cursor_map(
                [spec.task_key for spec in self._tasks]
            )
        except Exception:
            logger.exception("加载定时任务游标失败")
            if raise_on_setup_error:
                raise
            return

        for spec in self._tasks:
            if stop_event.is_set():
                break
            try:
                cursor = cursor_map.get(spec.task_key)
                if cursor is None:
                    logger.error("定时任务游标缺失 task_key=%s", spec.task_key)
                    continue
                if cursor.is_running:
                    continue

                due_trigger_at = self._resolve_due_trigger_at(
                    spec=spec,
                    now_sec=now_sec,
                    last_claimed_trigger_at=cursor.last_claimed_trigger_at,
                )
                if due_trigger_at is None:
                    continue

                claim_now_sec = timestamp_now_seconds()
                claimed = await cron_task_cursor_service.claim_trigger(
                    task_key=spec.task_key,
                    trigger_at=due_trigger_at,
                    running_at=claim_now_sec,
                )
                if not claimed:
                    continue
                if stop_event.is_set():
                    await cron_task_cursor_service.release_running(
                        task_key=spec.task_key,
                        running_at=claim_now_sec,
                    )
                    break

                execution_task = asyncio.create_task(
                    execute_claimed_task(
                        spec=spec,
                        running_at=claim_now_sec,
                        task_timeout_seconds=self._task_timeout_seconds,
                    )
                )
                self._running_tasks.add(execution_task)
                execution_task.add_done_callback(self._on_execution_task_done)
            except Exception:
                logger.exception("扫描定时任务失败 task_key=%s", spec.task_key)

    async def _init_missing_cursors(self) -> None:
        """启动期为注册任务补齐缺失游标。"""
        initial_cursors = self._build_initial_cursors(timestamp_now_seconds())
        try:
            await cron_task_cursor_service.init_missing_cursors(initial_cursors)
        except Exception:
            logger.exception("初始化定时任务游标失败")
            raise

    def _build_initial_cursors(self, now_sec: int) -> dict[str, int]:
        """按任务规格生成缺失游标的初始 last_claimed_trigger_at。"""
        initial_cursors: dict[str, int] = {}
        for spec in self._tasks:
            if spec.kind == "interval":
                assert spec.interval_seconds is not None
                initial_cursors[spec.task_key] = now_sec - spec.interval_seconds
                continue
            initial_cursors[spec.task_key] = self._build_daily_anchor_timestamp(
                local_date=self._local_date_for(now_sec) - timedelta(days=1),
                spec=spec,
            )
        return initial_cursors

    @staticmethod
    def _resolve_due_trigger_at(
        *,
        spec: CronTaskSpec,
        now_sec: int,
        last_claimed_trigger_at: int,
    ) -> int | None:
        """按任务类型计算本轮可领取的最近触发点。"""
        if spec.kind == "interval":
            assert spec.interval_seconds is not None
            return CronScheduler._resolve_interval_due_trigger_at(
                now_sec=now_sec,
                last_claimed_trigger_at=last_claimed_trigger_at,
                interval_seconds=spec.interval_seconds,
            )
        return CronScheduler._resolve_daily_due_trigger_at(
            spec=spec,
            now_sec=now_sec,
            last_claimed_trigger_at=last_claimed_trigger_at,
        )

    @staticmethod
    def _resolve_interval_due_trigger_at(
        *,
        now_sec: int,
        last_claimed_trigger_at: int,
        interval_seconds: int,
    ) -> int | None:
        """计算 interval 任务本轮可领取的最近窗口。"""
        elapsed_windows = (now_sec - last_claimed_trigger_at) // interval_seconds
        if elapsed_windows <= 0:
            return None
        return last_claimed_trigger_at + elapsed_windows * interval_seconds

    @staticmethod
    def _resolve_daily_due_trigger_at(
        *,
        spec: CronTaskSpec,
        now_sec: int,
        last_claimed_trigger_at: int,
    ) -> int | None:
        """按服务器本地日历日计算 daily 任务最近触发点。"""
        local_now = datetime.fromtimestamp(now_sec, tz=system_timezone())
        today_anchor = CronScheduler._build_daily_anchor_timestamp(
            local_date=local_now.date(),
            spec=spec,
        )
        if today_anchor <= now_sec:
            candidate = today_anchor
        else:
            candidate = CronScheduler._build_daily_anchor_timestamp(
                local_date=local_now.date() - timedelta(days=1),
                spec=spec,
            )
        if candidate <= last_claimed_trigger_at:
            return None
        return candidate

    @staticmethod
    def _local_date_for(now_sec: int) -> date:
        """把秒级时间戳转换为服务器时区日期。"""
        return datetime.fromtimestamp(now_sec, tz=system_timezone()).date()

    @staticmethod
    def _build_daily_anchor_timestamp(
        *,
        local_date: date,
        spec: CronTaskSpec,
    ) -> int:
        """把 daily_time 锚到指定服务器本地日期并返回秒级时间戳。"""
        hour, minute, second = spec.daily_time_parts()
        local_anchor = datetime(
            local_date.year,
            local_date.month,
            local_date.day,
            hour,
            minute,
            second,
            tzinfo=system_timezone(),
        )
        return int(local_anchor.timestamp())

    def _on_scan_task_done(self, task: asyncio.Task[None]) -> None:
        """扫描任务结束回调，清理当前引用并消费结果。"""
        if self._task is task:
            self._task = None
            self._stop_event = None
        self._consume_scan_task_result(task)

    def _on_execution_task_done(self, task: asyncio.Task[None]) -> None:
        """执行 wrapper 结束回调，移除跟踪集合并消费结果。"""
        self._running_tasks.discard(task)
        self._consume_execution_task_result(task)

    @staticmethod
    def _consume_scan_task_result(task: asyncio.Task[None]) -> None:
        """消费扫描任务结果，避免未取异常。"""
        try:
            task.result()
        except asyncio.CancelledError:
            logger.debug("定时任务扫描任务已取消")
        except Exception:
            logger.exception("定时任务扫描任务异常退出")

    @staticmethod
    def _consume_execution_task_result(task: asyncio.Task[None]) -> None:
        """消费执行 wrapper 结果，避免未取异常。"""
        try:
            task.result()
        except asyncio.CancelledError:
            logger.debug("定时任务执行 wrapper 已取消")
        except Exception:
            logger.exception("定时任务执行 wrapper 异常退出")
