"""媒体执行 token 的加密签发与验签。

parse-pre-v2 把一次解析所需的代理配置封进执行 token；parse-v2 只信任解密后的
token，不从客户端接受代理地址。材料 token 复用同一加密合同，把 Vimeo 的完整
direct/client_mux 材料带回业务节点，download-pre-v2 验签后直接返回。
"""

from __future__ import annotations

import base64
import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from pydantic import TypeAdapter

from app.constants.media_download import MEDIA_DOWNLOAD_MAX_SIZE_BYTES
from app.core.config import settings
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.schemas.media_schema import DownloadMaterial

_TOKEN_VERSION = 1
_PROXY_TOKEN_TYPE = "media_proxy_execution"
_RESOURCE_TOKEN_TYPE = "media_resource"
_PROXY_TOKEN_TTL_SECONDS = 120
_RESOURCE_TOKEN_TTL_SECONDS = 24 * 60 * 60
_MAX_TOKEN_LENGTH = 1024 * 1024
_MATERIAL_ADAPTER: TypeAdapter[DownloadMaterial] = TypeAdapter(DownloadMaterial)


@dataclass(frozen=True, slots=True)
class ProxyExecutionClaims:
    """parse-v2 一次解析使用的代理执行材料。"""

    link: str
    proxy_url: str
    node_id: int
    iat: int
    exp: int


@dataclass(frozen=True, slots=True)
class ResourceMaterialClaims:
    """download-pre-v2 使用的完整资源材料。"""

    platform: str
    canonical_link: str
    source_id: str
    download_mode: str
    filename: str | None
    mime_type: str | None
    size: int | None
    material: DownloadMaterial
    iat: int
    exp: int


class MediaExecutionTokenService:
    """使用配置 secret 加密并认证 parse/resource token。"""

    def issue_proxy_token(self, *, link: str, proxy_url: str, node_id: int) -> str:
        """签发一次性解析执行 token。"""

        now = int(time.time())
        return self._encode(
            purpose="proxy",
            payload={
                "typ": _PROXY_TOKEN_TYPE,
                "v": _TOKEN_VERSION,
                "link": link,
                "proxy_url": proxy_url,
                "node_id": node_id,
                "iat": now,
                "exp": now + _PROXY_TOKEN_TTL_SECONDS,
            },
        )

    def decode_proxy_token(self, token: str) -> ProxyExecutionClaims:
        """验签并解析 parse-v2 代理执行 token。"""

        payload = self._decode(
            token,
            purpose="proxy",
            code=CommonCode.MEDIA_PARSE_EXECUTION_TOKEN_INVALID,
            expired_code=CommonCode.MEDIA_PARSE_EXECUTION_TOKEN_EXPIRED,
        )
        try:
            claims = ProxyExecutionClaims(
                link=str(payload["link"]),
                proxy_url=str(payload["proxy_url"]),
                node_id=int(payload["node_id"]),
                iat=int(payload["iat"]),
                exp=int(payload["exp"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise AppCommonException(
                CommonCode.MEDIA_PARSE_EXECUTION_TOKEN_INVALID,
                ext_msg=f"media_execution_token.decode_proxy_token: invalid claims, error={exc}",
            ) from exc
        if not claims.link or not claims.proxy_url or claims.node_id <= 0:
            raise AppCommonException(
                CommonCode.MEDIA_PARSE_EXECUTION_TOKEN_INVALID,
                ext_msg="media_execution_token.decode_proxy_token: required claim is empty",
            )
        return claims

    def issue_resource_token(
        self,
        *,
        platform: str,
        canonical_link: str,
        source_id: str,
        download_mode: str,
        filename: str | None,
        mime_type: str | None,
        size: int | None,
        material: DownloadMaterial,
    ) -> str:
        """加密签发包含完整 direct/client_mux 材料的 resource token。"""

        now = int(time.time())
        return self._encode(
            purpose="resource",
            payload={
                "typ": _RESOURCE_TOKEN_TYPE,
                "v": _TOKEN_VERSION,
                "platform": platform,
                "canonical_link": canonical_link,
                "source_id": source_id,
                "download_mode": download_mode,
                "filename": filename,
                "mime_type": mime_type,
                "size": size,
                "material": material.model_dump(mode="json"),
                "iat": now,
                "exp": now + _RESOURCE_TOKEN_TTL_SECONDS,
            },
        )

    def decode_resource_token(self, token: str) -> ResourceMaterialClaims:
        """验签、校验过期时间并恢复完整资源材料。"""

        payload = self._decode(
            token,
            purpose="resource",
            code=CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID,
            expired_code=CommonCode.MEDIA_RESOURCE_MATERIAL_EXPIRED,
        )
        try:
            material = _MATERIAL_ADAPTER.validate_python(payload["material"])
            claims = ResourceMaterialClaims(
                platform=str(payload["platform"]),
                canonical_link=str(payload["canonical_link"]),
                source_id=str(payload["source_id"]),
                download_mode=str(payload["download_mode"]),
                filename=(
                    None
                    if payload.get("filename") is None
                    else str(payload["filename"])
                ),
                mime_type=(
                    None
                    if payload.get("mime_type") is None
                    else str(payload["mime_type"])
                ),
                size=None if payload.get("size") is None else int(payload["size"]),
                material=material,
                iat=int(payload["iat"]),
                exp=int(payload["exp"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise AppCommonException(
                CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID,
                ext_msg=f"media_execution_token.decode_resource_token: invalid material, error={exc}",
            ) from exc
        if (
            payload.get("typ") != _RESOURCE_TOKEN_TYPE
            or claims.platform != "vimeo"
            or claims.download_mode != claims.material.download_mode
            or claims.source_id != claims.material.source_id
            or claims.filename != claims.material.filename
            or claims.mime_type != claims.material.mime_type
            or claims.size != claims.material.size
        ):
            raise AppCommonException(
                CommonCode.MEDIA_RESOURCE_MATERIAL_INVALID,
                ext_msg="media_execution_token.decode_resource_token: material claims mismatch",
            )
        if claims.size is not None and claims.size > MEDIA_DOWNLOAD_MAX_SIZE_BYTES:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_FILE_TOO_LARGE,
                ext_msg="media_execution_token.decode_resource_token: material exceeds 4GiB",
            )
        return claims

    def _encode(self, *, purpose: str, payload: dict[str, object]) -> str:
        raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
        return self._fernet(purpose).encrypt(raw).decode()

    def _decode(
        self,
        token: str,
        *,
        purpose: str,
        code: CommonCode,
        expired_code: CommonCode,
    ) -> dict[str, Any]:
        if not token or len(token) > _MAX_TOKEN_LENGTH:
            raise AppCommonException(
                code, ext_msg="media_execution_token: token is empty or too large"
            )
        try:
            payload = json.loads(self._fernet(purpose).decrypt(token.encode()).decode())
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AppCommonException(
                code,
                ext_msg=f"media_execution_token: verification failed, purpose={purpose}",
            ) from exc
        if not isinstance(payload, dict) or payload.get("v") != _TOKEN_VERSION:
            raise AppCommonException(
                code, ext_msg="media_execution_token: invalid token claims"
            )
        now = int(time.time())
        try:
            exp = int(payload["exp"])
            iat = int(payload["iat"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AppCommonException(
                code, ext_msg="media_execution_token: invalid time claims"
            ) from exc
        if exp <= now:
            raise AppCommonException(
                expired_code, ext_msg="media_execution_token: token expired"
            )
        if iat <= 0 or exp <= iat:
            raise AppCommonException(
                code, ext_msg="media_execution_token: invalid time claims"
            )
        return payload

    def _fernet(self, purpose: str) -> Fernet:
        secret = str(
            getattr(settings.download_token, "resource_token_secret", "") or ""
        ).strip()
        if not secret:
            raise AppCommonException(
                CommonCode.INTERNAL_SERVER_ERROR,
                ext_msg="media_execution_token: resource_token_secret is empty",
            )
        key = base64.urlsafe_b64encode(
            hashlib.sha256(f"{purpose}:{secret}".encode()).digest()
        )
        return Fernet(key)


media_execution_token_service = MediaExecutionTokenService()
