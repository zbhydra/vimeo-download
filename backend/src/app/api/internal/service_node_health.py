"""下载节点无数据库健康检查接口。

本模块只汇报当前进程角色、版本和本地运行态计数。它不能导入业务数据库、
service_nodes 控制面或任何需要业务库初始化的模块，保证 download role 可无 DB 启动。
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/service-node", tags=["service-node"])


class ServiceNodeHealthResponse(BaseModel):
    """下载节点健康检查响应。"""

    status: str = Field(..., description="节点基础健康状态")
    role: str = Field(..., description="当前 app.role")
    version: str = Field(..., description="应用版本")


@router.get("/health", response_model=ServiceNodeHealthResponse)
async def service_node_health_check() -> ServiceNodeHealthResponse:
    """
    返回下载节点本地健康状态。

    Returns:
        ServiceNodeHealthResponse: 不包含业务数据库 node_id 的健康信息。
    """
    return ServiceNodeHealthResponse(
        status="ok",
        role=settings.app.role,
        version=settings.app.version,
    )
