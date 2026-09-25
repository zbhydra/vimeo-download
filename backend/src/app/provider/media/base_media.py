"""媒体 Provider 契约层。

Provider 只描述单个平台如何解析和生成下载材料；用户活跃下载、
Range 错误映射和 FastAPI Response 生成由 service/API 统一处理。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import ClassVar, Literal, Protocol, TypeAlias

from app.contracts.media_download import MediaDownloadTokenClaims
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.schemas.media_schema import (
    MediaClientMuxDownloadIntentResponse,
    MediaClientMuxTrackResponse,
    MediaDirectDownloadIntentResponse,
    MediaParseResponse,
)
from app.utils.logger import logger
from app.utils.media_extra import JsonValue, MediaExtra

DownloadJsonPayload: TypeAlias = (
    MediaDirectDownloadIntentResponse | MediaClientMuxDownloadIntentResponse
)


class DirectDownloadContext(Protocol):
    """direct intent service 返回的公共字段。"""

    @property
    def source_id(self) -> str: ...

    @property
    def download_url(self) -> str: ...

    @property
    def filename(self) -> str: ...

    @property
    def mime_type(self) -> str | None: ...

    @property
    def size(self) -> int | None: ...

    @property
    def expires_at(self) -> int | None: ...


class ClientMuxDownloadContext(Protocol):
    """client_mux intent service 返回的公共字段。"""

    @property
    def source_id(self) -> str: ...

    @property
    def filename(self) -> str: ...

    @property
    def mime_type(self) -> str: ...

    @property
    def size(self) -> int | None: ...

    @property
    def expires_at(self) -> int | None: ...

    @property
    def video_track(self) -> MediaClientMuxTrackResponse: ...

    @property
    def audio_track(self) -> MediaClientMuxTrackResponse: ...


@dataclass(frozen=True, slots=True)
class ProviderPolicy:
    """Provider 下载治理策略声明。"""

    active_limited: bool = True


@dataclass(frozen=True, slots=True)
class MediaParseRequest:
    """Provider parse 请求上下文。"""

    url: str
    user_id: int | None
    device_id: str | None
    client_ip: str


@dataclass(frozen=True, slots=True)
class MediaDownloadRequest:
    """Provider download 请求上下文。"""

    claims: MediaDownloadTokenClaims
    range_header: str | None
    client_ip: str
    extra: MediaExtra


@dataclass(frozen=True, slots=True)
class MediaParseResult:
    """Provider parse 结果，response.resources.extra 为内部字段。"""

    response: MediaParseResponse


@dataclass(frozen=True, slots=True)
class JsonDownloadResult:
    """Provider 返回给前端执行的 JSON 下载材料。"""

    payload: DownloadJsonPayload


class MediaProviderErrorCode(StrEnum):
    """Provider 统一错误码。"""

    INVALID_LINK = "invalid_link"
    UNSUPPORTED_PLATFORM = "unsupported_platform"
    UNSUPPORTED_DOWNLOAD_MODE = "unsupported_download_mode"
    REQUIRES_CLIENT = "requires_client"
    RESOURCE_NOT_FOUND = "resource_not_found"
    RESOURCE_UNREACHABLE = "resource_unreachable"
    NODE_UNAVAILABLE = "node_unavailable"
    RANGE_NOT_SATISFIABLE = "range_not_satisfiable"
    FILE_TOO_LARGE = "file_too_large"
    UPSTREAM_FAILED = "upstream_failed"


class MediaProviderError(Exception):
    """Provider 边界内的统一异常。"""

    def __init__(
        self,
        code: MediaProviderErrorCode,
        message: str,
        *,
        data: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data or {}


class BaseMedia:
    """媒体 Provider 基类。"""

    platform: ClassVar[str]
    policy: ClassVar[ProviderPolicy] = ProviderPolicy()

    async def parse(self, request: MediaParseRequest) -> MediaParseResult:
        """执行平台解析，并把旧 AppCommonException 收敛为 Provider 错误。"""
        try:
            return await self._parse(request)
        except MediaProviderError:
            raise
        except AppCommonException as exc:
            raise _map_legacy_parse_error(exc) from exc
        except Exception as exc:
            logger.error(
                "media_provider_parse_unexpected: "
                f"platform={self.platform}, error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise MediaProviderError(
                MediaProviderErrorCode.NODE_UNAVAILABLE,
                (
                    "media_provider_parse: unexpected failure, "
                    f"platform={self.platform}, error={type(exc).__name__}: {exc}"
                ),
            ) from exc

    async def download(self, request: MediaDownloadRequest) -> JsonDownloadResult:
        """执行平台下载，并把旧 AppCommonException 收敛为 Provider 错误。"""
        try:
            return await self._download(request)
        except MediaProviderError:
            raise
        except AppCommonException as exc:
            raise _map_legacy_download_error(exc) from exc
        except Exception as exc:
            logger.error(
                "media_provider_download_unexpected: "
                f"platform={self.platform}, jti={request.claims.jti}, "
                f"error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise MediaProviderError(
                MediaProviderErrorCode.NODE_UNAVAILABLE,
                (
                    "media_provider_download: unexpected failure, "
                    f"platform={self.platform}, jti={request.claims.jti}, "
                    f"error={type(exc).__name__}: {exc}"
                ),
            ) from exc

    async def _parse(self, request: MediaParseRequest) -> MediaParseResult:
        """子类实现平台 parse。"""
        raise NotImplementedError

    async def _download(self, request: MediaDownloadRequest) -> JsonDownloadResult:
        """子类实现平台 download。"""
        raise NotImplementedError


def parse_user_or_device_key(request: MediaParseRequest) -> str:
    """按 user -> device -> IP 顺序构造平台解析限流身份。"""
    if request.user_id is not None and request.user_id > 0:
        return str(request.user_id)
    if request.device_id:
        return request.device_id
    return request.client_ip or "anonymous"


def json_value_as_str(value: JsonValue | None) -> str | None:
    """从 extra 中读取字符串 hint。"""
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def build_direct_json_result(
    *,
    context: DirectDownloadContext,
    platform: Literal["vimeo"],
) -> JsonDownloadResult:
    """把 direct intent context 转成公开 JSON result。"""
    return JsonDownloadResult(
        payload=MediaDirectDownloadIntentResponse(
            source_id=context.source_id,
            platform=platform,
            download_mode="direct",
            download_url=context.download_url,
            filename=context.filename,
            mime_type=context.mime_type,
            size=context.size,
            expires_at=context.expires_at,
        )
    )


def build_client_mux_json_result(
    *,
    context: ClientMuxDownloadContext,
    platform: Literal["vimeo"],
) -> JsonDownloadResult:
    """把 client_mux intent context 转成公开 JSON result。"""
    return JsonDownloadResult(
        payload=MediaClientMuxDownloadIntentResponse(
            source_id=context.source_id,
            platform=platform,
            download_mode="client_mux",
            filename=context.filename,
            mime_type=context.mime_type,
            size=context.size,
            expires_at=context.expires_at,
            video_track=context.video_track,
            audio_track=context.audio_track,
        )
    )


def _map_legacy_parse_error(exc: AppCommonException) -> MediaProviderError:
    """把存量平台 parse 错误映射到 Provider 错误。"""
    if exc.code in {
        CommonCode.INVALID_REQUEST,
        CommonCode.VALIDATION_ERROR,
    }:
        return MediaProviderError(
            MediaProviderErrorCode.INVALID_LINK,
            exc.ext_msg or "invalid media link",
            data=exc.data,
        )
    if exc.code == CommonCode.MEDIA_PLATFORM_UNSUPPORTED:
        return MediaProviderError(
            MediaProviderErrorCode.UNSUPPORTED_PLATFORM,
            exc.ext_msg or "unsupported platform",
            data=exc.data,
        )
    if exc.code == CommonCode.MEDIA_PARSE_REQUIRES_CLIENT:
        return MediaProviderError(
            MediaProviderErrorCode.REQUIRES_CLIENT,
            exc.ext_msg or "parse requires client",
            data=exc.data,
        )
    if exc.code in {
        CommonCode.NOT_FOUND,
        CommonCode.VIMEO_PARSE_FAILED,
    }:
        return MediaProviderError(
            MediaProviderErrorCode.RESOURCE_NOT_FOUND,
            exc.ext_msg or "media resource not found",
            data=exc.data,
        )
    if exc.code in {
        CommonCode.RATE_LIMIT_EXCEEDED,
        CommonCode.RATE_LIMIT_EXCEEDED_MEDIA,
        CommonCode.PERMISSION_DENIED,
        CommonCode.INTERNAL_SERVER_ERROR,
        CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE,
    }:
        return MediaProviderError(
            MediaProviderErrorCode.NODE_UNAVAILABLE,
            exc.ext_msg or "media parse node unavailable",
            data=exc.data,
        )
    return MediaProviderError(
        MediaProviderErrorCode.NODE_UNAVAILABLE,
        exc.ext_msg or f"unmapped parse error: {exc.code.name}",
        data=exc.data,
    )


def _map_legacy_download_error(exc: AppCommonException) -> MediaProviderError:
    """把存量平台 download 错误映射到 Provider 错误。"""
    if exc.code == CommonCode.MEDIA_RANGE_NOT_SATISFIABLE:
        return MediaProviderError(
            MediaProviderErrorCode.RANGE_NOT_SATISFIABLE,
            exc.ext_msg or "range not satisfiable",
            data=exc.data,
        )
    if exc.code == CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE:
        return MediaProviderError(
            MediaProviderErrorCode.FILE_TOO_LARGE,
            exc.ext_msg or "media file too large",
            data=exc.data,
        )
    if exc.code in {
        CommonCode.NOT_FOUND,
        CommonCode.SOURCE_FORBIDDEN,
        CommonCode.INVALID_REQUEST,
        CommonCode.VIMEO_PARSE_FAILED,
    }:
        return MediaProviderError(
            MediaProviderErrorCode.RESOURCE_UNREACHABLE,
            exc.ext_msg or "media resource unreachable",
            data=exc.data,
        )
    if exc.code in {
        CommonCode.PERMISSION_DENIED,
        CommonCode.RATE_LIMIT_EXCEEDED,
        CommonCode.RATE_LIMIT_EXCEEDED_MEDIA,
        CommonCode.INTERNAL_SERVER_ERROR,
        CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
    }:
        return MediaProviderError(
            MediaProviderErrorCode.NODE_UNAVAILABLE,
            exc.ext_msg or "media download node unavailable",
            data=exc.data,
        )
    return MediaProviderError(
        MediaProviderErrorCode.NODE_UNAVAILABLE,
        exc.ext_msg or f"unmapped download error: {exc.code.name}",
        data=exc.data,
    )
