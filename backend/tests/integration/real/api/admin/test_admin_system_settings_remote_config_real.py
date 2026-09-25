"""远端配置系统设置 API real 集成测试。

依赖：真实 MySQL，`admins` 和 `system_data` 表；鉴权使用真实管理员记录与 JWT。

覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
POST /api/admin/system-settings/remote-config | Y | Y | Y | Y | Y | N/A | Y | Y | Y | Admin/public GET + DB

Min/Max 由空对象覆盖：顶层对象没有字段必填或数量下限。Overflow 为 N/A：接口
没有长度、字段数量或数值范围合同，不为测试新增限制。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from copy import deepcopy
from dataclasses import dataclass
import uuid

from httpx import AsyncClient
import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_engine
from app.i18n.common_code import CommonCode
from app.models.admin_model import AdminModel
from app.models.system_data_model import JsonValue, SystemDataModel
from app.services.admin_service import admin_service
from app.services.system_data_service import REMOTE_CONFIG_DATA_KEY, system_data_service
from app.utils.crypto import hash_password


pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_ADMIN_CONFIG_URL = "/api/admin/system-settings/remote-config"
_PUBLIC_CONFIG_URL = "/api/client/remote-config/config"
_TEST_ADMIN_PASSWORD = "RemoteConfigRealTest123!"


@dataclass(frozen=True, slots=True)
class _SystemDataSnapshot:
    """保存 system_data 单行的完整恢复信息。"""

    data_value: JsonValue
    created_at: int
    updated_at: int


@dataclass(frozen=True, slots=True)
class _RemoteConfigState:
    """保存测试前的远端配置状态。"""

    remote_config: _SystemDataSnapshot | None


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""
    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _read_system_data_snapshot(
    data_key: str,
) -> _SystemDataSnapshot | None:
    """绕过 service 缓存直接读取 system_data 单行。"""
    engine = get_engine()
    async with AsyncSession(engine) as session:
        result = await session.execute(
            select(SystemDataModel).where(SystemDataModel.data_key == data_key)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return _SystemDataSnapshot(
            data_value=deepcopy(row.data_value),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )


async def _restore_system_data(
    data_key: str,
    snapshot: _SystemDataSnapshot | None,
) -> None:
    """恢复 system_data 单行到测试前的精确状态。"""
    engine = get_engine()
    async with AsyncSession(engine) as session:
        await session.execute(
            delete(SystemDataModel).where(SystemDataModel.data_key == data_key)
        )
        if snapshot is not None:
            session.add(
                SystemDataModel(  # type: ignore[call-arg]
                    data_key=data_key,
                    data_value=deepcopy(snapshot.data_value),
                    created_at=snapshot.created_at,
                    updated_at=snapshot.updated_at,
                )
            )
        await session.commit()
    system_data_service.clear_cache()


async def _assert_success_response(response, expected: dict[str, JsonValue]) -> None:
    """断言统一成功响应及其配置数据。"""
    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == expected


async def _assert_config_round_trip(
    client: AsyncClient,
    headers: dict[str, str],
    expected: dict[str, JsonValue],
) -> None:
    """从 Admin、公共接口和数据库确认保存副作用。"""
    admin_response = await client.get(_ADMIN_CONFIG_URL, headers=headers)
    await _assert_success_response(admin_response, expected)

    public_response = await client.get(_PUBLIC_CONFIG_URL)
    await _assert_success_response(public_response, expected)

    database_row = await _read_system_data_snapshot(REMOTE_CONFIG_DATA_KEY)
    assert database_row is not None
    assert database_row.data_value == expected


@pytest.fixture
async def real_remote_config_schema_ready(real_mysql_ready) -> None:
    """检查远端配置 real 测试需要的表。"""
    missing = [
        table for table in ("admins", "system_data") if not await _table_exists(table)
    ]
    if missing:
        pytest.skip(f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(missing)} 表")


@pytest.fixture
async def real_remote_config_state(
    real_remote_config_schema_ready,
) -> AsyncIterator[_RemoteConfigState]:
    """快照远端配置，结束时精确恢复。"""
    state = _RemoteConfigState(
        remote_config=await _read_system_data_snapshot(REMOTE_CONFIG_DATA_KEY),
    )
    try:
        yield state
    finally:
        await _restore_system_data(REMOTE_CONFIG_DATA_KEY, state.remote_config)


@pytest.fixture
async def real_remote_config_admin_token(
    real_remote_config_schema_ready,
    test_run_id: str,
) -> AsyncIterator[str]:
    """创建真实管理员，并签发会被 get_admin_user 回库校验的 token。"""
    username = f"pytest-admin-remote-config-{uuid.uuid4().hex[:8]}-{test_run_id}"
    admin = AdminModel(  # type: ignore[call-arg]
        username=username,
        password_hash=hash_password(_TEST_ADMIN_PASSWORD),
        is_active=True,
    )
    engine = get_engine()
    async with AsyncSession(engine) as session:
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

    try:
        access_token, _refresh_token, _access_expire, _refresh_expire = (
            admin_service.create_token_pair(admin)
        )
        yield access_token
    finally:
        async with AsyncSession(engine) as session:
            await session.execute(
                delete(AdminModel).where(AdminModel.username == username)
            )
            await session.commit()


async def test_real_remote_config_get_returns_empty_when_unconfigured(
    real_async_client: AsyncClient,
    real_remote_config_admin_token: str,
    real_remote_config_state: _RemoteConfigState,
) -> None:
    """配置不存在时 Admin 和公共 GET 均返回空对象。"""
    await system_data_service.system_data_del([REMOTE_CONFIG_DATA_KEY])
    headers = {
        "Authorization": f"Bearer {real_remote_config_admin_token}",
    }

    admin_response = await real_async_client.get(_ADMIN_CONFIG_URL, headers=headers)
    await _assert_success_response(admin_response, {})
    public_response = await real_async_client.get(_PUBLIC_CONFIG_URL)
    await _assert_success_response(public_response, {})
    assert await _read_system_data_snapshot(REMOTE_CONFIG_DATA_KEY) is None


async def test_real_remote_config_requires_admin(
    real_async_client: AsyncClient,
    real_remote_config_state: _RemoteConfigState,
) -> None:
    """Admin GET 和 POST 未携带凭据时沿用全局空 401 鉴权合同。"""
    get_response = await real_async_client.get(_ADMIN_CONFIG_URL)
    post_response = await real_async_client.post(_ADMIN_CONFIG_URL, json={})

    assert get_response.status_code == 401
    assert get_response.content == b""
    assert post_response.status_code == 401
    assert post_response.content == b""


async def test_real_remote_config_saves_empty_object(
    real_async_client: AsyncClient,
    real_remote_config_admin_token: str,
    real_remote_config_state: _RemoteConfigState,
) -> None:
    """空对象作为合法上下界原样保存。"""
    headers = {
        "Authorization": f"Bearer {real_remote_config_admin_token}",
    }
    response = await real_async_client.post(
        _ADMIN_CONFIG_URL,
        headers=headers,
        json={},
    )

    await _assert_success_response(response, {})
    await _assert_config_round_trip(real_async_client, headers, {})


async def test_real_remote_config_rejects_missing_body(
    real_async_client: AsyncClient,
    real_remote_config_admin_token: str,
    real_remote_config_state: _RemoteConfigState,
) -> None:
    """缺少请求体时返回统一非法请求响应且不写库。"""
    headers = {
        "Authorization": f"Bearer {real_remote_config_admin_token}",
    }
    before = await _read_system_data_snapshot(REMOTE_CONFIG_DATA_KEY)
    response = await real_async_client.post(_ADMIN_CONFIG_URL, headers=headers)
    body = response.json()

    assert response.status_code == CommonCode.INVALID_REQUEST.value
    assert body["code"] == CommonCode.INVALID_REQUEST.value
    assert await _read_system_data_snapshot(REMOTE_CONFIG_DATA_KEY) == before


@pytest.mark.parametrize(
    "payload",
    [[], "scalar", 1, True, None],
    ids=["array", "string", "number", "boolean", "null"],
)
async def test_real_remote_config_rejects_non_object_top_level(
    real_async_client: AsyncClient,
    real_remote_config_admin_token: str,
    real_remote_config_state: _RemoteConfigState,
    payload: JsonValue,
) -> None:
    """数组和各类 JSON 标量均被拒绝且不产生副作用。"""
    headers = {
        "Authorization": f"Bearer {real_remote_config_admin_token}",
    }
    before = await _read_system_data_snapshot(REMOTE_CONFIG_DATA_KEY)
    response = await real_async_client.post(
        _ADMIN_CONFIG_URL,
        headers=headers,
        json=payload,
    )
    body = response.json()

    assert response.status_code == CommonCode.INVALID_REQUEST.value
    assert body["code"] == CommonCode.INVALID_REQUEST.value
    assert await _read_system_data_snapshot(REMOTE_CONFIG_DATA_KEY) == before


async def test_real_remote_config_round_trips_sparse_object(
    real_async_client: AsyncClient,
    real_remote_config_admin_token: str,
    real_remote_config_state: _RemoteConfigState,
    test_run_id: str,
) -> None:
    """缺少分组和字段的正常稀疏对象原样保存。"""
    headers = {
        "Authorization": f"Bearer {real_remote_config_admin_token}",
    }
    payload: dict[str, JsonValue] = {
        "dom": {
            "aMessageSelector": f".Message[data-real-test='{test_run_id}']",
        },
    }
    response = await real_async_client.post(
        _ADMIN_CONFIG_URL,
        headers=headers,
        json=payload,
    )

    await _assert_success_response(response, payload)
    await _assert_config_round_trip(real_async_client, headers, payload)


async def test_real_remote_config_round_trips_nested_attack_characters(
    real_async_client: AsyncClient,
    real_remote_config_admin_token: str,
    real_remote_config_state: _RemoteConfigState,
    test_run_id: str,
) -> None:
    """嵌套 XSS、SQLi 与 Unicode 控制字符按 JSON 字面值保存。"""
    headers = {
        "Authorization": f"Bearer {real_remote_config_admin_token}",
    }
    payload: dict[str, JsonValue] = {
        "testRunId": test_run_id,
        "future": {
            "xss": "<script>alert('remote-config')</script>",
            "sqli": "' OR 1=1; DROP TABLE system_data; --",
            "unicode": "left\u0000middle\u202eright",
        },
    }
    response = await real_async_client.post(
        _ADMIN_CONFIG_URL,
        headers=headers,
        json=payload,
    )

    await _assert_success_response(response, payload)
    await _assert_config_round_trip(real_async_client, headers, payload)
