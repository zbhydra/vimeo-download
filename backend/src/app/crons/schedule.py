"""cron 任务规格、调度常量和注册校验。"""

import inspect
import re
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any, Literal

# cron 任务统一是无参 async callable，返回值不参与调度决策。
CronTaskFunc = Callable[[], Coroutine[Any, Any, None]]

# 当前只支持固定间隔和每日本地固定时间两类触发。
CronTaskKind = Literal["interval", "daily"]

# 后台扫描间隔，决定多久发现到期任务和超时占用。
CRON_CHECK_INTERVAL_SECONDS = 30

# 单个任务运行上限，超过后释放 DB 占用并取消本进程业务协程。
CRON_TASK_TIMEOUT_SECONDS = 300

# shutdown 等待扫描循环自然退出的上限。
CRON_SCAN_SHUTDOWN_GRACE_SECONDS = 5

# shutdown 等待执行 wrapper 自然释放占用的上限。
CRON_TASK_SHUTDOWN_GRACE_SECONDS = 30

# shutdown 发出 cancel 后继续等待收尾的上限。
CRON_TASK_CANCEL_GRACE_SECONDS = 5

# task_key 进入 DB 主键和日志，限制成稳定的 domain.action 形态。
_TASK_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")

# daily_time 只允许纯本地时钟时间，避免日期和时区混入注册配置。
_DAILY_TIME_PATTERN = re.compile(r"^(\d{2}):(\d{2}):(\d{2})$")


@dataclass(frozen=True, slots=True)
class CronTaskSpec:
    """单个 cron 任务的注册规格。"""

    task_key: str
    task: CronTaskFunc
    kind: CronTaskKind
    interval_seconds: int | None = None
    daily_time: str | None = None

    def __post_init__(self) -> None:
        """构造时完成 task_key、调度策略和任务函数校验。"""
        key_length = len(self.task_key) if isinstance(self.task_key, str) else -1
        error_context = (
            f"task_key={self.task_key!r} kind={self.kind!r} "
            f"interval_seconds={self.interval_seconds!r} "
            f"daily_time={self.daily_time!r} task_key_length={key_length}"
        )

        if not isinstance(self.task_key, str) or not 1 <= key_length <= 100:
            raise ValueError(f"invalid cron task_key length: {error_context}")
        if _TASK_KEY_PATTERN.fullmatch(self.task_key) is None:
            raise ValueError(f"invalid cron task_key format: {error_context}")
        if self.kind not in ("interval", "daily"):
            raise ValueError(f"invalid cron task kind: {error_context}")
        if not self._is_async_callable(self.task):
            raise ValueError(f"cron task must be async callable: {error_context}")
        if not self._is_no_arg_callable(self.task):
            raise ValueError(f"cron task must be no-arg callable: {error_context}")

        if self.kind == "interval":
            if (
                not isinstance(self.interval_seconds, int)
                or self.interval_seconds < CRON_CHECK_INTERVAL_SECONDS
            ):
                raise ValueError(f"invalid interval cron task: {error_context}")
            if self.daily_time is not None:
                raise ValueError(f"interval cron task has daily_time: {error_context}")
            return

        if self.interval_seconds is not None:
            raise ValueError(f"daily cron task has interval_seconds: {error_context}")
        if not isinstance(self.daily_time, str):
            raise ValueError(f"daily cron task missing daily_time: {error_context}")
        try:
            self._parse_daily_time(self.daily_time)
        except ValueError as exc:
            raise ValueError(f"invalid daily cron task: {error_context}") from exc

    def daily_time_parts(self) -> tuple[int, int, int]:
        """返回 daily_time 的 hour、minute、second。"""
        if not isinstance(self.daily_time, str):
            raise ValueError(f"daily cron task missing daily_time: {self.task_key}")
        return self._parse_daily_time(self.daily_time)

    @staticmethod
    def _parse_daily_time(daily_time: str) -> tuple[int, int, int]:
        """解析 HH:mm:ss，并校验本地时钟范围。"""
        match = _DAILY_TIME_PATTERN.fullmatch(daily_time)
        if match is None:
            raise ValueError(f"daily_time must match HH:mm:ss: value={daily_time!r}")

        hour, minute, second = (int(part) for part in match.groups())
        if hour > 23 or minute > 59 or second > 59:
            raise ValueError(f"daily_time out of range: value={daily_time!r}")
        return hour, minute, second

    @staticmethod
    def _is_async_callable(task: object) -> bool:
        """静态判断任务对象是否为 async callable。"""
        if inspect.iscoroutinefunction(task):
            return True
        call_method = getattr(task, "__call__", None)
        return inspect.iscoroutinefunction(call_method)

    @staticmethod
    def _is_no_arg_callable(task: object) -> bool:
        """静态判断任务能否无参调用，注册阶段不执行任务避免副作用。"""
        if not callable(task):
            return False
        try:
            signature = inspect.signature(task)
        except (TypeError, ValueError):
            return False
        return len(signature.parameters) == 0
