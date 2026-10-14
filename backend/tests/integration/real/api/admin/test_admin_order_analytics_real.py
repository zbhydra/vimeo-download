"""订单统计真实 API 测试；依赖 MySQL 的 admins、users、orders 表。"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, text

from app.constants.order import OrderStatus, ProductClass
from app.core.database import get_async_session
from app.i18n.common_code import CommonCode
from app.models.admin_model import AdminModel
from app.models.order_model import OrderModel
from app.models.user_model import UserModel
from app.services import admin_order_analytics_service as analytics_module
from app.services.admin_service import admin_service

pytestmark = [pytest.mark.real, pytest.mark.asyncio]


@dataclass
class _CleanupState:
    """记录本用例所有者及真实鉴权凭据。"""

    admin_id: int
    user_id: int
    token: str
    test_run_id: str


def _ms(value: str) -> int:
    """测试日期明确按统计合同的 UTC+8 解释。"""
    return int(
        datetime.fromisoformat(value)
        .replace(tzinfo=ZoneInfo("Asia/Shanghai"))
        .timestamp()
        * 1000
    )


@pytest.fixture
async def real_order_analytics_data(
    real_mysql_ready, test_run_id: str
) -> AsyncIterator[_CleanupState]:
    """创建本用例的真实管理员和用户，并只清理其订单和账号。"""
    async with get_async_session() as db:
        tables = {str(row[0]) for row in (await db.execute(text("SHOW TABLES"))).all()}
        missing = {"admins", "users", "orders"} - tables
        if missing:
            pytest.skip(
                f"REAL_SCHEMA_UNAVAILABLE: 数据库缺少 {','.join(sorted(missing))}"
            )
        admin = AdminModel(  # type: ignore[call-arg]
            username=f"pytest-analytics-{test_run_id}",
            password_hash="!NOLOGIN!",
            is_active=True,
        )
        user = UserModel(  # type: ignore[call-arg]
            email=f"pytest-analytics-{test_run_id}@example.com",
            password_hash="!NOLOGIN!",
        )
        db.add_all([admin, user])
        await db.commit()
        await db.refresh(admin)
        await db.refresh(user)
        token, _ = admin_service.create_token(admin)
        state = _CleanupState(admin.admin_id, user.user_id, token, test_run_id)
    try:
        yield state
    finally:
        async with get_async_session() as db:
            await db.execute(
                delete(OrderModel).where(OrderModel.user_id == state.user_id)
            )
            await db.execute(
                delete(UserModel).where(UserModel.user_id == state.user_id)
            )
            await db.execute(
                delete(AdminModel).where(AdminModel.admin_id == state.admin_id)
            )
            await db.commit()


async def _seed_orders(
    state: _CleanupState,
    orders: list[tuple[str, int, str, OrderStatus, ProductClass]],
) -> None:
    """写入具有本轮所有者标记的订单快照，不触碰配置表。"""
    async with get_async_session() as db:
        for index, (created_at, amount, currency, status, product_class) in enumerate(
            orders
        ):
            db.add(
                OrderModel(  # type: ignore[call-arg]
                    order_no=f"ANALYT{state.test_run_id}{index:03}",
                    user_id=state.user_id,
                    product_class=product_class.value,
                    product_id=f"analytics-{state.test_run_id}",
                    product_name=f"pytest analytics {state.test_run_id}",
                    amount=amount,
                    currency=currency,
                    order_status=status.value,
                    paid_amount=99_000_000,
                    paid_currency="EUR",
                    created_at=_ms(created_at),
                    paid_at=_ms(created_at) + 86_400_000,
                    expired_at=_ms(created_at) + 1_800_000,
                )
            )
        await db.commit()


async def _get_rows(
    client: AsyncClient, state: _CleanupState, endpoint: str, params: dict
) -> list[dict]:
    """经过真实管理员鉴权读取响应，并同时检查 HTTP 与业务状态。"""
    response = await client.get(
        f"/api/admin/order-analytics/{endpoint}",
        params=params,
        headers={"Authorization": f"Bearer {state.token}"},
    )
    body = response.json()
    assert response.status_code == 200
    assert body["code"] == 10000
    return body["data"]["rows"]


async def test_real_week_recharge_crosses_year_and_counts_zero_days(
    real_async_client: AsyncClient,
    real_order_analytics_data: _CleanupState,
    monkeypatch,
) -> None:
    """周一分桶、部分周期、零充值日期、多币种与创建日快照口径。"""
    state = real_order_analytics_data
    monkeypatch.setattr(analytics_module, "timestamp_now", lambda: _ms("2041-02-01"))
    await _seed_orders(
        state,
        [
            (
                "2040-12-31T23:59:59.999",
                99_000_000,
                "USD",
                OrderStatus.PAID,
                ProductClass.RECHARGE,
            ),
            ("2041-01-01", 1_000_001, "USD", OrderStatus.PAID, ProductClass.RECHARGE),
            (
                "2041-01-04T12:00:00",
                2_000_000,
                "USD",
                OrderStatus.PAID,
                ProductClass.SUBSCRIPTION,
            ),
            (
                "2041-01-06T23:59:59.999",
                3_000_000,
                "XTR",
                OrderStatus.PAID,
                ProductClass.RECHARGE,
            ),
            (
                "2041-01-08",
                42_000_000,
                "USD",
                OrderStatus.PENDING,
                ProductClass.RECHARGE,
            ),
            (
                "2041-01-09",
                42_000_000,
                "USD",
                OrderStatus.REFUNDED,
                ProductClass.SUBSCRIPTION,
            ),
        ],
    )
    params = {"from_ms": _ms("2041-01-01"), "to_ms": _ms("2041-01-14T23:59:59.999")}
    rows = await _get_rows(
        real_async_client, state, "period-recharge", {**params, "period": "week"}
    )
    assert rows == [
        {
            "start_date": "2041-01-01",
            "end_date": "2041-01-06",
            "day_count": 6,
            "count": 3,
            "amounts": [
                {"currency": "USD", "amount": 3_000_001, "display_amount": "3.000001"},
                {"currency": "XTR", "amount": 3_000_000, "display_amount": "3"},
            ],
            "daily_average_amounts": [
                {"currency": "USD", "amount": 500_000, "display_amount": "0.5"},
                {"currency": "XTR", "amount": 500_000, "display_amount": "0.5"},
            ],
        }
    ]
    daily = await _get_rows(real_async_client, state, "daily-recharge", params)
    assert sum(row["success_count"] for row in daily) == rows[0]["count"]
    assert (
        sum(item["amount"] for row in daily for item in row["success_amounts"])
        == 6_000_001
    )


async def test_real_month_recharge_covers_leap_day_and_stops_today(
    real_async_client: AsyncClient,
    real_order_analytics_data: _CleanupState,
    monkeypatch,
) -> None:
    """闰年二月部分筛选与当前月分母，未来订单不计入，微额日均四舍五入。"""
    state = real_order_analytics_data
    monkeypatch.setattr(
        analytics_module, "timestamp_now", lambda: _ms("2044-03-02T12:00:00")
    )
    await _seed_orders(
        state,
        [
            (
                "2044-02-15T11:59:59.999",
                99_000_000,
                "USD",
                OrderStatus.PAID,
                ProductClass.RECHARGE,
            ),
            (
                "2044-02-29T23:59:59.999",
                2_000_001,
                "USD",
                OrderStatus.PAID,
                ProductClass.SUBSCRIPTION,
            ),
            (
                "2044-02-29T12:00:00",
                3_000_000,
                "XTR",
                OrderStatus.PAID,
                ProductClass.RECHARGE,
            ),
            ("2044-03-01", 1, "USD", OrderStatus.PAID, ProductClass.RECHARGE),
            (
                "2044-03-02T12:00:00.001",
                42_000_000,
                "USD",
                OrderStatus.PAID,
                ProductClass.SUBSCRIPTION,
            ),
            ("2044-03-03", 42_000_000, "XTR", OrderStatus.PAID, ProductClass.RECHARGE),
        ],
    )
    params = {
        "from_ms": _ms("2044-02-15T12:00:00"),
        "to_ms": _ms("2044-03-31T23:59:59.999"),
    }
    rows = await _get_rows(
        real_async_client, state, "period-recharge", {**params, "period": "month"}
    )
    assert [
        (row["start_date"], row["end_date"], row["day_count"], row["count"])
        for row in rows
    ] == [
        ("2044-03-01", "2044-03-02", 2, 1),
        ("2044-02-15", "2044-02-29", 15, 2),
    ]
    assert rows[0]["amounts"] == [
        {"currency": "USD", "amount": 1, "display_amount": "0.000001"}
    ]
    assert rows[0]["daily_average_amounts"] == [
        {"currency": "USD", "amount": 1, "display_amount": "0.000001"}
    ]
    assert rows[1]["amounts"] == [
        {"currency": "USD", "amount": 2_000_001, "display_amount": "2.000001"},
        {"currency": "XTR", "amount": 3_000_000, "display_amount": "3"},
    ]
    assert rows[1]["daily_average_amounts"] == [
        {"currency": "USD", "amount": 133_333, "display_amount": "0.133333"},
        {"currency": "XTR", "amount": 200_000, "display_amount": "0.2"},
    ]
    daily = await _get_rows(
        real_async_client,
        state,
        "daily-recharge",
        {**params, "to_ms": _ms("2044-03-02T12:00:00")},
    )
    assert sum(row["success_count"] for row in daily) == sum(
        row["count"] for row in rows
    )
    assert (
        sum(item["amount"] for row in daily for item in row["success_amounts"])
        == 5_000_002
    )


async def test_real_period_recharge_enforces_api_contract(
    real_async_client: AsyncClient, real_order_analytics_data: _CleanupState
) -> None:
    """入口保留真实鉴权和范围校验，拒绝非法周期，完全未来区间为空。"""
    state = real_order_analytics_data
    path = "/api/admin/order-analytics/period-recharge"
    response = await real_async_client.get(
        path, params={"period": "week", "from_ms": 1, "to_ms": 2}
    )
    assert response.status_code == 401
    headers = {"Authorization": f"Bearer {state.token}"}
    response = await real_async_client.get(
        path, params={"period": "week", "from_ms": 2, "to_ms": 1}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["code"] == CommonCode.INVALID_REQUEST.value
    response = await real_async_client.get(
        path, params={"period": "day", "from_ms": 1, "to_ms": 2}, headers=headers
    )
    assert response.status_code == 422
    for period in ("week", "month"):
        rows = await _get_rows(
            real_async_client,
            state,
            "period-recharge",
            {
                "period": period,
                "from_ms": _ms("2400-01-01"),
                "to_ms": _ms("2400-01-02"),
            },
        )
        assert rows == []
