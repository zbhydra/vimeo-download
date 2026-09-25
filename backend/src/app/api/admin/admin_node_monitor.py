"""Admin 节点本机监控 API。

本模块只读取当前进程内的本机监控缓存，不访问业务数据库、Redis 或
`service_nodes`。business/download role 都可以挂载，用于 Admin 前端按节点
直连读取当前节点运行态。
"""

from fastapi import APIRouter, Depends

from app.api.admin_dependencies import get_admin_jwt_only
from app.services.monitor_service import monitor_service
from app.utils.logger import logger
from app.utils.response import ResponseUtils

node_local_router = APIRouter(
    prefix="/node-monitor",
    tags=["admin-node-local-monitor"],
)


def get_network_rate_for_admin_response() -> dict[str, int] | None:
    """读取本机网络速率缓存；失败时返回空，避免影响管理页面。"""
    try:
        return monitor_service.get_network_rate()
    except Exception as exc:
        logger.error(
            "admin_node_monitor_network_rate_failed: "
            f"error={type(exc).__name__}: {exc}",
            exc_info=True,
        )
        return None


@node_local_router.get(
    "/network-rate",
    dependencies=[Depends(get_admin_jwt_only)],
)
async def get_node_network_rate():
    """返回当前节点仍在有效期内的网络进出速率。"""
    return ResponseUtils.ok({"network_rate": get_network_rate_for_admin_response()})
