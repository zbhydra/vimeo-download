"""Website 签到客户端 API。"""

from fastapi import APIRouter, Depends

from app.api.user_dependencies import UserContext, get_current_user
from app.schemas.checkin_schema import CheckinClaimRequest
from app.services.user_checkin_service import user_checkin_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/checkin", tags=["Website 签到"])


@router.post("/entry")
async def enter_checkin_campaign(
    current_user: UserContext = Depends(get_current_user),
):
    """进入签到系统；必须登录，没有活动时创建活动。"""
    status = await user_checkin_service.enter_checkin_campaign(current_user.user_id)
    return ResponseUtils.ok(status.model_dump())


@router.post("/claim")
async def claim_daily_checkin(
    _request: CheckinClaimRequest,
    current_user: UserContext = Depends(get_current_user),
):
    """领取今天签到奖励；请求体必须为空对象。"""
    result = await user_checkin_service.claim_daily_checkin(current_user.user_id)
    return ResponseUtils.ok(result.model_dump())
