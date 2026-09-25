"""匿名下载授权：验签结果 → 大小门禁 → 设备短锁 → 免费次数判定 → 签发 → 计次及资源排重。"""

from pydantic import BaseModel, Field, model_validator
from typing import Literal

from app.api.user_dependencies import UserContext
from app.constants.counter import DeviceCounterId
from app.core.redis import redis_client
from app.services.config_public_service import config_public_service
from app.services.counter_device_service import counter_device_service
from app.services.media_pre_authorization_service import (
    DownloadPreValidatedRequest,
    media_pre_authorization_service,
)
from app.services.media_service import media_service
from app.schemas.media_schema import (
    MediaAnonymousDownloadPreV2Response,
    MediaAnonymousDownloadLoginResponse,
    MediaPreNodeResponse,
)
from app.utils.redis_key import build_redis_key
from app.utils.redis_lock import RedisLock


class AnonymousDownloadPolicy(BaseModel):
    """配置表中的匿名业务阈值，缺失或非法配置直接报错。"""

    dl_anonymous_immediate_count: int = Field(ge=0, strict=True)
    dl_anonymous_total_count: int = Field(ge=0, strict=True)
    dl_anonymous_max_size_bytes: int = Field(gt=0, strict=True)
    dl_anonymous_wait_seconds: int = Field(ge=0, strict=True)
    dl_anonymous_dedup_seconds: int = Field(gt=0, strict=True)

    @model_validator(mode="after")
    def _total_covers_immediate(self) -> "AnonymousDownloadPolicy":
        """免费总次数必须覆盖直接放行次数，否则等待区间不存在或直接放行被截断。"""
        if self.dl_anonymous_total_count < self.dl_anonymous_immediate_count:
            raise ValueError(
                "AnonymousDownloadPolicy: dl_anonymous_total_count 不得小于 "
                f"dl_anonymous_immediate_count, total={self.dl_anonymous_total_count}, "
                f"immediate={self.dl_anonymous_immediate_count}"
            )
        return self


_device_lock = RedisLock()


class MediaAnonymousDownloadService:
    """匿名策略与计次的业务 owner，等待只由前端执行，免费次数用尽后要求登录。"""

    async def authorize(
        self,
        *,
        payload: DownloadPreValidatedRequest,
        user_context: UserContext,
        device_id: str,
    ) -> MediaAnonymousDownloadPreV2Response | MediaAnonymousDownloadLoginResponse:
        """为已验签资源签发匿名授权，重复资源刷新 token 而不续排重 TTL。"""
        policy = AnonymousDownloadPolicy.model_validate(
            await config_public_service.get_lists()
        )
        if payload.size is None or payload.size >= policy.dl_anonymous_max_size_bytes:
            return MediaAnonymousDownloadLoginResponse()
        resource_key = media_service.build_download_resource_key(
            platform=payload.platform,
            canonical_link=payload.link,
            source_id=payload.source_id,
            download_mode=payload.download_mode,
        )
        dedup_key = self.build_dedup_key(device_id, resource_key)
        # Redis 为硬依赖；失败直接上抛。MySQL 成功后写排重失败，重试可能再计一次。
        async with _device_lock.lock_context(
            f"media:anonymous_download:{device_id}",
            ttl=5,
            timeout=0,
        ):
            redis = await redis_client.get_client()
            duplicate = await redis.exists(dedup_key)
            if not duplicate:
                used = await counter_device_service.get(
                    device_id,
                    DeviceCounterId.ANONYMOUS_DOWNLOAD,
                )
                # 超过匿名免费总次数要求登录：不签发、不计次、不写排重。
                if used + 1 > policy.dl_anonymous_total_count:
                    return MediaAnonymousDownloadLoginResponse()
            result = (
                await media_pre_authorization_service.create_download_authorization(
                    payload=payload,
                    user_context=user_context,
                    credits_cost=0,
                    issued_ip=user_context.ip,
                    device_id=device_id,
                )
            )
            status: Literal[1, 2] = 1
            if not duplicate:
                count = await counter_device_service.add(
                    device_id,
                    DeviceCounterId.ANONYMOUS_DOWNLOAD,
                    1,
                )
                await redis.set(dedup_key, "1", ex=policy.dl_anonymous_dedup_seconds)
                if count > policy.dl_anonymous_immediate_count:
                    status = 2
        return MediaAnonymousDownloadPreV2Response(
            status=status,
            token=result.token,
            expires_at=result.expires_at,
            download_mode=result.download_mode,
            nodes=[
                MediaPreNodeResponse(node_id=node.node_id, url=node.url)
                for node in result.nodes
            ],
            wait_seconds=policy.dl_anonymous_wait_seconds if status == 2 else None,
        )

    def build_dedup_key(self, device_id: str, resource_key: str) -> str:
        """生成设备与稳定资源标识的排重 key。"""
        return build_redis_key(f"media:anonymous_download:{device_id}:{resource_key}")


media_anonymous_download_service = MediaAnonymousDownloadService()
