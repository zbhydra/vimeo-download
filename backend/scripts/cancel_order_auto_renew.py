#!/usr/bin/env python3
"""输入本地订单号，经确认后取消该订单对应的渠道自动续费。"""

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
    cancel_order_auto_renew,
    format_json,
    format_script_error,
    query_order_auto_renew,
)

from app.core.database import check_db_connection, close_engine  # noqa: E402


def _parse_args() -> argparse.Namespace:
    """解析订单号和非交互确认开关。"""

    parser = argparse.ArgumentParser(
        description="按本地订单号取消支付渠道后续自动扣款。",
    )
    parser.add_argument(
        "order_no",
        nargs="?",
        help="本地订单号；省略时由终端输入。",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="跳过 CANCEL 二次确认，供明确的自动化操作使用。",
    )
    return parser.parse_args()


async def _run(order_no: str, *, skip_confirmation: bool) -> dict[str, object] | None:
    """在同一事件循环中完成查询、确认、取消并关闭数据库连接。"""

    try:
        if not await check_db_connection():
            raise RuntimeError(
                "cancel_order_auto_renew: 数据库不可用，请确认 MySQL 和 "
                "backend/config.yaml 配置。"
            )
        status = (await query_order_auto_renew(order_no)).to_dict()
        print("取消前状态:")
        print(format_json(status))
        if not skip_confirmation:
            confirmation = await asyncio.to_thread(
                input,
                "输入 CANCEL 确认停止后续自动扣款: ",
            )
            if confirmation.strip() != "CANCEL":
                return None
        return (await cancel_order_auto_renew(order_no)).to_dict()
    finally:
        await close_engine()


def main() -> int:
    """同步 CLI 入口。"""

    args = _parse_args()
    try:
        order_no = args.order_no or input("请输入订单号: ").strip()
        result = asyncio.run(_run(order_no, skip_confirmation=args.yes))
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] {format_script_error(exc)}", file=sys.stderr)
        return 2

    if result is None:
        print("已取消本次操作。")
        return 1
    print("取消结果:")
    print(format_json(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
