"""Website 站点图标 SVG 资源路由。

返回 32×32 透明 SVG：页面以普通 img 正常加载该资源，请求穿透到后端用于
写入设备可信关系（device_trust），但不产生任何可见内容。
`/assets/icons/credits.svg` 是旧版路径，部署过渡期继续兼容；新页面统一使用
`/assets/icons/logo.svg`。
"""

from fastapi import APIRouter, Request, status
from fastapi.responses import Response

from app.exceptions.common_exception import AppCommonException
from app.services.device_service import device_service
from app.utils.common import get_client_ip
from app.utils.device_id import validate_request_device_id
from app.utils.logger import logger

router = APIRouter(tags=["website-assets"])

_CLIENT_UUID_COOKIE_NAME = "client_uuid"
_SVG_HEADERS = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
}
_BRAND_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"></svg>\n'


def _svg_response(status_code: int = status.HTTP_200_OK) -> Response:
    """返回站点图标 SVG 响应，显式禁止缓存和索引。"""
    return Response(
        content=_BRAND_LOGO_SVG,
        status_code=status_code,
        headers=_SVG_HEADERS,
    )


async def _store_device_trust_from_cookie(request: Request) -> None:
    """从 client_uuid Cookie 建立设备可信关系，非法 Cookie 直接忽略。"""
    cookie_device_id = request.cookies.get(_CLIENT_UUID_COOKIE_NAME)
    if not cookie_device_id:
        logger.info(
            "device_trust_set_skipped: reason=missing_client_uuid, "
            "current_ip=%r, path=%s",
            get_client_ip(request),
            request.url.path,
        )
        return

    try:
        device_id = validate_request_device_id(cookie_device_id)
    except AppCommonException as exc:
        logger.info(
            "device_trust_set_skipped: reason=invalid_client_uuid, "
            "device_id=%r, error_code=%s, current_ip=%r, path=%s",
            cookie_device_id,
            exc.code.name,
            get_client_ip(request),
            request.url.path,
        )
        return

    ip = get_client_ip(request)
    if not ip:
        logger.info(
            "device_trust_set_skipped: reason=missing_client_ip, "
            "device_id=%r, path=%s",
            device_id,
            request.url.path,
        )
        return

    await device_service.set(device_id, ip)


@router.get("/assets/icons/logo.svg", include_in_schema=False)
@router.get("/assets/icons/credits.svg", include_in_schema=False)
async def brand_logo_icon(request: Request) -> Response:
    """返回站点图标 SVG，并在 Cookie 合法时建立设备可信关系。"""
    try:
        await _store_device_trust_from_cookie(request)
        return _svg_response()
    except Exception:
        logger.error(
            "brand_logo_svg_failed: unexpected error while serving brand logo svg",
            exc_info=True,
        )
        return _svg_response(status.HTTP_404_NOT_FOUND)
