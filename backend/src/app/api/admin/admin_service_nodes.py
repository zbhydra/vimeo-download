"""Admin 服务节点管理 API。

提供 `service_nodes` 表的列表、创建、更新、启停和手动健康检查。
该控制面只挂载在 business role。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.services.service_node_admin_service import (
    SERVICE_NODE_MAX_WEIGHT,
    SERVICE_NODE_MIN_WEIGHT,
    ServiceNodeWriteData,
    service_node_admin_service,
)
from app.services.service_node_service import (
    SERVICE_NODE_TYPE_BUSINESS,
    SERVICE_NODE_TYPE_DOWNLOAD,
)
from app.utils.service_node_url import normalize_service_node_base_url
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/service-nodes", tags=["admin-service-nodes"])
NodeIdPath = Annotated[int, Path(ge=1, description="服务节点 ID")]


class ServiceNodeWriteRequest(BaseModel):
    """服务节点创建/更新请求。"""

    node_type: int = Field(
        ...,
        description="节点类型：1=business，2=download",
    )
    name: str = Field(..., min_length=1, max_length=100, description="节点名称")
    region: str = Field(..., min_length=1, max_length=64, description="节点地区")
    public_base_url: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="公网访问基础地址",
    )
    internal_base_url: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="内网健康检查基础地址",
    )
    enabled: bool = Field(default=True, description="是否启用")
    weight: int = Field(
        default=100,
        ge=SERVICE_NODE_MIN_WEIGHT,
        le=SERVICE_NODE_MAX_WEIGHT,
        description="节点随机选择权重，0 表示不参与分配",
    )

    @field_validator("name", "region", "public_base_url", "internal_base_url")
    @classmethod
    def _strip_required_string(cls, value: str) -> str:
        """去除首尾空白，空值交给 min_length 之外的业务校验兜底。"""
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must not be blank")
        return normalized

    @field_validator("name", "region")
    @classmethod
    def _reject_unsafe_label(cls, value: str) -> str:
        """名称类字段拒绝控制字符和尖括号，避免后台展示配置污染。"""
        if any(ord(char) < 32 or char in "<>\u202e" for char in value):
            raise ValueError("value contains unsafe characters")
        return value

    @field_validator("public_base_url", "internal_base_url")
    @classmethod
    def _validate_http_base_url(cls, value: str) -> str:
        """节点基础地址必须是无 query/fragment/userinfo 的 http(s) base URL。"""
        return normalize_service_node_base_url(value)

    def to_write_data(self) -> ServiceNodeWriteData:
        """转换为 service 层写入对象。"""
        data = ServiceNodeWriteData(
            node_type=self.node_type,
            name=self.name,
            region=self.region,
            public_base_url=self.public_base_url,
            internal_base_url=self.internal_base_url,
            enabled=self.enabled,
            weight=self.weight,
        )
        service_node_admin_service.validate_write_data(data)
        return data


@router.get("")
async def list_service_nodes(
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """查询服务节点列表。"""
    nodes = await service_node_admin_service.list_nodes()
    return ResponseUtils.ok(
        {
            "nodes": [
                service_node_admin_service.serialize_node(node) for node in nodes
            ],
            "total": len(nodes),
        }
    )


@router.post("")
async def create_service_node(
    req: ServiceNodeWriteRequest,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """创建服务节点。"""
    node = await service_node_admin_service.create_node(req.to_write_data())
    return ResponseUtils.ok(service_node_admin_service.serialize_node(node))


@router.post("/{node_id}/update")
async def update_service_node(
    req: ServiceNodeWriteRequest,
    node_id: NodeIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """更新服务节点基础信息。"""
    node = await service_node_admin_service.update_node(
        node_id=node_id,
        data=req.to_write_data(),
    )
    return ResponseUtils.ok(service_node_admin_service.serialize_node(node))


@router.post("/{node_id}/enable")
async def enable_service_node(
    node_id: NodeIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """启用服务节点。"""
    node = await service_node_admin_service.set_enabled(
        node_id=node_id,
        enabled=True,
    )
    return ResponseUtils.ok(service_node_admin_service.serialize_node(node))


@router.post("/{node_id}/disable")
async def disable_service_node(
    node_id: NodeIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """停用服务节点。"""
    node = await service_node_admin_service.set_enabled(
        node_id=node_id,
        enabled=False,
    )
    return ResponseUtils.ok(service_node_admin_service.serialize_node(node))


@router.post("/{node_id}/health-check")
async def health_check_service_node(
    node_id: NodeIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """手动检查服务节点健康状态并返回本地诊断。"""
    return ResponseUtils.ok(
        await service_node_admin_service.health_check_node(node_id=node_id)
    )


__all__ = [
    "SERVICE_NODE_TYPE_BUSINESS",
    "SERVICE_NODE_TYPE_DOWNLOAD",
    "router",
]
