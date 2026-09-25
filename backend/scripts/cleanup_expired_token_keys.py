#!/usr/bin/env python3
"""为历史 token ZSet 补齐基于最大 score 的 key 绝对过期时间。"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from app.core.config import settings  # noqa: E402
from app.core.redis import redis_client  # noqa: E402
from app.utils.time import timestamp_now_seconds  # noqa: E402

SCAN_COUNT = 500


@dataclass(frozen=True, slots=True)
class CleanupStats:
    """历史 token key 扫描统计。"""

    scanned_keys: int = 0
    keys_without_ttl: int = 0
    expired_max_score_keys: int = 0
    active_max_score_keys: int = 0


def _token_key_patterns(key_prefix: str) -> tuple[str, str, str]:
    """返回 token ZSet 扫描 pattern；已有 TTL 的宽限期 key 会在读取时跳过。"""

    return (
        f"{key_prefix}:access_token:*",
        f"{key_prefix}:refresh_token:*",
        f"{key_prefix}:admin_refresh_token:*",
    )


async def _read_key_expiration(key: str) -> tuple[int, int] | None:
    """读取 key TTL 状态与最大 token score；并发删除时返回空。"""

    redis = await redis_client.get_client()
    ttl = await redis.ttl(key)
    highest_score = await redis.zrange(key, -1, -1, withscores=True)
    if not highest_score:
        return None
    return int(ttl), int(highest_score[0][1])


async def cleanup_expired_token_keys(
    *,
    key_prefix: str,
    execute: bool = False,
) -> CleanupStats:
    """扫描当前 token ZSet，并为没有 TTL 的 key 补绝对过期时间。

    Args:
        key_prefix: 完整 Redis 命名空间前缀，也是 SCAN 的隔离边界。
        execute: 是否实际写入；默认只统计。

    Returns:
        本次完整扫描的聚合统计，不包含 key 或 token 信息。
    """

    redis = await redis_client.get_client()
    now = timestamp_now_seconds()
    scanned_keys = 0
    keys_without_ttl = 0
    expired_max_score_keys = 0
    active_max_score_keys = 0

    for pattern in _token_key_patterns(key_prefix):
        async for key in redis.scan_iter(match=pattern, count=SCAN_COUNT):
            scanned_keys += 1
            expiration = await _read_key_expiration(str(key))
            if expiration is None:
                continue

            ttl, max_score = expiration
            if ttl != -1:
                continue

            keys_without_ttl += 1
            if max_score <= now:
                expired_max_score_keys += 1
            else:
                active_max_score_keys += 1

            if execute:
                await redis.expireat(key, max_score, nx=True)

    return CleanupStats(
        scanned_keys=scanned_keys,
        keys_without_ttl=keys_without_ttl,
        expired_max_score_keys=expired_max_score_keys,
        active_max_score_keys=active_max_score_keys,
    )


def _parse_args() -> argparse.Namespace:
    """解析是否执行写入；不开放命名空间参数。"""

    parser = argparse.ArgumentParser(
        description=(
            "扫描当前配置命名空间的用户与管理员 token key；默认只统计，"
            "传入 --execute 才为无 TTL key 设置绝对过期时间。"
        )
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="实际为无 TTL token key 设置 EXPIREAT；省略时不修改 Redis。",
    )
    return parser.parse_args()


def _print_stats(stats: CleanupStats, *, execute: bool) -> None:
    """输出不含 Redis key 或 token 内容的聚合结果。"""

    print(f"mode: {'execute' if execute else 'dry-run'}")
    print(f"scanned_keys: {stats.scanned_keys}")
    print(f"keys_without_ttl: {stats.keys_without_ttl}")
    print(f"expired_max_score_keys: {stats.expired_max_score_keys}")
    print(f"active_max_score_keys: {stats.active_max_score_keys}")


def main() -> int:
    """使用运行配置前缀执行一次完整扫描。"""

    args = _parse_args()
    stats = asyncio.run(
        cleanup_expired_token_keys(
            key_prefix=settings.redis.key_prefix,
            execute=args.execute,
        )
    )
    _print_stats(stats, execute=args.execute)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
