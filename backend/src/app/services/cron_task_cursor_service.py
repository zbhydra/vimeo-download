"""cron 任务领取游标服务。

服务只负责 MySQL 原子领取和释放：
1. 启动期用 INSERT IGNORE 补齐缺失游标。
2. 到期时用条件 UPDATE 领取单个触发点。
3. 任务结束时用 running_at 身份释放占用。
4. 扫描循环定期释放超时占用。
"""

from dataclasses import dataclass

from sqlalchemy import select, text, update

from app.core.database import get_async_session
from app.core.singleton import singleton
from app.models.cron_task_cursor_model import CronTaskCursorModel
from app.services.base_service import BaseService


@dataclass(frozen=True, slots=True)
class CronTaskCursorSnapshot:
    """cron 任务游标快照。"""

    last_claimed_trigger_at: int
    is_running: bool
    running_at: int


@singleton
class CronTaskCursorService(BaseService[CronTaskCursorModel]):
    """cron 任务游标表操作服务。"""

    primary_key_field = "task_key"

    def __init__(self) -> None:
        """绑定 cron 游标模型。"""
        super().__init__(CronTaskCursorModel)

    async def init_missing_cursors(self, initial_cursors: dict[str, int]) -> None:
        """用 INSERT IGNORE 初始化缺失游标，不覆盖已有任务进度。"""
        if not initial_cursors:
            return

        values_sql: list[str] = []
        params: dict[str, int | str] = {}
        for index, (task_key, cursor) in enumerate(initial_cursors.items()):
            task_key_param = f"task_key_{index}"
            cursor_param = f"cursor_{index}"
            values_sql.append(f"(:{task_key_param}, :{cursor_param}, 0, 0)")
            params[task_key_param] = task_key
            params[cursor_param] = int(cursor)

        stmt = text(
            "INSERT IGNORE INTO cron_task_cursor "
            "(task_key, last_claimed_trigger_at, is_running, running_at) "
            f"VALUES {', '.join(values_sql)}"
        )
        async with get_async_session() as db:
            await db.execute(stmt, params)
            await db.commit()

    async def load_cursor_map(
        self,
        task_keys: list[str],
    ) -> dict[str, CronTaskCursorSnapshot]:
        """批量加载指定 task_key 的游标快照。"""
        unique_task_keys = list(dict.fromkeys(task_keys))
        if not unique_task_keys:
            return {}

        stmt = select(
            CronTaskCursorModel.task_key,
            CronTaskCursorModel.last_claimed_trigger_at,
            CronTaskCursorModel.is_running,
            CronTaskCursorModel.running_at,
        ).where(CronTaskCursorModel.task_key.in_(unique_task_keys))

        async with get_async_session() as db:
            result = await db.execute(stmt)
            return {
                str(row.task_key): CronTaskCursorSnapshot(
                    last_claimed_trigger_at=int(row.last_claimed_trigger_at),
                    is_running=bool(row.is_running),
                    running_at=int(row.running_at),
                )
                for row in result
            }

    async def claim_trigger(
        self,
        *,
        task_key: str,
        trigger_at: int,
        running_at: int,
    ) -> bool:
        """领取一个触发点；只有未运行且游标落后时才会成功。"""
        stmt = (
            update(CronTaskCursorModel)
            .where(
                CronTaskCursorModel.task_key == task_key,
                CronTaskCursorModel.is_running.is_(False),
                CronTaskCursorModel.last_claimed_trigger_at < trigger_at,
            )
            .values(
                last_claimed_trigger_at=trigger_at,
                is_running=True,
                running_at=running_at,
            )
        )
        async with get_async_session() as db:
            result = await db.execute(stmt)
            await db.commit()
            return int(getattr(result, "rowcount", 0) or 0) == 1

    async def release_running(
        self,
        *,
        task_key: str,
        running_at: int,
    ) -> bool:
        """按本次 running_at 身份释放占用，防止旧 worker 释放新占用。"""
        stmt = (
            update(CronTaskCursorModel)
            .where(
                CronTaskCursorModel.task_key == task_key,
                CronTaskCursorModel.is_running.is_(True),
                CronTaskCursorModel.running_at == running_at,
            )
            .values(is_running=False, running_at=0)
        )
        async with get_async_session() as db:
            result = await db.execute(stmt)
            await db.commit()
            return int(getattr(result, "rowcount", 0) or 0) == 1

    async def release_expired_running(
        self,
        *,
        now_sec: int,
        expire_seconds: int,
    ) -> int:
        """释放已经超过 expire_seconds 的运行占用，并返回释放数量。"""
        expired_threshold = now_sec - expire_seconds
        stmt = (
            update(CronTaskCursorModel)
            .where(
                CronTaskCursorModel.is_running.is_(True),
                CronTaskCursorModel.running_at <= expired_threshold,
            )
            .values(is_running=False, running_at=0)
        )
        async with get_async_session() as db:
            result = await db.execute(stmt)
            await db.commit()
            return int(getattr(result, "rowcount", 0) or 0)


cron_task_cursor_service = CronTaskCursorService()
