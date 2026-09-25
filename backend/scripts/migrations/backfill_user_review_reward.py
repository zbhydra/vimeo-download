#!/usr/bin/env python3
"""把好评赠送的历史领取账号从账号 Counter 迁移到 user_review_reward 事实表。

背景：领取事实原本存在账号维度的永久 Counter 6001，现在改由三维度（账号 / 设备 /
TG 身份）事实表承载。旧 Counter 只覆盖账号维度，设备与 TG 无历史，因此本迁移也只
回填账号作用域，``value`` 写成 ``userid:<user_id>`` 供人工排查与回滚回填。

只跑主站部署。

幂等：写入用 ``INSERT IGNORE`` 收敛到 uid 主键，重复执行没有副作用，所以不需要
「已执行」标记文件。核对由脚本自己完成——分批按 uid 主键查新表，断言源账号全部命中；
不用两侧计数做判据（迁移期间新领取行本就会让两侧计数不等，而「不低于」也证明不了没漏迁）。
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.ext.asyncio import AsyncSession

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from app.constants.counter import CounterId  # noqa: E402
from app.core.database import close_engine, get_async_session  # noqa: E402
from app.models.counter_user_lifetime_model import (  # noqa: E402
    CounterUserLifetimeModel,
)
from app.models.user_review_reward_model import (  # noqa: E402
    UserReviewRewardModel,
)
from app.utils.time import timestamp_now  # noqa: E402
from app.utils.uid import build_user_scope  # noqa: E402

# 迁移行没有业务日期：旧 Counter 只存累计值、不存领取时间，0 表示「无业务日期」。
# 不得为了补日期改用 CONVERT_TZ——本仓库有过命名时区表缺失导致它静默返回 NULL 的事故。
_MIGRATION_YMD = 0
# 每批源账号数；按 user_id 递增翻页，单批的 uid IN 查询与 INSERT 都保持小事务。
_SOURCE_BATCH_SIZE = 500


@dataclass(frozen=True, slots=True)
class ReviewRewardMigrationStats:
    """好评赠送领取事实迁移统计。

    ``verified_accounts`` 与 ``missing_accounts`` 是逐项核对结果，只在 ``execute=True``
    时统计：dry-run 没有写入，核对本就不成立，两者恒为 0。
    """

    source_accounts: int
    # 源账号中本次执行前新表就已存在的行数；重复执行时它就是全部源账号。
    already_present_accounts: int
    pending_accounts: int
    # 核对命中的源账号数，含迁移前已存在的行。
    verified_accounts: int
    missing_accounts: int


async def backfill_user_review_reward(
    *, execute: bool = False
) -> ReviewRewardMigrationStats:
    """分批迁移 6001 的历史领取账号，并逐个核对新表命中。

    Args:
        execute: 为 True 时写入领取事实行，False 只统计不修改数据库。

    Returns:
        ReviewRewardMigrationStats: 源账号数、迁移前已存在数、待写入数、核对命中数与缺项数。

    Raises:
        RuntimeError: 已执行写入但仍有源账号在新表查不到 uid，说明迁移漏项。
    """

    source_accounts = 0
    already_present_accounts = 0
    pending_accounts = 0
    verified_accounts = 0
    missing_values: list[str] = []
    last_user_id = 0

    async with get_async_session() as db:
        while True:
            user_ids = await _load_source_user_ids(db, after_user_id=last_user_id)
            if not user_ids:
                break
            last_user_id = user_ids[-1]

            scopes = [build_user_scope(user_id) for user_id in user_ids]
            existing_uids = await _load_uids(db, [uid for uid, _ in scopes])
            pending_scopes = [
                scope for scope in scopes if scope[0] not in existing_uids
            ]

            source_accounts += len(scopes)
            already_present_accounts += len(scopes) - len(pending_scopes)
            pending_accounts += len(pending_scopes)

            if not execute:
                continue

            if pending_scopes:
                await _insert_scopes(db, pending_scopes)

            # 核对整批源账号，而不是只核对本次新插入的那些：迁移前已存在的行同样是命中，
            # 否则重复执行会报出 verified_accounts=0，把「已迁移完成」误报成「一个都没命中」。
            verified_uids = await _load_uids(db, [uid for uid, _ in scopes])
            verified_accounts += len(verified_uids)
            missing_values.extend(
                value for uid, value in scopes if uid not in verified_uids
            )

    if execute and missing_values:
        raise RuntimeError(
            "backfill_user_review_reward: 迁移后仍有源账号在新表缺 uid: "
            f"missing={len(missing_values)}, sample={missing_values[:5]}"
        )

    return ReviewRewardMigrationStats(
        source_accounts=source_accounts,
        already_present_accounts=already_present_accounts,
        pending_accounts=pending_accounts,
        verified_accounts=verified_accounts,
        missing_accounts=len(missing_values),
    )


async def _load_source_user_ids(
    db: AsyncSession,
    *,
    after_user_id: int,
) -> list[int]:
    """按 user_id 递增读取一批 6001 的源账号。

    走 ``uk_counter_user_lifetime_user_id_counter_id`` 的最左前缀：范围与排序都用
    user_id，不产生文件排序，也不新增索引。
    """

    stmt = (
        select(CounterUserLifetimeModel.user_id)
        .where(
            CounterUserLifetimeModel.counter_id
            == CounterId.SUBSCRIPTION_REVIEW_REWARD_CLAIMED,
            CounterUserLifetimeModel.value > 0,
            CounterUserLifetimeModel.user_id > after_user_id,
        )
        .order_by(CounterUserLifetimeModel.user_id)
        .limit(_SOURCE_BATCH_SIZE)
    )
    result = await db.execute(stmt)
    return [int(user_id) for user_id in result.scalars().all()]


async def _load_uids(db: AsyncSession, uids: list[str]) -> set[str]:
    """按 uid 主键批量查新表，返回已存在的 uid 集合。"""

    if not uids:
        return set()
    result = await db.execute(
        select(UserReviewRewardModel.uid).where(UserReviewRewardModel.uid.in_(uids))
    )
    return {str(uid) for uid in result.scalars().all()}


async def _insert_scopes(db: AsyncSession, scopes: list[tuple[str, str]]) -> None:
    """把一批账号事实行按主键收敛写入（已存在则跳过）。"""

    now_ms = timestamp_now()
    stmt = mysql_insert(UserReviewRewardModel).prefix_with("IGNORE")
    await db.execute(
        stmt.values(
            [
                {
                    "uid": uid,
                    "ymd": _MIGRATION_YMD,
                    "value": value,
                    "created_at": now_ms,
                }
                for uid, value in scopes
            ]
        )
    )
    await db.commit()


def _parse_args() -> argparse.Namespace:
    """解析执行模式；默认不修改数据库。"""

    parser = argparse.ArgumentParser(
        description=(
            "把 counter 6001 的历史领取账号迁移到 user_review_reward 事实表；"
            "默认只预览，传入 --execute 才写入。"
        )
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="实际写入领取事实行；省略时不修改数据库。",
    )
    return parser.parse_args()


async def _run(*, execute: bool) -> ReviewRewardMigrationStats:
    """执行迁移并在退出前释放数据库连接池。"""

    try:
        return await backfill_user_review_reward(execute=execute)
    finally:
        await close_engine()


def main() -> int:
    """执行好评赠送领取事实迁移。"""

    args = _parse_args()
    stats = asyncio.run(_run(execute=args.execute))
    print(f"mode: {'execute' if args.execute else 'dry-run'}")
    print(f"source_accounts: {stats.source_accounts}")
    print(f"already_present_accounts: {stats.already_present_accounts}")
    print(f"pending_accounts: {stats.pending_accounts}")
    print(f"verified_accounts: {stats.verified_accounts}")
    print(f"missing_accounts: {stats.missing_accounts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
