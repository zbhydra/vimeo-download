"""UserCreditService MySQL real 测试。

真实资源依赖：
- MySQL
- users / user_credit_accounts / user_credit_logs 表
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass

import pytest
from sqlalchemy import delete, func, select, text

from app.core.database import get_async_session, get_engine
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.models.user_model import UserModel
from app.services.user_credit_service import user_credit_service
from app.services.user_service import UserService


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的测试邮箱。"""

    emails: list[str]


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _delete_credit_user(email: str) -> None:
    """删除测试用户及其 Credits 关联数据。"""

    async with get_async_session() as db:
        result = await db.execute(
            select(UserModel.user_id).where(UserModel.email == email)
        )
        user_id = result.scalar_one_or_none()
        if user_id is None:
            return

        await db.execute(
            delete(UserCreditLogModel).where(UserCreditLogModel.user_id == user_id)
        )
        await db.execute(
            delete(UserCreditAccountModel).where(
                UserCreditAccountModel.user_id == user_id
            )
        )
        await db.execute(delete(UserModel).where(UserModel.user_id == user_id))
        await db.commit()


@pytest.fixture
async def real_user_credit_schema_ready(real_mysql_ready) -> None:
    """检查 Credits real 测试需要的表。"""

    required_tables = {
        "users",
        "user_credit_accounts",
        "user_credit_logs",
    }
    missing: list[str] = []
    for table_name in sorted(required_tables):
        if not await _table_exists(table_name):
            missing.append(table_name)
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_credit_cleanup_state(
    real_user_credit_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的测试用户 Credits 数据。"""

    state = _CleanupState(emails=[])
    try:
        yield state
    finally:
        for email in state.emails:
            await _delete_credit_user(email)


@pytest.fixture
def make_credit_real_email(
    real_credit_cleanup_state: _CleanupState,
    make_test_email: Callable[[str], str],
) -> Callable[[str], str]:
    """生成可清理的 real 测试邮箱。"""

    def _make_credit_real_email(label: str) -> str:
        email = make_test_email(label)
        real_credit_cleanup_state.emails.append(email)
        return email

    return _make_credit_real_email


async def test_real_add_balance_records_every_call(
    make_credit_real_email: Callable[[str], str],
) -> None:
    """真实 MySQL 中公共 Credits 发放每调用一次就增加余额和流水。"""

    email = make_credit_real_email("real-credit")
    user_service = UserService()
    user = await user_service.create_user_without_password(email=email)

    await user_credit_service.add_balance(
        user_id=user.user_id,
        amount=10,
        reason="registration_bonus",
    )
    await user_credit_service.add_balance(
        user_id=user.user_id,
        amount=10,
        reason="registration_bonus",
    )

    async with get_async_session() as db:
        balance_result = await db.execute(
            select(UserCreditAccountModel.balance).where(
                UserCreditAccountModel.user_id == user.user_id
            )
        )
        log_count_result = await db.execute(
            select(func.count())
            .select_from(UserCreditLogModel)
            .where(
                UserCreditLogModel.user_id == user.user_id,
                UserCreditLogModel.reason == "registration_bonus",
            )
        )

    assert balance_result.scalar_one() == 20
    assert log_count_result.scalar_one() == 2


async def test_real_registration_entry_grants_credits(
    make_credit_real_email: Callable[[str], str],
) -> None:
    """真实 MySQL 中注册入口成功后能读取到 Credits 余额。"""

    email = make_credit_real_email("real-credit-register")
    user = await UserService().create_user_without_password_with_registration_bonus(
        email=email,
        full_name="Real Credit User",
    )

    assert await user_credit_service.get_balance(user.user_id) == 10


async def test_real_password_registration_entry_grants_credits(
    make_credit_real_email: Callable[[str], str],
) -> None:
    """真实 MySQL 中密码注册入口成功后能读取到 Credits 余额。"""

    email = make_credit_real_email("real-credit-password")
    user = await UserService().create_user_with_registration_bonus(
        email=email,
        password="TestPassword123!",
        full_name="Real Credit Password User",
    )

    assert await user_credit_service.get_balance(user.user_id) == 10


async def test_real_registration_bonus_failure_does_not_rollback_user(
    monkeypatch,
    make_credit_real_email: Callable[[str], str],
) -> None:
    """真实 MySQL 中 Credits 发放失败不回滚用户创建。"""

    email = make_credit_real_email("real-credit-fail")

    async def fail_registration_bonus(user_id: int) -> None:
        raise RuntimeError(f"forced credit failure for user_id={user_id}")

    monkeypatch.setattr(
        "app.services.user_service.user_credit_service.add_balance",
        fail_registration_bonus,
    )

    user_service = UserService()
    user = await user_service.create_user_without_password_with_registration_bonus(
        email=email,
        full_name="Real Credit Failure User",
    )
    persisted = await user_service.get_user_by_email(email)

    assert user.user_id > 0
    assert persisted is not None
    assert persisted.user_id == user.user_id


async def test_real_get_balance_returns_zero_when_account_missing(
    real_user_credit_schema_ready,
) -> None:
    """真实 MySQL 中账户不存在时余额按 0 返回。"""

    assert await user_credit_service.get_balance(-1) == 0
