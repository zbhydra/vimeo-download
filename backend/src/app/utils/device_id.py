"""客户端设备 ID 校验工具。"""

import re

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode

_DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_DEVICE_ID_MAX_LENGTH = 64


def validate_request_device_id(device_id: str | None) -> str:
    """集中校验 X-Device-Id 的格式和命名空间约束。"""
    if not device_id:
        raise AppCommonException(
            CommonCode.INVALID_DEVICE_ID,
            ext_msg="X-Device-Id header is missing or empty",
        )
    if len(device_id) > _DEVICE_ID_MAX_LENGTH:
        raise AppCommonException(
            CommonCode.INVALID_DEVICE_ID,
            ext_msg=(
                "X-Device-Id too long: "
                f"{len(device_id)} chars (max {_DEVICE_ID_MAX_LENGTH})"
            ),
        )
    if not _DEVICE_ID_RE.match(device_id):
        raise AppCommonException(
            CommonCode.INVALID_DEVICE_ID,
            ext_msg=f"X-Device-Id contains illegal characters: {device_id!r}",
        )
    if device_id.isdigit():
        raise AppCommonException(
            CommonCode.QUOTA_INVALID_REQUEST,
            ext_msg=(
                "X-Device-Id cannot be numeric because anonymous uid shares "
                f"namespace with user_id, value={device_id!r}"
            ),
        )
    return device_id
