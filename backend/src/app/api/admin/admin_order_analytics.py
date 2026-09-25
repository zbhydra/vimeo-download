"""Admin 订单统计只读 API。

提供管理后台「数据分析」中的订单维度统计：每日充值和商品统计。接口只做
admin 鉴权、时间范围校验与响应封装，聚合逻辑在 ``admin_order_analytics_service``。
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.admin_order_analytics_service import admin_order_analytics_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/order-analytics", tags=["admin-order-analytics"])


def _validate_range(from_ms: int, to_ms: int) -> None:
    """校验订单统计时间范围。"""
    if from_ms >= to_ms:
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=(
                "order-analytics 参数错误: from_ms/to_ms 必传且 from_ms < to_ms, "
                f"got from_ms={from_ms}, to_ms={to_ms}"
            ),
            data={"field": "time_range", "from_ms": from_ms, "to_ms": to_ms},
        )


@router.get("/daily-recharge")
async def get_daily_recharge(
    from_ms: int = Query(..., description="区间起点，毫秒时间戳（闭区间）"),
    to_ms: int = Query(..., description="区间终点，毫秒时间戳（闭区间）"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """每日充值：按 +8 日期返回成功/全部订单笔数、去重人数与多币种金额。"""
    _validate_range(from_ms, to_ms)
    rows = await admin_order_analytics_service.get_daily_recharge(
        from_ms=from_ms,
        to_ms=to_ms,
    )
    return ResponseUtils.ok({"rows": [asdict(row) for row in rows]})


@router.get("/product-statistics")
async def get_product_statistics(
    from_ms: int = Query(..., description="区间起点，毫秒时间戳（闭区间）"),
    to_ms: int = Query(..., description="区间终点，毫秒时间戳（闭区间）"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """商品统计：按 +8 日期和商品 ID 返回成功/全部订单笔数、去重人数与多币种金额。"""
    _validate_range(from_ms, to_ms)
    rows = await admin_order_analytics_service.get_product_statistics(
        from_ms=from_ms,
        to_ms=to_ms,
    )
    return ResponseUtils.ok({"rows": [asdict(row) for row in rows]})


__all__ = ["router"]
