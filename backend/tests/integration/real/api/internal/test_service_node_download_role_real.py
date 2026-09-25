"""Download role service-node health real smoke.

依赖说明：
- 本测试不依赖 MySQL、Redis 或外部网络。
- pytest 收集 integration/real 时会加载 real/conftest.py；无 DB 启动边界由独立
  subprocess 内的 `app.core.database not in sys.modules` 断言证明。

覆盖矩阵：
| Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET /internal/service-node/health | yes | n/a internal smoke | n/a | n/a | n/a | n/a | n/a | n/a | n/a | no DB import |
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

# backend 根目录，用于独立子进程设置 PYTHONPATH。
_BACKEND_ROOT = Path(__file__).resolve().parents[5]


@pytest.mark.real
def test_real_download_role_health_smoke_without_database(tmp_path):
    """独立进程使用 download 配置请求 health，验证无业务 DB 导入。"""
    config_path = tmp_path / "download-role-config.yaml"
    config_path.write_text(
        """
app:
  name: "vimeo-download-server"
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
