"""App 版本发布外部 API。

发布脚本机器调用，鉴权复用管理员 API Key（Bearer）；不做列表/更新/删除。
"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.external_dependencies import (
    ExternalApiAdminContext,
    get_external_api_admin,
)
from app.schemas.app_release_schema import AppReleaseCreateRequest
from app.services.app_release_service import app_release_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/app", tags=["external-app"])


@router.post("/release")
async def create_app_release(
    request: AppReleaseCreateRequest,
    _admin: ExternalApiAdminContext = Depends(get_external_api_admin),
) -> JSONResponse:
    """入库一条版本发布记录；重复 version_code 报版本已存在。"""
    record = await app_release_service.app_release_create(
        platform=request.platform,
        channel=request.channel,
        version_code=request.version_code,
        version_name=request.version_name,
        download_url=request.download_url,
        release_notes=request.release_notes,
        forced=request.forced,
        enabled=request.enabled,
    )
    return ResponseUtils.ok(record.to_dict())
