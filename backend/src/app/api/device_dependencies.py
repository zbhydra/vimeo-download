"""客户端设备相关 FastAPI 依赖。"""

from typing import NoReturn

from fastapi import Header, Request

from app.constants.client_product import ClientProductEnum
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.device_service import device_service
from app.utils.common import get_client_ip
from app.utils.logger import logger


def _is_extension_request(request: Request) -> bool:
    """判断请求是否显式声明来自扩展。

    只比对字面量，不能用 `normalize_client_product`：它对缺失头与无法识别的值
    都返回默认域 extension，等于把无头请求和伪造头一并放行，闸门整体架空。
    """

    raw_product = request.headers.get("X-Client-Product")
    if not raw_product:
        return False
    return raw_product.strip().lower() == ClientProductEnum.EXTENSION.value


def _raise_auth_page_refresh_required(
    *,
    operation: str,
    reason: str,
    request: Request,
    device_id: str | None,
    ip: str | None,
    logo_ip: str | None,
) -> NoReturn:
    """设备可信关系校验失败时统一要求用户刷新页面。"""
    raise AppCommonException(
        code=CommonCode.AUTH_PAGE_REFRESH_REQUIRED,
        ext_msg=(
            "device_dependencies.require_trusted_client_device: "
            "device trust check failed: "
            f"operation={operation}, reason={reason}, device_id={device_id!r}, "
            f"current_ip={ip!r}, logo_ip={logo_ip!r}, path={request.url.path}"
        ),
    )


async def require_trusted_client_device(
    *,
    request: Request,
    device_id: str | None,
    operation: str,
) -> None:
    """校验重要客户端入口必须来自最近加载过 Website 页面的设备。

    扩展来源跳过校验：插件设备使用自己生成的 UUID，唯一的可信记录写入通道是
    Website 页面读 `client_uuid` Cookie，跨站请求既带不上该 Cookie 也不会加载
    品牌 Logo，开关一旦打开插件请求会 100% 被拒。豁免只认显式声明的请求头，
    不带该头的请求（网站与第三方）照旧走完整校验。
    """

    if _is_extension_request(request):
        logger.info(
            "device_trust_bypassed_for_extension: operation=%s, device_id=%r, "
            "path=%s",
            operation,
            device_id,
            request.url.path,
        )
        return

    verify_result = await device_service.verify_request_device(
        device_id=device_id,
        ip=get_client_ip(request),
    )
    if not verify_result.trusted:
        _raise_auth_page_refresh_required(
            operation=operation,
            reason=verify_result.reason,
            request=request,
            device_id=verify_result.device_id,
            ip=verify_result.ip,
            logo_ip=verify_result.logo_ip,
        )


async def require_parse_pre_v2_trusted_client_device(
    request: Request,
    x_device_id: str | None = Header(None, alias="X-Device-Id"),
) -> None:
    """在 parse-pre-v2 用户上下文依赖前完成设备可信校验。"""
    await require_trusted_client_device(
        request=request,
        device_id=x_device_id,
        operation="parse_media_pre_v2",
    )


async def require_download_pre_v2_trusted_client_device(
    request: Request,
    x_device_id: str | None = Header(None, alias="X-Device-Id"),
) -> None:
    """在 download-pre-v2 登录用户依赖前完成设备可信校验。"""
    await require_trusted_client_device(
        request=request,
        device_id=x_device_id,
        operation="download_pre_v2",
    )
