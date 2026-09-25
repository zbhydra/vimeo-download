"""
Admin Dashboard API

复用 DashboardService 获取 60 天聚合数据，转为 JSON 响应。
"""

from dataclasses import asdict
import time

from fastapi import APIRouter, Depends

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.services.dashboard_service import dashboard_service
from app.utils.logger import logger

router = APIRouter(prefix="/dashboard", tags=["admin-dashboard"])


@router.get("")
async def get_dashboard(_admin: AdminContext = Depends(get_admin_user)) -> dict:
    """
    获取 Dashboard 统计数据

    返回 60 天按天聚合的用户统计和打点数据。
    复用 DashboardService.get_dashboard_data()，frozen dataclass 转 dict。
    """
    started_at = time.perf_counter()
    data = await dashboard_service.get_dashboard_data(days=60)
    response_started_at = time.perf_counter()
    response = {"code": 10000, "data": asdict(data), "msg": "success"}
    logger.warning(
        "admin_dashboard_api_timing: "
        f"response_build_ms={(time.perf_counter() - response_started_at) * 1000:.2f} "
        f"endpoint_total_ms={(time.perf_counter() - started_at) * 1000:.2f}"
    )
    return response
