"""媒体下载 Credits 业务服务。

本模块只放媒体域规则：
1. 按媒体大小计算下载消耗 Credits。
2. 构造媒体资源指纹。
3. 写下载记录，并调用公共 Credits 底座扣余额。
"""

from dataclasses import dataclass
import hashlib
import json

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_download_record_model import UserDownloadRecordModel
from app.services.user_credit_service import user_credit_service
from app.utils.time import timestamp_now

# 下载扣费流水原因。
DOWNLOAD_CHARGE_REASON = "download_charge"
# 同一 website 资源重复下载免扣窗口，毫秒。
DOWNLOAD_FREE_WINDOW_MS = 6 * 60 * 60 * 1000
# 文件大小阶梯使用 MiB 口径。
_MIB = 1024 * 1024


@dataclass(frozen=True, slots=True)
class CreditChargeResult:
    """媒体下载 Credits 扣费结果。"""

    allowed: bool
    cost: int
    balance: int
    free_reason: str | None
    resource_key: str
    record_id: int | None = None


class MediaService:
    """媒体下载业务服务。"""

    def calculate_download_credits(self, size_bytes: int | None) -> int:
        """按文件大小计算 website 下载消耗的 Credits。"""

        if size_bytes is None:
            return 2
        if size_bytes < 0:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=(
                    "media.calculate_download_credits: size must be non-negative, "
                    f"size_bytes={size_bytes}"
                ),
            )

        if size_bytes < 50 * _MIB:
            return 1
        if size_bytes < 300 * _MIB:
            return 2
        if size_bytes < 800 * _MIB:
            return 3
        if size_bytes < 1300 * _MIB:
            return 4
        if size_bytes < 1800 * _MIB:
            return 5
        if size_bytes < 2300 * _MIB:
            return 6
        if size_bytes < 2800 * _MIB:
            return 7
        if size_bytes < 3300 * _MIB:
            return 8
        if size_bytes < 3800 * _MIB:
            return 9
        if size_bytes < 4300 * _MIB:
            return 10
        return 11 + (size_bytes - 4300 * _MIB) // (500 * _MIB)

    def build_download_resource_key(
        self,
        *,
        platform: str,
        canonical_link: str,
        source_id: str,
        download_mode: str,
    ) -> str:
        """构建 website 下载资源指纹。"""

        payload = f"{platform}\n{canonical_link}\n{source_id}\n{download_mode}"
        return hashlib.md5(payload.encode("utf-8"), usedforsecurity=False).hexdigest()

    async def has_recent_paid_download(
        self,
        *,
        user_id: int,
        resource_key: str,
    ) -> bool:
        """判断同一用户同一资源是否在免扣窗口内已付费下载。"""

        async with get_async_session() as db:
            return await self._has_recent_paid_download_in_session(
                db,
                user_id=user_id,
                resource_key=resource_key,
                free_since_ms=timestamp_now() - DOWNLOAD_FREE_WINDOW_MS,
            )

    async def charge_download(
        self,
        *,
        user_id: int,
        platform: str,
        canonical_link: str,
        source_id: str,
        download_mode: str,
        filename: str | None,
        size_bytes: int | None,
    ) -> CreditChargeResult:
        """为 website 媒体下载扣减 Credits 并记录下载行为。"""

        self._validate_download_charge_inputs(
            user_id=user_id,
            platform=platform,
            canonical_link=canonical_link,
            source_id=source_id,
            download_mode=download_mode,
            filename=filename,
            size_bytes=size_bytes,
        )
        resource_key = self.build_download_resource_key(
            platform=platform,
            canonical_link=canonical_link,
            source_id=source_id,
            download_mode=download_mode,
        )

        now_ms = timestamp_now()
        free_since_ms = now_ms - DOWNLOAD_FREE_WINDOW_MS
        async with get_async_session() as db:
            if await self._has_recent_paid_download_in_session(
                db,
                user_id=user_id,
                resource_key=resource_key,
                free_since_ms=free_since_ms,
            ):
                balance = await user_credit_service.get_balance(user_id)
                record = self._build_download_record(
                    user_id=user_id,
                    resource_key=resource_key,
                    platform=platform,
                    canonical_link=canonical_link,
                    source_id=source_id,
                    filename=filename,
                    size_bytes=size_bytes,
                    credits_cost=0,
                    now_ms=now_ms,
                )
                db.add(record)
                await db.flush()
                await db.commit()
                return CreditChargeResult(
                    allowed=True,
                    cost=0,
                    balance=balance,
                    free_reason="recent_download",
                    resource_key=resource_key,
                    record_id=record.id,
                )

            cost = self.calculate_download_credits(size_bytes)
            charge_result = await user_credit_service.cut_balance_in_session(
                db,
                user_id=user_id,
                amount=cost,
                reason=DOWNLOAD_CHARGE_REASON,
                resource_key=resource_key,
                metadata_json=self._download_metadata_json(
                    platform=platform,
                    canonical_link=canonical_link,
                    source_id=source_id,
                    download_mode=download_mode,
                    filename=filename,
                    size_bytes=size_bytes,
                ),
            )
            if not charge_result.allowed:
                await db.rollback()
                return CreditChargeResult(
                    allowed=False,
                    cost=cost,
                    balance=charge_result.balance,
                    free_reason=None,
                    resource_key=resource_key,
                )

            record = self._build_download_record(
                user_id=user_id,
                resource_key=resource_key,
                platform=platform,
                canonical_link=canonical_link,
                source_id=source_id,
                filename=filename,
                size_bytes=size_bytes,
                credits_cost=cost,
                now_ms=now_ms,
            )
            db.add(record)
            await db.flush()
            await db.commit()
            return CreditChargeResult(
                allowed=True,
                cost=cost,
                balance=charge_result.balance,
                free_reason=None,
                resource_key=resource_key,
                record_id=record.id,
            )

    async def _has_recent_paid_download_in_session(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        resource_key: str,
        free_since_ms: int,
    ) -> bool:
        """在既有 session 中查询同一用户资源是否处于重复下载免扣窗口。"""

        recent_result = await db.execute(
            select(UserDownloadRecordModel.id)
            .where(
                UserDownloadRecordModel.user_id == user_id,
                UserDownloadRecordModel.resource_key == resource_key,
                UserDownloadRecordModel.credits_cost > 0,
                UserDownloadRecordModel.created_at >= free_since_ms,
            )
            .order_by(desc(UserDownloadRecordModel.created_at))
            .limit(1)
        )
        return recent_result.scalar_one_or_none() is not None

    def _build_download_record(
        self,
        *,
        user_id: int,
        resource_key: str,
        platform: str,
        canonical_link: str,
        source_id: str,
        filename: str | None,
        size_bytes: int | None,
        credits_cost: int,
        now_ms: int,
    ) -> UserDownloadRecordModel:
        """构造媒体下载记录。"""

        return UserDownloadRecordModel(  # type: ignore[call-arg]
            user_id=user_id,
            resource_key=resource_key,
            platform=platform,
            canonical_link=canonical_link,
            source_id=source_id,
            filename=filename,
            size_bytes=size_bytes,
            credits_cost=credits_cost,
            created_at=now_ms,
        )

    def _download_metadata_json(
        self,
        *,
        platform: str,
        canonical_link: str,
        source_id: str,
        download_mode: str,
        filename: str | None,
        size_bytes: int | None,
    ) -> str:
        """生成下载扣费流水 JSON 快照。"""

        return json.dumps(
            {
                "platform": platform,
                "canonical_link": canonical_link,
                "source_id": source_id,
                "download_mode": download_mode,
                "filename": filename,
                "size_bytes": size_bytes,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    def _validate_download_charge_inputs(
        self,
        *,
        user_id: int,
        platform: str,
        canonical_link: str,
        source_id: str,
        download_mode: str,
        filename: str | None,
        size_bytes: int | None,
    ) -> None:
        """校验下载扣费输入，避免写入无意义资源指纹。"""

        if user_id <= 0:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=f"media.charge_download: login required, user_id={user_id}",
            )
        self._validate_non_empty_text("platform", platform, 32)
        self._validate_non_empty_text("canonical_link", canonical_link, 2048)
        self._validate_non_empty_text("source_id", source_id, 256)
        self._validate_non_empty_text("download_mode", download_mode, 32)
        if filename is not None and len(filename) > 512:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=(
                    "media.charge_download: filename too long, "
                    f"user_id={user_id}, length={len(filename)}"
                ),
            )
        if size_bytes is not None and size_bytes < 0:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=(
                    "media.charge_download: size must be non-negative, "
                    f"user_id={user_id}, size_bytes={size_bytes}"
                ),
            )

    def _validate_non_empty_text(
        self,
        field_name: str,
        value: str,
        max_length: int,
    ) -> None:
        """校验字符串字段非空且不超过数据库字段长度。"""

        if not isinstance(value, str) or not value.strip():
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=f"media.charge_download: {field_name} must not be empty",
            )
        if len(value) > max_length:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=(
                    "media.charge_download: text field too long, "
                    f"field={field_name}, length={len(value)}, max={max_length}"
                ),
            )


media_service = MediaService()
