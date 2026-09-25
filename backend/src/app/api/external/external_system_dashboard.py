"""外部系统统计大盘 API。"""

from dataclasses import asdict
import time

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.external_dependencies import (
    ExternalApiAdminContext,
    get_external_api_admin,
)
from app.services.external_system_dashboard_service import (
    external_system_dashboard_service,
)
from app.utils.response import ResponseUtils
from app.utils.logger import logger

router = APIRouter(prefix="/system", tags=["external-system"])


@router.get("/dashboard")
async def get_external_system_dashboard(
    _admin: ExternalApiAdminContext = Depends(get_external_api_admin),
) -> JSONResponse:
    """返回外部 API 系统统计大盘。"""
    started_at = time.perf_counter()
    result = await external_system_dashboard_service.get_dashboard()
    response_started_at = time.perf_counter()
    response = ResponseUtils.ok(asdict(result))
    logger.warning(
        "external_dashboard_api_timing: "
        f"response_build_ms={(time.perf_counter() - response_started_at) * 1000:.2f} "
        f"endpoint_total_ms={(time.perf_counter() - started_at) * 1000:.2f}"
    )
    return response
