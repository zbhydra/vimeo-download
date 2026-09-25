"""好评赠送领取事实迁移脚本的 real 测试。

真实资源依赖：
- MySQL: users / counter_user_lifetime / user_review_reward
- Redis: 测试账号的 access token 白名单（仅用于清理）

覆盖：
- 源账号迁移到新表（uid 由共用 helper 生成、value 带 userid: 前缀、ymd=0）
- 重复执行幂等且不重写已存在行
- 迁移只读旧表、不删行
- 迁移后的账号仍判为不可领
- 固定输入在 Python helper 与 MySQL SHA2 两侧输出一致
"""

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field

import pytest
from sqlalchemy import delete, select, text

from app.constants.counter import CounterId
from app.core.database import get_async_session, get_engine
from app.models.counter_user_lifetime_model import CounterUserLifetimeModel
from app.models.user_review_reward_model import UserReviewRewardModel
from app.services.subscription_review_reward_service import (
    subscription_review_reward_service,
)
from app.services.user_service import UserService
from app.services.user_token_service import user_token_service
from app.utils.time import timestamp_now
from app.utils.uid import build_user_scope
from scripts.migrations.backfill_user_review_reward import (
    backfill_user_review_reward,
)

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_REVIEW_REWARD_COUNTER_ID = int(CounterId.SUBSCRIPTION_REVIEW_REWARD_CLAIMED)


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的测试账号。"""

    user_ids: list[int] = field(default_factory=list)


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _seed_source_account(user_id: int) -> None:
    """写一行旧 Counter 领取记录，模拟迁移前的历史数据。"""

    now_ms = timestamp_now()
    async with get_async_session() as db:
        db.add(
            CounterUserLifetimeModel(  # type: ignore[call-arg]
                user_id=user_id,
                counter_id=_REVIEW_REWARD_COUNTER_ID,
                value=1,
                created_at=now_ms,
                updated_at=now_ms,
            )
        )
        await db.commit()


async def _load_reward_row(user_id: int) -> tuple[int, str, int] | None:
    """按 uid 读取迁移后的领取事实行。"""

    uid = build_user_scope(user_id)[0]
    async with get_async_session() as db:
        row = (
            await db.execute(
                select(
                    UserReviewRewardModel.ymd,
                    UserReviewRewardModel.value,
                    UserReviewRewardModel.created_at,
                ).where(UserReviewRewardModel.uid == uid)
            )
        ).first()
    if row is None:
        return None
    return int(row[0]), str(row[1]), int(row[2])


async def _source_counter_value(user_id: int) -> int | None:
    """读取旧表 Counter 值，用于断言迁移不删行、不改写。"""

    async with get_async_session() as db:
        return await db.scalar(
            select(CounterUserLifetimeModel.value).where(
                CounterUserLifetimeModel.user_id == user_id,
                CounterUserLifetimeModel.counter_id == _REVIEW_REWARD_COUNTER_ID,
            )
        )


async def _delete_migrated_account(user_id: int) -> None:
    """按 uid 清理事实行，再清掉旧 Counter 与 Redis token。

    用户行不在这里删：tests/conftest.py 的 autouse 清理已按测试邮箱删除本轮用户，
    重复删会与它的 users 读锁形成交叉锁等待（级联子表 X 锁 vs users 索引 S 锁）。
    """

    await user_token_service.revoke_all_user_tokens(user_id)
    async with get_async_session() as db:
        await db.execute(
            delete(UserReviewRewardModel).where(
                UserReviewRewardModel.uid == build_user_scope(user_id)[0]
            )
        )
        await db.execute(
            delete(CounterUserLifetimeModel).where(
                CounterUserLifetimeModel.user_id == user_id
            )
        )
        await db.commit()


@pytest.fixture
async def real_migration_schema_ready(real_mysql_ready, real_redis_ready) -> None:
    """检查迁移 real 测试需要的真实表。"""

    required_tables = {"users", "counter_user_lifetime", "user_review_reward"}
    missing = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_migration_cleanup_state(
    real_migration_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的真实测试数据。"""

    state = _CleanupState()
    try:
        yield state
    finally:
        for user_id in state.user_ids:
            await _delete_migrated_account(user_id)


@pytest.fixture
def make_migrated_account(
    real_migration_cleanup_state: _CleanupState,
    make_test_email: Callable[[str], str],
) -> Callable[[str], Awaitable[int]]:
    """创建带旧 Counter 领取记录的真实测试账号，返回账号 ID。"""

    async def _create(label: str) -> int:
        user = await UserService().create_user_without_password(
            email=make_test_email(label)
        )
        await _seed_source_account(user.user_id)
        real_migration_cleanup_state.user_ids.append(user.user_id)
        return user.user_id

    return _create


async def test_real_backfill_migrates_source_account_idempotently(
    make_migrated_account: Callable[[str], Awaitable[int]],
) -> None:
    """源账号迁移为新表事实行，重复执行不重写已存在行。"""

    user_id = await make_migrated_account("migration-source")

    preview_stats = await backfill_user_review_reward(execute=False)
    assert preview_stats.pending_accounts >= 1
    assert await _load_reward_row(user_id) is None

    first_stats = await backfill_user_review_reward(execute=True)
    migrated_row = await _load_reward_row(user_id)

    assert first_stats.missing_accounts == 0
    assert first_stats.verified_accounts >= 1
    assert migrated_row is not None
    ymd, value, created_at = migrated_row
    assert ymd == 0
    assert value == f"userid:{user_id}"
    assert (
        await subscription_review_reward_service.claimed_count_for_display(
            user_id=user_id,
            device_id=None,
        )
        == 1
    )

    second_stats = await backfill_user_review_reward(execute=True)

    assert second_stats.pending_accounts == 0
    # 重复执行同样要报出真实总命中数：迁移前已存在的行必须计入核对，不能报 0。
    assert second_stats.already_present_accounts >= 1
    assert second_stats.verified_accounts >= second_stats.already_present_accounts
    assert second_stats.missing_accounts == 0
    assert await _load_reward_row(user_id) == (ymd, value, created_at)
    assert await _source_counter_value(user_id) == 1


async def test_real_backfill_matches_python_and_mysql_uid_hash(
    real_migration_schema_ready,
) -> None:
    """固定输入 userid:1 在 Python helper 与迁移 SQL 两侧输出同一字符串。"""

    python_uid, python_value = build_user_scope(1)
    async with get_async_session() as db:
        mysql_uid = await db.scalar(
            text("SELECT LOWER(SUBSTR(SHA2(CONCAT('userid:', :user_id), 256), 1, 32))"),
            {"user_id": 1},
        )

    assert python_value == "userid:1"
    assert isinstance(mysql_uid, str)
    assert mysql_uid == python_uid
    assert len(python_uid) == 32
    assert python_uid == python_uid.lower()
