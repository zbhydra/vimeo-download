"""媒体下载节点 V2 API。

本 router 只暴露无业务数据库依赖的数据面接口：
1. `POST /api/client/media/parse-v2` 匿名解析，不扣额度。
2. `POST /api/client/media/download-v2` 从 body 读取 media_download token 后执行。
3. `GET /api/client/media/download-v2` 浏览器原生下载入口，从 query
   读取同一个 media_download token 后执行。

路由保持独立，方便业务 role 挂载完整接口、download role 只挂 V2 数据面接口。
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Header, Query, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from starlette.responses import Response as StarletteResponse

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.schemas.media_schema import (
    MEDIA_DOWNLOAD_TOKEN_MAX_LENGTH,
    MEDIA_DOWNLOAD_TOKEN_MIN_LENGTH,
    MediaDownloadV2Request,
    MediaParseResponse,
    MediaParseV2Request,
)
from app.services.media_download_token_service import (
    media_download_token_service,
)
from app.services.media_provider_service import media_provider_service
from app.utils.common import get_client_ip
from app.utils.redis_fixed_limiter import RedisFixedLimiter
from app.utils.response import ResponseUtils

# download-v2 token 和响应材料都不允许被浏览器或代理缓存。
_DOWNLOAD_V2_CACHE_CONTROL = "no-store"
# parse-v2 是真实解析执行入口，按 IP 做节点侧硬限流。
_PARSE_V2_IP_WINDOW_SECONDS = 60
_PARSE_V2_IP_LIMIT = 10
_parse_v2_ip_limiter = RedisFixedLimiter(key_prefix="media_parse_v2_ip")


class _MediaV2NoStoreRoute(APIRoute):
    """为 download-v2 的所有 FastAPI 响应补 no-store。"""

    def get_route_handler(
        self,
    ) -> Callable[[Request], Coroutine[Any, Any, StarletteResponse]]:
        original_handler = super().get_route_handler()

        async def custom_route_handler(request: Request) -> StarletteResponse:
            is_download_v2 = request.url.path.endswith("/download-v2")
            try:
                response = await original_handler(request)
            except RequestValidationError as exc:
                if not is_download_v2:
                    raise
                response = await request_validation_exception_handler(request, exc)
            if is_download_v2:
                response.headers["Cache-Control"] = _DOWNLOAD_V2_CACHE_CONTROL
            return response

        return custom_route_handler


router = APIRouter(
    prefix="/media",
    tags=["Media V2 下载节点"],
    route_class=_MediaV2NoStoreRoute,
)


@router.post("/parse-v2")
async def parse_media_link_v2(payload: MediaParseV2Request, request: Request):
    """
    下载节点匿名解析入口。

    Args:
        payload: 只包含 link 的严格请求体。

    Returns:
        通用 media parse schema 的成功 envelope，或 MEDIA_PARSE_* 错误 envelope。
    """
    client_ip = get_client_ip(request) or "unknown"
    if not await _parse_v2_ip_limiter.is_allowed(
        client_ip,
        limit=_PARSE_V2_IP_LIMIT,
        window=_PARSE_V2_IP_WINDOW_SECONDS,
    ):
        return ResponseUtils.error(
            CommonCode.RATE_LIMIT_EXCEEDED_MEDIA,
            data={"reason": "parse_v2_ip_rate_limited"},
            status_code=_media_v2_error_status_code(
                CommonCode.RATE_LIMIT_EXCEEDED_MEDIA
            ),
        )

    try:
        result = await media_provider_service.parse_v2(
            link=payload.link,
            client_ip=client_ip,
        )
    except AppCommonException as exc:
        return ResponseUtils.error(
            exc.code,
            data=exc.data,
            status_code=_media_v2_error_status_code(exc.code),
        )
    return ResponseUtils.ok(_parse_response_public_dump(result))


@router.post("/download-v2")
async def download_media_resource_v2(
    request: Request,
    payload: MediaDownloadV2Request,
    range_header: str | None = Header(default=None, alias="Range"),
) -> StarletteResponse:
    """
    下载节点 token 执行入口。

    Args:
        payload: 只允许 token 模式；如果混入旧 link/source_id 字段直接拒绝。
        range_header: 浏览器或下载器传入的 HTTP Range。

    Returns:
        direct JSON 或 client_mux JSON 的成功 envelope。
    """
    if payload.link is not None or payload.source_id is not None:
        return _download_v2_error_response(
            CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
            data={"reason": "token_cannot_mix_with_link_or_source_id"},
            status_code=400,
        )

    return await _download_media_resource_v2_by_token(
        request=request,
        token=payload.token,
        range_header=range_header,
    )


@router.get("/download-v2")
async def download_media_resource_v2_browser(
    request: Request,
    token: str = Query(
        ...,
        min_length=MEDIA_DOWNLOAD_TOKEN_MIN_LENGTH,
        max_length=MEDIA_DOWNLOAD_TOKEN_MAX_LENGTH,
    ),
    range_header: str | None = Header(default=None, alias="Range"),
) -> StarletteResponse:
    """
    下载节点浏览器原生下载入口。

    Args:
        token: media_download JWT。GET 入口从 query 读取，供浏览器直接下载。
        range_header: 浏览器或系统下载器自行传入的 HTTP Range；前端不主动控制。

    Returns:
        direct JSON 或 client_mux JSON 的成功 envelope。
    """
    return await _download_media_resource_v2_by_token(
        request=request,
        token=token,
        range_header=range_header,
    )


async def _download_media_resource_v2_by_token(
    *,
    request: Request,
    token: str,
    range_header: str | None,
) -> StarletteResponse:
    """
    复用 download-v2 token 执行流程。

    Args:
        request: 当前 FastAPI 请求。
        token: media_download JWT。
        range_header: 调用方传入的 HTTP Range。

    Returns:
        direct JSON 或 client_mux JSON 的成功 envelope。
    """
    try:
        claims = media_download_token_service.decode_for_download(token)
        result = await media_provider_service.download_v2(
            claims=claims,
            range_header=range_header,
            client_ip=get_client_ip(request) or "unknown",
        )
    except AppCommonException as exc:
        headers: dict[str, str] | None = None
        data = exc.data
        if exc.code == CommonCode.MEDIA_RANGE_NOT_SATISFIABLE:
            content_range = (data or {}).get("content_range")
            if isinstance(content_range, str):
                headers = {"Content-Range": content_range}
        return _download_v2_error_response(
            exc.code,
            data=data,
            status_code=_media_v2_error_status_code(exc.code),
            headers=headers,
        )

    json_response = ResponseUtils.ok(result.payload.model_dump())
    return _with_download_v2_no_store(json_response)


def _with_download_v2_no_store(response: StarletteResponse) -> StarletteResponse:
    """
    为 download-v2 所有响应统一写入 no-store。

    Args:
        response: 成功或错误响应。

    Returns:
        带 Cache-Control 的响应对象。
    """
    response.headers["Cache-Control"] = _DOWNLOAD_V2_CACHE_CONTROL
    return response


def _parse_response_public_dump(response: MediaParseResponse) -> dict:
    """导出 parse-v2 公开 JSON，排除 Provider 内部 resources[].extra。"""
    return response.model_dump(exclude={"resources": {"__all__": {"extra"}}})


def _download_v2_error_response(
    code: CommonCode,
    *,
    data: dict | None = None,
    status_code: int | None = None,
    headers: dict[str, str] | None = None,
) -> StarletteResponse:
    """
    构建 download-v2 错误响应并保留协议头。

    Args:
        code: 业务错误码。
        data: 错误附加数据。
        status_code: HTTP 状态码。
        headers: 额外响应头，例如 Range 416 的 Content-Range。

    Returns:
        带 Cache-Control: no-store 的错误响应。
    """
    response = ResponseUtils.error(
        code,
        data=data,
        status_code=status_code or _media_v2_error_status_code(code),
    )
    for name, value in (headers or {}).items():
        response.headers[name] = value
    return _with_download_v2_no_store(response)


def _media_v2_error_status_code(code: CommonCode) -> int:
    """
    V2 错误码到 HTTP 状态的显式映射。

    Args:
        code: CommonCode 错误码。

    Returns:
        HTTP 状态码。
    """
    if code == CommonCode.MEDIA_RANGE_NOT_SATISFIABLE:
        return 416
    return 200
