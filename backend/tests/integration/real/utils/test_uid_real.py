"""事实表 uid 构造 helper 与 MySQL SHA2 的固定输入一致性测试。

真实资源依赖：
- MySQL: 仅用于执行 SHA2 表达式，不读写业务表
"""

import pytest
from sqlalchemy import text

from app.core.database import get_async_session
from app.utils.uid import (
    build_device_scope,
    build_user_scope,
)

pytestmark = [pytest.mark.real, pytest.mark.asyncio]

_FIXED_SCOPES = (
    build_user_scope(1),
    build_user_scope(78_571),
    build_device_scope("Device-Id-Probe_1"),
)


async def test_real_uid_scope_matches_mysql_sha256_prefix(
    real_mysql_ready: None,
) -> None:
    """固定输入在 Python helper 与 MySQL SHA2 两侧输出同一 32 位小写 hex。

    历史迁移 SQL 只按 `SHA2(CONCAT('<前缀>:', <原值>), 256)` 构造 uid，本用例是
    helper 改动后防止两侧漂移的唯一护栏。
    """

    assert [value for _uid, value in _FIXED_SCOPES] == [
        "userid:1",
        "userid:78571",
        "Device-Id:Device-Id-Probe_1",
    ]

    async with get_async_session() as db:
        for uid, value in _FIXED_SCOPES:
            prefix, _, raw_value = value.partition(":")
            result = await db.execute(
                text(
                    """
                    SELECT LOWER(SUBSTR(SHA2(CONCAT(:prefix, ':', :raw_value), 256), 1, 32))
                    """
                ),
                {"prefix": prefix, "raw_value": raw_value},
            )
            assert result.scalar_one() == uid
