"""事实表 uid 构造 helper。

`user_first_day` 与 `user_review_reward` 两张事实表都以 uid 作主键：uid 是
「作用域前缀:原值」的 sha256 前 32 位小写 hex，同表还存一份带前缀原值供人工排查。
前缀与算法只有这一个来源——Python 侧与历史迁移 SQL 的 `SHA2(CONCAT(...), 256)` 必须
逐字符一致，任何一侧改动都要同步另一侧，不得在别处另写哈希。
"""

from __future__ import annotations

import hashlib

# 作用域前缀。大小写必须与迁移 SQL 里的字面量完全一致（注意 Device-Id 的大写 D / I）。
USER_SCOPE_PREFIX = "userid"
DEVICE_SCOPE_PREFIX = "Device-Id"

_UID_HEX_LENGTH = 32


def build_user_scope(user_id: int) -> tuple[str, str]:
    """账号作用域：返回 (uid, value)。"""
    return _build_scope(USER_SCOPE_PREFIX, str(user_id))


def build_device_scope(device_id: str) -> tuple[str, str]:
    """设备作用域：返回 (uid, value)。"""
    return _build_scope(DEVICE_SCOPE_PREFIX, device_id)


def _build_scope(prefix: str, raw_value: str) -> tuple[str, str]:
    """返回 (uid, value)；value 是带前缀原值，uid 是它的 sha256 前 32 位小写 hex。"""
    value = f"{prefix}:{raw_value}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:_UID_HEX_LENGTH], value
