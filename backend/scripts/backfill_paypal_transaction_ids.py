#!/usr/bin/env python3
"""从历史 PayPal 回调快照回填订单交易流水 ID。"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from sqlalchemy import or_, select, update
from sqlalchemy.engine import CursorResult

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from app.constants.order import OrderStatus  # noqa: E402
from app.constants.payment import PAYPAL_PAYMENT_METHOD  # noqa: E402
from app.core.database import close_engine, get_async_session  # noqa: E402
from app.models.order_model import OrderModel  # noqa: E402


@dataclass(frozen=True, slots=True)
class BackfillStats:
    """PayPal 交易流水回填统计。"""

    scanned_orders: int
    eligible_orders: int
    missing_capture_id_orders: int
    updated_orders: int


def _object(value: object) -> dict[str, object] | None:
    """把 JSON 值收窄为对象。"""

    return cast(dict[str, object], value) if isinstance(value, dict) else None


def _capture_id_from_metadata(raw_metadata: str) -> str | None:
    """从 Capture Order 响应或 Capture Completed webhook 提取 capture ID。"""

    try:
        metadata = _object(json.loads(raw_metadata))
    except json.JSONDecodeError:
        return None
    if metadata is None:
        return None

    callback = _object(metadata.get("payment_callback")) or metadata
    purchase_units = callback.get("purchase_units")
    if isinstance(purchase_units, list):
        for purchase_unit_value in purchase_units:
            purchase_unit = _object(purchase_unit_value)
            payments = _object(purchase_unit.get("payments")) if purchase_unit else None
            captures = payments.get("captures") if payments else None
            if not isinstance(captures, list):
                continue
            for capture_value in captures:
                capture = _object(capture_value)
                if not capture or capture.get("status") != "COMPLETED":
                    continue
                capture_id = capture.get("id")
                if isinstance(capture_id, str) and capture_id.strip():
                    return capture_id.strip()

    if callback.get("event_type") == "PAYMENT.CAPTURE.COMPLETED":
        resource = _object(callback.get("resource"))
        capture_id = resource.get("id") if resource else None
        if isinstance(capture_id, str) and capture_id.strip():
            return capture_id.strip()
    return None


async def backfill_paypal_transaction_ids(*, execute: bool = False) -> BackfillStats:
    """扫描缺少流水 ID 的已支付 PayPal 订单，并按需执行回填。"""

    async with get_async_session() as db:
        result = await db.execute(
            select(OrderModel.id, OrderModel.extra_metadata)
            .where(
                OrderModel.payment_method == PAYPAL_PAYMENT_METHOD,
                OrderModel.order_status == OrderStatus.PAID.value,
                or_(
                    OrderModel.payment_transaction_id.is_(None),
                    OrderModel.payment_transaction_id == "",
                ),
                OrderModel.extra_metadata.is_not(None),
                OrderModel.extra_metadata != "",
            )
            .order_by(OrderModel.id)
        )
        rows = result.all()
        matches = [
            (order_id, capture_id)
            for order_id, raw_metadata in rows
            if raw_metadata
            and (capture_id := _capture_id_from_metadata(raw_metadata)) is not None
        ]

        updated_orders = 0
        if execute:
            for order_id, capture_id in matches:
                update_result = cast(
                    CursorResult[tuple[object]],
                    await db.execute(
                        update(OrderModel)
                        .where(
                            OrderModel.id == order_id,
                            or_(
                                OrderModel.payment_transaction_id.is_(None),
                                OrderModel.payment_transaction_id == "",
                            ),
                        )
                        .values(payment_transaction_id=capture_id)
                    ),
                )
                updated_orders += update_result.rowcount
            await db.commit()

    return BackfillStats(
        scanned_orders=len(rows),
        eligible_orders=len(matches),
        missing_capture_id_orders=len(rows) - len(matches),
        updated_orders=updated_orders,
    )


def _parse_args() -> argparse.Namespace:
    """解析执行模式；默认不修改数据库。"""

    parser = argparse.ArgumentParser(
        description=(
            "从历史 PayPal 回调快照提取 capture ID；默认只预览，"
            "传入 --execute 才写入 orders.payment_transaction_id。"
        )
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="实际回填流水 ID；省略时不修改数据库。",
    )
    return parser.parse_args()


async def _run(*, execute: bool) -> BackfillStats:
    """执行回填并在退出前释放数据库连接池。"""

    try:
        return await backfill_paypal_transaction_ids(execute=execute)
    finally:
        await close_engine()


def main() -> int:
    """执行历史 PayPal 交易流水回填。"""

    args = _parse_args()
    stats = asyncio.run(_run(execute=args.execute))
    print(f"mode: {'execute' if args.execute else 'dry-run'}")
    print(f"scanned_orders: {stats.scanned_orders}")
    print(f"eligible_orders: {stats.eligible_orders}")
    print(f"missing_capture_id_orders: {stats.missing_capture_id_orders}")
    print(f"updated_orders: {stats.updated_orders}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
