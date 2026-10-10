"""媒体 V2 Pre 控制面 API。

本 router 只允许 business role 挂载：
1. `POST /api/client/media/parse-pre-v2` 返回单个 parse-v2 节点和代理执行 token。
2. `POST /api/client/media/download-pre-v2` 验证材料、扣额度并直接返回材料。

download role 禁止挂载本 router，因为它会导入业务数据库和 Redis 配额路径。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.device_dependencies import (
    require_download_pre_v2_trusted_client_device,
    require_parse_pre_v2_trusted_client_device,
)
from app.api.user_dependencies import (
    UserContext,
    get_current_user,
    get_current_user_optional,
)
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.schemas.media_schema import (
    MediaDownloadPreV2Request,
    MediaDownloadPreV2Response,
    MediaParsePreV2Request,
    MediaParsePreV2Response,
    MediaPreNodeResponse,
)
from app.services.media_pre_authorization_service import media_pre_authorization_service
from app.services.media_anonymous_download_service import (
    media_anonymous_download_service,
)
from app.services.media_service import media_service
from app.utils.logger import logger
from app.utils.response import ResponseUtils
from app.utils.redis_fixed_limiter import RedisFixedLimiter

router = APIRouter(prefix="/media", tags=["Media V2 控制面"])
# parse-pre-v2 匿名 IP 限流窗口，秒。
_PARSE_PRE_V2_IP_WINDOW_SECONDS = 60
# parse-pre-v2 单 IP 每窗口最多请求次数。
_PARSE_PRE_V2_IP_LIMIT = 60
_parse_pre_v2_ip_limiter = RedisFixedLimiter(key_prefix="media_parse_pre_v2")


@router.post("/parse-pre-v2")
async def parse_media_pre_v2(
    payload: MediaParsePreV2Request,
    _device_trust: None = Depends(require_parse_pre_v2_trusted_client_device),
    current_user: UserContext = Depends(get_current_user_optional),
):
    """
    返回单个 parse-v2 节点和加密代理执行 token。

    Args:
        payload: 包含 link 的请求体。
        current_user: 请求上下文，提供统一解析后的 IP。

    Returns:
        成功 envelope，data 为 MediaParsePreV2Response。
    """
    try:
        allowed = await _parse_pre_v2_ip_limiter.is_allowed(
            current_user.ip or "unknown",
            limit=_PARSE_PRE_V2_IP_LIMIT,
            window=_PARSE_PRE_V2_IP_WINDOW_SECONDS,
        )
    except Exception as exc:
        logger.error("parse_pre_v2_ip_limiter_failed", exc_info=True)
        raise AppCommonException(
            CommonCode.MEDIA_SERVICE_NODE_UNAVAILABLE,
            ext_msg=f"parse_pre_v2: IP limiter unavailable, error={type(exc).__name__}: {exc}",
        ) from exc
    if not allowed:
        return ResponseUtils.error(
            CommonCode.MEDIA_SERVICE_NODE_UNAVAILABLE,
            data={"reason": "parse_pre_v2_ip_rate_limited"},
        )

    result = await media_pre_authorization_service.parse_pre_v2(link=payload.link)
    response = MediaParsePreV2Response(
        node=MediaPreNodeResponse(node_id=result.node.node_id, url=result.node.url),
        token=result.token,
    )
    return ResponseUtils.ok(response.model_dump())


@router.post("/download-anonymous-pre-v2")
async def create_media_download_anonymous_pre_v2(
    payload: MediaDownloadPreV2Request,
    _device_trust: None = Depends(require_download_pre_v2_trusted_client_device),
    current_user: UserContext = Depends(get_current_user_optional),
):
    """校验设备及资源，返回匿名放行、等待或需要登录的成功响应。"""
    device_id = current_user.validated_device_id()
    validated_payload = media_pre_authorization_service.validate_download_pre_payload(
        payload
    )
    result = await media_anonymous_download_service.authorize(
        payload=validated_payload,
        user_context=current_user,
        device_id=device_id,
    )
    return ResponseUtils.ok(result.model_dump(exclude_none=True))


@router.post("/download-pre-v2")
async def create_media_download_pre_v2(
    payload: MediaDownloadPreV2Request,
    _device_trust: None = Depends(require_download_pre_v2_trusted_client_device),
    current_user: UserContext = Depends(get_current_user),
):
    """
    验证完整材料并创建登录下载扣费记录。

    Args:
        payload: parse-v2 resource token 和节点亲和提示。
        current_user: 已登录用户上下文；download-pre-v2 只允许登录用户。

    Returns:
        成功 envelope，data 为 MediaDownloadPreV2Response。
    """
    async with media_pre_authorization_service.download_pre_v2_user_lock(
        user_context=current_user
    ):
        validated_payload = (
            media_pre_authorization_service.validate_download_pre_payload(payload)
        )
        charge_result = await media_service.charge_download(
            user_id=current_user.user_id,
            platform=validated_payload.platform,
            canonical_link=validated_payload.link,
            source_id=validated_payload.source_id,
            download_mode=validated_payload.download_mode,
            filename=validated_payload.filename,
            size_bytes=validated_payload.size,
        )
        if not charge_result.allowed:
            raise AppCommonException(
                CommonCode.CREDIT_INSUFFICIENT,
                ext_msg=(
                    "download_pre_v2: Credits insufficient or account missing, "
                    f"user_id={current_user.user_id}, "
                    f"resource_key={charge_result.resource_key}, "
                    f"cost={charge_result.cost}, balance={charge_result.balance}"
                ),
                data={
                    "credits_cost": charge_result.cost,
                    "credits_balance": charge_result.balance,
                    "resource_key": charge_result.resource_key,
                },
            )

    response = MediaDownloadPreV2Response(
        credits_balance=charge_result.balance,
        material=validated_payload.material,
    )
    return ResponseUtils.ok(response.model_dump())
