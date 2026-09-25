"""统一每日额度类型常量。"""

import enum

# Deprecated: extension 下载上限已改由订阅 metadata.daily_limit 统一解析。
EXTENSION_DOWNLOAD_DAILY_LIMIT = 9999


class QuotaTypeEnum(enum.IntEnum):
    """每日额度类型。"""

    WEB_DOWNLOAD = 1
    WEB_PLAY = 2
    EXTENSION_DOWNLOAD = 3


ALL_QUOTA_TYPES = (
    QuotaTypeEnum.WEB_DOWNLOAD,
    QuotaTypeEnum.WEB_PLAY,
    QuotaTypeEnum.EXTENSION_DOWNLOAD,
)


def normalize_quota_type(value: int | QuotaTypeEnum) -> QuotaTypeEnum:
    """把内部额度类型值归一化为枚举。"""
    if isinstance(value, bool):
        raise ValueError(f"Invalid quota_type: {value!r}")
    try:
        return QuotaTypeEnum(value)
    except ValueError as exc:
        raise ValueError(f"Invalid quota_type: {value!r}") from exc
