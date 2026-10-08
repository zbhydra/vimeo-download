"""代理池配置管理服务。

该服务只提供配置的查询、写入和删除。批量新增在一个 session 中统一 commit，
数据库异常交由 session 上下文回滚，从而保证整批成功或整批失败。
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass

from sqlalchemy import delete, func, select, update

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.proxy_pool_entry_model import ProxyPoolEntryModel
from app.utils.time import timestamp_now

PROXY_TYPE_DYNAMIC = 1
PROXY_TYPE_STATIC = 2


@dataclass(frozen=True, slots=True)
class ProxyPoolEntryWriteData:
    """代理配置的完整写入字段。"""

    name: str
    proxy_type: int
    protocol: str
    dynamic_url: str | None
    host: str | None
    port: int | None
    username: str | None
    password: str | None
    country_code: str | None
    enabled: bool


class ProxyPoolService:
    """代理池配置 CRUD 服务。"""

    async def proxy_pool_entry_lists(
        self,
        *,
        ids: Sequence[int] | None = None,
        name_like: str | None = None,
        proxy_types: Sequence[int] | None = None,
        protocols: Sequence[str] | None = None,
        country_codes: Sequence[str] | None = None,
        enabled: Sequence[bool] | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[ProxyPoolEntryModel]:
        """按筛选条件分页读取代理配置，返回完整 ORM 模型。"""
        stmt = self._apply_filters(
            select(ProxyPoolEntryModel),
            ids=ids,
            name_like=name_like,
            proxy_types=proxy_types,
            protocols=protocols,
            country_codes=country_codes,
            enabled=enabled,
        )
        async with get_async_session() as session:
            result = await session.execute(
                stmt.order_by(ProxyPoolEntryModel.proxy_id).offset(offset).limit(limit)
            )
            return list(result.scalars().all())

    async def count_proxy_pool_entries(
        self,
        *,
        name_like: str | None = None,
        proxy_types: Sequence[int] | None = None,
        protocols: Sequence[str] | None = None,
        country_codes: Sequence[str] | None = None,
        enabled: Sequence[bool] | None = None,
    ) -> int:
        """统计筛选后的代理配置数量。"""
        stmt = self._apply_filters(
            select(func.count(ProxyPoolEntryModel.proxy_id)),
            name_like=name_like,
            proxy_types=proxy_types,
            protocols=protocols,
            country_codes=country_codes,
            enabled=enabled,
        )
        async with get_async_session() as session:
            result = await session.execute(stmt)
            return int(result.scalar_one())

    async def proxy_pool_entry_info(self, proxy_id: int) -> ProxyPoolEntryModel:
        """读取一条代理配置；不存在时返回统一 NOT_FOUND。"""
        rows = await self.proxy_pool_entry_lists(ids=[proxy_id], limit=1)
        if not rows:
            raise AppCommonException(
                CommonCode.NOT_FOUND,
                ext_msg=(
                    "proxy_pool_entry_info: proxy entry not found: "
                    f"proxy_id={proxy_id}"
                ),
            )
        return rows[0]

    async def proxy_pool_entry_create(
        self, data: ProxyPoolEntryWriteData
    ) -> ProxyPoolEntryModel:
        """创建一条代理配置。"""
        entry = self._build_model(data)
        async with get_async_session() as session:
            session.add(entry)
            await session.commit()
            await session.refresh(entry)
            return entry

    async def proxy_pool_entry_batch_create(
        self, entries: Sequence[ProxyPoolEntryWriteData]
    ) -> list[ProxyPoolEntryModel]:
        """在同一事务中按输入顺序创建多条代理配置。"""
        models = [self._build_model(entry) for entry in entries]
        async with get_async_session() as session:
            for model in models:
                session.add(model)
            await session.commit()
            for model in models:
                await session.refresh(model)
            return models

    async def proxy_pool_entry_update(
        self,
        proxy_id: int,
        data: ProxyPoolEntryWriteData,
    ) -> ProxyPoolEntryModel:
        """更新一条代理配置，并允许清理不再使用的可空字段。"""
        values = asdict(data)
        values["updated_at"] = timestamp_now()
        async with get_async_session() as session:
            await session.execute(
                update(ProxyPoolEntryModel)
                .where(ProxyPoolEntryModel.proxy_id == proxy_id)
                .values(**values)
            )
            await session.commit()
        return await self.proxy_pool_entry_info(proxy_id)

    async def proxy_pool_entry_del(self, proxy_id: int) -> None:
        """物理删除一条代理配置。"""
        async with get_async_session() as session:
            result = await session.execute(
                delete(ProxyPoolEntryModel).where(
                    ProxyPoolEntryModel.proxy_id == proxy_id
                )
            )
            if int(getattr(result, "rowcount", 0)) != 1:
                raise AppCommonException(
                    CommonCode.NOT_FOUND,
                    ext_msg=(
                        "proxy_pool_entry_del: proxy entry not found: "
                        f"proxy_id={proxy_id}"
                    ),
                )
            await session.commit()

    @staticmethod
    def serialize_entry(
        entry: ProxyPoolEntryModel, *, include_credentials: bool
    ) -> dict[str, object]:
        """序列化代理配置；列表摘要默认排除用户名和密码。"""
        data: dict[str, object] = {
            "proxy_id": int(entry.proxy_id),
            "name": str(entry.name),
            "proxy_type": int(entry.proxy_type),
            "protocol": str(entry.protocol),
            "dynamic_url": entry.dynamic_url,
            "host": entry.host,
            "port": entry.port,
            "country_code": entry.country_code,
            "enabled": bool(entry.enabled),
            "created_at": int(entry.created_at),
            "updated_at": int(entry.updated_at),
        }
        if include_credentials:
            data["username"] = entry.username
            data["password"] = entry.password
        return data

    @staticmethod
    def _build_model(data: ProxyPoolEntryWriteData) -> ProxyPoolEntryModel:
        """把已校验写入数据转换为 ORM 模型。"""
        now = timestamp_now()
        return ProxyPoolEntryModel(  # type: ignore[call-arg]
            name=data.name,
            proxy_type=data.proxy_type,
            protocol=data.protocol,
            dynamic_url=data.dynamic_url,
            host=data.host,
            port=data.port,
            username=data.username,
            password=data.password,
            country_code=data.country_code,
            enabled=data.enabled,
            created_at=now,
            updated_at=now,
        )

    @staticmethod
    def _apply_filters(
        stmt,
        *,
        ids: Sequence[int] | None = None,
        name_like: str | None = None,
        proxy_types: Sequence[int] | None = None,
        protocols: Sequence[str] | None = None,
        country_codes: Sequence[str] | None = None,
        enabled: Sequence[bool] | None = None,
    ):
        """复用列表和计数查询的筛选条件。"""
        if ids is not None:
            stmt = stmt.where(ProxyPoolEntryModel.proxy_id.in_(ids))
        if name_like:
            stmt = stmt.where(ProxyPoolEntryModel.name.like(f"%{name_like}%"))
        if proxy_types is not None:
            stmt = stmt.where(ProxyPoolEntryModel.proxy_type.in_(proxy_types))
        if protocols is not None:
            stmt = stmt.where(ProxyPoolEntryModel.protocol.in_(protocols))
        if country_codes is not None:
            stmt = stmt.where(ProxyPoolEntryModel.country_code.in_(country_codes))
        if enabled is not None:
            stmt = stmt.where(ProxyPoolEntryModel.enabled.in_(enabled))
        return stmt


proxy_pool_service = ProxyPoolService()


__all__ = [
    "PROXY_TYPE_DYNAMIC",
    "PROXY_TYPE_STATIC",
    "ProxyPoolEntryWriteData",
    "ProxyPoolService",
    "proxy_pool_service",
]
