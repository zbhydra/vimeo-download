"""CronTaskCursorService MySQL real 测试。

真实资源依赖：
- MySQL
- cron_task_cursor 表
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
import uuid

import pytest
from sqlalchemy import text

from app.core.database import get_engine
from app.services.cron_task_cursor_service import cron_task_cursor_service


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass
class _CleanupState:
    """记录本文件创建的 cron task_key。"""

    test_run_id: str
    task_keys: list[str] = field(default_factory=list)


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""
    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


@pytest.fixture
async def real_cron_schema_ready(real_mysql_ready) -> None:
    """检查 cron real 测试需要的游标表。"""
    if not await _table_exists("cron_task_cursor"):
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 数据库缺少 cron_task_cursor 表")


@pytest.fixture
async def real_cron_cleanup_state(
    real_cron_schema_ready,
    test_run_id: str,
) -> AsyncIterator[_CleanupState]:
    """yield finalizer 清理本轮 test_run_id 下的 cron task_key。"""
    state = _CleanupState(test_run_id=test_run_id)
    task_key_prefix = f"test.run_{test_run_id}.%"
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM cron_task_cursor WHERE task_key LIKE :prefix"),
            {"prefix": task_key_prefix},
        )

    try:
        yield state
    finally:
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM cron_task_cursor WHERE task_key LIKE :prefix"),
                {"prefix": task_key_prefix},
            )


@pytest.fixture
def make_cron_task_key(
    real_cron_cleanup_state: _CleanupState,
) -> Callable[[str], str]:
    """生成满足 domain.action 风格且可清理的测试 task_key。"""

    def _make_cron_task_key(case_name: str) -> str:
        safe_case_name = "".join(
            char if char.isalnum() else "_" for char in case_name.lower()
        )
        task_key = (
            f"test.run_{real_cron_cleanup_state.test_run_id}."
            f"case_{safe_case_name}_{uuid.uuid4().hex[:8]}"
        )
        real_cron_cleanup_state.task_keys.append(task_key)
        return task_key

    return _make_cron_task_key


async def test_real_init_missing_cursors_does_not_overwrite_existing_cursor(
    make_cron_task_key: Callable[[str], str],
) -> None:
    """重复初始化不会覆盖已有游标。"""
    task_key = make_cron_task_key("init")

    await cron_task_cursor_service.init_missing_cursors({task_key: 100})
    await cron_task_cursor_service.init_missing_cursors({task_key: 999})

    cursor_map = await cron_task_cursor_service.load_cursor_map([task_key])

    assert cursor_map[task_key].last_claimed_trigger_at == 100
    assert cursor_map[task_key].is_running is False
    assert cursor_map[task_key].running_at == 0


async def test_real_claim_trigger_allows_only_one_worker_per_trigger(
    make_cron_task_key: Callable[[str], str],
) -> None:
    """同一触发点只能被一个 worker 领取。"""
    task_key = make_cron_task_key("claim")
    await cron_task_cursor_service.init_missing_cursors({task_key: 100})

    first_claimed = await cron_task_cursor_service.claim_trigger(
        task_key=task_key,
        trigger_at=200,
        running_at=300,
    )
    second_claimed = await cron_task_cursor_service.claim_trigger(
        task_key=task_key,
        trigger_at=200,
        running_at=400,
    )

    assert first_claimed is True
    assert second_claimed is False


async def test_real_release_running_requires_matching_running_at(
    make_cron_task_key: Callable[[str], str],
) -> None:
    """running_at 不匹配时不能误释放占用。"""
    task_key = make_cron_task_key("release")
    await cron_task_cursor_service.init_missing_cursors({task_key: 100})
    assert await cron_task_cursor_service.claim_trigger(
        task_key=task_key,
        trigger_at=200,
        running_at=300,
    )

    wrong_released = await cron_task_cursor_service.release_running(
        task_key=task_key,
        running_at=301,
    )
    cursor_after_wrong_release = (
        await cron_task_cursor_service.load_cursor_map([task_key])
    )[task_key]

    right_released = await cron_task_cursor_service.release_running(
        task_key=task_key,
        running_at=300,
    )
    cursor_after_right_release = (
        await cron_task_cursor_service.load_cursor_map([task_key])
    )[task_key]

    assert wrong_released is False
    assert cursor_after_wrong_release.is_running is True
    assert cursor_after_wrong_release.running_at == 300
    assert right_released is True
    assert cursor_after_right_release.is_running is False
    assert cursor_after_right_release.running_at == 0


async def test_real_release_expired_running_releases_only_expired_occupancy(
    make_cron_task_key: Callable[[str], str],
) -> None:
    """release_expired_running 只释放超过阈值的运行占用。"""
    expired_key = make_cron_task_key("expired")
    active_key = make_cron_task_key("active")
    idle_key = make_cron_task_key("idle")
    await cron_task_cursor_service.init_missing_cursors(
        {
            expired_key: 100,
            active_key: 100,
            idle_key: 100,
        }
    )
    assert await cron_task_cursor_service.claim_trigger(
        task_key=expired_key,
        trigger_at=200,
        running_at=100,
    )
    assert await cron_task_cursor_service.claim_trigger(
        task_key=active_key,
        trigger_at=200,
        running_at=490,
    )

    released_count = await cron_task_cursor_service.release_expired_running(
        now_sec=500,
        expire_seconds=300,
    )
    cursor_map = await cron_task_cursor_service.load_cursor_map(
        [expired_key, active_key, idle_key]
    )

    assert released_count == 1
    assert cursor_map[expired_key].is_running is False
    assert cursor_map[expired_key].running_at == 0
    assert cursor_map[active_key].is_running is True
    assert cursor_map[active_key].running_at == 490
    assert cursor_map[idle_key].is_running is False
