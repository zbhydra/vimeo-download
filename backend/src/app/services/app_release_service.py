"""App 版本发布记录服务。

client 版本检查按 platform+channel 取 enabled 的最大 version_code 条目；
发布端点入库并用唯一键拦截重复 version_code。
"""

from collections.abc import Mapping, Sequence
from typing import Literal, cast

from sqlalchemy import Select, delete, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.app_release_model import AppReleaseModel
from app.utils.time import timestamp_now

AppReleaseListOrder = Literal[
    "created_at_desc",
    "created_at_asc",
    "version_code_desc",
    "version_code_asc",
]


class AppReleaseService:
    """App 版本发布记录服务。"""

    async def app_release_create(
        self,
        *,
        platform: str,
        channel: str,
        version_code: int,
        version_name: str,
        download_url: str | None,
        release_notes: str,
        forced: bool = False,
        enabled: bool = True,
    ) -> AppReleaseModel:
        """新增一条版本发布记录；唯一键冲突映射为版本已存在业务错误。"""

        item = AppReleaseModel(  # type: ignore[call-arg]
            platform=platform,
            channel=channel,
            version_code=version_code,
            version_name=version_name,
            download_url=download_url,
            release_notes=release_notes,
            forced=forced,
            enabled=enabled,
            created_at=timestamp_now(),
        )
        try:
            async with get_async_session() as db:
                db.add(item)
                await db.commit()
                await db.refresh(item)
                return item
        except IntegrityError as exc:
            raise AppCommonException(
                CommonCode.APP_RELEASE_VERSION_EXISTS,
                ext_msg=(
                    "app_release_create: duplicate version_code: "
                    f"platform={platform}, channel={channel}, "
                    f"version_code={version_code}"
                ),
            ) from exc

    async def app_release_lists(
        self,
        *,
        ids: Sequence[int] | None = None,
        platforms: Sequence[str] | None = None,
        channels: Sequence[str] | None = None,
        version_codes: Sequence[int] | None = None,
        version_names: Sequence[str] | None = None,
        download_urls: Sequence[str] | None = None,
        release_notes: Sequence[str] | None = None,
        forced: bool | None = None,
        enabled: bool | None = None,
        created_after_ms: int | None = None,
        created_before_ms: int | None = None,
        offset: int = 0,
        limit: int = 20,
        order_by: AppReleaseListOrder = "version_code_desc",
    ) -> list[AppReleaseModel]:
        """按通用条件查询版本发布记录。"""

        stmt = self._apply_app_release_filters(
            select(AppReleaseModel),
            ids=ids,
            platforms=platforms,
            channels=channels,
            version_codes=version_codes,
            version_names=version_names,
            download_urls=download_urls,
            release_notes=release_notes,
            forced=forced,
            enabled=enabled,
            created_after_ms=created_after_ms,
            created_before_ms=created_before_ms,
        )
        if order_by == "created_at_asc":
            stmt = stmt.order_by(AppReleaseModel.created_at.asc())
        elif order_by == "version_code_asc":
            stmt = stmt.order_by(AppReleaseModel.version_code.asc())
        elif order_by == "version_code_desc":
            stmt = stmt.order_by(AppReleaseModel.version_code.desc())
        else:
            stmt = stmt.order_by(AppReleaseModel.created_at.desc())
        stmt = stmt.offset(offset).limit(limit)

        async with get_async_session() as db:
            result = await db.execute(stmt)
            return list(result.scalars().all())

    async def app_release_info(self, release_id: int) -> AppReleaseModel | None:
        """按记录 ID 读取版本发布记录。"""

        rows = await self.app_release_lists(ids=[release_id], limit=1)
        return rows[0] if rows else None

    async def app_release_update(
        self,
        release_id: int,
        fields: Mapping[str, object | None],
    ) -> bool:
        """更新版本发布记录，值为 None 的字段不更新。"""

        values = {key: value for key, value in fields.items() if value is not None}
        if not values:
            return False

        async with get_async_session() as db:
            result = cast(
                CursorResult[object],
                await db.execute(
                    update(AppReleaseModel)
                    .where(AppReleaseModel.id == release_id)
                    .values(**values)
                ),
            )
            await db.commit()
            return result.rowcount == 1

    async def app_release_del(self, release_ids: Sequence[int]) -> int:
        """按记录 ID 批量删除版本发布记录。"""

        if not release_ids:
            return 0

        async with get_async_session() as db:
            result = cast(
                CursorResult[object],
                await db.execute(
                    delete(AppReleaseModel).where(AppReleaseModel.id.in_(release_ids))
                ),
            )
            await db.commit()
            return int(result.rowcount or 0)

    def _apply_app_release_filters(
        self,
        stmt: Select[tuple[AppReleaseModel]],
        *,
        ids: Sequence[int] | None,
        platforms: Sequence[str] | None,
        channels: Sequence[str] | None,
        version_codes: Sequence[int] | None,
        version_names: Sequence[str] | None,
        download_urls: Sequence[str] | None,
        release_notes: Sequence[str] | None,
        forced: bool | None,
        enabled: bool | None,
        created_after_ms: int | None,
        created_before_ms: int | None,
    ) -> Select[tuple[AppReleaseModel]]:
        """应用版本发布记录查询条件。"""

        if ids is not None:
            stmt = stmt.where(AppReleaseModel.id.in_(ids))
        if platforms is not None:
            stmt = stmt.where(AppReleaseModel.platform.in_(platforms))
        if channels is not None:
            stmt = stmt.where(AppReleaseModel.channel.in_(channels))
        if version_codes is not None:
            stmt = stmt.where(AppReleaseModel.version_code.in_(version_codes))
        if version_names is not None:
            stmt = stmt.where(AppReleaseModel.version_name.in_(version_names))
        if download_urls is not None:
            stmt = stmt.where(AppReleaseModel.download_url.in_(download_urls))
        if release_notes is not None:
            stmt = stmt.where(AppReleaseModel.release_notes.in_(release_notes))
        if forced is not None:
            stmt = stmt.where(AppReleaseModel.forced == forced)
        if enabled is not None:
            stmt = stmt.where(AppReleaseModel.enabled == enabled)
        if created_after_ms is not None:
            stmt = stmt.where(AppReleaseModel.created_at >= created_after_ms)
        if created_before_ms is not None:
            stmt = stmt.where(AppReleaseModel.created_at <= created_before_ms)
        return stmt


app_release_service = AppReleaseService()
