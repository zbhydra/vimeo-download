"""服务节点 Admin 管理服务。

本服务只在 business role 使用，负责 `service_nodes` 控制面 CRUD、
启停和手动健康检查。API 层负责参数校验，本服务负责事务和写回。
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import time
from typing import Any

import httpx
from sqlalchemy import select, update

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.service_node_model import ServiceNodeModel
from app.services.service_node_health_service import service_node_health_service
from app.services.service_node_service import (
    SERVICE_NODE_HEALTH_UNKNOWN,
    SERVICE_NODE_STATUS_ACTIVE,
    SERVICE_NODE_TYPE_BUSINESS,
    SERVICE_NODE_TYPE_DOWNLOAD,
)

# 历史状态字段：disabled 节点由管理员停用，不能进入分配池。
SERVICE_NODE_STATUS_DISABLED = 3
# 权重下限：0 表示保留节点记录但不参与分配。
SERVICE_NODE_MIN_WEIGHT = 0
# 权重上限：防止单节点配置失误导致加权随机完全失衡。
SERVICE_NODE_MAX_WEIGHT = 1000


@dataclass(frozen=True, slots=True)
class ServiceNodeWriteData:
    """服务节点创建/更新字段。"""

    #: 节点类型，1=business，2=download；调度时二者进入同一个权重池。
    node_type: int
    #: Admin 展示名。
    name: str
    #: Admin 展示和人工筛选用地区标识。
    region: str
    #: 浏览器访问 parse-v2/download-v2 使用的公网 base URL。
    public_base_url: str
    #: 业务服务器健康检查访问节点使用的内网 base URL。
    internal_base_url: str
    #: 管理员总开关；False 时无论健康状态如何都不参与分配。
    enabled: bool
    #: 加权随机权重，范围由 SERVICE_NODE_MIN/MAX_WEIGHT 限制。
    weight: int


class ServiceNodeAdminService:
    """服务节点 Admin 控制面服务。"""

    async def list_nodes(self) -> list[ServiceNodeModel]:
        """按 node_id 正序返回全部服务节点。"""
        async with get_async_session() as session:
            result = await session.execute(
                select(ServiceNodeModel).order_by(ServiceNodeModel.node_id)
            )
            return list(result.scalars().all())

    async def create_node(self, data: ServiceNodeWriteData) -> ServiceNodeModel:
        """创建服务节点，并显式写入 created_at/updated_at。"""
        now = self._now()
        node = ServiceNodeModel(  # type: ignore[call-arg]
            node_type=data.node_type,
            name=data.name,
            region=data.region,
            public_base_url=data.public_base_url,
            internal_base_url=data.internal_base_url,
            enabled=data.enabled,
            status=self._status_for_enabled(data.enabled),
            weight=data.weight,
            last_health_status=SERVICE_NODE_HEALTH_UNKNOWN,
            created_at=now,
            updated_at=now,
        )
        async with get_async_session() as session:
            session.add(node)
            await session.commit()
            await session.refresh(node)
            return node

    async def update_node(
        self,
        *,
        node_id: int,
        data: ServiceNodeWriteData,
    ) -> ServiceNodeModel:
        """更新服务节点基础信息，并显式写入 updated_at。"""
        values = asdict(data)
        values["status"] = self._status_for_enabled(data.enabled)
        values["updated_at"] = self._now()
        async with get_async_session() as session:
            result = await session.execute(
                update(ServiceNodeModel)
                .where(ServiceNodeModel.node_id == node_id)
                .values(**values)
            )
            rowcount = int(getattr(result, "rowcount", 0))
            if rowcount != 1:
                raise AppCommonException(
                    CommonCode.NOT_FOUND,
                    f"service_node_admin.update_node: node not found, node_id={node_id}",
                )
            await session.commit()
        return await self.get_node(node_id=node_id)

    async def set_enabled(self, *, node_id: int, enabled: bool) -> ServiceNodeModel:
        """设置节点启用状态。"""
        return await self._update_fields(
            node_id=node_id,
            values={
                "enabled": enabled,
                "status": self._status_for_enabled(enabled),
            },
        )

    async def health_check_node(self, *, node_id: int) -> dict[str, Any]:
        """手动触发单节点健康检查，返回诊断结果和最新节点状态。"""
        node = await self.get_node(node_id=node_id)
        async with httpx.AsyncClient(timeout=8.0) as client:
            result = await service_node_health_service.check_one(
                client=client,
                node=node,
            )
        latest = await self.get_node(node_id=node_id)
        return {
            "diagnosis": asdict(result),
            "node": self.serialize_node(latest),
        }

    async def get_node(self, *, node_id: int) -> ServiceNodeModel:
        """按 node_id 读取节点，不存在时抛 404。"""
        async with get_async_session() as session:
            result = await session.execute(
                select(ServiceNodeModel).where(ServiceNodeModel.node_id == node_id)
            )
            node = result.scalar_one_or_none()
            if node is None:
                raise AppCommonException(
                    CommonCode.NOT_FOUND,
                    f"service_node_admin.get_node: node not found, node_id={node_id}",
                )
            return node

    def serialize_node(self, node: ServiceNodeModel) -> dict[str, Any]:
        """把 SQLAlchemy 节点模型转为 API 响应字典。"""
        return {
            "node_id": int(node.node_id),
            "node_type": int(node.node_type),
            "name": str(node.name),
            "region": str(node.region),
            "public_base_url": str(node.public_base_url),
            "internal_base_url": str(node.internal_base_url),
            "enabled": bool(node.enabled),
            "status": int(node.status),
            "weight": int(node.weight),
            "last_health_status": int(node.last_health_status),
            "last_health_at": node.last_health_at,
            "last_error": node.last_error,
            "version": node.version,
            "created_at": int(node.created_at),
            "updated_at": int(node.updated_at),
        }

    async def _update_fields(
        self,
        *,
        node_id: int,
        values: dict[str, Any],
    ) -> ServiceNodeModel:
        """更新节点局部字段并返回最新模型。"""
        values["updated_at"] = self._now()
        async with get_async_session() as session:
            result = await session.execute(
                update(ServiceNodeModel)
                .where(ServiceNodeModel.node_id == node_id)
                .values(**values)
            )
            rowcount = int(getattr(result, "rowcount", 0))
            if rowcount != 1:
                raise AppCommonException(
                    CommonCode.NOT_FOUND,
                    f"service_node_admin._update_fields: node not found, node_id={node_id}",
                )
            await session.commit()
        return await self.get_node(node_id=node_id)

    def validate_write_data(self, data: ServiceNodeWriteData) -> None:
        """集中校验服务节点写入枚举，供 API 和测试复用。"""
        if data.node_type not in (
            SERVICE_NODE_TYPE_BUSINESS,
            SERVICE_NODE_TYPE_DOWNLOAD,
        ):
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                f"service_node_validate: invalid node_type={data.node_type}",
            )
        if not SERVICE_NODE_MIN_WEIGHT <= data.weight <= SERVICE_NODE_MAX_WEIGHT:
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                f"service_node_validate: invalid weight={data.weight}",
            )

    @staticmethod
    def _status_for_enabled(enabled: bool) -> int:
        """把唯一 Admin 开关映射到调度状态。"""
        return SERVICE_NODE_STATUS_ACTIVE if enabled else SERVICE_NODE_STATUS_DISABLED

    @staticmethod
    def _now() -> int:
        """返回 Unix 秒级时间戳。"""
        return int(time.time())


service_node_admin_service = ServiceNodeAdminService()
