"""app.role 路由装配与无数据库下载节点启动测试。

本文件只验证应用装配边界：business role 保留完整业务路由，download role 只暴露
节点健康检查和 media v2 数据面接口，且 download role 的 import/lifespan 不触发业务 DB。
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import textwrap
from datetime import timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

import app.main as main_module
from app.api.admin_dependencies import get_admin_jwt_only, get_admin_user
from app.main import create_app
from app.core.config import settings
from app.utils.jwt import JwtData, JwtUnit

# backend 根目录，用于子进程 import/启动 smoke test。
_BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _paths(app) -> set[str]:
    """返回 FastAPI app 当前注册的路由 path 集合。"""
    return {getattr(route, "path", "") for route in app.routes}


def _route_dependency_calls(app, path: str, method: str) -> set[object]:
    """返回指定 method/path 的顶层依赖 callable 集合。"""
    calls: set[object] = set()
    for route in app.routes:
        if (
            getattr(route, "path", "") != path
            or method not in getattr(route, "methods", set())
            or not hasattr(route, "dependant")
        ):
            continue
        calls.update(dependency.call for dependency in route.dependant.dependencies)
    return calls


def _route_count(app, path: str, method: str) -> int:
    """返回指定 method/path 注册到 FastAPI 的次数。"""
    return sum(
        1
        for route in app.routes
        if getattr(route, "path", "") == path
        and method in getattr(route, "methods", set())
    )


def _admin_access_token(*, user_id: int = 1) -> str:
    """签发测试用 admin access JWT。"""
    token, _expires_at = JwtUnit.create_admin_token(
        JwtData(user_id=user_id, email="pytest-admin"),
        expires_delta=timedelta(minutes=5),
    )
    return token


_NODE_LOCAL_MONITOR_ROUTES = (("GET", "/api/admin/node-monitor/network-rate"),)


def test_download_role_only_mounts_node_and_media_v2_routes(monkeypatch):
    """download role 挂节点本地管理和 V2 数据面，不挂业务管理入口。"""
    monkeypatch.setattr(settings.app, "role", "download")

    app = create_app()
    paths = _paths(app)

    assert "/internal/service-node/health" in paths
    assert "/internal/service-node/dashboard-snapshot" in paths
    assert "/api/client/media/parse-v2" in paths
    assert "/api/client/media/download-v2" in paths
    assert "/api/client/media/parse-pre-v2" not in paths
    assert "/api/client/media/download-pre-v2" not in paths
    assert "/api/system/health" not in paths
    assert "/api/client/auth/login" not in paths
    assert "/api/client/media/parse" not in paths
    assert "/api/client/media/download" not in paths
    assert "/api/admin/node-monitor/network-rate" in paths
    assert "/api/admin/auth/login" not in paths
    assert "/api/admin/auth/refresh" not in paths
    assert "/api/admin/dashboard" not in paths
    assert "/api/admin/service-nodes" not in paths
    assert "/api/admin/system-settings/api-key" not in paths
    assert "/api/admin/system-settings/config-cache/refresh" not in paths
    assert "/api/external/system/dashboard" not in paths
    assert "/api" not in paths
    assert "/docs" not in paths
    assert "/redoc" not in paths
    assert "/openapi.json" not in paths


def test_business_role_keeps_current_business_routes(monkeypatch):
    """business role 保留当前业务路由，并移除旧媒体下载入口。"""
    monkeypatch.setattr(settings.app, "role", "business")
    monkeypatch.setattr(settings.api, "docs_url", "/docs")
    monkeypatch.setattr(settings.api, "redoc_url", "/redoc")

    app = create_app()
    paths = _paths(app)

    assert "/api" in paths
    assert "/api/system/health" in paths
    assert "/api/client/auth/login" in paths
    assert "/api/client/media/parse" not in paths
    assert "/api/client/media/download" not in paths
    assert "/api/client/media/direct-download-intent" not in paths
    assert "/api/client/media/client-mux-intent" not in paths
    assert "/api/admin/auth/login" in paths
    assert "/api/client/media/parse-v2" in paths
    assert "/api/client/media/download-v2" in paths
    assert "/api/client/media/parse-pre-v2" in paths
    assert "/api/client/media/download-pre-v2" in paths
    assert "/api/admin/node-monitor/network-rate" in paths
    assert "/api/admin/service-nodes" in paths
    assert "/api/admin/system-settings/api-key" in paths
    assert _route_count(app, "/api/admin/system-settings/api-key", "GET") == 1
    assert _route_count(app, "/api/admin/system-settings/api-key", "POST") == 1
    assert "/api/admin/system-settings/api-key/generate" not in paths
    assert "/api/admin/system-settings/config-cache/refresh" in paths
    assert "/api/external/system/dashboard" in paths
    assert "/internal/service-node/health" in paths
    assert "/internal/service-node/dashboard-snapshot" in paths
    assert "/docs" in paths
    assert "/redoc" in paths
    assert "/openapi.json" in paths


def test_node_local_monitor_paths_use_jwt_only_dependency(monkeypatch):
    """business/download role 的节点本机监控接口都只验 JWT。"""
    for role in ("business", "download"):
        monkeypatch.setattr(settings.app, "role", role)
        app = create_app()

        for method, path in _NODE_LOCAL_MONITOR_ROUTES:
            calls = _route_dependency_calls(app, path, method)
            assert _route_count(app, path, method) == 1
            assert get_admin_jwt_only in calls
            assert get_admin_user not in calls


@pytest.mark.asyncio
async def test_download_node_monitor_accepts_jwt_without_admin_db_check(
    monkeypatch,
) -> None:
    """download role 节点本机监控接口保留 JWT-only 访问能力。"""
    monkeypatch.setattr(settings.app, "role", "download")

    async def forbidden_get_by_id(_admin_id):
        raise AssertionError("download node-local admin routes must not check DB admin")

    import app.services.admin_service as admin_service_module

    monkeypatch.setattr(
        admin_service_module.admin_service,
        "get_by_id",
        forbidden_get_by_id,
    )
    app = create_app()

    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {_admin_access_token(user_id=987654321)}"}
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        x_response = await client.get(
            "/api/admin/node-monitor/network-rate",
            headers=headers,
        )

    assert x_response.status_code == 200
    assert x_response.json()["code"] == 10000


@pytest.mark.asyncio
async def test_business_lifespan_starts_and_stops_health_task(monkeypatch):
    """business role lifespan 启动并取消服务节点健康检查 task。"""
    monkeypatch.setattr(settings.app, "role", "business")
    calls: list[str] = []
    task = asyncio.create_task(asyncio.sleep(60))

    async def fake_start_monitor_service():
        calls.append("monitor_start")

    async def fake_stop_monitor_service():
        calls.append("monitor_stop")

    async def fake_start_business_cron_scheduler():
        calls.append("cron_start")

    async def fake_stop_business_cron_scheduler():
        calls.append("cron_stop")

    async def fake_start_service_node_health_task():
        calls.append("start")
        return task

    async def fake_stop_service_node_health_task(received_task):
        calls.append("stop")
        assert received_task is task
        received_task.cancel()
        try:
            await received_task
        except asyncio.CancelledError:
            calls.append("cancelled")

    async def fake_shutdown_node_runtime_resources():
        calls.append("node_shutdown")

    async def fake_shutdown_business_database_resources():
        calls.append("db_shutdown")

    monkeypatch.setattr(
        main_module,
        "_start_monitor_service",
        fake_start_monitor_service,
    )
    monkeypatch.setattr(
        main_module,
        "_stop_monitor_service",
        fake_stop_monitor_service,
    )
    monkeypatch.setattr(
        main_module,
        "_start_business_cron_scheduler",
        fake_start_business_cron_scheduler,
    )
    monkeypatch.setattr(
        main_module,
        "_stop_business_cron_scheduler",
        fake_stop_business_cron_scheduler,
    )
    monkeypatch.setattr(
        main_module,
        "_start_service_node_health_task",
        fake_start_service_node_health_task,
    )
    monkeypatch.setattr(
        main_module,
        "_stop_service_node_health_task",
        fake_stop_service_node_health_task,
    )
    monkeypatch.setattr(
        main_module,
        "_shutdown_node_runtime_resources",
        fake_shutdown_node_runtime_resources,
    )
    monkeypatch.setattr(
        main_module,
        "_shutdown_business_database_resources",
        fake_shutdown_business_database_resources,
    )

    app = create_app()
    async with app.router.lifespan_context(app):
        assert calls == ["monitor_start", "cron_start", "start"]

    assert calls == [
        "monitor_start",
        "cron_start",
        "start",
        "monitor_stop",
        "stop",
        "cancelled",
        "node_shutdown",
        "cron_stop",
        "db_shutdown",
    ]


@pytest.mark.asyncio
async def test_download_lifespan_does_not_start_health_task(monkeypatch):
    """download role lifespan 不启动服务节点健康检查调度。"""
    monkeypatch.setattr(settings.app, "role", "download")
    calls: list[str] = []

    async def fake_start_monitor_service():
        calls.append("monitor_start")

    async def fake_stop_monitor_service():
        calls.append("monitor_stop")

    async def forbidden_start_service_node_health_task():
        raise AssertionError(
            "download lifespan must not start service node health task"
        )

    async def fake_stop_service_node_health_task(received_task):
        calls.append(f"stop:{received_task is None}")

    async def fake_shutdown_node_runtime_resources():
        calls.append("node_shutdown")

    async def forbidden_shutdown_business_database_resources():
        raise AssertionError("download lifespan must not close business database")

    monkeypatch.setattr(
        main_module,
        "_start_monitor_service",
        fake_start_monitor_service,
    )
    monkeypatch.setattr(
        main_module,
        "_stop_monitor_service",
        fake_stop_monitor_service,
    )
    monkeypatch.setattr(
        main_module,
        "_start_service_node_health_task",
        forbidden_start_service_node_health_task,
    )
    monkeypatch.setattr(
        main_module,
        "_stop_service_node_health_task",
        fake_stop_service_node_health_task,
    )
    monkeypatch.setattr(
        main_module,
        "_shutdown_node_runtime_resources",
        fake_shutdown_node_runtime_resources,
    )
    monkeypatch.setattr(
        main_module,
        "_shutdown_business_database_resources",
        forbidden_shutdown_business_database_resources,
    )

    app = create_app()
    async with app.router.lifespan_context(app):
        assert calls == ["monitor_start"]

    assert calls == ["monitor_start", "monitor_stop", "stop:True", "node_shutdown"]


@pytest.mark.asyncio
async def test_download_role_health_does_not_touch_db(monkeypatch):
    """download role 的节点健康检查不调用业务 DB。"""
    monkeypatch.setattr(settings.app, "role", "download")
    app = create_app()

    async def forbidden_check_db_connection():
        raise AssertionError("download health must not call check_db_connection")

    async def forbidden_close_engine():
        raise AssertionError("download health must not close business DB")

    import app.core.database as database_module

    monkeypatch.setattr(
        database_module,
        "check_db_connection",
        forbidden_check_db_connection,
    )
    monkeypatch.setattr(database_module, "close_engine", forbidden_close_engine)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/internal/service-node/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["role"] == "download"
    assert body["version"] == settings.app.version
    assert "node_id" not in body


def test_download_role_import_and_lifespan_do_not_load_database_module():
    """download role 进程导入和 lifespan 不导入 app.core.database。"""
    code = """
import asyncio
import json
import sys

sys.path.insert(0, "src")

from app.core.config import settings

settings.app.role = "download"
import app.main as main

async def run():
    async with main.app.router.lifespan_context(main.app):
        pass

asyncio.run(run())
print(json.dumps({
    "has_database_module": "app.core.database" in sys.modules,
    "paths": sorted(
        getattr(route, "path", "")
        for route in main.app.routes
        if getattr(route, "path", "").startswith(
            ("/api", "/internal", "/docs", "/redoc", "/openapi.json")
        )
    ),
}))
"""
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=_BACKEND_ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    data = json.loads(result.stdout.strip().splitlines()[-1])

    assert data["has_database_module"] is False
    assert "/internal/service-node/health" in data["paths"]
    assert "/api/admin/node-monitor/network-rate" in data["paths"]
    assert "/api/client/media/parse-v2" in data["paths"]
    assert "/api/client/media/download-v2" in data["paths"]
    assert "/api/client/media/parse-pre-v2" not in data["paths"]
    assert "/api/client/media/download-pre-v2" not in data["paths"]
    assert "/api/system/health" not in data["paths"]
    assert "/api/admin/system-settings/api-key" not in data["paths"]
    assert "/api/external/system/dashboard" not in data["paths"]
    assert "/docs" not in data["paths"]
    assert "/redoc" not in data["paths"]
    assert "/openapi.json" not in data["paths"]


def test_download_role_subprocess_health_smoke_without_database(tmp_path):
    """独立进程用 download 配置请求节点 health，不加载业务 DB。"""
    config_path = tmp_path / "download-config.yaml"
    config_path.write_text(
        """
app:
  name: "vimeo-video-downloader-node"
  version: "0.1.0"
  role: "download"
  env: "dev"
download_token:
  algorithm: "EdDSA"
  resource_token_secret: "test-resource-token-secret"
  public_keys:
    - "test-public-key"
service_node:
  health_check_interval_seconds: 60
  internal_auth_token: "pytest-service-node-internal-token"
smtp:
  - host: "smtp.example.com"
    username: "sender@example.com"
    password: "secret"
    from_email: "sender@example.com"
""",
        encoding="utf-8",
    )
    code = textwrap.dedent(
        """
        import asyncio
        import json
        import sys

        from httpx import ASGITransport, AsyncClient

        sys.path.insert(0, "src")

        from app.core.config_schema import Settings
        import app.core.config as config_module

        config_module.settings = Settings(sys.argv[1])

        import app.main as main

        async def run():
            async with AsyncClient(
                transport=ASGITransport(app=main.app),
                base_url="http://test",
            ) as client:
                response = await client.get("/internal/service-node/health")
            print(json.dumps({
                "status_code": response.status_code,
                "body": response.json(),
                "has_database_module": "app.core.database" in sys.modules,
            }))

        asyncio.run(run())
        """
    )

    result = subprocess.run(
        [sys.executable, "-c", code, str(config_path)],
        cwd=_BACKEND_ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    data = json.loads(result.stdout.strip().splitlines()[-1])
    body = data["body"]

    assert data["status_code"] == 200
    assert data["has_database_module"] is False
    assert body["status"] == "ok"
    assert body["role"] == "download"
    assert body["version"] == "0.1.0"
    assert "node_id" not in body
