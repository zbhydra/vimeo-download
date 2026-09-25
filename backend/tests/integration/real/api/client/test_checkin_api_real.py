"""Website 签到 API real 测试。

真实资源依赖：
- MySQL: users / user_checkin_campaigns / user_checkin_records / user_credit_* 表
- Redis: 用户 access token 校验

覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
POST /api/client/checkin/entry | Y | centralized | N/A | N/A | N/A | N/A | ignored-extra | ignored-extra | ignored-extra | Y
POST /api/client/checkin/claim | Y | centralized | N/A | N/A | N/A | N/A | ignored-extra | ignored-extra | ignored-extra | Y
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import timedelta

import pytest
from sqlalchemy import delete, func, select, text, update

from app.constants.auth import TokenType
from app.core.database import get_async_session, get_engine
from app.i18n.common_code import CommonCode
from app.models.user_checkin_campaign_model import UserCheckinCampaignModel
from app.models.user_checkin_record_model import UserCheckinRecordModel
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.models.user_model import UserModel
from app.services.user_service import UserService
from app.services.user_token_service import user_token_service
from app.utils.jwt import JwtData, JwtUnit
from app.utils.time import (
    get_day_end_timestamp,
    get_day_start_timestamp,
    get_today_start_timestamp,
    timestamp_to_datetime,
)


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的真实测试用户。"""

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


async def _delete_checkin_user(email: str) -> None:
    """按依赖顺序删除签到 real 测试创建的数据。"""

    async with get_async_session() as db:
        user_id = await db.scalar(
            select(UserModel.user_id).where(UserModel.email == email)
        )
        if user_id is None:
            return

        await db.execute(
            delete(UserCheckinRecordModel).where(
                UserCheckinRecordModel.user_id == user_id
            )
        )
        await db.execute(
            delete(UserCheckinCampaignModel).where(
                UserCheckinCampaignModel.user_id == user_id
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


async def _create_real_access_token(user_id: int, email: str) -> str:
    """创建真实 JWT，并写入 Redis token 白名单。"""

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


@pytest.fixture
async def real_checkin_schema_ready(real_mysql_ready, real_redis_ready) -> None:
    """检查签到 real 测试需要的真实表。"""

    required_tables = {
        "users",
        "user_checkin_campaigns",
        "user_checkin_records",
        "user_credit_accounts",
        "user_credit_logs",
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
async def real_checkin_cleanup_state(
    real_checkin_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的真实测试用户。"""

    state = _CleanupState(emails=[])
    try:
        yield state
    finally:
        for email in state.emails:
            await _delete_checkin_user(email)


@pytest.fixture
def make_checkin_real_email(
    real_checkin_cleanup_state: _CleanupState,
    make_test_email: Callable[[str], str],
) -> Callable[[str], str]:
    """生成可清理的签到 real 测试邮箱。"""

    def _make_checkin_real_email(label: str) -> str:
        email = make_test_email(label)
        real_checkin_cleanup_state.emails.append(email)
        return email

    return _make_checkin_real_email


async def test_real_checkin_entry_and_claim_use_current_database_schema(
    real_async_client,
    make_checkin_real_email: Callable[[str], str],
) -> None:
    """真实 API 调用能创建 campaign、领取 Credits，并忽略额外字段。"""

    email = make_checkin_real_email("checkin-api")
    user = await UserService().create_user_without_password(email=email)
    token = await _create_real_access_token(user.user_id, email)
    headers = {"Authorization": f"Bearer {token}", "X-Device-Id": "real-checkin-api"}

    entry_response = await real_async_client.post(
        "/api/client/checkin/entry",
        headers=headers,
    )
    claim_response = await real_async_client.post(
        "/api/client/checkin/claim",
        json={
            "timezone": "America/New_York",
            "day_index": 99,
            "xss": "<script>alert(1)</script>",
            "sqli": "' OR 1=1 --",
        },
        headers=headers,
    )
    second_claim_response = await real_async_client.post(
        "/api/client/checkin/claim",
        json={"extra": "ignored"},
        headers=headers,
    )

    assert entry_response.status_code == 200
    assert entry_response.json()["code"] == 10000
    assert entry_response.json()["data"]["today_claimed"] is False

    assert claim_response.status_code == 200
    claim_body = claim_response.json()
    assert claim_body["code"] == 10000
    assert claim_body["data"]["reward_credits"] in {3, 6}
    assert claim_body["data"]["today_claimed"] is True

    assert second_claim_response.status_code == 200
    assert second_claim_response.json()["code"] != 10000

    async with get_async_session() as db:
        campaign_count = await db.scalar(
            select(func.count())
            .select_from(UserCheckinCampaignModel)
            .where(UserCheckinCampaignModel.user_id == user.user_id)
        )
        record_count = await db.scalar(
            select(func.count())
            .select_from(UserCheckinRecordModel)
            .where(UserCheckinRecordModel.user_id == user.user_id)
        )
        credit_balance = await db.scalar(
            select(UserCreditAccountModel.balance).where(
                UserCreditAccountModel.user_id == user.user_id
            )
        )
        checkin_log_count = await db.scalar(
            select(func.count())
            .select_from(UserCreditLogModel)
            .where(
                UserCreditLogModel.user_id == user.user_id,
                UserCreditLogModel.reason == "checkin_reward",
            )
        )

    assert campaign_count == 1
    assert record_count == 1
    assert credit_balance == claim_body["data"]["credits_balance"]
    assert checkin_log_count == 1


async def test_real_checkin_claim_again_after_db_cross_day_shift(
    real_async_client,
    make_checkin_real_email: Callable[[str], str],
) -> None:
    """真实 API 领取后，直接改 campaign 时间模拟跨日，可以再次领取。"""

    email = make_checkin_real_email("checkin-cross-day")
    user = await UserService().create_user_without_password(email=email)
    token = await _create_real_access_token(user.user_id, email)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Device-Id": "real-checkin-cross-day",
    }

    first_claim_response = await real_async_client.post(
        "/api/client/checkin/claim",
        json={},
        headers=headers,
    )
    assert first_claim_response.status_code == 200
    first_claim_body = first_claim_response.json()
    assert first_claim_body["code"] == 10000

    today_start_at = get_today_start_timestamp()
    previous_day_claim_at = today_start_at - 1
    async with get_async_session() as db:
        await db.execute(
            update(UserCheckinCampaignModel)
            .where(UserCheckinCampaignModel.user_id == user.user_id)
            .values(last_claim_at=previous_day_claim_at)
        )
        await db.commit()

    entry_response = await real_async_client.post(
        "/api/client/checkin/entry",
        headers=headers,
    )
    second_claim_response = await real_async_client.post(
        "/api/client/checkin/claim",
        json={},
        headers=headers,
    )

    assert entry_response.status_code == 200
    assert entry_response.json()["code"] == 10000
    assert entry_response.json()["data"]["today_claimed"] is False

    assert second_claim_response.status_code == 200
    second_claim_body = second_claim_response.json()
    assert second_claim_body["code"] == 10000

    async with get_async_session() as db:
        campaign = (
            await db.execute(
                select(UserCheckinCampaignModel).where(
                    UserCheckinCampaignModel.user_id == user.user_id
                )
            )
        ).scalar_one()
        record_count = await db.scalar(
            select(func.count())
            .select_from(UserCheckinRecordModel)
            .where(UserCheckinRecordModel.user_id == user.user_id)
        )
        checkin_log_count = await db.scalar(
            select(func.count())
            .select_from(UserCreditLogModel)
            .where(
                UserCreditLogModel.user_id == user.user_id,
                UserCreditLogModel.reason == "checkin_reward",
            )
        )

    assert campaign.last_claim_at >= today_start_at
    assert campaign.total_claim_days == 2
    assert record_count == 2
    assert checkin_log_count == 2


async def test_real_checkin_rejects_corrupt_fifteenth_campaign_day(
    real_async_client,
    make_checkin_real_email: Callable[[str], str],
) -> None:
    """异常 15 天存量活动在 entry 中封顶，并在 claim 前拒绝领取。"""

    email = make_checkin_real_email("checkin-fifteenth-day")
    user = await UserService().create_user_without_password(email=email)
    token = await _create_real_access_token(user.user_id, email)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Device-Id": "real-checkin-fifteenth-day",
    }

    initial_entry_response = await real_async_client.post(
        "/api/client/checkin/entry",
        headers=headers,
    )
    assert initial_entry_response.status_code == 200
    assert initial_entry_response.json()["code"] == 10000

    today_start_at = get_today_start_timestamp()
    today_date = timestamp_to_datetime(today_start_at).date()
    corrupt_start_date = today_date - timedelta(days=14)
    async with get_async_session() as db:
        await db.execute(
            update(UserCheckinCampaignModel)
            .where(UserCheckinCampaignModel.user_id == user.user_id)
            .values(
                start_at=get_day_start_timestamp(corrupt_start_date),
                end_at=get_day_end_timestamp(today_date),
                last_claim_at=0,
                total_claim_days=0,
            )
        )
        await db.commit()

    entry_response = await real_async_client.post(
        "/api/client/checkin/entry",
        headers=headers,
    )
    claim_response = await real_async_client.post(
        "/api/client/checkin/claim",
        json={},
        headers=headers,
    )

    entry_body = entry_response.json()
    assert entry_response.status_code == 200
    assert entry_body["code"] == 10000
    assert entry_body["data"]["campaign_ended"] is True
    assert entry_body["data"]["day_index"] == 14
    assert entry_body["data"]["today_reward_credits"] == 0
    assert entry_body["data"]["end_at"] == get_day_end_timestamp(
        today_date - timedelta(days=1)
    )

    assert claim_response.status_code == 200
    assert claim_response.json()["code"] == CommonCode.CHECKIN_CAMPAIGN_ENDED

    async with get_async_session() as db:
        campaign = (
            await db.execute(
                select(UserCheckinCampaignModel).where(
                    UserCheckinCampaignModel.user_id == user.user_id
                )
            )
        ).scalar_one()
        credit_log_count = await db.scalar(
            select(func.count())
            .select_from(UserCreditLogModel)
            .where(
                UserCreditLogModel.user_id == user.user_id,
                UserCreditLogModel.reason == "checkin_reward",
            )
        )

    assert campaign.last_claim_at == 0
    assert campaign.total_claim_days == 0
    assert credit_log_count == 0


async def test_real_checkin_final_day_claim_has_no_next_claim_time(
    real_async_client,
    make_checkin_real_email: Callable[[str], str],
) -> None:
    """第 14 天领取正常发奖，但响应不再返回不存在的第 15 天领取时间。"""

    email = make_checkin_real_email("checkin-final-day")
    user = await UserService().create_user_without_password(email=email)
    token = await _create_real_access_token(user.user_id, email)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Device-Id": "real-checkin-final-day",
    }

    initial_entry_response = await real_async_client.post(
        "/api/client/checkin/entry",
        headers=headers,
    )
    assert initial_entry_response.status_code == 200
    assert initial_entry_response.json()["code"] == 10000

    today_start_at = get_today_start_timestamp()
    today_date = timestamp_to_datetime(today_start_at).date()
    async with get_async_session() as db:
        await db.execute(
            update(UserCheckinCampaignModel)
            .where(UserCheckinCampaignModel.user_id == user.user_id)
            .values(
                start_at=get_day_start_timestamp(today_date - timedelta(days=13)),
                end_at=get_day_end_timestamp(today_date),
                last_claim_at=0,
                total_claim_days=0,
            )
        )
        await db.commit()

    claim_response = await real_async_client.post(
        "/api/client/checkin/claim",
        json={},
        headers=headers,
    )

    claim_body = claim_response.json()
    assert claim_response.status_code == 200
    assert claim_body["code"] == 10000
    assert claim_body["data"]["day_index"] == 14
    assert claim_body["data"]["reward_credits"] == 3
    assert claim_body["data"]["next_claim_at"] is None
    assert claim_body["data"]["next_claim_at_ts"] is None
