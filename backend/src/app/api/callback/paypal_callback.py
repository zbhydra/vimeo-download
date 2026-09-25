"""PayPal webhook 回调入口。

职责仅限：落原始日志 → Provider 验签 → 交给 OrderService.handle_payment_callback。
续费派单、并发收敛、履约、Provider 后置动作全部由 OrderService 统一处理。
"""

import json
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request

from app.constants.payment import PAYPAL_PAYMENT_METHOD
from app.core.config import settings
from app.services.order_service import order_service
from app.services.payment_service import payment_service
from app.utils.logger import logger
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/paypal", tags=["paypal-callback"])
_PAYPAL_PAYMENT_LOG_DIR = Path("log") / "payment" / "paypal"
_SENSITIVE_PAYPAL_HEADERS = {
    "authorization",
    "paypal-transmission-sig",
}


@router.post("/payment")
async def paypal_payment_callback(request: Request):
    """处理 PayPal 支付 webhook，唯一支付成功入口。"""

    callback_start_time = time.perf_counter()
    body = await request.body()
    _write_raw_callback_log(request, body)
    provider = await payment_service.get_provider(PAYPAL_PAYMENT_METHOD)
    verify_start_time = time.perf_counter()
    verified = await provider.verify_callback(request)
    verify_duration_ms = _elapsed_ms(verify_start_time)

    if not verified.valid:
        total_duration_ms = _elapsed_ms(callback_start_time)
        logger.info(
            "paypal_payment_callback_finished: event=%s, order_no=%s, valid=false, "
            "processed=%s, verify_duration_ms=%.2f, total_duration_ms=%.2f",
            verified.event,
            verified.order_no,
            verified.processed,
            verify_duration_ms,
            total_duration_ms,
        )
        return ResponseUtils.ok(
            {
                "processed": verified.processed,
                "event": verified.event,
                "order_no": verified.order_no,
                "payment_valid": False,
                "provider_data": verified.provider_data or {},
                "error_message": verified.error_message,
            }
        )

    handle_payment_callback_start_time = time.perf_counter()
    result = await order_service.handle_payment_callback(
        payment_method=PAYPAL_PAYMENT_METHOD,
        callback=verified,
    )
    handle_payment_callback_duration_ms = _elapsed_ms(
        handle_payment_callback_start_time
    )
    total_duration_ms = _elapsed_ms(callback_start_time)
    logger.info(
        "paypal_payment_callback_finished: event=%s, order_no=%s, valid=true, "
        "processed=%s, idempotent=%s, verify_duration_ms=%.2f, "
        "handle_payment_callback_duration_ms=%.2f, total_duration_ms=%.2f",
        verified.event,
        result.order_no,
        verified.processed,
        result.idempotent,
        verify_duration_ms,
        handle_payment_callback_duration_ms,
        total_duration_ms,
    )
    return ResponseUtils.ok(
        {
            "processed": verified.processed,
            "event": verified.event,
            "order_no": result.order_no,
            "idempotent": result.idempotent,
        }
    )


def _write_raw_callback_log(request: Request, body: bytes) -> None:
    """第一时间记录 PayPal payment webhook 原始请求。"""

    log_dir = Path(settings.root_path) / _PAYPAL_PAYMENT_LOG_DIR
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{datetime.now().strftime('%Y-%m-%d')}.log"
    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in _SENSITIVE_PAYPAL_HEADERS
    }
    entry = {
        "received_at": datetime.now().isoformat(timespec="milliseconds"),
        "path": request.url.path,
        "headers": headers,
        "body": body.decode("utf-8", errors="replace"),
    }
    with log_file.open("a", encoding="utf-8") as file:
        file.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")))
        file.write("\n")


def _elapsed_ms(start_time: float) -> float:
    """计算 PayPal webhook 阶段耗时，统一以毫秒输出。"""

    return (time.perf_counter() - start_time) * 1000
