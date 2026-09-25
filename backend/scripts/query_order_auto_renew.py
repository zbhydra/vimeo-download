#!/usr/bin/env python3
"""输入本地订单号，查询该订单对应的渠道自动续费状态。"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from scripts._order_auto_renew import (  # noqa: E402
    format_json,
    format_script_error,
    query_order_auto_renew,
)

from app.core.database import check_db_connection, close_engine  # noqa: E402


def _parse_args() -> argparse.Namespace:
    """解析可选订单号；省略时进入交互输入。"""

    parser = argparse.ArgumentParser(
        description="按本地订单号查询支付渠道自动续费状态。",
    )
    parser.add_argument(
        "order_no",
        nargs="?",
        help="本地订单号；省略时由终端输入。",
    )
    return parser.parse_args()


async def _run(order_no: str) -> dict[str, object]:
    """检查数据库后执行一次状态查询。"""

    try:
        if not await check_db_connection():
            raise RuntimeError(
                "query_order_auto_renew: 数据库不可用，请确认 MySQL 和 "
                "backend/config.yaml 配置。"
            )
        return (await query_order_auto_renew(order_no)).to_dict()
    finally:
        await close_engine()


def main() -> int:
    """同步 CLI 入口。"""

    args = _parse_args()
    try:
        order_no = args.order_no or input("请输入订单号: ").strip()
        result = asyncio.run(_run(order_no))
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] {format_script_error(exc)}", file=sys.stderr)
        return 2
    print(format_json(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
