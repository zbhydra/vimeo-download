"""首日免费在下载与展示两个入口上的真实口径一致性测试。

真实资源依赖：
- MySQL: users、user_first_day、config_subscription_product、user_subscriptions
- Redis: 用户 access token 白名单与每日额度 key

覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
POST /api/client/quota/check | Y | centralized | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Y
GET /api/client/subscription/status | Y | centralized | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Y
GET /api/client/auth/me | Y | centralized | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Y
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from uuid import uuid4

import pytest
from sqlalchemy import delete, select, text, update

from app.constants.auth import TokenType
from app.constants.quota import QuotaTypeEnum
from app.core.database import get_async_session, get_engine
from app.core.redis import redis_client
from app.i18n.common_code import CommonCode
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_first_day_model import UserFirstDayModel
from app.models.user_model import UserModel
from app.services.quota_service import quota_service
from app.services.user_service import UserService
from app.services.user_token_service import user_token_service
from app.utils.jwt import JwtData, JwtUnit
from app.utils.time import (
    get_current_ymd,
    get_today_start_timestamp,
    timestamp_now,
    timestamp_to_ymd,
)
from app.utils.uid import build_device_scope, build_user_scope

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_EXTENSION_DOWNLOAD = QuotaTypeEnum.EXTENSION_DOWNLOAD


@dataclass(slots=True)
class _CleanupState:
    """记录本文件创建的测试用户与设备标识。"""

    emails: list[str] = field(default_factory=list)
    device_ids: list[str] = field(default_factory=list)


def _previous_ymd() -> int:
    """返回业务时区昨天的 YYYYMMDD，用于构造"更早某天"的既有事实行。"""

    return int(timestamp_to_ymd(get_today_start_timestamp() - 1).replace("-", ""))


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


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


async def _delete_first_day_rows(uids: tuple[str, ...]) -> None:
    """按 uid 删除事实行，并清理对应的每日额度 key。"""

    async with get_async_session() as db:
        await db.execute(
            delete(UserFirstDayModel).where(UserFirstDayModel.uid.in_(uids))
        )
        await db.commit()


async def _backdate_first_day_rows(uids: tuple[str, ...], ymd: int) -> None:
    """把既有事实行的业务日期改成指定日期，模拟"次日再访问"。"""

    async with get_async_session() as db:
        await db.execute(
            update(UserFirstDayModel)
            .where(UserFirstDayModel.uid.in_(uids))
            .values(ymd=ymd)
        )
        await db.commit()


async def _insert_broken_subscription(user_id: int, product_id: str) -> None:
    """写入一条指向不存在商品的生效订阅，让上限解析真实抛配置错误。"""

    now_ms = timestamp_now()
    async with get_async_session() as db:
        db.add(
            UserSubscriptionModel(  # type: ignore[call-arg]
                user_id=user_id,
                product_id=product_id,
                expires_at=now_ms + 86_400_000,
                created_at=now_ms,
                updated_at=now_ms,
            )
        )
        await db.commit()


async def _delete_quota_keys(quota_u_ids: tuple[str, ...]) -> None:
    """删除指定作用域的每日额度 key。"""

    redis = await redis_client.get_client()
    await redis.delete(
        *[
            quota_service.build_quota_key(quota_u_id, _EXTENSION_DOWNLOAD)
            for quota_u_id in quota_u_ids
        ]
    )


async def _delete_real_user(email: str) -> None:
    """删除本文件创建的真实测试用户。"""

    async with get_async_session() as db:
        user_id = await db.scalar(
            select(UserModel.user_id).where(UserModel.email == email)
        )
        if user_id is None:
            return
        await db.execute(delete(UserModel).where(UserModel.user_id == user_id))
        await db.commit()


@pytest.fixture
async def real_first_day_api_schema_ready(
    real_mysql_ready,
    real_redis_ready,
) -> None:
    """检查首日 API real 测试需要的真实表。"""

    required_tables = {
        "users",
        "user_first_day",
        "config_subscription_product",
        "user_subscriptions",
    }
    missing = [
        table_name
        for table_name in sorted(required_tables)
        if not await _table_exists(table_name)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_first_day_api_cleanup_state(
    real_first_day_api_schema_ready: None,
) -> AsyncIterator[_CleanupState]:
    """清理本文件创建的用户、事实行与额度 key。"""

    state = _CleanupState()
    try:
        yield state
    finally:
        for device_id in state.device_ids:
            await _delete_first_day_rows((build_device_scope(device_id)[0],))
            await _delete_quota_keys((device_id,))
        for email in state.emails:
            async with get_async_session() as db:
                user_id = await db.scalar(
                    select(UserModel.user_id).where(UserModel.email == email)
                )
            if user_id is not None:
                await _delete_first_day_rows((build_user_scope(user_id)[0],))
                await _delete_quota_keys((str(user_id),))
                async with get_async_session() as db:
                    await db.execute(
                        delete(UserSubscriptionModel).where(
                            UserSubscriptionModel.user_id == user_id
                        )
                    )
                    await db.commit()
            await _delete_real_user(email)


@pytest.fixture
def make_first_day_device_id(
    real_first_day_api_cleanup_state: _CleanupState,
) -> Callable[[], str]:
    """生成可清理的设备标识。"""

    def _make_first_day_device_id() -> str:
        device_id = f"real-first-day-api-{uuid4().hex}"
        real_first_day_api_cleanup_state.device_ids.append(device_id)
        return device_id

    return _make_first_day_device_id


async def test_real_anonymous_first_day_check_and_status_agree(
    real_async_client,
    make_first_day_device_id: Callable[[], str],
) -> None:
    """匿名设备首日：下载入口放行不限次，状态入口展示同一口径。"""

    device_id = make_first_day_device_id()
    headers = {"X-Device-Id": device_id}
    key = quota_service.build_quota_key(device_id, _EXTENSION_DOWNLOAD)
    redis = await redis_client.get_client()
    await redis.delete(key)

    check_response = await real_async_client.post(
        "/api/client/quota/check",
        json={"count": 1},
        headers=headers,
    )
    status_response = await real_async_client.get(
        "/api/client/subscription/status",
        headers=headers,
    )

    check_body = check_response.json()
    status_body = status_response.json()
    assert check_response.status_code == 200
    assert check_body["code"] == 10000
    assert check_body["data"]["allowed"] is True
    assert check_body["data"]["status"] == 1
    assert check_body["data"]["remaining"] == -1
    assert status_response.status_code == 200
    assert status_body["code"] == 10000
    assert status_body["data"]["daily_limit"] == -1
    assert status_body["data"]["remaining"] == -1
    assert status_body["data"]["extension_download"] == {
        "use": 0,
        "remaining": -1,
        "limit": -1,
    }
    assert await redis.get(key) is None
    device_uid, device_value = build_device_scope(device_id)
    async with get_async_session() as db:
        rows = await db.execute(
            select(UserFirstDayModel.ymd, UserFirstDayModel.value).where(
                UserFirstDayModel.uid == device_uid
            )
        )
    assert rows.all() == [(get_current_ymd(), device_value)]


async def test_real_first_day_check_succeeds_despite_broken_subscription_config(
    real_async_client,
    make_first_day_device_id: Callable[[], str],
    make_test_email: Callable[[str], str],
    real_first_day_api_cleanup_state: _CleanupState,
) -> None:
    """订阅商品缺失时首日下载请求仍放行并登记，非首日才按既有错误面返回。"""

    email = make_test_email("first-day-broken-config")
    real_first_day_api_cleanup_state.emails.append(email)
    device_id = make_first_day_device_id()
    user = await UserService().create_user_without_password(email=email)
    token = await _create_real_access_token(user.user_id, email)
    await _insert_broken_subscription(user.user_id, f"missing-product-{uuid4().hex}")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Device-Id": device_id,
    }

    first_response = await real_async_client.post(
        "/api/client/quota/check",
        json={"count": 1},
        headers=headers,
    )

    first_body = first_response.json()
    assert first_response.status_code == 200
    assert first_body["code"] == 10000
    assert first_body["data"]["allowed"] is True
    assert first_body["data"]["remaining"] == -1
    user_uid, user_value = build_user_scope(user.user_id)
    device_uid, device_value = build_device_scope(device_id)
    async with get_async_session() as db:
        rows = await db.execute(
            select(UserFirstDayModel.uid, UserFirstDayModel.ymd).where(
                UserFirstDayModel.uid.in_((user_uid, device_uid))
            )
        )
    assert {str(uid): int(ymd) for uid, ymd in rows.all()} == {
        user_uid: get_current_ymd(),
        device_uid: get_current_ymd(),
    }
    assert user_value == f"userid:{user.user_id}"
    assert device_value == f"Device-Id:{device_id}"

    # 同一作用域进入非首日后，配置异常按既有错误规则返回，不被首日分支吞掉。
    await _backdate_first_day_rows((user_uid, device_uid), _previous_ymd())
    second_response = await real_async_client.post(
        "/api/client/quota/check",
        json={"count": 1},
        headers=headers,
    )

    assert second_response.status_code == 200
    assert second_response.json()["code"] == CommonCode.PAYMENT_GATEWAY_ERROR.value


async def test_real_legacy_identity_fields_are_ignored_by_quota_and_account_endpoints(
    real_async_client,
    make_first_day_device_id: Callable[[], str],
    make_test_email: Callable[[str], str],
    real_first_day_api_cleanup_state: _CleanupState,
) -> None:
    """已发布插件仍会上报的旧身份字段被忽略：不产生 422、不跳过扣额，展示侧同口径。"""
    email = make_test_email("legacy-identity-field")
    real_first_day_api_cleanup_state.emails.append(email)
    device_id = make_first_day_device_id()
    user = await UserService().create_user_without_password(email=email)
    token = await _create_real_access_token(user.user_id, email)
    headers = {"Authorization": f"Bearer {token}", "X-Device-Id": device_id}
    await quota_service.set(
        str(user.user_id), _EXTENSION_DOWNLOAD, 1, device_id=device_id
    )
    await _backdate_first_day_rows(
        (build_user_scope(user.user_id)[0], build_device_scope(device_id)[0]),
        _previous_ymd(),
    )
    limit = await quota_service.resolve_quota_limit(
        str(user.user_id), _EXTENSION_DOWNLOAD
    )
    assert limit > 0

    # 起点读数按真实配置取值：首日开关决定上面那次预消耗是否落 key，不写死数字。
    used_before = await quota_service.get(str(user.user_id), _EXTENSION_DOWNLOAD)

    # 旧身份字段是已发布插件的固定上报内容，服务端必须继续忽略而不是拒绝请求。
    check_response = await real_async_client.post(
        "/api/client/quota/check",
        headers=headers,
        json={"count": 1, "tg_user_id": 9007199254740992},
    )
    assert check_response.status_code == 200
    assert check_response.json()["code"] == 10000
    assert check_response.json()["data"]["allowed"] is True
    assert check_response.json()["data"]["used"] == used_before + 1

    for endpoint in ("/api/client/subscription/status", "/api/client/auth/me"):
        response = await real_async_client.get(
            endpoint, headers=headers, params={"tg_user_id": "-1"}
        )
        assert response.status_code == 200
        assert response.json()["code"] == 10000
        data = response.json()["data"]
        quota = data["subscription"] if endpoint.endswith("/me") else data
        assert quota["used"] == used_before + 1
        assert quota["remaining"] == max(0, limit - used_before - 1)

    # 多余字段被忽略不等于放宽校验：count 非法仍按框架 422 拒绝。
    invalid_count = await real_async_client.post(
        "/api/client/quota/check",
        headers=headers,
        json={"count": 0, "tg_user_id": {}},
    )
    assert invalid_count.status_code == 422


async def test_real_logged_in_first_day_matches_account_summary(
    real_async_client,
    make_first_day_device_id: Callable[[], str],
    make_test_email: Callable[[str], str],
    real_first_day_api_cleanup_state: _CleanupState,
) -> None:
    """登录用户首日：下载、订阅状态与账号摘要三处都按不限次返回。"""

    email = make_test_email("first-day-api")
    real_first_day_api_cleanup_state.emails.append(email)
    device_id = make_first_day_device_id()
    user = await UserService().create_user_without_password(email=email)
    token = await _create_real_access_token(user.user_id, email)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Device-Id": device_id,
    }

    check_response = await real_async_client.post(
        "/api/client/quota/check",
        json={"count": 1},
        headers=headers,
    )
    status_response = await real_async_client.get(
        "/api/client/subscription/status",
        headers=headers,
    )
    me_response = await real_async_client.get("/api/client/auth/me", headers=headers)

    check_body = check_response.json()
    status_body = status_response.json()
    me_body = me_response.json()
    assert check_body["data"]["remaining"] == -1
    assert status_body["data"]["daily_limit"] == -1
    assert status_body["data"]["remaining"] == -1
    assert me_body["code"] == 10000
    assert me_body["data"]["subscription"]["daily_limit"] == -1
    assert me_body["data"]["subscription"]["remaining"] == -1

    user_uid, user_value = build_user_scope(user.user_id)
    device_uid, device_value = build_device_scope(device_id)
    async with get_async_session() as db:
        rows = await db.execute(
            select(UserFirstDayModel.uid, UserFirstDayModel.ymd).where(
                UserFirstDayModel.uid.in_((user_uid, device_uid))
            )
        )
    assert {str(uid): int(ymd) for uid, ymd in rows.all()} == {
        user_uid: get_current_ymd(),
        device_uid: get_current_ymd(),
    }
    assert user_value == f"userid:{user.user_id}"
    assert device_value == f"Device-Id:{device_id}"
