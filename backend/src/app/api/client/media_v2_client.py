"""媒体 parse-v2 执行节点 API。

parse-pre-v2 在业务节点签发加密代理执行 token；本路由验签后只执行一次 Vimeo
解析，并把完整材料封进加密 resource token。下载材料由 business 的
download-pre-v2 返回，执行节点不承载下载授权。
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.exceptions.common_exception import AppCommonException
from app.schemas.media_schema import MediaParseResponse, MediaParseV2Request
from app.services.media_execution_token_service import media_execution_token_service
from app.services.media_provider_service import media_provider_service
from app.utils.common import get_client_ip
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/media", tags=["Media parse-v2 执行节点"])


@router.post("/parse-v2")
async def parse_media_link_v2(payload: MediaParseV2Request, request: Request):
    """验证代理执行 token 并完成单次 Vimeo 解析。"""
    try:
        claims = media_execution_token_service.decode_proxy_token(payload.token)
        result = await media_provider_service.parse_v2(
            link=claims.link,
            proxy_url=claims.proxy_url,
            client_ip=get_client_ip(request) or "unknown",
        )
    except AppCommonException as exc:
        return ResponseUtils.error(exc.code, data=exc.data)
    return ResponseUtils.ok(_parse_response_public_dump(result))


def _parse_response_public_dump(response: MediaParseResponse) -> dict:
    """导出解析元数据，材料只保留在加密 resource token 内。"""
    return response.model_dump(exclude={"resources": {"__all__": {"extra"}}})
