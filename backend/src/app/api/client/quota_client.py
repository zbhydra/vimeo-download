"""配额 API - 客户端接口。"""

from fastapi import APIRouter, Depends, Request

from app.api.user_dependencies import UserContext, get_current_user_optional
from app.constants.quota import QuotaTypeEnum
from app.exceptions.common_exception import AppCommonException, UserAuthFailedException
from app.i18n.common_code import CommonCode
from app.schemas.quota_schema import CheckQuotaRequest, CheckQuotaResponse
from app.services.quota_service import quota_service
from app.utils.logger import logger
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/quota", tags=["配额管理"])


@router.post("/check", response_model=CheckQuotaResponse)
async def check_download_quota(
    request: CheckQuotaRequest,
    http_request: Request,
    current_user: UserContext = Depends(get_current_user_optional),
):
    """
    检查下载配额

    - 已登录用户：根据订阅层级检查
    - 匿名用户：使用免费版配额（3次/天）
    - 作用域首次下载当天不限次

    返回：
    - status=1: 配额充足，已消耗
    - status=0: 配额不足，未消耗
    """
    # 消费不能把过期账号静默降为游客；401 让客户端续签后按账号权益重试。
    if current_user.user_id == 0 and http_request.headers.get("Authorization"):
        raise UserAuthFailedException(
            "check_download_quota: invalid authorization: path=/quota/check"
        )

    count = request.count
    if count < 1 or count is None:
        count = 1

    if current_user.user_id > 0:
        u_id = str(current_user.user_id)
    else:
        u_id = current_user.validated_device_id()

    try:
        result = await quota_service.set(
            u_id,
            QuotaTypeEnum.EXTENSION_DOWNLOAD,
            count,
            device_id=current_user.device_id,
        )
    except AppCommonException as exc:
        if exc.code != CommonCode.QUOTA_INVALID_REQUEST:
            raise
        logger.error(
            "extension_quota_check_fail_open: "
            f"u_id={u_id}, count={count}, error={exc.ext_msg}",
            exc_info=True,
        )
        return ResponseUtils.ok(
            {
                "allowed": True,
                "count": count,
                "used": 0,
                "remaining": -1,
                "status": 1,
                "reset_at": quota_service.next_reset_at(),
            }
        )

    # 配额不足时返回成功响应，但 status=0
    if not result.allowed:
        return ResponseUtils.ok(
            {
                "allowed": False,
                "count": 0,
                "used": result.used,
                "remaining": 0,
                "status": 0,
                "reset_at": result.reset_at,
            }
        )

    return ResponseUtils.ok(
        {
            "allowed": True,
            "count": count,
            "used": result.used,
            "remaining": result.remaining,
            "status": 1,
            "reset_at": result.reset_at,
        }
    )
