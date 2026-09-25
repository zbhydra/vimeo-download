"""CounterService 使用真实 MySQL 的周期、原子累加与 schema 测试。"""

import asyncio
from typing import Protocol

import pytest
from sqlalchemy import func, select, text

from app.constants.counter import (
    COUNTER_DEFINITIONS,
    CounterCycle,
    CounterId,
    get_counter_definition,
)
from app.core.database import get_async_session
from app.models.counter_user_daily_model import CounterUserDailyModel
from app.services.counter_service import counter_service
from app.utils.time import get_current_ymd

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_DAILY_ID = int(CounterId.DEMO_DAILY)
_MONTHLY_ID = int(CounterId.DEMO_MONTHLY)
_LIFETIME_ID = int(CounterId.DEMO_LIFETIME)
_REVIEW_REWARD_ID = int(CounterId.SUBSCRIPTION_REVIEW_REWARD_CLAIMED)
_UNKNOWN_ID = 999_999


class _CleanupState(Protocol):
    """本文件消费的 Counter 清理 fixture 合同。"""

    test_run_id: str
    user_id: int


def test_real_counter_registry_keeps_production_ids() -> None:
    """生产 Counter ID 稳定注册到各自周期。"""

    assert set(COUNTER_DEFINITIONS) == {
        _DAILY_ID,
        _MONTHLY_ID,
        _LIFETIME_ID,
        _REVIEW_REWARD_ID,
    }
    assert get_counter_definition(_DAILY_ID).cycle == CounterCycle.DAILY
    assert get_counter_definition(_MONTHLY_ID).cycle == CounterCycle.MONTHLY
    assert get_counter_definition(_LIFETIME_ID).cycle == CounterCycle.LIFETIME
    assert get_counter_definition(_REVIEW_REWARD_ID).cycle == CounterCycle.LIFETIME


async def test_real_get_returns_zero_for_missing_counters(
    real_counter_cleanup_state: _CleanupState,
) -> None:
    """三周期记录均不存在时 get 与 get_list 补零。"""

    user_id = real_counter_cleanup_state.user_id

    assert await counter_service.get(user_id, _DAILY_ID) == 0
    assert await counter_service.get_list(
        user_id, [_DAILY_ID, _MONTHLY_ID, _LIFETIME_ID]
    ) == {_DAILY_ID: 0, _MONTHLY_ID: 0, _LIFETIME_ID: 0}


async def test_real_add_twice_and_get_list_reads_all_cycles(
    real_counter_cleanup_state: _CleanupState,
) -> None:
    """三周期分别连续累加两次后可由同一个混合读取接口返回。"""

    user_id = real_counter_cleanup_state.user_id
    increments = {
        _DAILY_ID: (2, 5),
        _MONTHLY_ID: (3, 7),
        _LIFETIME_ID: (11, 13),
    }
    for counter_id, numbers in increments.items():
        for number in numbers:
            await counter_service.add(user_id, counter_id, number)

    assert await counter_service.get_list(
        user_id, [_DAILY_ID, _MONTHLY_ID, _LIFETIME_ID]
    ) == {_DAILY_ID: 7, _MONTHLY_ID: 10, _LIFETIME_ID: 24}
    assert await counter_service.get(user_id, _DAILY_ID) == 7


@pytest.mark.parametrize("invalid_number", [0, -1])
async def test_real_add_rejects_non_positive_number_before_write(
    real_counter_cleanup_state: _CleanupState,
    invalid_number: int,
) -> None:
    """零或负增量直接失败，既有值保持不变。"""

    user_id = real_counter_cleanup_state.user_id
    await counter_service.add(user_id, _DAILY_ID, 17)

    with pytest.raises(
        ValueError,
        match=(
            rf"user_id={user_id}, counter_id={_DAILY_ID}, " rf"number={invalid_number}"
        ),
    ):
        await counter_service.add(user_id, _DAILY_ID, invalid_number)

    assert await counter_service.get(user_id, _DAILY_ID) == 17


async def test_real_unknown_id_fails_before_mixed_read(
    real_counter_cleanup_state: _CleanupState,
) -> None:
    """未知 ID 使整个混合读取直接抛出 KeyError。"""

    with pytest.raises(KeyError, match=str(_UNKNOWN_ID)):
        await counter_service.get_list(
            real_counter_cleanup_state.user_id,
            [_DAILY_ID, _UNKNOWN_ID],
        )


async def test_real_get_list_accepts_empty_and_duplicate_ids(
    real_counter_cleanup_state: _CleanupState,
) -> None:
    """空列表返回空映射，重复 ID 合并为一个结果键。"""

    user_id = real_counter_cleanup_state.user_id
    assert await counter_service.get_list(user_id, []) == {}

    await counter_service.add(user_id, _DAILY_ID, 19)
    assert await counter_service.get_list(user_id, [_DAILY_ID, _DAILY_ID]) == {
        _DAILY_ID: 19
    }


async def test_real_concurrent_add_is_exact_and_creates_one_row(
    real_counter_cleanup_state: _CleanupState,
) -> None:
    """同一用户、自然日与 Counter 的并发正增量不丢失且仅一行。"""

    user_id = real_counter_cleanup_state.user_id
    numbers = list(range(1, 25))
    await asyncio.gather(
        *(counter_service.add(user_id, _DAILY_ID, number) for number in numbers)
    )

    async with get_async_session() as db:
        result = await db.execute(
            select(
                func.count(CounterUserDailyModel.id),
                func.sum(CounterUserDailyModel.value),
            ).where(
                CounterUserDailyModel.user_id == user_id,
                CounterUserDailyModel.ymd == get_current_ymd(),
                CounterUserDailyModel.counter_id == _DAILY_ID,
            )
        )
        row_count, total_value = result.one()

    assert row_count == 1
    assert total_value == sum(numbers)
    assert await counter_service.get(user_id, _DAILY_ID) == sum(numbers)


async def test_real_counter_schema_has_exact_columns_comments_and_indexes(
    real_counter_schema_ready: None,
) -> None:
    """三表字段注释、主键与唯一键符合生产 schema 合同。"""

    expected_columns = {
        "counter_user_daily": {
            "id": "记录 ID",
            "user_id": "用户 ID",
            "counter_id": "固定 Counter ID",
            "ymd": "业务时区自然日（YYYYMMDD）",
            "value": "当前自然日累计值",
            "created_at": "创建时间（毫秒时间戳）",
            "updated_at": "更新时间（毫秒时间戳）",
        },
        "counter_user_monthly": {
            "id": "记录 ID",
            "user_id": "用户 ID",
            "counter_id": "固定 Counter ID",
            "ym": "业务时区自然月（YYYYMM）",
            "value": "当前自然月累计值",
            "created_at": "创建时间（毫秒时间戳）",
            "updated_at": "更新时间（毫秒时间戳）",
        },
        "counter_user_lifetime": {
            "id": "记录 ID",
            "user_id": "用户 ID",
            "counter_id": "固定 Counter ID",
            "value": "永久累计值",
            "created_at": "创建时间（毫秒时间戳）",
            "updated_at": "更新时间（毫秒时间戳）",
        },
    }
    expected_indexes = {
        "counter_user_daily": {
            "PRIMARY": (True, ("id",)),
            "uk_counter_user_daily_user_id_ymd_counter_id": (
                True,
                ("user_id", "ymd", "counter_id"),
            ),
        },
        "counter_user_monthly": {
            "PRIMARY": (True, ("id",)),
            "uk_counter_user_monthly_user_id_ym_counter_id": (
                True,
                ("user_id", "ym", "counter_id"),
            ),
        },
        "counter_user_lifetime": {
            "PRIMARY": (True, ("id",)),
            "uk_counter_user_lifetime_user_id_counter_id": (
                True,
                ("user_id", "counter_id"),
            ),
        },
    }

    async with get_async_session() as db:
        for table_name, column_comments in expected_columns.items():
            column_result = await db.execute(
                text(
                    """
                    SELECT COLUMN_NAME, COLUMN_COMMENT
                    FROM information_schema.columns
                    WHERE table_schema = DATABASE() AND table_name = :table_name
                    ORDER BY ORDINAL_POSITION
                    """
                ),
                {"table_name": table_name},
            )
            assert dict(column_result.all()) == column_comments

            index_result = await db.execute(
                text(
                    """
                    SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
                    FROM information_schema.statistics
                    WHERE table_schema = DATABASE() AND table_name = :table_name
                    ORDER BY INDEX_NAME, SEQ_IN_INDEX
                    """
                ),
                {"table_name": table_name},
            )
            actual_indexes: dict[str, tuple[bool, list[str]]] = {}
            for index_name, non_unique, column_name, _sequence in index_result:
                is_unique, columns = actual_indexes.setdefault(
                    str(index_name),
                    (not bool(non_unique), []),
                )
                columns.append(str(column_name))
                actual_indexes[str(index_name)] = (is_unique, columns)

            normalized_indexes = {
                name: (is_unique, tuple(columns))
                for name, (is_unique, columns) in actual_indexes.items()
            }
            assert normalized_indexes == expected_indexes[table_name]
