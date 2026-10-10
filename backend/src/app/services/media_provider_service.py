"""媒体 Provider 编排服务。

本服务负责 parse-v2 的 Provider 查找、代理执行和加密 resource token 签发；
下载材料在业务预授权阶段验签并直接返回。
"""

from __future__ import annotations

from app.contracts.media_platform import detect_platform
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.media import get_media_provider
from app.provider.media.base_media import (
    BaseMedia,
    MediaParseRequest,
    MediaProviderError,
    MediaProviderErrorCode,
)
from app.schemas.media_schema import MediaParseResponse
from app.services.media_execution_token_service import media_execution_token_service
from app.utils.logger import logger


class MediaProviderService:
    """媒体 Provider 统一编排服务。"""

    def get_provider(self, platform: str) -> BaseMedia:
        """
        获取平台 Provider。

        Args:
            platform: 平台标识。

        Raises:
            AppCommonException: 当前节点 registry 缺失该 Provider。
        """
        provider = get_media_provider(platform)
        if provider is None:
            raise AppCommonException(
                CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE,
                ext_msg=f"media_provider.get_provider: provider missing, platform={platform}",
                data={"reason": "provider_missing"},
            )
        return provider

    async def parse_v2(
        self,
        *,
        link: str,
        proxy_url: str,
        user_id: int | None = None,
        device_id: str | None = None,
        client_ip: str | None = None,
    ) -> MediaParseResponse:
        """
        执行 parse-v2 并给可下载资源签发 resource token。

        Args:
            link: 用户提交的媒体链接。
            user_id: 已登录用户 ID；匿名时为 None。
            device_id: 游客设备 ID。
            client_ip: API 层解析出的客户端 IP。
        """
        if not link or not link.strip():
            raise AppCommonException(
                CommonCode.MEDIA_PARSE_INVALID_LINK,
                ext_msg="media_provider_parse_v2: link is empty",
            )
        try:
            platform = detect_platform(link)
        except AppCommonException as exc:
            raise _map_detect_platform_error(exc) from exc

        provider = get_media_provider(platform)
        if provider is None:
            raise AppCommonException(
                CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE,
                ext_msg=f"media_provider_parse_v2: provider missing, platform={platform}",
                data={"reason": "provider_missing"},
            )

        try:
            result = await provider.parse(
                MediaParseRequest(
                    url=link,
                    user_id=user_id,
                    device_id=device_id,
                    client_ip=client_ip or "unknown",
                    proxy_url=proxy_url,
                )
            )
        except MediaProviderError as exc:
            raise _map_parse_provider_error(exc, platform=platform, link=link) from exc

        response = result.response.model_copy(deep=True)
        if response.status == "requires_client":
            raise AppCommonException(
                CommonCode.MEDIA_PARSE_REQUIRES_CLIENT,
                ext_msg=(
                    "media_provider_parse_v2: parse requires client, "
                    f"platform={response.platform}, reason={response.reason or ''}"
                ),
                data={
                    "status": response.status,
                    "platform": response.platform,
                    "original_link": response.original_link,
                    "canonical_link": response.canonical_link,
                    "reason": response.reason or "",
                },
            )

        for resource in response.resources:
            if resource.capabilities.download:
                resource.resource_token = (
                    media_execution_token_service.issue_resource_token(
                        platform=resource.platform,
                        canonical_link=response.canonical_link,
                        source_id=resource.source_id,
                        download_mode=resource.download_mode,
                        filename=resource.filename,
                        mime_type=resource.mime_type,
                        size=resource.size,
                        material=result.material,
                    )
                )
        _log_empty_parse_result(link=link, response=response)
        return response


def _map_detect_platform_error(exc: AppCommonException) -> AppCommonException:
    """把平台识别失败映射为 parse-v2 unsupported platform。"""
    if exc.code == CommonCode.MEDIA_PLATFORM_UNSUPPORTED:
        return AppCommonException(
            CommonCode.MEDIA_PARSE_UNSUPPORTED_PLATFORM,
            ext_msg=exc.ext_msg,
            data=exc.data,
        )
    return exc


def _map_parse_provider_error(
    exc: MediaProviderError,
    *,
    platform: str,
    link: str,
) -> AppCommonException:
    """把 Provider parse 错误映射为公开 CommonCode。"""
    if exc.code == MediaProviderErrorCode.UNSUPPORTED_PLATFORM:
        return AppCommonException(
            CommonCode.MEDIA_PARSE_UNSUPPORTED_PLATFORM,
            ext_msg=exc.message,
            data=exc.data,
        )
    if exc.code == MediaProviderErrorCode.INVALID_LINK:
        return AppCommonException(
            CommonCode.MEDIA_PARSE_INVALID_LINK,
            ext_msg=exc.message,
            data=exc.data,
        )
    if exc.code == MediaProviderErrorCode.REQUIRES_CLIENT:
        return AppCommonException(
            CommonCode.MEDIA_PARSE_REQUIRES_CLIENT,
            ext_msg=exc.message,
            data=exc.data,
        )
    if exc.code in {
        MediaProviderErrorCode.RESOURCE_NOT_FOUND,
        MediaProviderErrorCode.RESOURCE_UNREACHABLE,
    }:
        _log_parse_resource_not_found(platform=platform, link=link, exc=exc)
        return AppCommonException(
            CommonCode.MEDIA_PARSE_RESOURCE_NOT_FOUND,
            ext_msg=exc.message,
            data=exc.data,
        )
    return AppCommonException(
        CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE,
        ext_msg=exc.message,
        data=exc.data,
    )


def _log_empty_parse_result(
    *,
    link: str,
    response: MediaParseResponse,
) -> None:
    """记录成功响应里没有可下载资源的解析结果，便于定位空结果。"""
    resource_count = len(response.resources)
    downloadable_count = sum(
        1 for resource in response.resources if resource.capabilities.download
    )
    if downloadable_count > 0:
        return
    post_content_id = response.post.content_id if response.post else "<none>"
    logger.info(
        "media_provider_parse_v2_empty_result: "
        f"platform={response.platform}, status={response.status}, "
        f"resource_count={resource_count}, downloadable_count={downloadable_count}, "
        f"original_link={link[:256]}, canonical_link={response.canonical_link[:256]}, "
        f"post_content_id={post_content_id}"
    )


def _log_parse_resource_not_found(
    *,
    platform: str,
    link: str,
    exc: MediaProviderError,
) -> None:
    """记录 parse resource not found 的平台上下文。"""
    logger.info(
        "media_provider_parse_v2_resource_not_found: "
        f"platform={platform}, original_code={exc.code.value}, "
        f"link={link[:256]}, message={exc.message[:512]!r}, data={exc.data}"
    )


media_provider_service = MediaProviderService()
