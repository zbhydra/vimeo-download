"""媒体下载节点 JWT 签发与验签服务。

本模块只处理 `media_download` token 的加解密和 claims 校验：
1. 业务侧按文件大小计算 TTL，并使用配置中的 EdDSA 私钥签发。
2. 下载节点固定使用配置里的 algorithm 验签，不根据 JWT header 自动放宽算法。
3. 公钥按配置顺序逐个尝试，用于当前 key 和上一轮 key 的平滑轮换。
4. token 允许重复使用；`jti` 只用于日志关联，不写 Redis 或数据库消费状态。
"""

from __future__ import annotations

from dataclasses import asdict
import hashlib
import time
from typing import Any
import uuid

import jwt

from app.constants.media_download import (
    MEDIA_DOWNLOAD_100_MIB,
    MEDIA_DOWNLOAD_500_MIB,
    MEDIA_DOWNLOAD_MAX_SIZE_BYTES,
    MEDIA_DOWNLOAD_TTL_1_HOUR,
    MEDIA_DOWNLOAD_TTL_3_HOURS,
    MEDIA_DOWNLOAD_TTL_6_HOURS,
)
from app.contracts.media_download import MediaDownloadMode, MediaDownloadTokenClaims
from app.contracts.media_platform import PLATFORM_VIMEO
from app.core.config import settings
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.utils.logger import logger
from app.utils.device_id import validate_request_device_id
from app.utils.media_extra import MediaExtra, normalize_media_extra

# JWT typ claim，download-v2 只接受该 token 类型，避免误用登录 token。
MEDIA_DOWNLOAD_TOKEN_TYPE = "media_download"
# media_download claims 结构版本；字段调整时递增并保留兼容校验。
MEDIA_DOWNLOAD_TOKEN_VERSION = 1

# media_download token 只签发给这些已统一到 V2 下载合同的平台。
_SUPPORTED_PLATFORMS = frozenset({PLATFORM_VIMEO})
# media_download token 只允许节点当前已实现的两种执行模式。
_SUPPORTED_DOWNLOAD_MODES = frozenset({"direct", "client_mux"})


class MediaDownloadTokenService:
    """媒体下载 JWT 的签发与验签服务。"""

    def issue_token(
        self,
        *,
        platform: str,
        download_mode: MediaDownloadMode,
        link: str,
        sid: str,
        size: int | None,
        user_id: int | None,
        credits_cost: int,
        issued_ip: str | None,
        active_download_limit: int,
        extra: object | None = None,
        device_id: str | None = None,
    ) -> tuple[str, MediaDownloadTokenClaims]:
        """
        签发媒体下载 token。

        Args:
            platform: 媒体平台标识。
            download_mode: 下载执行模式。
            link: 节点执行时重新解析使用的链接。
            sid: 资源 source_id。
            size: 授权时已知文件大小，未知时为 None。
            user_id: 登录用户 ID；节点活跃下载按该身份分桶计数。
            credits_cost: 本次下载授权实际扣除 Credits，重复免扣为 0。
            issued_ip: 业务服务器签发授权时看到的客户端 IP。
            active_download_limit: 配置表确定的单身份活跃下载上限。
            extra: Provider 私有 JSON object，只写入 signed claims。
            device_id: 匿名设备 ID，用于节点并发分组。

        Returns:
            (JWT 字符串, claims)。

        Raises:
            AppCommonException: 配置缺失、claims 非法或文件超过 4GiB。
        """
        self._validate_claim_inputs(
            platform=platform,
            download_mode=download_mode,
            link=link,
            sid=sid,
            size=size,
        )
        if device_id is not None:
            validate_request_device_id(device_id)
        token_config = self._load_config()
        private_key = _normalize_pem_value(_config_value(token_config, "private_key"))
        if not private_key:
            raise AppCommonException(
                CommonCode.INTERNAL_SERVER_ERROR,
                ext_msg="media_download_token.issue_token: private_key is empty",
            )

        now = int(time.time())
        ttl = media_download_token_ttl_seconds(size)
        normalized_extra = normalize_media_extra(
            extra,
            code=CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
            source="media_download_token.issue_token",
        )
        claims = MediaDownloadTokenClaims(
            typ=MEDIA_DOWNLOAD_TOKEN_TYPE,
            v=MEDIA_DOWNLOAD_TOKEN_VERSION,
            platform=platform,
            download_mode=download_mode,
            link=link,
            sid=sid,
            size=size,
            uid=user_id if user_id is not None and user_id > 0 else None,
            credits_cost=max(0, int(credits_cost)),
            issued_ip=str(issued_ip or ""),
            iat=now,
            active_download_limit=active_download_limit,
            exp=now + ttl,
            jti=str(uuid.uuid4()),
            extra=normalized_extra,
            device_id=device_id,
        )
        encoded = jwt.encode(  # type: ignore[attr-defined]
            asdict(claims),
            private_key,
            algorithm=self._load_algorithm(token_config),
        )
        return encoded, claims

    def decode_for_download(self, token: str) -> MediaDownloadTokenClaims:
        """
        验签并解析媒体下载 token。

        Args:
            token: POST body 中的 JWT 字符串。

        Returns:
            已校验的 claims。

        Raises:
            AppCommonException: token 无效、过期或节点验签配置不可用。
        """
        if not token or not token.strip():
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg="media_download_token.decode_for_download: token is empty",
            )

        token_config = self._load_config()
        algorithm = self._load_algorithm(token_config)
        public_keys = self._load_public_keys(token_config)
        last_error: Exception | None = None
        for public_key in public_keys:
            try:
                payload = jwt.decode(  # type: ignore[attr-defined]
                    token,
                    public_key,
                    algorithms=[algorithm],
                    options={
                        "require": [
                            "typ",
                            "v",
                            "platform",
                            "download_mode",
                            "link",
                            "sid",
                            "iat",
                            "exp",
                            "jti",
                        ]
                    },
                )
                return self._payload_to_claims(payload)
            except jwt.ExpiredSignatureError as exc:  # type: ignore[attr-defined]
                raise AppCommonException(
                    CommonCode.MEDIA_DOWNLOAD_TOKEN_EXPIRED,
                    ext_msg=(
                        "media_download_token.decode_for_download: token expired, "
                        f"jti={extract_unverified_jti(token)}, "
                        f"token_hash={token_hash_for_log(token)}"
                    ),
                ) from exc
            except Exception as exc:
                last_error = exc

        logger.warning(
            "media_download_token_verify_failed: "
            f"jti={extract_unverified_jti(token)}, "
            f"token_hash={token_hash_for_log(token)}, "
            f"error={type(last_error).__name__ if last_error else 'unknown'}"
        )
        raise AppCommonException(
            CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
            ext_msg=(
                "media_download_token.decode_for_download: verification failed, "
                f"token_hash={token_hash_for_log(token)}"
            ),
        ) from last_error

    def _load_config(self) -> object:
        """读取运行态 download_token 配置对象。"""
        token_config = getattr(settings, "download_token", None)
        if token_config is None:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
                ext_msg="media_download_token: settings.download_token is missing",
            )
        return token_config

    def _load_algorithm(self, token_config: object) -> str:
        """
        读取并校验 JWT 算法。

        这里只接受配置中的 EdDSA。验签时把该值传给 PyJWT `algorithms` 白名单，
        因此不会因 header 自报其它算法而改变验签策略。
        """
        algorithm = str(_config_value(token_config, "algorithm") or "").strip()
        if algorithm != "EdDSA":
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
                ext_msg=(
                    "media_download_token: unsupported algorithm, "
                    f"configured={algorithm or '<empty>'}"
                ),
            )
        return algorithm

    def _load_public_keys(self, token_config: object) -> list[str]:
        """读取并规范化公钥列表。"""
        raw_public_keys = _config_value(token_config, "public_keys")
        if not isinstance(raw_public_keys, list):
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
                ext_msg="media_download_token: public_keys must be a list",
            )
        public_keys = [
            key
            for key in (_normalize_pem_value(item) for item in raw_public_keys)
            if key
        ]
        if not public_keys:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_NODE_UNAVAILABLE,
                ext_msg="media_download_token: public_keys is empty",
            )
        return public_keys

    def _payload_to_claims(self, payload: Any) -> MediaDownloadTokenClaims:
        """将 PyJWT payload 转换为强类型 claims 并执行业务校验。"""
        if not isinstance(payload, dict):
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg="media_download_token: payload is not an object",
            )

        try:
            if "size" not in payload:
                raise KeyError("size")
            size_value = payload.get("size")
            size = None if size_value is None else int(size_value)
            uid_value = payload.get("uid")
            uid = None if uid_value is None else int(uid_value)
            raw_credits_cost = payload.get("credits_cost", 0)
            credits_cost = max(0, int(raw_credits_cost))
            download_mode = str(payload["download_mode"])
            # 分批部署期间，旧业务节点签发的 token 沿用原固定并发上限。
            active_download_limit = payload.get("active_download_limit", 3)
            if type(active_download_limit) is not int or active_download_limit <= 0:
                raise ValueError("active_download_limit 必须为正整数")
            if download_mode not in _SUPPORTED_DOWNLOAD_MODES:
                raise ValueError("unsupported download_mode")
            claims = MediaDownloadTokenClaims(
                typ=str(payload["typ"]),
                v=int(payload["v"]),
                platform=str(payload["platform"]),
                download_mode=download_mode,  # type: ignore[arg-type]
                link=str(payload["link"]),
                sid=str(payload["sid"]),
                size=size,
                uid=uid if uid is not None and uid > 0 else None,
                credits_cost=credits_cost,
                issued_ip=str(payload.get("issued_ip") or ""),
                iat=int(payload["iat"]),
                active_download_limit=active_download_limit,
                exp=int(payload["exp"]),
                jti=str(payload["jti"]),
                extra=_payload_extra(payload),
                device_id=payload.get("device_id"),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg=f"media_download_token: invalid claims shape, error={exc}",
            ) from exc

        self._validate_claims(claims)
        return claims

    def _validate_claims(self, claims: MediaDownloadTokenClaims) -> None:
        """校验已解码 claims 的固定字段、TTL 和文件大小边界。"""
        self._validate_claim_inputs(
            platform=claims.platform,
            download_mode=claims.download_mode,
            link=claims.link,
            sid=claims.sid,
            size=claims.size,
        )
        if claims.device_id is not None:
            if not isinstance(claims.device_id, str):
                raise AppCommonException(
                    CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                    ext_msg="media_download_token: device_id 必须为字符串",
                )
            validate_request_device_id(claims.device_id)
        if claims.typ != MEDIA_DOWNLOAD_TOKEN_TYPE:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg=f"media_download_token: unexpected typ={claims.typ}",
            )
        if claims.v != MEDIA_DOWNLOAD_TOKEN_VERSION:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg=f"media_download_token: unexpected version={claims.v}",
            )
        if not claims.jti or claims.iat <= 0 or claims.exp <= claims.iat:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg="media_download_token: invalid iat/exp/jti",
            )
        max_ttl = media_download_token_ttl_seconds(claims.size)
        if claims.exp - claims.iat > max_ttl:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg=(
                    "media_download_token: exp exceeds size ttl, "
                    f"jti={claims.jti}, ttl={claims.exp - claims.iat}, max_ttl={max_ttl}"
                ),
            )
        normalize_media_extra(
            claims.extra,
            code=CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
            source="media_download_token.validate_claims",
        )

    def _validate_claim_inputs(
        self,
        *,
        platform: str,
        download_mode: str,
        link: str,
        sid: str,
        size: int | None,
    ) -> None:
        """校验签发与验签共享的 claims 输入。"""
        if platform not in _SUPPORTED_PLATFORMS:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg=f"media_download_token: unsupported platform={platform}",
            )
        if download_mode not in _SUPPORTED_DOWNLOAD_MODES:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg=f"media_download_token: unsupported download_mode={download_mode}",
            )
        if not link.strip() or not sid.strip():
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg="media_download_token: link or sid is empty",
            )
        if size is not None and size < 0:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
                ext_msg=f"media_download_token: negative size={size}",
            )
        if size is not None and size > MEDIA_DOWNLOAD_MAX_SIZE_BYTES:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE,
                ext_msg=(
                    "media_download_token: size exceeds 4GiB, "
                    f"sid={sid}, size={size}"
                ),
            )


def media_download_token_ttl_seconds(size: int | None) -> int:
    """
    按资源大小计算下载 token TTL。

    Args:
        size: 文件大小，未知时为 None。

    Returns:
        TTL 秒数。

    Raises:
        AppCommonException: size 为负数或超过 4GiB。
    """
    if size is None:
        return MEDIA_DOWNLOAD_TTL_6_HOURS
    if size < 0:
        raise AppCommonException(
            CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
            ext_msg=f"media_download_token_ttl_seconds: negative size={size}",
        )
    if size > MEDIA_DOWNLOAD_MAX_SIZE_BYTES:
        raise AppCommonException(
            CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE,
            ext_msg=f"media_download_token_ttl_seconds: size exceeds 4GiB, size={size}",
        )
    if size <= MEDIA_DOWNLOAD_100_MIB:
        return MEDIA_DOWNLOAD_TTL_1_HOUR
    if size <= MEDIA_DOWNLOAD_500_MIB:
        return MEDIA_DOWNLOAD_TTL_3_HOURS
    return MEDIA_DOWNLOAD_TTL_6_HOURS


def token_hash_for_log(token: str) -> str:
    """
    返回 token 的短 hash，日志中禁止记录完整 JWT。

    Args:
        token: 原始 JWT。

    Returns:
        `sha256:<16 hex>` 形式的短标识。
    """
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
    return f"sha256:{digest}"


def extract_unverified_jti(token: str) -> str:
    """
    尝试从未验签 payload 中读取 jti，仅用于日志关联。

    Args:
        token: 原始 JWT。

    Returns:
        jti 字符串；读取失败时返回 unknown。
    """
    try:
        payload = jwt.decode(  # type: ignore[attr-defined]
            token,
            options={"verify_signature": False, "verify_exp": False},
        )
    except Exception:
        return "unknown"
    if not isinstance(payload, dict):
        return "unknown"
    jti = payload.get("jti")
    return str(jti) if jti else "unknown"


def _config_value(config_obj: object, key: str) -> object:
    """同时支持 Pydantic 对象、SimpleNamespace 和 dict 配置。"""
    if isinstance(config_obj, dict):
        return config_obj.get(key)
    return getattr(config_obj, key, None)


def _normalize_pem_value(value: object) -> str:
    """规范化 YAML/env 中常见的 PEM 字符串转义换行。"""
    if not isinstance(value, str):
        return ""
    return value.strip().replace("\\n", "\n")


def _payload_extra(payload: dict[str, Any]) -> MediaExtra:
    """读取 token 的 extra claim。"""
    return normalize_media_extra(
        payload.get("extra"),
        code=CommonCode.MEDIA_DOWNLOAD_TOKEN_INVALID,
        source="media_download_token.payload_extra",
    )


media_download_token_service = MediaDownloadTokenService()
