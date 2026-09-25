"""ClinkBill 支付 Webhook 路由。"""

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.i18n.translator import translator
from app.provider.payment.clink import CLINK_PAYMENT_METHOD
from app.services.order_service import order_service
from app.services.payment_service import payment_service
from app.utils.feishu_utils import send_feishu_alarm
from app.utils.logger import logger
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/clink", tags=["clink-callback"])
_CLINK_PAYMENT_LOG_DIR = Path("log") / "payment" / "clink"
_SENSITIVE_CLINK_HEADERS = {"authorization", "x-clink-signature"}


@router.post("/payment")
async def clink_payment_callback(request: Request) -> JSONResponse:
    """验签 ClinkBill Webhook，并把支付成功事件交给统一订单服务。"""

    body = await request.body()
    _write_raw_callback_log(request, body)
    try:
        provider = await payment_service.get_provider_for_existing_payment(
            CLINK_PAYMENT_METHOD
        )
        verified = await provider.verify_callback(request)
        if not verified.processed:
            data: dict[str, object] = {
                "processed": False,
                "event": verified.event,
            }
            reason = (verified.provider_data or {}).get("reason")
            if isinstance(reason, str):
                data["reason"] = reason
            return ResponseUtils.ok(data)

        result = await order_service.handle_payment_callback(
            payment_method=CLINK_PAYMENT_METHOD,
            callback=verified,
        )
    except Exception as exc:
        logger.error(
            "clink_payment_callback: payment check or processing failed", exc_info=True
        )
        try:
            await send_feishu_alarm(
                title=translator.translate("payment_alarm.callback_failed", "zh-CN"),
                content=f"POST {request.url.path}\n{type(exc).__name__}: {exc}",
            )
        except Exception:
            # 告警失败不能覆盖支付异常，渠道仍需收到失败响应以重试。
            logger.error("clink_payment_callback: Feishu alarm failed", exc_info=True)
        raise
    return ResponseUtils.ok(
        {
            "processed": True,
            "event": verified.event,
            "order_no": result.order_no,
            "idempotent": result.idempotent,
        }
    )


def _write_raw_callback_log(request: Request, body: bytes) -> None:
    """第一时间记录 ClinkBill payment webhook 原始请求。"""

    log_dir = Path(settings.root_path) / _CLINK_PAYMENT_LOG_DIR
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{datetime.now().strftime('%Y-%m-%d')}.log"
    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in _SENSITIVE_CLINK_HEADERS
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
