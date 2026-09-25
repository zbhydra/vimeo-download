"""MediaService MySQL real 测试。

真实资源依赖：
- MySQL
- users / user_credit_accounts / user_credit_logs / user_download_records 表
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass

import pytest
from sqlalchemy import delete, func, select, text

from app.core.database import get_async_session, get_engine
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.models.user_download_record_model import UserDownloadRecordModel
from app.models.user_model import UserModel
from app.services.media_service import media_service
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


async def _delete_media_credit_user(email: str) -> None:
    """删除测试用户及其媒体下载 Credits 关联数据。"""

    async with get_async_session() as db:
        result = await db.execute(
            select(UserModel.user_id).where(UserModel.email == email)
        )
        user_id = result.scalar_one_or_none()
        if user_id is None:
            return

        await db.execute(
            delete(UserDownloadRecordModel).where(
                UserDownloadRecordModel.user_id == user_id
            )
        )
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
async def real_media_credit_schema_ready(real_mysql_ready) -> None:
    """检查媒体下载 Credits real 测试需要的表。"""

    required_tables = {
        "users",
        "user_credit_accounts",
        "user_credit_logs",
        "user_download_records",
    }
    missing: list[str] = []
    for table_name in sorted(required_tables):
        if not await _table_exists(table_name):
            missing.append(table_name)
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_media_credit_cleanup_state(
    real_media_credit_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的测试用户 Credits 数据。"""

    state = _CleanupState(emails=[])
    try:
        yield state
    finally:
        for email in state.emails:
            await _delete_media_credit_user(email)


@pytest.fixture
def make_media_credit_real_email(
    real_media_credit_cleanup_state: _CleanupState,
    make_test_email: Callable[[str], str],
) -> Callable[[str], str]:
    """生成可清理的 real 测试邮箱。"""

    def _make_media_credit_real_email(label: str) -> str:
        email = make_test_email(label)
        real_media_credit_cleanup_state.emails.append(email)
        return email

    return _make_media_credit_real_email


async def test_real_charge_download_charges_once_then_recent_download_is_free(
    make_media_credit_real_email: Callable[[str], str],
) -> None:
    """真实 MySQL 中同一资源 6 小时内重复下载写记录但 cost=0。"""

    email = make_media_credit_real_email("real-media-credit-download")
    user = await UserService().create_user_without_password_with_registration_bonus(
        email=email,
        full_name="Real Media Credit Download User",
    )

    first = await media_service.charge_download(
        user_id=user.user_id,
        platform="vimeo",
        canonical_link="https://vimeo.com/example/123",
        source_id="source-video-1",
        download_mode="direct",
        filename="demo.mp4",
        size_bytes=49 * 1024 * 1024,
    )
    second = await media_service.charge_download(
        user_id=user.user_id,
        platform="vimeo",
        canonical_link="https://vimeo.com/example/123",
        source_id="source-video-1",
        download_mode="direct",
        filename="demo.mp4",
        size_bytes=49 * 1024 * 1024,
    )

    async with get_async_session() as db:
        record_count = await db.scalar(
            select(func.count())
            .select_from(UserDownloadRecordModel)
            .where(UserDownloadRecordModel.user_id == user.user_id)
        )
        charge_log_count = await db.scalar(
            select(func.count())
            .select_from(UserCreditLogModel)
            .where(
                UserCreditLogModel.user_id == user.user_id,
                UserCreditLogModel.reason == "download_charge",
            )
        )

    assert first.allowed is True
    assert first.cost == 1
    assert first.balance == 9
    assert second.allowed is True
    assert second.cost == 0
    assert second.free_reason == "recent_download"
    assert second.balance == 9
    assert record_count == 2
    assert charge_log_count == 1


async def test_real_charge_download_insufficient_balance_writes_no_records(
    make_media_credit_real_email: Callable[[str], str],
) -> None:
    """真实 MySQL 中余额不足不写下载记录和扣费流水。"""

    email = make_media_credit_real_email("real-media-credit-insufficient")
    user = await UserService().create_user_without_password(email=email)
    async with get_async_session() as db:
        db.add(
            UserCreditAccountModel(  # type: ignore[call-arg]
                user_id=user.user_id,
                balance=0,
                created_at=1,
                updated_at=1,
            )
        )
        await db.commit()

    result = await media_service.charge_download(
        user_id=user.user_id,
        platform="vimeo",
        canonical_link="https://vimeo.com/example/456",
        source_id="source-video-2",
        download_mode="direct",
        filename="demo.mp4",
        size_bytes=50 * 1024 * 1024,
    )

    async with get_async_session() as db:
        record_count = await db.scalar(
            select(func.count())
            .select_from(UserDownloadRecordModel)
            .where(UserDownloadRecordModel.user_id == user.user_id)
        )
        charge_log_count = await db.scalar(
            select(func.count())
            .select_from(UserCreditLogModel)
            .where(
                UserCreditLogModel.user_id == user.user_id,
                UserCreditLogModel.reason == "download_charge",
            )
        )

    assert result.allowed is False
    assert result.cost == 2
    assert result.balance == 0
    assert record_count == 0
    assert charge_log_count == 0
