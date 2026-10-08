"""
FastAPI 请求处理流程

================================================================================
请求进入 (Request In)
================================================================================

1. Middleware 按添加顺序的**反向**执行（洋葱模型）
   ┌────────────────────────────────────────────────────────────────────┐
   │  RequestLoggingMiddleware (最后添加，最先执行)                     │
   │  ├─ 记录请求开始                                                    │
   │  └─ await call_next(request) ──────────────────────────┐           │
   │                                                          │           │
   │  CrossOriginMiddleware (中间添加)                        │           │
   │  ├─ 处理 CORS                                            │           │
   │  └─ await call_next(request) ───────────────────┐       │           │
   │                                                    │       │           │
   │  ErrorHandlingMiddleware (最先添加，最后执行)     │       │           │
   │  ├─ try: await call_next(request) ────────┐       │       │           │
   │  │                                        │       │       │           │
   │  │  ↓ 路由处理 & 业务逻辑                  │       │       │           │
   └──┼────────────────────────────────────────┼───────┼───────┼───────────┘
      │                                        │       │       │
      │  ┌─────────────────────────────────────┼───────┼───────┼───────────┐
      │  │  Pydantic 验证请求参数               │       │       │           │
      │  │  ├─ 解析请求体                       │       │       │           │
      │  │  └─ 失败 → raise ValidationError     │       │       │           │
      │  │                                        │       │       │           │
      │  │  路由处理函数                         │       │       │           │
      │  │  ├─ 执行业务逻辑                     │       │       │           │
      │  │  └─ return Response                  │       │       │           │
      │  └─────────────────────────────────────┼───────┼───────┼───────────┘
      │                                        │       │       │
      │  ↓ 异常处理流程                        │       │       │
      │                                        │       │       │
      │  @app.exception_handler(ValidationError) ←─────┘       │
      │  ├─ 捕获 ValidationError                        │       │
      │  ├─ 自定义错误响应                              │       │
      │  └─ return JSONResponse (status=422) ──────────┐       │
      │                                                │       │
      │  其他未捕获异常 → 传播回 Middleware ────────────┘       │
      │                                                        │
      │  ↓ 响应返回 (Response Out)                              │
      │                                                        │
      └─ ErrorHandlingMiddleware except 块捕获异常 ────────────┘
         ├─ 捕获 AppCommonException → 翻译后返回
         └─ 捕获其他 Exception → 通用错误响应

================================================================================
异常处理优先级
================================================================================

1. @app.exception_handler() 先触发
   - 处理路由处理阶段抛出的特定异常（如 ValidationError）
   - 返回自定义错误响应

2. Middleware 的 except 块后触发
   - 只捕获 Exception Handler 未处理的异常
   - ErrorHandlingMiddleware 处理 AppCommonException 和通用异常

================================================================================
Middleware 添加顺序与执行顺序
================================================================================

添加顺序:
  app.add_middleware(ErrorHandlingMiddleware)      # ① 最先添加
  app.add_middleware(CrossOriginMiddleware)        # ②
  app.add_middleware(RequestLoggingMiddleware)     # ③ 最后添加

请求进入顺序 (从外到内):
  ③ RequestLoggingMiddleware → ② CrossOrigin → ① ErrorHandling → 路由

响应返回顺序 (从内到外):
  路由 → ① ErrorHandling → ② CrossOrigin → ③ RequestLogging → 响应

================================================================================
"""

from collections.abc import AsyncIterator
import asyncio
from contextlib import asynccontextmanager
import importlib
from types import ModuleType
from typing import Literal

from app.middleware.cross_origin import CrossOriginMiddleware
import uvicorn

from app.core.config import settings
from app.utils.logger import logger, setup_logger
from app.middleware import (
    ErrorHandlingMiddleware,
    RequestLoggingMiddleware,
)
from fastapi import FastAPI
from fastapi.routing import APIRouter


# 设置日志
setup_logger("server")

AppRole = Literal["business", "download"]
# 收到退出信号后立即关闭监听，只给存量请求最多 10 秒完成，避免长下载阻塞重启。
GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS = 10
# media-v2 router 模块名，使用延迟导入避免 download role 初始化业务路由依赖。
_MEDIA_V2_MODULE = "app.api.client.media_v2_client"
# media-v2 router 在模块中的属性名。
_MEDIA_V2_ROUTER_ATTR = "router"


async def _shutdown_node_runtime_resources() -> None:
    """关闭业务数据库之外的节点运行态资源。"""
    from app.provider.browser_runtime import close_browser_runtimes

    await close_browser_runtimes()


async def _start_business_cron_scheduler() -> None:
    """启动 business role 专属定时任务调度器。"""
    from app.crons.crons import cron_scheduler

    await cron_scheduler.start()


async def _stop_business_cron_scheduler() -> None:
    """停止 business role 专属定时任务调度器。"""
    from app.crons.crons import cron_scheduler

    await cron_scheduler.stop()


async def _shutdown_business_database_resources() -> None:
    """关闭 business role 专属业务数据库资源。"""
    from app.core.database import close_engine

    await close_engine()


async def _start_monitor_service() -> None:
    """启动 business/download role 共用的本机监控服务。"""
    from app.services.monitor_service import monitor_service

    await monitor_service.start()


async def _stop_monitor_service() -> None:
    """停止本机监控服务。"""
    from app.services.monitor_service import monitor_service

    await monitor_service.shutdown()


async def _start_service_node_health_task() -> asyncio.Task[None]:
    """
    启动 business role 服务节点健康检查后台任务。

    本函数只在 business lifespan 中调用，因此可以导入业务数据库相关服务。
    """
    from app.services.service_node_health_service import service_node_health_service

    return asyncio.create_task(service_node_health_service.run_forever())


async def _stop_service_node_health_task(task: asyncio.Task[None] | None) -> None:
    """
    停止服务节点健康检查后台任务。

    Args:
        task: 已启动的后台任务；None 表示未启动。
    """
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        logger.info("service_node_health_task_stopped")


def _create_lifespan(role: AppRole):
    """按 app role 创建生命周期管理器。"""

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        """
        应用生命周期管理。

        download role 只能清理本地运行态资源，不能导入或触发业务数据库路径。
        """
        logger.info(
            f"Starting {settings.app.name} v{settings.app.version}, role={role}"
        )

        # await init_db()

        service_node_health_task: asyncio.Task[None] | None = None
        await _start_monitor_service()
        if role == "business":
            await _start_business_cron_scheduler()
            service_node_health_task = await _start_service_node_health_task()

        logger.info("Application started successfully")

        try:
            yield
        finally:
            logger.info("Application is shutting down")

            await _stop_monitor_service()
            await _stop_service_node_health_task(service_node_health_task)

            await _shutdown_node_runtime_resources()
            if role == "business":
                await _stop_business_cron_scheduler()
                await _shutdown_business_database_resources()

    return lifespan


def _add_middlewares(app_instance: FastAPI) -> None:
    """按项目约定添加全局中间件。"""
    app_instance.add_middleware(ErrorHandlingMiddleware)
    app_instance.add_middleware(CrossOriginMiddleware)
    app_instance.add_middleware(RequestLoggingMiddleware)


def _include_api_info(app_instance: FastAPI) -> None:
    """挂载业务 API 根路径说明。"""

    @app_instance.get("/api")
    async def api_info() -> dict[str, str]:
        """API 根路径。"""
        return {
            "message": f"Welcome to {settings.app.name}",
            "version": settings.app.version,
        }


def _include_service_node_routes(app_instance: FastAPI) -> None:
    """挂载无业务数据库依赖的节点内部路由。"""
    from app.api.internal.service_node_health import (
        router as service_node_health_router,
    )
    from app.api.internal.service_node_dashboard_snapshot import (
        router as service_node_dashboard_snapshot_router,
    )

    app_instance.include_router(
        service_node_health_router,
        prefix="/internal",
        tags=["service-node"],
    )
    app_instance.include_router(
        service_node_dashboard_snapshot_router,
        prefix="/internal",
        tags=["service-node"],
    )


def _load_optional_media_v2_router() -> APIRouter | None:
    """
    加载 041.002B 提供的 media v2 router。

    本执行单元只负责角色化装配。若并行实现尚未提供 router，启动应继续；
    一旦模块存在但导出不符合契约，则直接失败，避免吞掉真实集成错误。
    """
    try:
        module: ModuleType = importlib.import_module(_MEDIA_V2_MODULE)
    except ModuleNotFoundError as exc:
        if exc.name == _MEDIA_V2_MODULE:
            logger.warning(
                f"media_v2_router_not_mounted: module={_MEDIA_V2_MODULE} missing"
            )
            return None
        raise

    router = getattr(module, _MEDIA_V2_ROUTER_ATTR, None)
    if not isinstance(router, APIRouter):
        raise RuntimeError(
            "media_v2_router_invalid: "
            f"module={_MEDIA_V2_MODULE}, attr={_MEDIA_V2_ROUTER_ATTR}"
        )
    return router


def _include_media_v2_routes(app_instance: FastAPI) -> None:
    """挂载 media parse-v2 / download-v2 节点执行路由。"""
    router = _load_optional_media_v2_router()
    if router is None:
        return
    app_instance.include_router(router, prefix="/api/client", tags=["client"])


def _include_media_pre_v2_routes(app_instance: FastAPI) -> None:
    """挂载 business role 专属 media Pre V2 控制面路由。"""
    from app.api.client.media_pre_v2_client import router as media_pre_v2_router

    app_instance.include_router(
        media_pre_v2_router,
        prefix="/api/client",
        tags=["client"],
    )


def _include_node_local_admin_routes(app_instance: FastAPI) -> None:
    """
    挂载节点本地 Admin 管理 API。

    download role 使用这些同路径 router 暴露节点本地平台管理能力，鉴权只校验
    ADMIN_ACCESS JWT，不访问业务数据库或 Redis。
    """
    from app.api.admin.admin_node_monitor import (
        node_local_router as admin_node_monitor_router,
    )

    app_instance.include_router(
        admin_node_monitor_router,
        prefix="/api/admin",
        tags=["admin-node-local"],
    )


def _include_business_routes(app_instance: FastAPI) -> None:
    """挂载完整业务路由，保持旧 business role 行为。"""
    from app.api.admin.admin_auth import router as admin_auth_router
    from app.api.admin.admin_dashboard import router as admin_dashboard_router
    from app.api.admin.admin_download_analytics import (
        router as admin_download_analytics_router,
    )
    from app.api.admin.admin_mark_log import router as admin_mark_log_router
    from app.api.admin.admin_order_analytics import (
        router as admin_order_analytics_router,
    )
    from app.api.admin.admin_orders import router as admin_orders_router
    from app.api.admin.admin_proxy_pool import router as admin_proxy_pool_router
    from app.api.admin.admin_users import router as admin_users_router
    from app.api.admin.admin_service_nodes import router as admin_service_nodes_router
    from app.api.admin.admin_system_settings import (
        router as admin_system_settings_router,
    )
    from app.api.admin.admin_node_monitor import (
        node_local_router as admin_node_monitor_router,
    )
    from app.api.callback.paypal_callback import router as paypal_callback_router
    from app.api.callback.clink_callback import router as clink_callback_router
    from app.api.callback.test_pay_callback import router as callback_router
    from app.api.client.auth_client import router as auth_router
    from app.api.client.checkin_client import router as checkin_router
    from app.api.client.brand_asset_client import router as brand_asset_router
    from app.api.client.credit_client import router as credit_router
    from app.api.client.mark_client import router as mark_router
    from app.api.client.order_client import router as order_router
    from app.api.client.quota_client import router as quota_router
    from app.api.client.remote_config_client import router as remote_config_router
    from app.api.client.subscription_client import router as subscription_router
    from app.api.external.external_app_release import (
        router as external_app_release_router,
    )
    from app.api.external.external_system_dashboard import (
        router as external_system_dashboard_router,
    )
    from app.api.system.dashboard import router as dashboard_router
    from app.api.system.health import router as health_router

    app_instance.include_router(health_router, prefix="/api/system", tags=["system"])
    app_instance.include_router(dashboard_router, prefix="/api/system", tags=["system"])
    app_instance.include_router(auth_router, prefix="/api/client", tags=["client"])
    app_instance.include_router(checkin_router, prefix="/api/client", tags=["client"])
    app_instance.include_router(credit_router, prefix="/api/client", tags=["client"])
    app_instance.include_router(quota_router, prefix="/api/client", tags=["client"])
    app_instance.include_router(
        subscription_router, prefix="/api/client", tags=["client"]
    )
    app_instance.include_router(order_router, prefix="/api/client", tags=["client"])
    app_instance.include_router(mark_router, prefix="/api/client", tags=["client"])
    app_instance.include_router(
        remote_config_router, prefix="/api/client", tags=["client"]
    )
    app_instance.include_router(brand_asset_router)
    _include_media_pre_v2_routes(app_instance)
    app_instance.include_router(
        callback_router, prefix="/api/callback", tags=["callback"]
    )
    app_instance.include_router(
        paypal_callback_router, prefix="/api/callback", tags=["callback"]
    )
    app_instance.include_router(
        clink_callback_router, prefix="/api/callback", tags=["callback"]
    )
    app_instance.include_router(admin_auth_router, prefix="/api/admin", tags=["admin"])
    app_instance.include_router(
        admin_dashboard_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(
        admin_download_analytics_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(
        admin_mark_log_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(
        admin_order_analytics_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(
        admin_orders_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(
        admin_proxy_pool_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(admin_users_router, prefix="/api/admin", tags=["admin"])
    app_instance.include_router(
        admin_service_nodes_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(
        admin_node_monitor_router, prefix="/api/admin", tags=["admin-node-local"]
    )
    app_instance.include_router(
        admin_system_settings_router, prefix="/api/admin", tags=["admin"]
    )
    app_instance.include_router(
        external_app_release_router,
        prefix="/api/external",
        tags=["external"],
    )
    app_instance.include_router(
        external_system_dashboard_router,
        prefix="/api/external",
        tags=["external"],
    )


def _current_role() -> AppRole:
    """读取并校验当前应用角色。"""
    role = settings.app.role
    if role not in ("business", "download"):
        raise RuntimeError(f"invalid app.role={role}")
    return role


def create_app() -> FastAPI:
    """按 app.role 创建 FastAPI 应用实例。"""
    role = _current_role()
    app_instance = FastAPI(
        title=settings.api.title,
        description=settings.api.description,
        lifespan=_create_lifespan(role),
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    _add_middlewares(app_instance)
    _include_service_node_routes(app_instance)
    _include_media_v2_routes(app_instance)

    if role == "business":
        _include_business_routes(app_instance)
        _include_api_info(app_instance)
    else:
        _include_node_local_admin_routes(app_instance)

    return app_instance


# 创建 FastAPI 应用
app = create_app()


def main_entry() -> None:
    """启动单进程 Uvicorn 服务。"""
    # 节点运行态资源（浏览器运行时、Cookie 池）只支持单进程长期持有，不能按 CPU 数量起多 worker。
    uvicorn.run(
        "app.main:app",
        host=settings.app.host,
        port=settings.app.port,
        reload=settings.app.debug,
        log_level=settings.logging.level.lower(),
        access_log=False,
        timeout_graceful_shutdown=GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS,
    )


if __name__ == "__main__":
    main_entry()
