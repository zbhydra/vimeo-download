"""媒体 Provider 编排服务。

本服务是 parse-v2/download-v2 的公共治理层：Provider 查找、resource token
签发、active-limited 并发计数、结果契约校验和错误映射都在这里完成。
"""

from __future__ import annotations

from app.constants.media_download import MEDIA_DOWNLOAD_MAX_SIZE_BYTES
from app.contracts.media_download import MediaDownloadTokenClaims
from app.contracts.media_platform import detect_platform
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.media import get_media_provider
from app.provider.media.base_media import (
    BaseMedia,
    JsonDownloadResult,
    MediaDownloadRequest,
    MediaParseRequest,
    MediaProviderError,
    MediaProviderErrorCode,
)
from app.schemas.media_schema import (
    MediaClientMuxDownloadIntentResponse,
    MediaDirectDownloadIntentResponse,
    MediaParseResponse,
)
from app.services.media_active_download_service import (
    ActiveDownloadGuard,
    media_active_download_service,
)
from app.services.media_resource_token_service import media_resource_token_service
from app.utils.logger import logger
from app.utils.media_extra import normalize_media_extra


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

        self._attach_resource_tokens(response)
        _log_empty_parse_result(link=link, response=response)
        return response

    async def download_v2(
        self,
        *,
        claims: MediaDownloadTokenClaims,
        range_header: str | None,
        client_ip: str | None = None,
    ) -> JsonDownloadResult:
        """
        执行 download-v2，统一处理 Provider policy、active guard 与 contract 校验。

        Args:
            claims: 已验签的 media_download claims。
            range_header: 原始 HTTP Range header。
            client_ip: API 层解析出的客户端 IP。
        """
        provider = get_media_provider(claims.platform)
        if provider is None:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
                ext_msg=(
                    "media_provider_download_v2: provider missing, "
                    f"platform={claims.platform}, jti={claims.jti}"
                ),
                data={"reason": "provider_missing"},
            )
        if claims.size is not None and claims.size > MEDIA_DOWNLOAD_MAX_SIZE_BYTES:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE,
                ext_msg=(
                    "media_provider_download_v2: token size exceeds 4GiB, "
                    f"jti={claims.jti}, sid={claims.sid}, size={claims.size}"
                ),
            )

        active_guard: ActiveDownloadGuard | None = None
        try:
            if provider.policy.active_limited:
                active_guard = media_active_download_service.acquire(
                    _active_user_key(claims), claims.active_download_limit
                )

            result = await provider.download(
                MediaDownloadRequest(
                    claims=claims,
                    range_header=range_header,
                    client_ip=client_ip or "unknown",
                    extra=claims.extra,
                )
            )
            _validate_result_contract(claims=claims, result=result)
            _reject_json_size_too_large(result=result, claims=claims)
            return result
        except AppCommonException:
            raise
        except MediaProviderError as exc:
            raise _map_download_provider_error(exc, claims=claims) from exc
        except Exception as exc:
            logger.error(
                "media_provider_download_v2_unexpected: "
                f"jti={claims.jti}, platform={claims.platform}, "
                f"mode={claims.download_mode}, error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
                ext_msg=(
                    "media_provider_download_v2: unexpected failure, "
                    f"jti={claims.jti}, platform={claims.platform}, "
                    f"mode={claims.download_mode}, error={type(exc).__name__}: {exc}"
                ),
            ) from exc
        finally:
            if active_guard is not None:
                active_guard.release()

    def _attach_resource_tokens(self, response: MediaParseResponse) -> None:
        """把每个资源的内部 extra 签入 resource token。"""
        for resource in response.resources:
            if not resource.capabilities.download:
                continue
            extra = normalize_media_extra(
                resource.extra,
                code=CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE,
                source=(
                    "media_provider_parse_v2.attach_resource_tokens:"
                    f"{response.platform}:{resource.source_id}"
                ),
            )
            resource.resource_token = media_resource_token_service.issue_token(
                platform=resource.platform,
                canonical_link=response.canonical_link,
                source_id=resource.source_id,
                download_mode=resource.download_mode,
                filename=resource.filename,
                mime_type=resource.mime_type,
                size=resource.size,
                extra=extra,
            )


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


def _map_download_provider_error(
    exc: MediaProviderError,
    *,
    claims: MediaDownloadTokenClaims,
) -> AppCommonException:
    """把 Provider download 错误映射为公开 CommonCode。"""
    if exc.code == MediaProviderErrorCode.RANGE_NOT_SATISFIABLE:
        return AppCommonException(
            CommonCode.MEDIA_RANGE_NOT_SATISFIABLE,
            ext_msg=exc.message,
            data=exc.data,
        )
    if exc.code == MediaProviderErrorCode.FILE_TOO_LARGE:
        return AppCommonException(
            CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE,
            ext_msg=exc.message,
            data=exc.data,
        )
    if exc.code in {
        MediaProviderErrorCode.RESOURCE_NOT_FOUND,
        MediaProviderErrorCode.RESOURCE_UNREACHABLE,
        MediaProviderErrorCode.REQUIRES_CLIENT,
    }:
        return AppCommonException(
            CommonCode.MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE,
            ext_msg=exc.message,
            data=exc.data,
        )
    return AppCommonException(
        CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
        ext_msg=(
            "media_provider_download_v2: provider unavailable or contract failed, "
            f"jti={claims.jti}, platform={claims.platform}, "
            f"mode={claims.download_mode}, detail={exc.message}"
        ),
        data=exc.data,
    )


def _validate_result_contract(
    *,
    claims: MediaDownloadTokenClaims,
    result: JsonDownloadResult,
) -> None:
    """校验 token download_mode 与 Provider JSON payload 类型匹配。"""
    if claims.download_mode == "direct" and isinstance(
        result.payload,
        MediaDirectDownloadIntentResponse,
    ):
        return
    if claims.download_mode == "client_mux" and isinstance(
        result.payload,
        MediaClientMuxDownloadIntentResponse,
    ):
        return
    raise MediaProviderError(
        MediaProviderErrorCode.NODE_UNAVAILABLE,
        (
            "media_provider_download_v2: JSON payload mismatches download_mode, "
            f"jti={claims.jti}, platform={claims.platform}, "
            f"mode={claims.download_mode}, payload={type(result.payload).__name__}"
        ),
    )


def _reject_json_size_too_large(
    *,
    result: JsonDownloadResult,
    claims: MediaDownloadTokenClaims,
) -> None:
    """校验 direct/client_mux Provider 返回的真实大小不超过 4GiB。"""
    size = result.payload.size
    if size is not None and size > MEDIA_DOWNLOAD_MAX_SIZE_BYTES:
        raise AppCommonException(
            CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE,
            ext_msg=(
                "media_provider_download_v2: JSON payload size exceeds 4GiB, "
                f"jti={claims.jti}, sid={claims.sid}, "
                f"mode={claims.download_mode}, size={size}"
            ),
        )


def _active_user_key(claims: MediaDownloadTokenClaims) -> str:
    """从 media_download claims 生成活跃下载 key。"""
    if claims.uid is not None and claims.uid > 0:
        return f"user:{claims.uid}"
    if claims.device_id:
        return f"device:{claims.device_id}"
    return f"token:{claims.jti}"


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
