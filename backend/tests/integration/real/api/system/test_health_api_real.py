"""系统健康检查 real 测试。"""

import pytest


pytestmark = [pytest.mark.real, pytest.mark.asyncio]


async def test_real_health_api_reports_database_status(
    real_async_client,
    real_mysql_ready,
):
    """
    验证健康检查端点可访问并返回真实数据库状态。

    Args:
        real_async_client: real API 客户端。
        real_mysql_ready: MySQL 可用性检查。
    """
    response = await real_async_client.get("/api/system/health")

    assert response.status_code == 200
    assert response.json()["msg"] == "healthy"
