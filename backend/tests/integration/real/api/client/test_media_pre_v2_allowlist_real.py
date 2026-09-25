"""Media download-pre-v2 文件类型白名单 real API 测试。

真实资源依赖：
- MySQL: users / user_credit_accounts / user_credit_logs / user_download_records / config_public 表
- Redis: 用户 access token 白名单、设备可信关系、download-pre-v2 用户短锁

覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
POST /api/client/media/download-pre-v2 | N/A | centralized | existing-tests | existing-tests | existing-tests | existing-tests | token-signed | token-signed | token-signed | Y
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass

import pytest
from sqlalchemy import delete, func, select, text

from app.constants.auth import TokenType
from app.core.database import get_async_session, get_engine
from app.core.redis import redis_client
from app.i18n.common_code import CommonCode
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.models.user_download_record_model import UserDownloadRecordModel
from app.models.user_model import UserModel
from app.services.device_service import device_service
from app.services.media_resource_token_service import MediaResourceTokenService
from app.services.user_service import UserService
from app.services.user_token_service import user_token_service
from app.utils.jwt import JwtData, JwtUnit


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的真实测试资源。"""

    emails: list[str]
    device_ids: list[str]


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _delete_media_pre_user(email: str) -> None:
    """按依赖顺序删除 download-pre-v2 real 测试创建的用户数据。"""

    async with get_async_session() as db:
        user_id = await db.scalar(
            select(UserModel.user_id).where(UserModel.email == email)
        )
        if user_id is None:
            return

        await user_token_service.revoke_all_user_tokens(user_id)
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
        await db.execute(
            delete(UserSubscriptionModel).where(
                UserSubscriptionModel.user_id == user_id
            )
        )
        await db.execute(delete(UserModel).where(UserModel.user_id == user_id))
        await db.commit()


async def _delete_device_trust(device_id: str) -> None:
    """删除本测试写入的设备可信 Redis key。"""

    redis = await redis_client.get_client()
    await redis.delete(device_service._build_key(device_id))  # noqa: SLF001


async def _create_real_access_token(user_id: int, email: str) -> str:
    """创建真实 Website access token，并写入 Redis token 白名单。"""

    token, expires_at = JwtUnit.create_access_token(
        JwtData(user_id=user_id, email=email)
    )
    await user_token_service.store_token(
        token,
        user_id,
        TokenType.USER_ACCESS,
        expires_at,
    )
    return token


def _non_allowlisted_resource_token() -> str:
    """签发风险后缀优先拒绝的 resource token。"""

    return MediaResourceTokenService().issue_token(
        platform="vimeo",
        canonical_link="https://vimeo.com/example/allowlist-real",
        source_id="source-exe-1",
        download_mode="direct",
        filename="setup.exe",
        mime_type="video/mp4",
        size=49 * 1024 * 1024,
    )


async def _credit_balance(user_id: int) -> int:
    """读取用户 Credits 余额。"""

    async with get_async_session() as db:
        balance = await db.scalar(
            select(UserCreditAccountModel.balance).where(
                UserCreditAccountModel.user_id == user_id
            )
        )
    assert balance is not None
    return balance


async def _download_record_count(user_id: int) -> int:
    """统计用户下载记录数量。"""

    async with get_async_session() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(UserDownloadRecordModel)
            .where(UserDownloadRecordModel.user_id == user_id)
        )
    return int(count or 0)


async def _download_charge_log_count(user_id: int) -> int:
    """统计用户下载扣费流水数量。"""

    async with get_async_session() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(UserCreditLogModel)
            .where(
                UserCreditLogModel.user_id == user_id,
                UserCreditLogModel.reason == "download_charge",
            )
        )
    return int(count or 0)


@pytest.fixture
async def real_media_pre_allowlist_schema_ready(
    real_mysql_ready,
    real_redis_ready,
) -> None:
    """检查 download-pre-v2 白名单 real API 测试需要的真实表。"""

    required_tables = {
        "users",
        "user_credit_accounts",
        "user_credit_logs",
        "user_download_records",
        "user_subscriptions",
        "config_public",
    }
    missing = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_media_pre_allowlist_cleanup_state(
    real_media_pre_allowlist_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的真实用户和设备可信 key。"""

    state = _CleanupState(emails=[], device_ids=[])
    try:
        yield state
    finally:
        for device_id in state.device_ids:
            await _delete_device_trust(device_id)
        for email in state.emails:
            await _delete_media_pre_user(email)


@pytest.fixture
def make_media_pre_allowlist_real_email(
    real_media_pre_allowlist_cleanup_state: _CleanupState,
    make_test_email: Callable[[str], str],
) -> Callable[[str], str]:
    """生成可清理的 download-pre-v2 real API 测试邮箱。"""

    def _make_email(label: str) -> str:
        email = make_test_email(label)
        real_media_pre_allowlist_cleanup_state.emails.append(email)
        return email

    return _make_email


@pytest.fixture
def make_media_pre_allowlist_real_device_id(
    real_media_pre_allowlist_cleanup_state: _CleanupState,
    make_test_device_id: Callable[[str], str],
) -> Callable[[str], str]:
    """生成可清理的 download-pre-v2 real API 测试设备 ID。"""

    def _make_device_id(label: str) -> str:
        device_id = make_test_device_id(label)
        real_media_pre_allowlist_cleanup_state.device_ids.append(device_id)
        return device_id

    return _make_device_id


async def test_real_download_pre_v2_rejects_non_allowlisted_file_before_charge(
    real_async_client,
    make_media_pre_allowlist_real_email: Callable[[str], str],
    make_media_pre_allowlist_real_device_id: Callable[[str], str],
) -> None:
    """真实 API 对非白名单 resource_token 返回 24049 且没有扣费副作用。"""

    email = make_media_pre_allowlist_real_email("media-pre-deny")
    device_id = make_media_pre_allowlist_real_device_id("media-pre-deny")
    client_ip = "198.51.100.49"
    user = await UserService().create_user_without_password_with_registration_bonus(
        email=email,
        full_name="Real Media Pre Allowlist User",
    )
    access_token = await _create_real_access_token(user.user_id, email)
    await device_service.set(device_id, client_ip)

    before_balance = await _credit_balance(user.user_id)
    before_record_count = await _download_record_count(user.user_id)
    before_charge_log_count = await _download_charge_log_count(user.user_id)

    response = await real_async_client.post(
        "/api/client/media/download-pre-v2",
        json={
            "resource_token": _non_allowlisted_resource_token(),
            "preferred_node_id": 1,
        },
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Device-Id": device_id,
            "X-Client-Product": "web",
            "X-Forwarded-For": client_ip,
        },
    )

    body = response.json()
    after_balance = await _credit_balance(user.user_id)
    after_record_count = await _download_record_count(user.user_id)
    after_charge_log_count = await _download_charge_log_count(user.user_id)

    assert response.status_code == 200
    assert body["code"] == CommonCode.MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED.value
    assert "token" not in body["data"]
    assert after_balance == before_balance
    assert after_record_count == before_record_count
    assert after_charge_log_count == before_charge_log_count
