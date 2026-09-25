"""QuotaService 首日免费使用真实 MySQL 与 Redis 的判定、登记与表结构测试。

真实资源依赖：
- MySQL: user_first_day、config_public、config_subscription_product、user_subscriptions
- Redis: quota:{type}:{u_id}:{YYYYMMDD}
"""

import asyncio
import hashlib
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text, update

from app.constants.quota import QuotaTypeEnum
from app.core.database import get_async_session, get_engine
from app.core.redis import redis_client
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.subscription_model import UserSubscriptionModel
from app.models.user_first_day_model import UserFirstDayModel
from app.services.config_public_service import config_public_service
from app.services.quota_service import quota_service
from app.services.subscription_status_service import subscription_status_service
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
class _FirstDayCleanupState:
    """记录本轮首日测试独占的账号与设备，供定向清理。"""

    test_run_id: str
    user_id: int
    device_id: str
    extra_uids: list[str] = field(default_factory=list)
    extra_quota_u_ids: list[str] = field(default_factory=list)

    @property
    def quota_u_ids(self) -> tuple[str, ...]:
        """下载链路实际使用的额度作用域。"""
        return (str(self.user_id), self.device_id, *self.extra_quota_u_ids)

    @property
    def uids(self) -> tuple[str, ...]:
        """可能被登记的作用域 uid。"""
        return (
            build_user_scope(self.user_id)[0],
            build_device_scope(self.device_id)[0],
            *self.extra_uids,
        )

    def track_device_scope(self, device_id: str) -> str:
        """登记测试内临时使用的额外界设备作用域，返回该设备标识。"""

        self.extra_uids.append(build_device_scope(device_id)[0])
        self.extra_quota_u_ids.append(device_id)
        return device_id


def _previous_ymd() -> int:
    """返回业务时区昨天的 YYYYMMDD，用于构造"更早某天"的既有事实行。"""

    return int(timestamp_to_ymd(get_today_start_timestamp() - 1).replace("-", ""))


def _unique_user_id(identity: str) -> int:
    """从测试标识派生本轮独占的超大 user_id，避开真实账号空间。"""

    digest = hashlib.sha256(identity.encode("utf-8")).digest()[:8]
    return 8_100_000_000_000_000_000 + int.from_bytes(digest, "big") % 10**15


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _insert_first_day_row(uid: str, ymd: int, value: str) -> None:
    """直接写入一条事实行，构造"该维度更早某天已下载过"的既有状态。"""

    async with get_async_session() as db:
        db.add(
            UserFirstDayModel(  # type: ignore[call-arg]
                uid=uid,
                ymd=ymd,
                value=value,
                created_at=timestamp_now(),
            )
        )
        await db.commit()


async def _load_first_day_rows(
    uids: tuple[str, ...],
) -> dict[str, tuple[int, str]]:
    """按 uid 读回事实行，返回 uid -> (ymd, value)。"""

    async with get_async_session() as db:
        result = await db.execute(
            select(
                UserFirstDayModel.uid,
                UserFirstDayModel.ymd,
                UserFirstDayModel.value,
            ).where(UserFirstDayModel.uid.in_(uids))
        )
        return {str(uid): (int(ymd), str(value)) for uid, ymd, value in result.all()}


async def _backdate_first_day_rows(uids: tuple[str, ...]) -> None:
    """把既有事实行的业务日期改成昨天，模拟"次日再下载"。"""

    async with get_async_session() as db:
        await db.execute(
            update(UserFirstDayModel)
            .where(UserFirstDayModel.uid.in_(uids))
            .values(ymd=_previous_ymd())
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


@pytest.fixture
async def real_first_day_schema_ready(real_mysql_ready: None) -> None:
    """检查首日事实表存在。"""

    if not await _table_exists("user_first_day"):
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 数据库缺少 user_first_day 表")


@pytest.fixture
async def real_first_day_state(
    real_first_day_schema_ready: None,
    test_run_id: str,
    request: pytest.FixtureRequest,
) -> AsyncIterator[_FirstDayCleanupState]:
    """为本轮测试分配独占账号与设备，并清理事实行与额度 key。"""

    state = _FirstDayCleanupState(
        test_run_id=test_run_id,
        user_id=_unique_user_id(f"{test_run_id}:{request.node.nodeid}"),
        device_id=f"real-first-day-{uuid4().hex}",
    )
    try:
        yield state
    finally:
        async with get_async_session() as db:
            await db.execute(
                delete(UserFirstDayModel).where(UserFirstDayModel.uid.in_(state.uids))
            )
            await db.execute(
                delete(UserSubscriptionModel).where(
                    UserSubscriptionModel.user_id == state.user_id
                )
            )
            await db.commit()
        redis = await redis_client.get_client()
        await redis.delete(
            *[
                quota_service.build_quota_key(quota_u_id, _EXTENSION_DOWNLOAD)
                for quota_u_id in state.quota_u_ids
            ]
        )


async def test_real_first_day_config_controls_download_and_display(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """只读真实活动配置，验证放行、展示和首次日期登记遵循同一开关。"""
    config = await config_public_service.get_lists(force_refresh=True)
    enabled = config.get("extension_first_day_free_enabled", True) is True
    device_id = real_first_day_state.device_id
    assert await quota_service.is_first_day(device_id) is enabled
    assert await _load_first_day_rows(real_first_day_state.uids) == {}

    daily_limit = await quota_service.resolve_quota_limit(
        device_id, _EXTENSION_DOWNLOAD
    )
    assert daily_limit > 0
    result = await quota_service.set(
        device_id, _EXTENSION_DOWNLOAD, 1, device_id=device_id
    )
    assert result.allowed is True
    assert result.remaining == (-1 if enabled else daily_limit - 1)
    assert result.used == (0 if enabled else 1)
    status = await subscription_status_service.build_status_data(
        user_id=0, quota_u_id=device_id, device_id=device_id
    )
    assert status["remaining"] == result.remaining
    assert status["daily_limit"] == (-1 if enabled else daily_limit)
    device_uid, device_value = build_device_scope(device_id)
    assert await _load_first_day_rows((device_uid,)) == {
        device_uid: (get_current_ymd(), device_value)
    }
    redis = await redis_client.get_client()
    assert await redis.get(
        quota_service.build_quota_key(device_id, _EXTENSION_DOWNLOAD)
    ) == (None if enabled else "1")


async def test_real_first_day_download_is_unlimited_and_writes_no_quota_key(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """匿名设备首次下载不限次，且不写当日额度 key。"""

    device_id = real_first_day_state.device_id
    device_uid, device_value = build_device_scope(device_id)
    key = quota_service.build_quota_key(device_id, _EXTENSION_DOWNLOAD)
    redis = await redis_client.get_client()
    await redis.delete(key)

    results = [
        await quota_service.set(device_id, _EXTENSION_DOWNLOAD, 1, device_id=device_id)
        for _ in range(5)
    ]

    assert [result.allowed for result in results] == [True] * 5
    assert [result.remaining for result in results] == [-1] * 5
    assert [result.used for result in results] == [0] * 5
    assert await redis.get(key) is None
    assert await _load_first_day_rows((device_uid,)) == {
        device_uid: (get_current_ymd(), device_value)
    }


async def test_real_next_day_falls_back_to_subscription_daily_limit(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """设备维度存在更早日期的事实行时，按档位上限扣减且不覆盖原 ymd。"""

    device_id = real_first_day_state.device_id
    device_uid, device_value = build_device_scope(device_id)
    previous_ymd = _previous_ymd()
    await _insert_first_day_row(device_uid, previous_ymd, device_value)
    key = quota_service.build_quota_key(device_id, _EXTENSION_DOWNLOAD)
    redis = await redis_client.get_client()
    await redis.delete(key)

    daily_limit = await quota_service.resolve_quota_limit(
        device_id,
        _EXTENSION_DOWNLOAD,
    )
    assert daily_limit > 0

    allowed_results = [
        await quota_service.set(device_id, _EXTENSION_DOWNLOAD, 1, device_id=device_id)
        for _ in range(daily_limit)
    ]
    rejected = await quota_service.set(
        device_id,
        _EXTENSION_DOWNLOAD,
        1,
        device_id=device_id,
    )

    assert [result.allowed for result in allowed_results] == [True] * daily_limit
    assert allowed_results[-1].remaining == 0
    assert rejected.allowed is False
    assert rejected.remaining == 0
    assert await redis.get(key) == str(daily_limit)
    assert await _load_first_day_rows((device_uid,)) == {
        device_uid: (previous_ymd, device_value)
    }


async def test_real_old_account_backfills_new_device_scope(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """账号维度早于今天时按非首日处理，并补记本次使用的新设备维度。"""

    user_id = real_first_day_state.user_id
    device_id = real_first_day_state.device_id
    user_uid, user_value = build_user_scope(user_id)
    device_uid, device_value = build_device_scope(device_id)
    previous_ymd = _previous_ymd()
    await _insert_first_day_row(user_uid, previous_ymd, user_value)

    result = await quota_service.set(
        str(user_id),
        _EXTENSION_DOWNLOAD,
        1,
        device_id=device_id,
    )

    assert result.allowed is True
    assert result.remaining >= 0
    assert await _load_first_day_rows((user_uid, device_uid)) == {
        user_uid: (previous_ymd, user_value),
        device_uid: (get_current_ymd(), device_value),
    }


async def test_real_new_account_backfills_account_scope_on_old_device(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """设备维度早于今天时按非首日处理，并补记本次登录的账号维度。"""

    user_id = real_first_day_state.user_id
    device_id = real_first_day_state.device_id
    user_uid, user_value = build_user_scope(user_id)
    device_uid, device_value = build_device_scope(device_id)
    previous_ymd = _previous_ymd()
    await _insert_first_day_row(device_uid, previous_ymd, device_value)

    result = await quota_service.set(
        str(user_id),
        _EXTENSION_DOWNLOAD,
        1,
        device_id=device_id,
    )

    assert result.allowed is True
    assert result.remaining >= 0
    assert await _load_first_day_rows((user_uid, device_uid)) == {
        user_uid: (get_current_ymd(), user_value),
        device_uid: (previous_ymd, device_value),
    }


async def test_real_concurrent_first_day_registration_keeps_one_row(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """并发首次下载都按首日放行，且同一设备维度只登记一行。"""

    device_id = real_first_day_state.device_id
    device_uid, device_value = build_device_scope(device_id)
    key = quota_service.build_quota_key(device_id, _EXTENSION_DOWNLOAD)
    redis = await redis_client.get_client()
    await redis.delete(key)

    results = await asyncio.gather(
        *(
            quota_service.set(
                device_id,
                _EXTENSION_DOWNLOAD,
                1,
                device_id=device_id,
            )
            for _ in range(8)
        )
    )

    assert [result.allowed for result in results] == [True] * 8
    assert await redis.get(key) is None
    async with get_async_session() as db:
        row_count = await db.scalar(
            select(func.count())
            .select_from(UserFirstDayModel)
            .where(UserFirstDayModel.uid == device_uid)
        )
    assert row_count == 1
    assert await _load_first_day_rows((device_uid,)) == {
        device_uid: (get_current_ymd(), device_value)
    }


async def test_real_duplicate_registration_conflict_is_not_a_failure(
    real_first_day_state: _FirstDayCleanupState,
) -> None:
    """判定后被并发抢先登记同一维度时按已达成处理：不降级、不覆盖原行。"""

    device_uid, device_value = build_device_scope(real_first_day_state.device_id)
    previous_ymd = _previous_ymd()
    await _insert_first_day_row(device_uid, previous_ymd, device_value)

    # 传入空集合复现"判定读到空、插入前已被并发请求抢先写入"的时序。
    await quota_service._backfill_first_day_scopes(
        [(device_uid, device_value)], frozenset()
    )

    assert await _load_first_day_rows((device_uid,)) == {
        device_uid: (previous_ymd, device_value)
    }


async def test_real_first_day_survives_broken_subscription_config(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """订阅配置异常时首日仍先判定并放行；非首日才按既有错误面失败。"""

    user_id = real_first_day_state.user_id
    device_id = real_first_day_state.device_id
    user_uid, user_value = build_user_scope(user_id)
    device_uid, device_value = build_device_scope(device_id)
    await _insert_broken_subscription(
        user_id,
        f"missing-product-{real_first_day_state.test_run_id}",
    )

    # 前提：该用户的上限解析真实失败，若首日排在其后就会被连累。
    with pytest.raises(AppCommonException) as exc_info:
        await quota_service.resolve_quota_limit(str(user_id), _EXTENSION_DOWNLOAD)
    assert exc_info.value.code == CommonCode.PAYMENT_GATEWAY_ERROR

    result = await quota_service.set(
        str(user_id),
        _EXTENSION_DOWNLOAD,
        1,
        device_id=device_id,
    )

    assert result.allowed is True
    assert result.remaining == -1
    assert await _load_first_day_rows((user_uid, device_uid)) == {
        user_uid: (get_current_ymd(), user_value),
        device_uid: (get_current_ymd(), device_value),
    }

    status = await subscription_status_service.build_status_data(
        user_id=user_id, quota_u_id=str(user_id), device_id=device_id
    )
    assert status["status"] == "unavailable"
    assert status["daily_limit"] == status["remaining"] == -1
    assert status["used"] == 0
    assert status["extension_download"] == {"use": 0, "remaining": -1, "limit": -1}

    # 同一作用域进入非首日后，配置异常按既有错误规则上抛，不被首日分支吞掉。
    await _backdate_first_day_rows((user_uid, device_uid))
    with pytest.raises(AppCommonException) as exc_info:
        await quota_service.set(
            str(user_id),
            _EXTENSION_DOWNLOAD,
            1,
            device_id=device_id,
        )
    assert exc_info.value.code == CommonCode.PAYMENT_GATEWAY_ERROR

    status = await subscription_status_service.build_status_data(
        user_id=user_id, quota_u_id=str(user_id), device_id=device_id
    )
    assert status["status"] == "unavailable"
    assert status["daily_limit"] == status["remaining"] == status["used"] == 0
    assert status["extension_download"] == {"use": 0, "remaining": 0, "limit": 0}


async def test_real_registration_failure_falls_back_to_daily_limit(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """登记写失败时跳过首日分支，按档位上限扣减并留下可定位的错误日志。"""

    # 设备标识长度让 value 超出 VARCHAR(128)，登记 INSERT 触发真实 MySQL 错误；
    # 这是不 mock DB 也能让登记步骤失败的唯一数据条件。
    device_id = real_first_day_state.track_device_scope(
        f"{real_first_day_state.device_id}-{'x' * 120}"
    )
    device_uid, _ = build_device_scope(device_id)
    key = quota_service.build_quota_key(device_id, _EXTENSION_DOWNLOAD)
    redis = await redis_client.get_client()
    await redis.delete(key)
    daily_limit = await quota_service.resolve_quota_limit(
        device_id,
        _EXTENSION_DOWNLOAD,
    )
    assert daily_limit > 0

    with caplog.at_level(logging.ERROR, logger="server"):
        result = await quota_service.set(
            device_id,
            _EXTENSION_DOWNLOAD,
            1,
            device_id=device_id,
        )

    assert result.allowed is True
    assert result.remaining == daily_limit - 1
    assert await _load_first_day_rows((device_uid,)) == {}
    assert await redis.get(key) == "1"
    assert "quota_service_first_day_failed" in caplog.text
    assert "operation=quota_service.set" in caplog.text


async def test_real_exhausted_quota_rejects_while_registration_keeps_failing(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """登记持续失败且当天额度已用满时仍按正常限额拒绝，不因首日模块异常放行。"""

    device_id = real_first_day_state.track_device_scope(
        f"{real_first_day_state.device_id}-{'y' * 120}"
    )
    key = quota_service.build_quota_key(device_id, _EXTENSION_DOWNLOAD)
    redis = await redis_client.get_client()
    await redis.delete(key)
    daily_limit = await quota_service.resolve_quota_limit(
        device_id,
        _EXTENSION_DOWNLOAD,
    )
    assert daily_limit > 0

    allowed_results = [
        await quota_service.set(device_id, _EXTENSION_DOWNLOAD, 1, device_id=device_id)
        for _ in range(daily_limit)
    ]
    rejected = await quota_service.set(
        device_id,
        _EXTENSION_DOWNLOAD,
        1,
        device_id=device_id,
    )

    assert [result.allowed for result in allowed_results] == [True] * daily_limit
    assert rejected.allowed is False
    assert rejected.used == daily_limit
    assert rejected.remaining == 0
    assert await redis.get(key) == str(daily_limit)


async def test_real_same_day_scope_does_not_block_first_day(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """当天登记的其它维度不夺走首日：判据是业务日期而不是记录存在。"""

    user_id = real_first_day_state.user_id
    device_id = real_first_day_state.device_id
    device_uid, device_value = build_device_scope(device_id)
    await _insert_first_day_row(device_uid, get_current_ymd(), device_value)

    assert await quota_service.is_first_day(str(user_id), device_id=device_id) is True

    result = await quota_service.set(
        str(user_id),
        _EXTENSION_DOWNLOAD,
        1,
        device_id=device_id,
    )

    assert result.allowed is True
    assert result.remaining == -1


async def test_real_display_side_first_day_check_writes_no_fact_row(
    real_first_day_state: _FirstDayCleanupState,
    real_redis_ready: None,
) -> None:
    """展示侧判定只读：只登录没下载过的账号不产生首日事实行。"""

    user_id = real_first_day_state.user_id
    device_id = real_first_day_state.device_id

    assert await quota_service.is_first_day(str(user_id), device_id=device_id) is True
    assert await _load_first_day_rows(real_first_day_state.uids) == {}


async def test_real_first_day_schema_has_exact_columns_collation_and_indexes(
    real_first_day_schema_ready: None,
) -> None:
    """事实表列、注释、非空、大小写敏感排序规则与索引符合表规格。"""

    expected_columns = {
        "uid": ("作用域 uid（sha256 前 32 位小写 hex），区分大小写", "NO"),
        "ymd": ("首个下载日的业务时区 YYYYMMDD，判定列", "NO"),
        "value": (
            "带前缀原值（userid:123 / Device-Id:xxx），仅供人工排查，不参与业务查询",
            "NO",
        ),
        "created_at": ("创建时间（毫秒时间戳）", "NO"),
    }
    expected_indexes = {"PRIMARY": (True, ("uid",))}

    async with get_async_session() as db:
        column_result = await db.execute(
            text(
                """
                SELECT COLUMN_NAME, COLUMN_COMMENT, IS_NULLABLE, COLLATION_NAME
                FROM information_schema.columns
                WHERE table_schema = DATABASE() AND table_name = :table_name
                ORDER BY ORDINAL_POSITION
                """
            ),
            {"table_name": "user_first_day"},
        )
        column_rows = list(column_result.all())

        index_result = await db.execute(
            text(
                """
                SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
                FROM information_schema.statistics
                WHERE table_schema = DATABASE() AND table_name = :table_name
                ORDER BY INDEX_NAME, SEQ_IN_INDEX
                """
            ),
            {"table_name": "user_first_day"},
        )
        actual_indexes: dict[str, tuple[bool, list[str]]] = {}
        for index_name, non_unique, column_name, _sequence in index_result:
            is_unique, columns = actual_indexes.setdefault(
                str(index_name),
                (not bool(non_unique), []),
            )
            columns.append(str(column_name))
            actual_indexes[str(index_name)] = (is_unique, columns)

    assert {
        str(name): (str(comment), str(nullable))
        for name, comment, nullable, _collation in column_rows
    } == expected_columns
    # 大小写敏感是硬要求：默认 _ci 排序规则会掩盖 Python 与 MySQL 的哈希大小写漂移。
    assert {
        str(name): collation for name, _comment, _nullable, collation in column_rows
    }["uid"] == "utf8mb4_bin"
    assert {
        name: (is_unique, tuple(columns))
        for name, (is_unique, columns) in actual_indexes.items()
    } == expected_indexes
