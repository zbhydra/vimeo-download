"""媒体 V2 Pre 控制面授权服务。

`parse-pre-v2` 选择一个解析节点和启用代理，签发加密执行 token；
`download-pre-v2` 验签完整材料后在用户短锁内完成 Credits 扣减。
"""

from __future__ import annotations
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, cast
from urllib.parse import urlparse

from app.api.user_dependencies import UserContext
from app.contracts.media_download import MediaDownloadMode
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.media_execution_token_service import media_execution_token_service
from app.services.proxy_pool_service import proxy_pool_service
from app.schemas.media_schema import DownloadMaterial
from app.services.service_node_service import service_node_service
from app.utils.media_download_allowlist import is_web_download_media_allowed
from app.utils.logger import logger
from app.utils.media_extra import MediaExtra
from app.utils.redis_lock import RedisLock

# 同一登录用户的 download-pre-v2 短锁 TTL；正常路径会 finally 释放。
_USER_LOCK_TTL_SECONDS = 5
_DOWNLOAD_PRE_FAILURE_REASON_MAX_LENGTH = 220
_download_pre_user_lock = RedisLock()


def _download_pre_invalid_data(
    reason: str,
    detail: str | None = None,
) -> dict[str, str]:
    """构造 download-pre-v2 短诊断，前端可安全写入 mark_msg。"""

    failure_reason = reason if detail is None else f"{reason}: {detail}"
    return {
        "reason": reason,
        "failure_reason": failure_reason[:_DOWNLOAD_PRE_FAILURE_REASON_MAX_LENGTH],
    }


@dataclass(frozen=True, slots=True)
class MediaPreNode:
    """
    Pre 控制面返回的节点地址。

    Attributes:
        node_id: service_nodes 自增节点 ID。
        url: 节点 API 完整地址。
    """

    node_id: int
    url: str


@dataclass(frozen=True, slots=True)
class ParsePreResult:
    """
    parse-pre-v2 结果。

    Attributes:
        nodes: 有序 parse-v2 节点列表。
    """

    node: MediaPreNode
    token: str


@dataclass(frozen=True, slots=True)
class DownloadPreValidatedRequest:
    """
    已通过业务校验的 download-pre-v2 请求。

    Attributes:
        link: resource token 中的 canonical_link。
        source_id: parse-v2 资源 ID。
        platform: 平台标识。
        download_mode: 下载模式。
        filename: 文件名。
        mime_type: MIME 类型。
        size: 资源大小；未知时为 None。
        preferred_node_id: 解析成功节点 ID 亲和提示。
        extra: Provider 私有 JSON object，只透传到 media_download token。
    """

    link: str
    source_id: str
    platform: str
    download_mode: MediaDownloadMode
    filename: str | None
    mime_type: str | None
    size: int | None
    preferred_node_id: int | None
    extra: MediaExtra
    material: DownloadMaterial


class MediaPreAuthorizationService:
    """媒体 V2 Pre 控制面服务。"""

    async def parse_pre_v2(self, *, link: object) -> ParsePreResult:
        """
        返回可尝试的 parse-v2 节点。

        Args:
            link: 用户输入链接，只做基础 URL 校验。

        Raises:
            AppCommonException: 输入非法或没有可用节点。
        """
        self._validate_http_link(
            link,
            code=CommonCode.MEDIA_PARSE_PRE_INVALID_LINK,
            field_name="link",
        )
        nodes = await service_node_service.select_parse_nodes()
        if not nodes:
            raise AppCommonException(
                CommonCode.MEDIA_SERVICE_NODE_UNAVAILABLE,
                ext_msg="media_pre.parse_pre_v2: no healthy service nodes",
            )
        node = nodes[0]
        proxy_url = await proxy_pool_service.select_parse_proxy()
        return ParsePreResult(
            node=MediaPreNode(
                node_id=node.node_id, url=node.api_url("/api/client/media/parse-v2")
            ),
            token=media_execution_token_service.issue_proxy_token(
                link=str(link).strip(), proxy_url=proxy_url, node_id=node.node_id
            ),
        )

    @asynccontextmanager
    async def download_pre_v2_user_lock(
        self, *, user_context: UserContext
    ) -> AsyncIterator[None]:
        """
        持有 download-pre-v2 用户短锁。

        调用方必须在上下文内完成 resource token 验签、节点选择、
        media_download token 签发和 Credits 扣减，避免同一用户双击并发扣费。
        """
        user_scope = self._build_user_scope(user_context)
        lock_key = self._build_download_pre_user_lock_key(user_scope)
        lock_token = await self._acquire_user_lock(lock_key, user_scope)
        if lock_token is None:
            raise AppCommonException(
                CommonCode.RATE_LIMIT_EXCEEDED_MEDIA,
                ext_msg=f"download_pre_v2: user request too frequent, scope={user_scope}",
            )

        try:
            yield
        finally:
            await _download_pre_user_lock.release(lock_key, lock_token)

    async def _acquire_user_lock(self, lock_key: str, user_scope: str) -> str | None:
        """获取用户级短锁；抢不到说明用户请求过于频繁。"""
        try:
            return await _download_pre_user_lock.acquire(
                lock_key,
                ttl=_USER_LOCK_TTL_SECONDS,
            )
        except Exception as exc:
            logger.error(
                "download_pre_v2_user_lock_acquire_failed: "
                f"scope={user_scope}, key={lock_key}, "
                f"error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_PRE_UNAVAILABLE,
                ext_msg=(
                    "download_pre_v2: Redis user lock unavailable, "
                    f"scope={user_scope}, key={lock_key}, "
                    f"error={type(exc).__name__}: {exc}"
                ),
            ) from exc

    def validate_download_pre_payload(
        self, raw_payload: object
    ) -> DownloadPreValidatedRequest:
        """校验 download-pre-v2 请求体，供 API 层读取 source_id 后扣额度。"""
        return self._validate_download_pre_payload(raw_payload)

    def _validate_download_pre_payload(
        self, raw_payload: object
    ) -> DownloadPreValidatedRequest:
        """
        校验 download-pre-v2 请求体。

        Args:
            raw_payload: Pydantic schema 或 dict。

        Returns:
            DownloadPreValidatedRequest。
        """
        data: dict[str, Any]
        if isinstance(raw_payload, DownloadPreValidatedRequest):
            return raw_payload
        if hasattr(raw_payload, "model_dump"):
            data = raw_payload.model_dump()
        elif isinstance(raw_payload, Mapping):
            data = dict(raw_payload)
        else:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST,
                ext_msg=(
                    "download_pre_v2: request payload must be pydantic model or mapping, "
                    f"type={type(raw_payload).__name__}"
                ),
                data=_download_pre_invalid_data(
                    "download_pre_payload_not_object",
                    type(raw_payload).__name__,
                ),
            )
        preferred_node_id = self._validate_preferred_node_id(
            data.get("preferred_node_id")
        )
        resource_token = self._validate_non_empty_string(
            data.get("resource_token"),
            max_length=1024 * 1024,
            code=CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST,
            field_name="resource_token",
        )
        claims = media_execution_token_service.decode_resource_token(resource_token)
        if not is_web_download_media_allowed(claims.filename, claims.mime_type):
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED,
                ext_msg=(
                    "download_pre_v2: media file type is not allowed for website "
                    "download, "
                    f"platform={claims.platform}, source_id={claims.source_id}, "
                    f"filename={claims.filename!r}, mime_type={claims.mime_type!r}"
                ),
            )
        return DownloadPreValidatedRequest(
            link=claims.canonical_link,
            source_id=claims.source_id,
            platform=claims.platform,
            download_mode=cast(MediaDownloadMode, claims.download_mode),
            filename=claims.filename,
            mime_type=claims.mime_type,
            size=claims.size,
            preferred_node_id=preferred_node_id,
            extra={},
            material=claims.material,
        )

    def _validate_http_link(
        self,
        value: object,
        *,
        code: CommonCode,
        field_name: str,
    ) -> str:
        """校验 HTTP/HTTPS URL 基础格式。"""
        link = self._validate_non_empty_string(
            value,
            max_length=2048,
            code=code,
            field_name=field_name,
        )
        parsed = urlparse(link)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise AppCommonException(
                code,
                ext_msg=f"{field_name}: URL must be http(s), value={link!r}",
            )
        return link

    def _validate_non_empty_string(
        self,
        value: object,
        *,
        max_length: int,
        code: CommonCode,
        field_name: str,
    ) -> str:
        """校验字符串非空且不超过指定长度。"""
        if not isinstance(value, str):
            data = (
                _download_pre_invalid_data(f"{field_name}_not_string")
                if code == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
                else None
            )
            raise AppCommonException(
                code,
                ext_msg=f"{field_name}: must be string",
                data=data,
            )
        normalized = value.strip()
        if not normalized:
            data = (
                _download_pre_invalid_data(f"{field_name}_empty")
                if code == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
                else None
            )
            raise AppCommonException(
                code,
                ext_msg=f"{field_name}: must not be empty",
                data=data,
            )
        if len(normalized) > max_length:
            data = (
                _download_pre_invalid_data(
                    f"{field_name}_too_long",
                    f"length={len(normalized)},max={max_length}",
                )
                if code == CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST
                else None
            )
            raise AppCommonException(
                code,
                ext_msg=(
                    f"{field_name}: too long, "
                    f"length={len(normalized)}, max={max_length}"
                ),
                data=data,
            )
        return normalized

    def _validate_preferred_node_id(self, value: object) -> int | None:
        """校验 preferred_node_id。"""
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_REQUEST,
                ext_msg=f"preferred_node_id: must be positive integer, value={value!r}",
                data=_download_pre_invalid_data("preferred_node_id_invalid"),
            )
        return value

    def _build_user_scope(self, user_context: UserContext) -> str:
        """构建登录用户额度 scope。"""
        if user_context.user_id <= 0:
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_PRE_INVALID_CLIENT_IDENTITY,
                ext_msg=f"download_pre_scope: login required, user_id={user_context.user_id}",
            )
        return f"user:{user_context.user_id}"

    def _build_download_pre_user_lock_key(self, user_scope: str) -> str:
        """构建用户级 download-pre-v2 短锁业务 key。"""
        return f"media:download_pre_lock:{{{user_scope}}}"


media_pre_authorization_service = MediaPreAuthorizationService()
