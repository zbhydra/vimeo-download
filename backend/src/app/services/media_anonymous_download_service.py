"""匿名下载授权：材料验签结果 → 大小门禁 → 设备短锁 → 免费次数判定 → 计次及资源排重。"""

from pydantic import BaseModel, Field, model_validator
from typing import Literal

from app.api.user_dependencies import UserContext
from app.constants.counter import DeviceCounterId
from app.core.redis import redis_client
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.config_public_service import config_public_service
from app.services.counter_device_service import counter_device_service
from app.services.media_pre_authorization_service import (
    DownloadPreValidatedRequest,
)
from app.services.media_service import media_service
from app.schemas.media_schema import (
    MediaAnonymousDownloadPreV2Response,
    MediaAnonymousDownloadLoginResponse,
)
from app.utils.redis_key import build_redis_key
from app.utils.redis_lock import RedisLock
from app.utils.logger import logger


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
    """匿名策略与计次的业务 owner，等待只由前端执行，返回已验签材料。"""

    async def authorize(
        self,
        *,
        payload: DownloadPreValidatedRequest,
        user_context: UserContext,
        device_id: str,
    ) -> MediaAnonymousDownloadPreV2Response | MediaAnonymousDownloadLoginResponse:
        """为已验签材料返回匿名放行状态，重复资源不续排重 TTL。"""
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
        # Redis 与 MySQL 是独立存储；任一步失败都闭锁，不返回材料。
        try:
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
                status: Literal[1, 2] = 1
                if not duplicate:
                    count = await counter_device_service.add(
                        device_id,
                        DeviceCounterId.ANONYMOUS_DOWNLOAD,
                        1,
                    )
                    await redis.set(
                        dedup_key, "1", ex=policy.dl_anonymous_dedup_seconds
                    )
                    if count > policy.dl_anonymous_immediate_count:
                        status = 2
        except Exception as exc:
            logger.error(
                "anonymous_download_authorize_infrastructure_failed", exc_info=True
            )
            raise AppCommonException(
                CommonCode.MEDIA_DOWNLOAD_PRE_UNAVAILABLE,
                ext_msg=f"anonymous_download.authorize: infrastructure unavailable, error={type(exc).__name__}: {exc}",
            ) from exc
        return MediaAnonymousDownloadPreV2Response(
            status=status,
            material=payload.material,
            wait_seconds=policy.dl_anonymous_wait_seconds if status == 2 else None,
        )

    def build_dedup_key(self, device_id: str, resource_key: str) -> str:
        """生成设备与稳定资源标识的排重 key。"""
        return build_redis_key(f"media:anonymous_download:{device_id}:{resource_key}")


media_anonymous_download_service = MediaAnonymousDownloadService()
