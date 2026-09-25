"""Media Provider 私有 extra 校验工具。

本模块只校验 extra 能否安全进入短期 JWT：必须是短小 JSON object，
公共层不理解也不读取其中业务字段。
"""

from __future__ import annotations

import json
import math
from typing import TypeAlias

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode

# extra compact JSON 最大字节数。
MEDIA_EXTRA_MAX_BYTES = 2048
# extra 最大嵌套深度；根 object 记为 1。
MEDIA_EXTRA_MAX_DEPTH = 4

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
MediaExtra: TypeAlias = dict[str, JsonValue]


def normalize_media_extra(
    value: object,
    *,
    code: CommonCode,
    source: str,
) -> MediaExtra:
    """
    规范化并校验 media extra。

    Args:
        value: 待校验的 extra 值。
        code: 校验失败时抛出的业务错误码。
        source: 错误定位前缀。

    Returns:
        符合 JSON object / 大小 / 深度约束的 extra。
    """
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise _invalid_extra(code=code, source=source, reason="not_object")

    normalized = _normalize_json_object(value, code=code, source=source)
    if _max_depth(normalized) > MEDIA_EXTRA_MAX_DEPTH:
        raise _invalid_extra(code=code, source=source, reason="too_deep")

    try:
        compact = json.dumps(
            normalized,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise _invalid_extra(code=code, source=source, reason="not_json") from exc

    byte_length = len(compact.encode("utf-8"))
    if byte_length > MEDIA_EXTRA_MAX_BYTES:
        raise _invalid_extra(
            code=code,
            source=source,
            reason=f"too_large:{byte_length}",
        )
    return normalized


def _normalize_json_object(
    value: dict[object, object],
    *,
    code: CommonCode,
    source: str,
) -> MediaExtra:
    """递归规范化 JSON object，拒绝非字符串 key。"""
    normalized: MediaExtra = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise _invalid_extra(code=code, source=source, reason="non_string_key")
        normalized[key] = _normalize_json_value(item, code=code, source=source)
    return normalized


def _normalize_json_value(
    value: object,
    *,
    code: CommonCode,
    source: str,
) -> JsonValue:
    """递归校验 JSON value。"""
    if value is None or isinstance(value, str | bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise _invalid_extra(code=code, source=source, reason="non_finite_float")
        return value
    if isinstance(value, list):
        return [_normalize_json_value(item, code=code, source=source) for item in value]
    if isinstance(value, dict):
        return _normalize_json_object(value, code=code, source=source)
    raise _invalid_extra(
        code=code,
        source=source,
        reason=f"unsupported_type:{type(value).__name__}",
    )


def _max_depth(value: JsonValue) -> int:
    """计算 JSON value 最大嵌套深度。"""
    if isinstance(value, dict):
        if not value:
            return 1
        return 1 + max(_max_depth(item) for item in value.values())
    if isinstance(value, list):
        if not value:
            return 1
        return 1 + max(_max_depth(item) for item in value)
    return 1


def _invalid_extra(
    *,
    code: CommonCode,
    source: str,
    reason: str,
) -> AppCommonException:
    """构建 extra 校验失败异常。"""
    return AppCommonException(
        code,
        ext_msg=f"{source}: invalid media extra, reason={reason}",
        data={"reason": "invalid_extra"},
    )
