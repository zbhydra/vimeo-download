"""打点 API 的真实 MySQL 边界测试。

真实资源依赖：
- MySQL: mark_logs 表

覆盖矩阵：
Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect
POST /api/client/mark/record | Y | N/A (anonymous endpoint) | Y | Y | min=0/max=1024 | 1025 | Y | Y | Y | Y
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
import json

import pytest
from sqlalchemy import delete, func, select, text

from app.constants.mark import MAX_MARK_MSG_LENGTH, MarkType
from app.core.database import get_async_session, get_engine
from app.models.mark_log_model import MarkLogModel


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass(slots=True)
class _CleanupState:
    """记录本文件写入真实数据库的设备 ID。"""

    device_ids: list[str] = field(default_factory=list)


async def _table_exists(table_name: str) -> bool:
    """判断真实数据库表是否存在。"""

    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SHOW TABLES LIKE :table_name"),
            {"table_name": table_name},
        )
        return result.first() is not None


async def _delete_mark_logs(device_ids: list[str]) -> None:
    """只删除本文件通过唯一设备 ID 创建的打点记录。"""

    if not device_ids:
        return

    async with get_async_session() as db:
        await db.execute(
            delete(MarkLogModel).where(MarkLogModel.device_id.in_(device_ids))
        )
        await db.commit()


async def _mark_log_count(device_id: str) -> int:
    """返回指定测试设备的打点记录数。"""

    async with get_async_session() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(MarkLogModel)
            .where(MarkLogModel.device_id == device_id)
        )
    return int(count or 0)


@pytest.fixture
async def real_mark_schema_ready(real_mysql_ready) -> None:
    """检查打点 real 测试需要的真实表。"""

    if not await _table_exists("mark_logs"):
        pytest.skip("REAL_SCHEMA_UNAVAILABLE: 数据库缺少 mark_logs 表")


@pytest.fixture
async def real_mark_cleanup_state(
    real_mark_schema_ready,
) -> AsyncIterator[_CleanupState]:
    """测试结束后定向清理本文件创建的打点记录。"""

    state = _CleanupState()
    try:
        yield state
    finally:
        await _delete_mark_logs(state.device_ids)


@pytest.fixture
def make_real_mark_device_id(
    real_mark_cleanup_state: _CleanupState,
    make_test_device_id: Callable[[str], str],
) -> Callable[[str], str]:
    """生成包含 test_run_id 且会被清理的打点设备 ID。"""

    def _make_device_id(label: str) -> str:
        device_id = make_test_device_id(label)
        real_mark_cleanup_state.device_ids.append(device_id)
        return device_id

    return _make_device_id


def _json_mark_msg_with_exact_length(test_run_id: str, length: int) -> str:
    """构造包含 test_run_id、可重新解析的指定字符数 JSON。"""

    prefix = f'{{"test_run_id":"{test_run_id}","padding":"'
    suffix = '"}'
    assert len(prefix) + len(suffix) <= length
    return prefix + "x" * (length - len(prefix) - len(suffix)) + suffix


async def _assert_validation_rejected_without_write(
    real_async_client,
    *,
    device_id: str,
    payload: dict[str, object],
    expected_location: list[str],
    expected_type: str,
) -> None:
    """断言 API 校验拒绝请求，且真实数据库没有产生打点记录。"""

    assert await _mark_log_count(device_id) == 0
    response = await real_async_client.post(
        "/api/client/mark/record",
        json=payload,
        headers={"X-Device-Id": device_id},
    )

    body = response.json()
    assert response.status_code == 422
    assert body["detail"][0]["loc"] == expected_location
    assert body["detail"][0]["type"] == expected_type
    assert await _mark_log_count(device_id) == 0


async def test_real_record_mark_persists_complete_max_length_message(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
    test_run_id: str,
) -> None:
    """合法上限消息必须经真实 API 和 service 完整写入 MySQL。"""

    device_id = make_real_mark_device_id("mark-max")
    mark_msg = _json_mark_msg_with_exact_length(test_run_id, MAX_MARK_MSG_LENGTH)

    assert await _mark_log_count(device_id) == 0
    response = await real_async_client.post(
        "/api/client/mark/record",
        json={
            "mark_type": MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value,
            "mark_msg": mark_msg,
            "first_opened_at": 1_762_345_678_901,
        },
        headers={
            "X-Device-Id": device_id,
            "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == {"recorded": True}

    async with get_async_session() as db:
        result = await db.execute(
            select(MarkLogModel).where(MarkLogModel.device_id == device_id)
        )
        row = result.scalar_one()

    assert row.user_id == 0
    assert row.mark_type == MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value
    assert row.mark_msg == mark_msg
    assert len(row.mark_msg) == MAX_MARK_MSG_LENGTH
    assert json.loads(row.mark_msg)["test_run_id"] == test_run_id
    assert row.first_opened_at == 1_762_345_678_901
    assert row.platform == "android"


async def test_real_record_mark_rejects_overflow_without_database_write(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
    test_run_id: str,
) -> None:
    """超过消息上限的请求必须在 API 校验层拒绝且不写数据库。"""

    device_id = make_real_mark_device_id("mark-overflow")
    mark_msg = _json_mark_msg_with_exact_length(test_run_id, MAX_MARK_MSG_LENGTH + 1)

    await _assert_validation_rejected_without_write(
        real_async_client,
        device_id=device_id,
        payload={
            "mark_type": MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value,
            "mark_msg": mark_msg,
        },
        expected_location=["body", "mark_msg"],
        expected_type="string_too_long",
    )


async def test_real_record_mark_persists_empty_min_length_message(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
) -> None:
    """消息最小值空字符串必须按接口默认值真实落库。"""

    device_id = make_real_mark_device_id("mark-min")
    response = await real_async_client.post(
        "/api/client/mark/record",
        json={"mark_type": MarkType.WEB_PARSE_CLICK.value},
        headers={"X-Device-Id": device_id},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == {"recorded": True}

    async with get_async_session() as db:
        result = await db.execute(
            select(MarkLogModel).where(MarkLogModel.device_id == device_id)
        )
        row = result.scalar_one()

    assert row.mark_msg == ""
    assert row.mark_type == MarkType.WEB_PARSE_CLICK.value


async def test_real_record_mark_persists_pricing_extension_entry(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
) -> None:
    """插件升级入口曝光必须以新类型和完整来源参数写入 MySQL。"""

    device_id = make_real_mark_device_id("pricing-extension-entry")
    mark_msg = json.dumps(
        {
            "utm_source": "extension",
            "source": "quota_upgrade_button",
        },
        separators=(",", ":"),
    )
    response = await real_async_client.post(
        "/api/client/mark/record",
        json={
            "mark_type": MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value,
            "mark_msg": mark_msg,
            "first_opened_at": 1_762_345_678_901,
        },
        headers={"X-Device-Id": device_id},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == {"recorded": True}

    async with get_async_session() as db:
        result = await db.execute(
            select(MarkLogModel).where(MarkLogModel.device_id == device_id)
        )
        row = result.scalar_one()

    assert row.mark_type == MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value
    assert row.mark_msg == mark_msg
    assert row.first_opened_at == 1_762_345_678_901


async def test_real_record_mark_persists_extension_store_review_click(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
) -> None:
    """插件商店评价点击必须以独立类型写入 MySQL。"""

    device_id = make_real_mark_device_id("extension-store-review-click")
    response = await real_async_client.post(
        "/api/client/mark/record",
        json={
            "mark_type": MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value,
            "mark_msg": "",
            "first_opened_at": 1_762_345_678_901,
        },
        headers={"X-Device-Id": device_id},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == {"recorded": True}

    async with get_async_session() as db:
        result = await db.execute(
            select(MarkLogModel).where(MarkLogModel.device_id == device_id)
        )
        row = result.scalar_one()

    assert row.mark_type == MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value
    assert row.mark_msg == ""
    assert row.first_opened_at == 1_762_345_678_901


@pytest.mark.parametrize(
    ("label", "mark_msg"),
    [
        ("xss", '<script>alert("xss")</script>'),
        ("sqli", "' OR 1=1 --"),
        ("unicode", "storage\u202eblocked"),
    ],
)
async def test_real_record_mark_persists_literal_special_characters(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
    test_run_id: str,
    label: str,
    mark_msg: str,
) -> None:
    """风险字符串必须作为普通文本真实落库，不被解释或改写。"""

    device_id = make_real_mark_device_id(f"mark-{label}")
    owned_mark_msg = f"{test_run_id}:{mark_msg}"
    response = await real_async_client.post(
        "/api/client/mark/record",
        json={
            "mark_type": MarkType.WEB_DOWNLOAD_FAILED.value,
            "mark_msg": owned_mark_msg,
        },
        headers={"X-Device-Id": device_id},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000

    async with get_async_session() as db:
        stored_mark_msg = await db.scalar(
            select(MarkLogModel.mark_msg).where(MarkLogModel.device_id == device_id)
        )
    assert stored_mark_msg == owned_mark_msg


async def test_real_record_mark_rejects_missing_mark_type_without_database_write(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
    test_run_id: str,
) -> None:
    """缺失必填打点类型必须拒绝且不写数据库。"""

    device_id = make_real_mark_device_id("mark-missing")
    await _assert_validation_rejected_without_write(
        real_async_client,
        device_id=device_id,
        payload={"mark_msg": test_run_id},
        expected_location=["body", "mark_type"],
        expected_type="missing",
    )


async def test_real_record_mark_rejects_wrong_message_type_without_database_write(
    real_async_client,
    make_real_mark_device_id: Callable[[str], str],
) -> None:
    """消息类型错误必须拒绝且不写数据库。"""

    device_id = make_real_mark_device_id("mark-type")
    await _assert_validation_rejected_without_write(
        real_async_client,
        device_id=device_id,
        payload={
            "mark_type": MarkType.WEB_DOWNLOAD_FAILED.value,
            "mark_msg": ["not", "a", "string"],
        },
        expected_location=["body", "mark_msg"],
        expected_type="string_type",
    )
