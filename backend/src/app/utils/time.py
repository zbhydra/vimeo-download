"""后端业务时间工具。

后端默认业务时区统一为 America/New_York；admin 看板等特殊场景如果需要
+8 时区，应在对应模块显式处理，不修改本公共工具的默认语义。
"""

import calendar
from datetime import date, datetime, time, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

# Time-related type definitions
Timestamp = int  # Millisecond timestamp
OptionalTimestamp = Optional[int]

DEFAULT_SYSTEM_TIMEZONE_NAME = "America/New_York"
DAY_START_TIME = time.min
DAY_END_TIME = time(23, 59, 59, 999000)


def system_timezone() -> ZoneInfo:
    """返回后端默认业务时区。"""

    return ZoneInfo(DEFAULT_SYSTEM_TIMEZONE_NAME)


def timestamp_now_seconds() -> int:
    """返回当前秒级 Unix 时间戳。"""
    return int(datetime.now(system_timezone()).timestamp())


def timestamp_now() -> Timestamp:
    """返回当前毫秒级 Unix 时间戳。"""
    return int(datetime.now(system_timezone()).timestamp() * 1000)


def datetime_to_timestamp(dt: datetime) -> Timestamp:
    """将 datetime 转换为毫秒级时间戳，naive 值按服务器时区解释。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=system_timezone())
    return int(dt.timestamp() * 1000)


def timestamp_to_datetime(ts: Timestamp) -> datetime:
    """将毫秒级时间戳转换为服务器时区 datetime。"""
    return datetime.fromtimestamp(ts / 1000, tz=system_timezone())


def add_natural_months(ts: Timestamp, months: int) -> Timestamp:
    """按业务时区增加自然月，目标月份没有原日期时取月末。"""

    current = timestamp_to_datetime(ts)
    month_index = current.year * 12 + current.month - 1 + months
    year, month_index = divmod(month_index, 12)
    month = month_index + 1
    day = min(current.day, calendar.monthrange(year, month)[1])
    return datetime_to_timestamp(current.replace(year=year, month=month, day=day))


def timestamp_to_datetime_str(ts: Timestamp, format: str = "%Y-%m-%d %H:%M:%S") -> str:
    """将毫秒级时间戳转换为服务器时区可读字符串。"""
    dt = timestamp_to_datetime(ts)
    return dt.strftime(format)


def parse_timestamp_input(ts_input: Any) -> Timestamp:
    """
    解析各种输入格式为毫秒级时间戳。

    支持 int/float 秒或毫秒、ISO 日期字符串、datetime 对象。
    """
    if ts_input is None:
        raise ValueError("时间戳输入不能为 None")

    if isinstance(ts_input, int):
        if ts_input < 10**10:
            return ts_input * 1000
        return ts_input

    if isinstance(ts_input, float):
        return int(ts_input * 1000)

    if isinstance(ts_input, str):
        return _parse_timestamp_string(ts_input)

    if isinstance(ts_input, datetime):
        return datetime_to_timestamp(ts_input)

    raise TypeError(f"不支持的时间戳输入类型: {type(ts_input)}")


def timestamp_now_datetime() -> datetime:
    """返回当前服务器时区 datetime。"""
    return datetime.now(system_timezone())


def get_current_ymd() -> int:
    """返回默认业务时区当前自然日，格式为 YYYYMMDD 整数。"""

    return int(timestamp_now_datetime().strftime("%Y%m%d"))


def get_current_ym() -> int:
    """返回默认业务时区当前自然月，格式为 YYYYMM 整数。"""

    return int(timestamp_now_datetime().strftime("%Y%m"))


def get_today_date() -> str:
    """返回服务器时区今日日期字符串，格式 YYYY-MM-DD。"""
    return timestamp_now_datetime().strftime("%Y-%m-%d")


def get_today_start_timestamp() -> Timestamp:
    """返回默认业务时区今天 00:00:00.000 的毫秒时间戳。"""

    return get_day_start_timestamp(timestamp_now_datetime().date())


def get_tomorrow_start_timestamp() -> Timestamp:
    """返回默认业务时区明天 00:00:00.000 的毫秒时间戳。"""

    return get_day_start_timestamp(timestamp_now_datetime().date() + timedelta(days=1))


def get_day_start_timestamp(value: str | date) -> Timestamp:
    """返回默认业务时区某自然日 00:00:00.000 的毫秒时间戳。"""

    day = _parse_ymd_date(value)
    dt = datetime.combine(day, DAY_START_TIME, tzinfo=system_timezone())
    return datetime_to_timestamp(dt)


def get_day_end_timestamp(value: str | date) -> Timestamp:
    """返回默认业务时区某自然日 23:59:59.999 的毫秒时间戳。"""

    day = _parse_ymd_date(value)
    dt = datetime.combine(day, DAY_END_TIME, tzinfo=system_timezone())
    return datetime_to_timestamp(dt)


def timestamp_to_ymd(ts: Timestamp) -> str:
    """将毫秒时间戳转换为默认业务时区 YYYY-MM-DD。"""

    return timestamp_to_datetime(ts).strftime("%Y-%m-%d")


def _parse_timestamp_string(ts_input: str) -> Timestamp:
    """解析字符串形式的时间戳或日期时间。"""
    value = ts_input.strip()
    if not value:
        raise ValueError("时间戳字符串不能为空")

    try:
        num = float(value)
    except ValueError:
        return _parse_datetime_string(value)

    if num < 10**10:
        return int(num * 1000)
    return int(num)


def _parse_datetime_string(value: str) -> Timestamp:
    """解析日期时间字符串，缺失时区时按服务器时区解释。"""
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
        except ValueError:
            continue
        if value.endswith("Z"):
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        elif dt.tzinfo is None:
            dt = dt.replace(tzinfo=system_timezone())
        return int(dt.timestamp() * 1000)

    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception as exc:
        raise ValueError(f"无法解析时间字符串 '{value}': {exc}") from exc

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=system_timezone())
    return int(dt.timestamp() * 1000)


def _parse_ymd_date(value: str | date) -> date:
    """解析 YYYY-MM-DD 或 date 为日期对象。"""

    if isinstance(value, date):
        return value
    return date.fromisoformat(value)
