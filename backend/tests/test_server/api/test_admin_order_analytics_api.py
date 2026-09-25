"""Admin 订单统计 API 测试。"""

import pytest

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.i18n.common_code import CommonCode
from app.main import app


async def _override_admin_user() -> AdminContext:
    """测试用管理员上下文。"""
    return AdminContext(admin_id=1, username="pytest-admin", token="token")


@pytest.fixture
async def admin_order_analytics_api_auth():
    """安装 admin 鉴权 override。"""
    app.dependency_overrides[get_admin_user] = _override_admin_user
    yield
    app.dependency_overrides.pop(get_admin_user, None)


@pytest.mark.asyncio
async def test_admin_order_analytics_requires_admin(async_client) -> None:
    """订单统计接口需要管理员登录。"""
    response = await async_client.get("/api/admin/order-analytics/daily-recharge")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_order_analytics_returns_empty_rows_for_empty_range(
    async_client,
    admin_order_analytics_api_auth,
) -> None:
    """空数据区间返回空 rows，不报错。"""
    response = await async_client.get(
        "/api/admin/order-analytics/product-statistics",
        params={
            "from_ms": 4_102_444_800_000,
            "to_ms": 4_102_531_200_000,
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["code"] == 10000
    assert body["data"] == {"rows": []}


@pytest.mark.asyncio
async def test_admin_order_analytics_rejects_invalid_range(
    async_client,
    admin_order_analytics_api_auth,
) -> None:
    """非法时间范围返回 INVALID_REQUEST。"""
    response = await async_client.get(
        "/api/admin/order-analytics/daily-recharge",
        params={"from_ms": 2, "to_ms": 1},
    )
    body = response.json()

    assert response.status_code == 400
    assert body["code"] == CommonCode.INVALID_REQUEST.value
    assert body["data"] == {"field": "time_range", "from_ms": 2, "to_ms": 1}
