"""打点 API - 客户端接口"""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.user_dependencies import (
    UserContext,
    get_current_user_optional,
)
from app.constants.mark import MAX_MARK_MSG_LENGTH, MarkType
from app.services.mark_service import mark_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/mark", tags=["打点系统"])


class RecordMarkRequest(BaseModel):
    """记录打点请求"""

    mark_type: MarkType = Field(..., description="打点类型")
    mark_msg: str = Field(
        default="",
        max_length=MAX_MARK_MSG_LENGTH,
        description="打点附加信息",
    )
    first_opened_at: int = Field(
        default=0,
        ge=0,
        description="首次打开网站时间（毫秒时间戳；插件/旧客户端默认0）",
    )


@router.post("/record")
async def record_mark(
    request: RecordMarkRequest,
    http_request: Request,
    current_user: UserContext | None = Depends(get_current_user_optional),
) -> JSONResponse:
    """
    记录打点日志

    - 已登录用户使用 user_id
    - 未登录用户使用 device_id
    - 请求校验失败返回 422；持久化失败返回成功，不中断前端业务
    """
    if current_user is None:
        return ResponseUtils.ok({"recorded": True})

    await mark_service.record_mark(
        mark_type=request.mark_type.value,
        mark_msg=request.mark_msg,
        first_opened_at=request.first_opened_at,
        user_id=current_user.user_id,
        device_id=current_user.device_id,
        client_ip=current_user.ip,
        language=current_user.language,
        user_agent=http_request.headers.get("user-agent"),
    )

    return ResponseUtils.ok({"recorded": True})
