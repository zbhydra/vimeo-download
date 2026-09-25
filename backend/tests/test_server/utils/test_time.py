"""服务器时区时间工具测试。"""

from datetime import datetime
import time
from zoneinfo import ZoneInfo

import pytest

from app.utils.time import (
    add_natural_months,
    datetime_to_timestamp,
    get_day_end_timestamp,
    get_day_start_timestamp,
    get_today_start_timestamp,
    get_tomorrow_start_timestamp,
    parse_timestamp_input,
    system_timezone,
    timestamp_now,
    timestamp_now_datetime,
    timestamp_now_seconds,
    timestamp_to_datetime,
)


@pytest.mark.parametrize(
    ("source", "months", "expected"),
    [
        ((2025, 1, 31), 1, (2025, 2, 28)),
        ((2024, 11, 30), 3, (2025, 2, 28)),
        ((2024, 2, 29), 12, (2025, 2, 28)),
    ],
)
def test_add_natural_months_uses_month_end(
    source: tuple[int, int, int], months: int, expected: tuple[int, int, int]
) -> None:
    """自然月续期在目标日期不存在时取目标月末。"""

    source_dt = datetime(*source, 12, tzinfo=system_timezone())
    result = timestamp_to_datetime(
        add_natural_months(datetime_to_timestamp(source_dt), months)
    )
    assert (result.year, result.month, result.day, result.hour) == (*expected, 12)


def test_system_timezone_uses_backend_default(monkeypatch) -> None:
    """后端业务时区固定为纽约，不跟随部署机器 TZ。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")

    assert system_timezone() == ZoneInfo("America/New_York")


def test_system_timezone_ignores_invalid_tz(monkeypatch) -> None:
    """TZ 非法时仍返回后端默认业务时区。"""
    monkeypatch.setenv("TZ", "Invalid/Timezone")

    assert system_timezone() == ZoneInfo("America/New_York")


def test_timestamp_now_seconds_returns_seconds() -> None:
    """秒级时间戳与系统时间接近，且不是毫秒量级。"""
    now = timestamp_now_seconds()

    assert abs(now - int(time.time())) <= 2
    assert now < 10**10


def test_timestamp_now_returns_milliseconds() -> None:
    """旧 API timestamp_now 继续返回毫秒级时间戳。"""
    now_ms = timestamp_now()

    assert now_ms > 10**12
    assert abs(now_ms - int(time.time() * 1000)) < 2_000


def test_datetime_helpers_return_aware_server_timezone(monkeypatch) -> None:
    """datetime 返回值带服务器时区。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")

    now = timestamp_now_datetime()
    converted = timestamp_to_datetime(1_781_280_000_000)

    assert now.tzinfo is not None
    assert str(now.tzinfo) == "America/New_York"
    assert converted.tzinfo is not None
    assert str(converted.tzinfo) == "America/New_York"


def test_naive_datetime_uses_server_timezone(monkeypatch) -> None:
    """naive datetime 按服务器时区解释。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")
    value = datetime(2026, 6, 13, 0, 0, 0)
    expected = int(
        datetime(2026, 6, 13, 0, 0, 0, tzinfo=ZoneInfo("America/New_York")).timestamp()
        * 1000
    )

    assert datetime_to_timestamp(value) == expected


def test_date_string_uses_server_local_midnight(monkeypatch) -> None:
    """无时区日期字符串按服务器本地零点解释。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")
    expected = int(
        datetime(2026, 6, 13, 0, 0, 0, tzinfo=ZoneInfo("America/New_York")).timestamp()
        * 1000
    )

    assert parse_timestamp_input("2026-06-13") == expected


def test_day_boundary_helpers_use_backend_default_timezone(monkeypatch) -> None:
    """自然日起止时间统一按后端默认业务时区计算。"""
    monkeypatch.setenv("TZ", "Asia/Shanghai")

    expected_start = int(
        datetime(2026, 6, 13, 0, 0, 0, tzinfo=ZoneInfo("America/New_York")).timestamp()
        * 1000
    )
    expected_end = int(
        datetime(
            2026,
            6,
            13,
            23,
            59,
            59,
            999000,
            tzinfo=ZoneInfo("America/New_York"),
        ).timestamp()
        * 1000
    )

    assert get_day_start_timestamp("2026-06-13") == expected_start
    assert get_day_end_timestamp("2026-06-13") == expected_end


def test_today_boundary_helpers_use_backend_default_timezone(monkeypatch) -> None:
    """今天和明天凌晨也统一由 time.py 负责计算。"""

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):  # type: ignore[no-untyped-def]
            return datetime(2026, 6, 13, 15, 30, 0, tzinfo=tz)

    monkeypatch.setattr("app.utils.time.datetime", FixedDateTime)
    expected_today = int(
        datetime(2026, 6, 13, 0, 0, 0, tzinfo=ZoneInfo("America/New_York")).timestamp()
        * 1000
    )
    expected_tomorrow = int(
        datetime(2026, 6, 14, 0, 0, 0, tzinfo=ZoneInfo("America/New_York")).timestamp()
        * 1000
    )

    assert get_today_start_timestamp() == expected_today
    assert get_tomorrow_start_timestamp() == expected_tomorrow


def test_aware_datetime_keeps_absolute_time(monkeypatch) -> None:
    """aware datetime 序列化不受服务器时区变化影响。"""
    msg_date = datetime(2026, 6, 13, 0, 0, 0, tzinfo=ZoneInfo("UTC"))

    monkeypatch.setenv("TZ", "Asia/Shanghai")
    shanghai_timestamp = datetime_to_timestamp(msg_date)

    monkeypatch.setenv("TZ", "America/New_York")
    new_york_timestamp = datetime_to_timestamp(msg_date)

    assert shanghai_timestamp == new_york_timestamp
    assert shanghai_timestamp == 1_781_308_800_000
