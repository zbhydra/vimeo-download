"""
Admin 日志排查 API

提供 web_parse_failed 排查和 website 下载详情日志查询能力。
"""

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.admin_mark_log_service import admin_mark_log_service

router = APIRouter(prefix="/mark-logs", tags=["admin-mark-logs"])


class AdminParseRetryRequest(BaseModel):
    """日志解析复查请求。"""

    log_id: int = Field(..., gt=0, description="mark_logs.log_id")


@router.get("/web-parse-failed")
async def list_web_parse_failed_logs(
    page: int = Query(default=1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(default=50, ge=1, le=100, description="每页数量"),
    _admin: AdminContext = Depends(get_admin_user),
) -> dict:
    """
    查询 web_parse_failed 日志列表。

    返回字段：操作 id、user_id、时间、url、mark_msg。
    """
    result = await admin_mark_log_service.list_web_parse_failed_logs(
        page=page, page_size=page_size
    )
    return {"code": 10000, "data": asdict(result), "msg": "success"}


@router.get("/web-downloads")
async def list_web_download_logs(
    page: int = Query(default=1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(default=50, ge=1, le=100, description="每页数量"),
    _admin: AdminContext = Depends(get_admin_user),
) -> dict:
    """
    查询 website 下载详情日志列表。

    返回字段：log_id、user_id、mark_type、status、platform、url、file_size、filename、
    node_id、retry_count、error_message、mark_time。
    """
    result = await admin_mark_log_service.list_web_download_logs(
        page=page,
        page_size=page_size,
    )
    return {"code": 10000, "data": asdict(result), "msg": "success"}


@router.post("/web-parse-failed/retry-parse")
async def retry_parse_web_parse_failed_log(
    req: AdminParseRetryRequest,
    _admin: AdminContext = Depends(get_admin_user),
) -> dict:
    """
    对单条 web_parse_failed 日志重新解析一次。

    用于确认失败是否仍然可复现。
    """
    try:
        result = await admin_mark_log_service.retry_parse_web_parse_failed_log(
            log_id=req.log_id
        )
    except ValueError as exc:
        raise AppCommonException(CommonCode.INVALID_REQUEST, ext_msg=str(exc)) from exc

    return {"code": 10000, "data": asdict(result), "msg": "success"}
