"""Admin 数据分析只读聚合 API。

提供「数据分析」菜单 4 个标签页的只读聚合接口，统一挂在
``/api/admin/download-analytics`` 前缀下。鉴权走 ``get_admin_user``（业务库聚合，
需回查管理员表）。聚合逻辑全部委托给 ``admin_download_analytics_service``，
API 层只做参数校验与响应封装。

口径详见 ``docs/feat/008.管理后台/tech-数据分析.md``。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.admin_download_analytics_service import (
    admin_download_analytics_service,
)
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/download-analytics", tags=["admin-download-analytics"])


def _validate_range(from_ms: int, to_ms: int) -> None:
    """校验时间区间参数：``from_ms`` 与 ``to_ms`` 必传且 ``from_ms < to_ms``。

    违规抛**定位级**错误（含具体入参，便于排查），不强制跨度上限。

    Args:
        from_ms: 区间起点（毫秒时间戳）。
        to_ms: 区间终点（毫秒时间戳）。

    Raises:
        AppCommonException: ``from_ms >= to_ms`` 时，INVALID_REQUEST，msg 含入参。
    """
    if from_ms >= to_ms:
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=(
                "download-analytics 参数错误: from_ms/to_ms 必传且 from_ms < to_ms, "
                f"got from_ms={from_ms}, to_ms={to_ms}"
            ),
            data={"field": "time_range", "from_ms": from_ms, "to_ms": to_ms},
        )


@router.get("/resource-distribution")
async def get_resource_distribution(
    from_ms: int = Query(..., description="区间起点，毫秒时间戳（闭区间）"),
    to_ms: int = Query(..., description="区间终点，毫秒时间戳（闭区间）"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """下载资源分布：12 桶 ``{key, label, paid_count, total_count}``，固定顺序。"""
    _validate_range(from_ms, to_ms)
    buckets = await admin_download_analytics_service.get_resource_distribution(
        from_ms=from_ms,
        to_ms=to_ms,
    )
    return ResponseUtils.ok({"buckets": buckets})


@router.get("/top-users")
async def get_top_users(
    from_ms: int = Query(..., description="区间起点，毫秒时间戳（闭区间）"),
    to_ms: int = Query(..., description="区间终点，毫秒时间戳（闭区间）"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """下载排名：至多 20 条 ``{user_id, paid_count, total_count}``，按 total_count 降序。"""
    _validate_range(from_ms, to_ms)
    users = await admin_download_analytics_service.get_top_users(
        from_ms=from_ms,
        to_ms=to_ms,
    )
    return ResponseUtils.ok({"users": users})


@router.get("/summary")
async def get_summary(
    from_ms: int = Query(..., description="区间起点，毫秒时间戳（闭区间）"),
    to_ms: int = Query(..., description="区间终点，毫秒时间戳（闭区间）"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """下载统计：6 个标量（人数 / 次数 / 资源大小，各按消耗积分与总和）。"""
    _validate_range(from_ms, to_ms)
    data = await admin_download_analytics_service.get_summary(
        from_ms=from_ms,
        to_ms=to_ms,
    )
    return ResponseUtils.ok(data)


@router.get("/user-geo")
async def get_user_geo(
    from_ms: int = Query(..., description="区间起点，毫秒时间戳（闭区间）"),
    to_ms: int = Query(..., description="区间终点，毫秒时间戳（闭区间）"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """用户地理分析：``{country, count}`` 列表，按 count 降序，空国家归 unknown。"""
    _validate_range(from_ms, to_ms)
    regions = await admin_download_analytics_service.get_user_geo(
        from_ms=from_ms,
        to_ms=to_ms,
    )
    return ResponseUtils.ok({"regions": regions})


__all__ = ["router"]
