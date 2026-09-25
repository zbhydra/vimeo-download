"""Service 层 real 集成测试专用 fixture。"""

from collections.abc import AsyncIterator
import hashlib
from dataclasses import dataclass
from typing import cast
from uuid import uuid4

import pytest
from sqlalchemy import delete, text
from sqlalchemy.sql.elements import ColumnElement

from app.constants.counter import CounterId
from app.core.database import get_async_session, get_engine
from app.models.counter_user_daily_model import CounterUserDailyModel
from app.models.counter_user_lifetime_model import CounterUserLifetimeModel
from app.models.counter_user_monthly_model import CounterUserMonthlyModel
from app.models.order_model import OrderModel
from app.models.subscription_model import UserSubscriptionModel
from app.utils.time import get_current_ym, get_current_ymd


@dataclass(frozen=True, slots=True)
class _RecurringPaymentCleanupState:
    """记录自动续费并发测试创建数据的归属标识。"""

    test_run_id: str
    user_id: int


@dataclass(frozen=True, slots=True)
class _CounterCleanupState:
    """记录本轮 Counter real 测试可精确删除的三表唯一键。"""

    test_run_id: str
    user_id: int
    daily_key: tuple[int, int, int]
    monthly_key: tuple[int, int, int]
    lifetime_key: tuple[int, int]


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
async def real_recurring_payment_schema_ready(real_mysql_ready: None) -> None:
    """检查自动续费并发测试需要的真实 MySQL 表。"""

    required_tables = {"orders", "user_subscriptions"}
    missing_tables = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing_tables:
        pytest.skip(
            f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing_tables)} 表"
        )


@pytest.fixture
async def real_counter_schema_ready(real_mysql_ready: None) -> None:
    """检查 Counter service real 测试需要的三张 MySQL 表。"""

    required_tables = {
        "counter_user_daily",
        "counter_user_monthly",
        "counter_user_lifetime",
    }
    missing_tables = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing_tables:
        pytest.skip(
            f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing_tables)} 表"
        )


@pytest.fixture
async def real_counter_cleanup_state(
    real_counter_schema_ready: None,
    test_run_id: str,
    request: pytest.FixtureRequest,
) -> AsyncIterator[_CounterCleanupState]:
    """从测试运行标识派生独占用户，并按三表唯一键清理数据。"""

    identity = f"{test_run_id}:{request.node.nodeid}".encode("utf-8")
    identity_number = int.from_bytes(hashlib.sha256(identity).digest()[:8], "big")
    user_id = 8_000_000_000_000_000_000 + identity_number % 1_000_000_000_000_000_000
    daily_id = int(CounterId.DEMO_DAILY)
    monthly_id = int(CounterId.DEMO_MONTHLY)
    lifetime_id = int(CounterId.DEMO_LIFETIME)
    state = _CounterCleanupState(
        test_run_id=test_run_id,
        user_id=user_id,
        daily_key=(user_id, get_current_ymd(), daily_id),
        monthly_key=(user_id, get_current_ym(), monthly_id),
        lifetime_key=(user_id, lifetime_id),
    )
    try:
        yield state
    finally:
        async with get_async_session() as db:
            await db.execute(
                delete(CounterUserDailyModel).where(
                    CounterUserDailyModel.user_id == state.daily_key[0],
                    CounterUserDailyModel.ymd == state.daily_key[1],
                    CounterUserDailyModel.counter_id == state.daily_key[2],
                )
            )
            await db.execute(
                delete(CounterUserMonthlyModel).where(
                    CounterUserMonthlyModel.user_id == state.monthly_key[0],
                    CounterUserMonthlyModel.ym == state.monthly_key[1],
                    CounterUserMonthlyModel.counter_id == state.monthly_key[2],
                )
            )
            await db.execute(
                delete(CounterUserLifetimeModel).where(
                    CounterUserLifetimeModel.user_id == state.lifetime_key[0],
                    CounterUserLifetimeModel.counter_id == state.lifetime_key[1],
                )
            )
            await db.commit()


@pytest.fixture
async def real_recurring_payment_cleanup_state(
    real_recurring_payment_schema_ready: None,
    test_run_id: str,
) -> AsyncIterator[_RecurringPaymentCleanupState]:
    """为自动续费并发测试分配唯一身份，并在失败后清理全部数据。"""

    state = _RecurringPaymentCleanupState(
        test_run_id=f"{test_run_id}{uuid4().hex[:12]}",
        user_id=9_800_000_000_000 + uuid4().int % 1_000_000_000_000,
    )
    try:
        yield state
    finally:
        async with get_async_session() as db:
            subscription_user_id = cast(
                ColumnElement[int], UserSubscriptionModel.user_id
            )
            await db.execute(
                delete(UserSubscriptionModel).where(
                    subscription_user_id == state.user_id
                )
            )
            await db.execute(
                delete(OrderModel).where(OrderModel.user_id == state.user_id)
            )
            await db.commit()
