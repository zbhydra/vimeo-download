"""订单履约补偿 cron 任务。

本任务每轮小批量扫描已支付但仍待履约的订单，重新调用订单侧履约入口。
"""

from app.constants.order import CallbackStatus, OrderStatus, ProductClass
from app.services.order_service import order_service
from app.utils.logger import logger
from app.utils.time import timestamp_now

ORDER_FULFILLMENT_COMPENSATION_TASK_KEY = "order.fulfillment_compensation"
ORDER_FULFILLMENT_COMPENSATION_BATCH_LIMIT = 20
ORDER_FULFILLMENT_COMPENSATION_STALE_MS = 60_000


async def compensate_paid_pending_orders() -> None:
    """补偿已支付但履约仍 PENDING 的滞留订单。"""
    try:
        # 用 updated_at 判断滞留，避免订单创建很久但刚支付成功时被提前补偿。
        orders = await order_service.order_lists(
            order_statuses=[OrderStatus.PAID],
            callback_statuses=[CallbackStatus.PENDING, CallbackStatus.FAILED],
            product_classes=[ProductClass.SUBSCRIPTION, ProductClass.RECHARGE],
            updated_before_ms=(
                timestamp_now() - ORDER_FULFILLMENT_COMPENSATION_STALE_MS
            ),
            limit=ORDER_FULFILLMENT_COMPENSATION_BATCH_LIMIT,
            order_by="updated_at_asc",
        )
    except Exception as exc:
        logger.error(
            "order_fulfillment_compensation scan_failed task_key=%s error=%s",
            ORDER_FULFILLMENT_COMPENSATION_TASK_KEY,
            exc,
        )
        return

    success_count = 0
    failed_count = 0
    skipped_count = 0
    runtime_error_count = 0

    for order in orders:
        try:
            fulfilled = await order_service.fulfill_paid_order(order)
        except Exception as exc:
            runtime_error_count += 1
            logger.error(
                "order_fulfillment_compensation runtime_failed task_key=%s "
                "order_no=%s user_id=%s product_id=%s callback_status=%s error=%s",
                ORDER_FULFILLMENT_COMPENSATION_TASK_KEY,
                order.order_no,
                order.user_id,
                order.product_id,
                order.callback_status,
                exc,
            )
            continue

        if fulfilled:
            success_count += 1
        else:
            skipped_count += 1

    logger.info(
        "order_fulfillment_compensation finished task_key=%s scanned_count=%d "
        "success_count=%d failed_count=%d skipped_count=%d runtime_error_count=%d",
        ORDER_FULFILLMENT_COMPENSATION_TASK_KEY,
        len(orders),
        success_count,
        failed_count,
        skipped_count,
        runtime_error_count,
    )


async def compensate_paid_pending_subscription_orders() -> None:
    """兼容旧注册名的订单履约补偿入口。"""

    await compensate_paid_pending_orders()
