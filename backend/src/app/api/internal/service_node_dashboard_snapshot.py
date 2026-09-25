"""服务节点大盘快照内部接口。

该接口只读取当前进程本机网络状态，不访问业务数据库，适合
business/download role 共同挂载到 `/internal`。
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.internal_dependencies import (
    ServiceNodeInternalContext,
    get_service_node_internal_access,
)
from app.services.monitor_service import monitor_service

router = APIRouter(prefix="/service-node", tags=["service-node"])


class ServiceNodeDashboardSnapshotResponse(BaseModel):
    """节点大盘快照响应。"""

    network_rate: dict[str, int] | None = Field(
        default=None,
        description="当前节点网络速率",
    )


@router.get(
    "/dashboard-snapshot",
    response_model=ServiceNodeDashboardSnapshotResponse,
)
async def get_service_node_dashboard_snapshot(
    _internal: ServiceNodeInternalContext = Depends(get_service_node_internal_access),
) -> ServiceNodeDashboardSnapshotResponse:
    """返回当前节点本机网络速率。"""
    return ServiceNodeDashboardSnapshotResponse(
        network_rate=monitor_service.get_network_rate(),
    )
