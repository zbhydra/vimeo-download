"""媒体资源 token 签发与验签服务。

本模块只处理 `media_resource` token：
1. 下载节点 parse-v2 根据解析结果签发资源 claims。
2. 业务服务器 download-pre-v2 验签后只信任 claims 字段扣 Credits。
3. token 使用 RESOURCE_TOKEN_SECRET 的 HS256 签名，不能被前端重算。
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import time
from typing import Any

import jwt

from app.constants.media_download import MEDIA_DOWNLOAD_MAX_SIZE_BYTES
from app.contracts.media_download import MediaDownloadMode
from app.contracts.media_platform import PLATFORM_VIMEO
from app.core.config import settings
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.utils.logger import logger
from app.utils.media_extra import MediaExtra, normalize_media_extra

# resource token 类型，download-pre-v2 只接受该类型。
MEDIA_RESOURCE_TOKEN_TYPE = "media_resource"
# resource token claims 版本。
MEDIA_RESOURCE_TOKEN_VERSION = 1
# resource token 固定 HS256 算法。
MEDIA_RESOURCE_TOKEN_ALGORITHM = "HS256"
# resource token 默认有效期，秒；需要覆盖用户停留下载页、登录和充值后再下载的场景。
MEDIA_RESOURCE_TOKEN_TTL_SECONDS = 24 * 60 * 60
_FAILURE_REASON_MAX_LENGTH = 220

_SUPPORTED_PLATFORMS = frozenset({PLATFORM_VIMEO})
_SUPPORTED_DOWNLOAD_MODES = frozenset({"direct", "client_mux"})


def _download_pre_invalid_data(
    reason: str,
    detail: str | None = None,
) -> dict[str, str]:
    """构造给前端 mark 使用的短诊断字段，避免把 JWT 原文塞进日志。"""

    failure_reason = reason if detail is None else f"{reason}: {detail}"
    return {
        "reason": reason,
        "failure_reason": failure_reason[:_FAILURE_REASON_MAX_LENGTH],
    }


def _download_pre_invalid_request(
    *,
    reason: str,
    ext_msg: str,
    detail: str | None = None,
) -> AppCommonException:
    """构造 download-pre-v2 输入非法异常，并携带可上报的短原因。"""

    return AppCommonException(
        CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST,
        ext_msg=ext_msg,
        data=_download_pre_invalid_data(reason, detail),
    )


@dataclass(frozen=True, slots=True)
class MediaResourceTokenClaims:
    """
    `media_resource` JWT claims。

    Attributes:
        typ: token 类型，固定 media_resource。
        v: claims 版本。
        platform: 媒体平台标识。
        canonical_link: 解析后的规范链接。
        source_id: 资源 ID。
        download_mode: 下载执行模式。
        filename: 文件名快照。
        mime_type: MIME 类型快照，旧 token 缺失时为 None。
        size: 文件大小，未知时为 None。
        iat: 签发 Unix 秒。
        exp: 过期 Unix 秒。
        extra: Provider 私有 JSON object，只签名透传给同平台 Provider。
    """

    typ: str
    v: int
    platform: str
    canonical_link: str
    source_id: str
    download_mode: MediaDownloadMode
    filename: str | None
    mime_type: str | None
    size: int | None
    iat: int
    exp: int
    extra: MediaExtra


class MediaResourceTokenService:
    """媒体资源 JWT 的签发与验签服务。"""

    def issue_token(
        self,
        *,
        platform: str,
        canonical_link: str,
        source_id: str,
        download_mode: str,
        filename: str | None,
        mime_type: str | None,
        size: int | None,
        extra: object | None = None,
    ) -> str:
        """
        签发 resource token。

        Args:
            platform: 平台标识。
            canonical_link: 解析后规范链接。
            source_id: 资源 ID。
            download_mode: 下载模式。
            filename: 文件名。
            mime_type: MIME 类型。
            size: 文件大小，未知时为 None。
            extra: Provider 私有 JSON object，只写入 signed claims。

        Returns:
            HS256 JWT 字符串。
        """

        self._validate_claim_inputs(
            platform=platform,
            canonical_link=canonical_link,
            source_id=source_id,
            download_mode=download_mode,
            filename=filename,
            mime_type=mime_type,
            size=size,
        )
        normalized_mime_type = _normalize_claim_mime_type(
            mime_type,
            source="media_resource_token.issue_token",
        )
        normalized_extra = normalize_media_extra(
            extra,
            code=CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST,
            source="media_resource_token.issue_token",
        )
        now = int(time.time())
        claims = MediaResourceTokenClaims(
            typ=MEDIA_RESOURCE_TOKEN_TYPE,
            v=MEDIA_RESOURCE_TOKEN_VERSION,
            platform=platform,
            canonical_link=canonical_link,
            source_id=source_id,
            download_mode=download_mode,  # type: ignore[arg-type]
            filename=filename,
            mime_type=normalized_mime_type,
            size=size,
            iat=now,
            exp=now + MEDIA_RESOURCE_TOKEN_TTL_SECONDS,
            extra=normalized_extra,
        )
        return jwt.encode(  # type: ignore[attr-defined]
            asdict(claims),
            self._load_secret(),
            algorithm=MEDIA_RESOURCE_TOKEN_ALGORITHM,
        )

    def decode_for_download_pre(self, token: str) -> MediaResourceTokenClaims:
        """
        验签并解析 download-pre-v2 使用的 resource token。

        Args:
            token: parse-v2 返回的 resource token。

        Returns:
            已校验的 claims。
        """

        if not token or not token.strip():
            raise _download_pre_invalid_request(
                reason="resource_token_empty",
                ext_msg="media_resource_token.decode_for_download_pre: token is empty",
            )

        try:
            payload = jwt.decode(  # type: ignore[attr-defined]
                token,
                self._load_secret(),
                algorithms=[MEDIA_RESOURCE_TOKEN_ALGORITHM],
                options={
                    "require": [
                        "typ",
                        "v",
                        "platform",
                        "canonical_link",
                        "source_id",
                        "download_mode",
                        "filename",
                        "iat",
                        "exp",
                    ]
                },
            )
            return self._payload_to_claims(payload)
        except jwt.ExpiredSignatureError as exc:  # type: ignore[attr-defined]
            raise _download_pre_invalid_request(
                reason="resource_token_expired",
                ext_msg="media_resource_token.decode_for_download_pre: token expired",
            ) from exc
        except AppCommonException:
            raise
        except Exception as exc:
            logger.warning(
                "media_resource_token_verify_failed: "
                f"error={type(exc).__name__}: {exc}"
            )
            raise _download_pre_invalid_request(
                reason="resource_token_verification_failed",
                ext_msg=(
                    "media_resource_token.decode_for_download_pre: verification failed"
                ),
                detail=type(exc).__name__,
            ) from exc

    def _load_secret(self) -> str:
        """读取并校验 RESOURCE_TOKEN_SECRET。"""

        token_config = getattr(settings, "download_token", None)
        secret = str(getattr(token_config, "resource_token_secret", "") or "").strip()
        if not secret or _is_default_resource_secret(secret):
            raise AppCommonException(
                CommonCode.INTERNAL_SERVER_ERROR,
                ext_msg=(
                    "media_resource_token: download_token.resource_token_secret "
                    "is empty or unsafe default"
                ),
            )
        return secret

    def _payload_to_claims(self, payload: Any) -> MediaResourceTokenClaims:
        """将 PyJWT payload 转换为强类型 claims 并校验。"""

        if not isinstance(payload, dict):
            raise _download_pre_invalid_request(
                reason="resource_token_payload_not_object",
                ext_msg="media_resource_token: payload is not an object",
            )
        try:
            if "size" not in payload:
                raise KeyError("size")
            if "filename" not in payload:
                raise KeyError("filename")
            size_value = payload.get("size")
            size = None if size_value is None else int(size_value)
            filename_value = payload.get("filename")
            filename = None if filename_value is None else str(filename_value)
            mime_type = _normalize_claim_mime_type(
                payload.get("mime_type"),
                source="media_resource_token.payload",
            )
            download_mode = str(payload["download_mode"])
            if download_mode not in _SUPPORTED_DOWNLOAD_MODES:
                raise ValueError("unsupported download_mode")
            claims = MediaResourceTokenClaims(
                typ=str(payload["typ"]),
                v=int(payload["v"]),
                platform=str(payload["platform"]),
                canonical_link=str(payload["canonical_link"]),
                source_id=str(payload["source_id"]),
                download_mode=download_mode,  # type: ignore[arg-type]
                filename=filename,
                mime_type=mime_type,
                size=size,
                iat=int(payload["iat"]),
                exp=int(payload["exp"]),
                extra=_payload_extra(payload),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise _download_pre_invalid_request(
                reason="resource_token_invalid_claims_shape",
                ext_msg=f"media_resource_token: invalid claims shape, error={exc}",
                detail=str(exc),
            ) from exc

        self._validate_claims(claims)
        return claims

    def _validate_claims(self, claims: MediaResourceTokenClaims) -> None:
        """校验解码后的 claims 固定字段和 TTL。"""

        if claims.typ != MEDIA_RESOURCE_TOKEN_TYPE:
            raise _download_pre_invalid_request(
                reason="resource_token_unexpected_type",
                ext_msg=f"media_resource_token: unexpected typ={claims.typ}",
                detail=claims.typ,
            )
        if claims.v != MEDIA_RESOURCE_TOKEN_VERSION:
            raise _download_pre_invalid_request(
                reason="resource_token_unexpected_version",
                ext_msg=f"media_resource_token: unexpected version={claims.v}",
                detail=str(claims.v),
            )
        if claims.iat <= 0 or claims.exp <= claims.iat:
            raise _download_pre_invalid_request(
                reason="resource_token_invalid_time_claims",
                ext_msg="media_resource_token: invalid iat/exp",
            )
        if claims.exp - claims.iat > MEDIA_RESOURCE_TOKEN_TTL_SECONDS:
            raise _download_pre_invalid_request(
                reason="resource_token_ttl_exceeded",
                ext_msg=(
                    "media_resource_token: exp exceeds ttl, "
                    f"ttl={claims.exp - claims.iat}, "
                    f"max_ttl={MEDIA_RESOURCE_TOKEN_TTL_SECONDS}"
                ),
                detail=str(claims.exp - claims.iat),
            )
        self._validate_claim_inputs(
            platform=claims.platform,
            canonical_link=claims.canonical_link,
            source_id=claims.source_id,
            download_mode=claims.download_mode,
            filename=claims.filename,
            mime_type=claims.mime_type,
            size=claims.size,
        )
        normalize_media_extra(
            claims.extra,
            code=CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST,
            source="media_resource_token.validate_claims",
        )

    def _validate_claim_inputs(
        self,
        *,
        platform: str,
        canonical_link: str,
        source_id: str,
        download_mode: str,
        filename: str | None,
        mime_type: str | None,
        size: int | None,
    ) -> None:
        """校验签发和验签共享的 claims 输入。"""

        if platform not in _SUPPORTED_PLATFORMS:
            raise _download_pre_invalid_request(
                reason="resource_token_unsupported_platform",
                ext_msg=f"media_resource_token: unsupported platform={platform}",
                detail=platform,
            )
        if download_mode not in _SUPPORTED_DOWNLOAD_MODES:
            raise _download_pre_invalid_request(
                reason="resource_token_unsupported_download_mode",
                ext_msg=f"media_resource_token: unsupported download_mode={download_mode}",
                detail=download_mode,
            )
        if not canonical_link.strip() or not source_id.strip():
            raise _download_pre_invalid_request(
                reason="resource_token_empty_resource_identity",
                ext_msg="media_resource_token: canonical_link or source_id is empty",
            )
        if len(canonical_link) > 2048 or len(source_id) > 256:
            raise _download_pre_invalid_request(
                reason="resource_token_resource_identity_too_long",
                ext_msg=(
                    "media_resource_token: canonical_link or source_id too long, "
                    f"canonical_length={len(canonical_link)}, "
                    f"source_id_length={len(source_id)}"
                ),
                detail=f"canonical={len(canonical_link)},source_id={len(source_id)}",
            )
        if filename is not None and len(filename) > 512:
            raise _download_pre_invalid_request(
                reason="resource_token_filename_too_long",
                ext_msg=f"media_resource_token: filename too long, length={len(filename)}",
                detail=str(len(filename)),
            )
        _normalize_claim_mime_type(
            mime_type,
            source="media_resource_token.validate_claim_inputs",
        )
        if size is not None and size < 0:
            raise _download_pre_invalid_request(
                reason="resource_token_negative_size",
                ext_msg=f"media_resource_token: negative size={size}",
                detail=str(size),
            )
        if size is not None and size > MEDIA_DOWNLOAD_MAX_SIZE_BYTES:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE,
                ext_msg=f"media_resource_token: size exceeds 4GiB, size={size}",
            )


def _is_default_resource_secret(secret: str) -> bool:
    """
    判断 resource token secret 是否为模板默认值。

    Args:
        secret: 配置中的 secret。

    Returns:
        True 表示不能用于签发或验签。
    """

    normalized = secret.strip().lower()
    return normalized in {
        "change_me",
        "change-me",
        "default",
        "{resource_token_secret}",
        "your-secret-key-change-in-production",
    }


def _payload_extra(payload: dict[str, Any]) -> MediaExtra:
    """读取 token 的 extra claim。"""
    return normalize_media_extra(
        payload.get("extra"),
        code=CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST,
        source="media_resource_token.payload_extra",
    )


def _normalize_claim_mime_type(value: object, *, source: str) -> str | None:
    """轻量规范化 resource token 的 MIME claim，未知类型不在这里拒绝。"""

    if value is None:
        return None
    normalized = str(value).split(";", 1)[0].strip().lower()
    if not normalized:
        return None
    if len(normalized) > 128 or "/" not in normalized:
        raise _download_pre_invalid_request(
            reason="resource_token_invalid_mime_type",
            ext_msg=(
                f"{source}: invalid mime_type claim, "
                f"mime_type={normalized!r}, length={len(normalized)}"
            ),
            detail=f"length={len(normalized)}",
        )
    if any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in normalized):
        raise _download_pre_invalid_request(
            reason="resource_token_invalid_mime_type_characters",
            ext_msg=f"{source}: invalid mime_type claim characters, mime_type={normalized!r}",
        )
    return normalized


media_resource_token_service = MediaResourceTokenService()
