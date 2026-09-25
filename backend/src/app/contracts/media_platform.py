"""媒体平台识别契约。

本模块只放平台合同值和 URL 平台识别逻辑，供 service 编排层与 Provider 共同使用。
"""

from __future__ import annotations

from urllib.parse import urlparse

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode

# 平台合同值：Vimeo direct 下载与 client_mux 多轨合成。
PLATFORM_VIMEO = "vimeo"

# Vimeo 域名白名单，用于 URL host 平台识别。
_VIMEO_HOSTS = frozenset({"vimeo.com", "www.vimeo.com", "player.vimeo.com"})


def _normalize_host(host: str) -> str:
    """
    规范化 host：去尾部点号，转小写。

    Args:
        host: 原始 host。

    Returns:
        规范化后的 host。
    """
    return host.rstrip(".").lower()


def detect_platform(link: str) -> str:
    """
    通过 URL host 识别链接所属平台。

    Args:
        link: 完整 URL 字符串。

    Returns:
        平台标识字符串。

    Raises:
        AppCommonException: 链接不属于 Vimeo。
    """
    try:
        parsed = urlparse(link)
        host = parsed.hostname or ""
    except Exception as exc:
        raise AppCommonException(
            CommonCode.MEDIA_PLATFORM_UNSUPPORTED,
            ext_msg=f"detect_platform: failed to parse URL: {link}",
        ) from exc

    normalized = _normalize_host(host)

    if normalized in _VIMEO_HOSTS:
        return PLATFORM_VIMEO

    raise AppCommonException(
        CommonCode.MEDIA_PLATFORM_UNSUPPORTED,
        ext_msg=f"detect_platform: unsupported host={normalized}, link={link}",
    )
