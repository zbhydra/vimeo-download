"""Dashboard API tests."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

import app.services.dashboard_service as dashboard_service_module
from app.constants.mark import MarkType
from app.models.mark_log_model import MarkLogModel
from app.models.user_model import UserModel

UTC_PLUS_8 = ZoneInfo("Asia/Shanghai")
PASSWORD_HASH = "b182aba15ce75b6e5f7ea2ee3151a72a"


def _local_timestamp(
    year: int,
    month: int,
    day: int,
    hour: int = 0,
    minute: int = 0,
) -> int:
    return int(
        datetime(
            year,
            month,
            day,
            hour,
            minute,
            tzinfo=UTC_PLUS_8,
        ).timestamp()
        * 1000
    )


def _row_by_date(rows, date_label: str):
    """按日期从 dashboard 行列表里取一行。"""

    return next(row for row in rows if row.date_label == date_label)


@pytest.mark.asyncio
class TestDashboardAPI:
    async def test_dashboard_requires_password(self, async_client):
        response = await async_client.get("/api/system/dashboard")

        assert response.status_code == 403
        assert "403 Forbidden" in response.text

    async def test_dashboard_logs_query_stage_timings(self, caplog):
        caplog.set_level("WARNING", logger="server")

        await dashboard_service_module.dashboard_service.get_dashboard_data(days=1)

        assert "admin_dashboard_stage_timing: stage=user_summary" in caplog.text
        assert "admin_dashboard_stage_timing: stage=mark_stats" in caplog.text
        assert "admin_dashboard_stage_timing: stage=daily_registrations" in caplog.text
        assert "admin_dashboard_stage_timing: stage=service_total" in caplog.text

    async def test_dashboard_renders_recent_60_days_stats_in_desc_order(
        self,
        async_client,
        test_db_session,
        monkeypatch,
        make_test_email,
        make_test_device_id,
    ):
        fixed_now = datetime(2026, 3, 28, 12, 0, tzinfo=UTC_PLUS_8)
        monkeypatch.setattr(
            dashboard_service_module.dashboard_service,
            "_now_local",
            lambda: fixed_now,
        )
        baseline = await dashboard_service_module.dashboard_service.get_dashboard_data()
        baseline_today = _row_by_date(baseline.rows, "2026-03-28")
        baseline_yesterday = _row_by_date(baseline.rows, "2026-03-27")

        active_users = [
            UserModel(  # type: ignore[call-arg]
                email=make_test_email("dashboard-today-1"),
                password_hash="hash",
                is_del=False,
                login_count=0,
                created_at=_local_timestamp(2026, 3, 28, 9, 0),
                updated_at=_local_timestamp(2026, 3, 28, 9, 0),
            ),
            UserModel(  # type: ignore[call-arg]
                email=make_test_email("dashboard-today-2"),
                password_hash="hash",
                is_del=False,
                login_count=0,
                created_at=_local_timestamp(2026, 3, 28, 10, 0),
                updated_at=_local_timestamp(2026, 3, 28, 10, 0),
            ),
            UserModel(  # type: ignore[call-arg]
                email=make_test_email("dashboard-old"),
                password_hash="hash",
                is_del=False,
                login_count=0,
                created_at=_local_timestamp(2026, 3, 20, 8, 0),
                updated_at=_local_timestamp(2026, 3, 20, 8, 0),
            ),
            UserModel(  # type: ignore[call-arg]
                email=make_test_email("dashboard-yesterday-same-period"),
                password_hash="hash",
                is_del=False,
                login_count=0,
                created_at=_local_timestamp(2026, 3, 27, 8, 0),
                updated_at=_local_timestamp(2026, 3, 27, 8, 0),
            ),
            UserModel(  # type: ignore[call-arg]
                email=make_test_email("dashboard-deleted"),
                password_hash="hash",
                is_del=True,
                login_count=0,
                created_at=_local_timestamp(2026, 3, 28, 7, 0),
                updated_at=_local_timestamp(2026, 3, 28, 7, 0),
            ),
        ]
        test_db_session.add_all(active_users)
        await test_db_session.flush()

        old_local_day = fixed_now.date() - timedelta(days=61)
        device_a = make_test_device_id("dashboard-a")
        device_b = make_test_device_id("dashboard-b")
        device_c = make_test_device_id("dashboard-c")
        device_old = make_test_device_id("dashboard-old")
        mark_logs = [
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[0].user_id,
                device_id=device_a,
                mark_type="web_parse_success",
                mark_msg="",
                mark_time=_local_timestamp(2026, 3, 28, 10, 0),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[0].user_id,
                device_id=device_a,
                mark_type="web_parse_success",
                mark_msg="",
                mark_time=_local_timestamp(2026, 3, 28, 11, 0),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[1].user_id,
                device_id=device_b,
                mark_type="web_first_opened",
                mark_msg="",
                mark_time=_local_timestamp(2026, 3, 28, 11, 20),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[1].user_id,
                device_id=device_b,
                mark_type=MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value,
                mark_msg='{"utm_source":"extension","source":"quota_upgrade_button"}',
                mark_time=_local_timestamp(2026, 3, 28, 11, 25),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[1].user_id,
                device_id=device_b,
                mark_type=MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value,
                mark_msg="",
                mark_time=_local_timestamp(2026, 3, 28, 11, 26),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[1].user_id,
                device_id=device_b,
                mark_type="web_parse_failed",
                mark_msg="",
                mark_time=_local_timestamp(2026, 3, 28, 11, 30),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[1].user_id,
                device_id=device_b,
                mark_type="web_credit_purchase_modal_open",
                mark_msg="",
                mark_time=_local_timestamp(2026, 3, 28, 11, 35),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[1].user_id,
                device_id=device_b,
                mark_type="web_credit_purchase_buy_click",
                mark_msg='{"product_name":"50 Credits"}',
                mark_time=_local_timestamp(2026, 3, 28, 11, 36),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[2].user_id,
                device_id=device_c,
                mark_type="web_download_start",
                mark_msg="",
                mark_time=_local_timestamp(2026, 3, 27, 8, 30),
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=active_users[3].user_id,
                device_id=device_old,
                mark_type="web_parse_success",
                mark_msg="",
                mark_time=int(
                    datetime(
                        old_local_day.year,
                        old_local_day.month,
                        old_local_day.day,
                        9,
                        0,
                        tzinfo=UTC_PLUS_8,
                    ).timestamp()
                    * 1000
                ),
            ),
        ]
        test_db_session.add_all(mark_logs)
        await test_db_session.commit()

        data = await dashboard_service_module.dashboard_service.get_dashboard_data()
        today = _row_by_date(data.rows, "2026-03-28")
        yesterday = _row_by_date(data.rows, "2026-03-27")

        assert data.summary.total_users == baseline.summary.total_users + 4
        assert data.summary.new_users == baseline.summary.new_users + 2
        assert (
            data.summary.new_users_yesterday_same_period
            == baseline.summary.new_users_yesterday_same_period + 1
        )
        assert data.summary.new_users_yesterday_same_period_change_percent == (
            pytest.approx(
                (
                    (
                        data.summary.new_users
                        - data.summary.new_users_yesterday_same_period
                    )
                    / data.summary.new_users_yesterday_same_period
                )
                * 100
            )
        )
        assert data.summary.active_users_24h == baseline.summary.active_users_24h + 2
        assert data.summary.active_users_7d == baseline.summary.active_users_7d + 3
        assert today.registered_count == baseline_today.registered_count + 2
        assert yesterday.registered_count == baseline_yesterday.registered_count + 1
        assert (
            today.metrics["web_parse_success"].event_count
            == baseline_today.metrics["web_parse_success"].event_count + 2
        )
        assert (
            today.metrics["web_parse_success"].device_count
            == baseline_today.metrics["web_parse_success"].device_count + 1
        )
        assert (
            today.metrics["web_parse_failed"].event_count
            == baseline_today.metrics["web_parse_failed"].event_count + 1
        )
        assert (
            data.mark_types.index("web_first_opened")
            < data.mark_types.index(MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value)
            < data.mark_types.index(MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value)
            < data.mark_types.index("web_parse_click")
        )
        assert (
            today.metrics["web_first_opened"].event_count
            == baseline_today.metrics["web_first_opened"].event_count + 1
        )
        assert (
            today.metrics[MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value].event_count
            == baseline_today.metrics[
                MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value
            ].event_count
            + 1
        )
        assert (
            today.metrics[MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value].event_count
            == baseline_today.metrics[
                MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value
            ].event_count
            + 1
        )
        assert (
            today.metrics[MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value].device_count
            == baseline_today.metrics[
                MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value
            ].device_count
            + 1
        )
        assert "web_credit_purchase_modal_open" in data.mark_types
        assert "web_credit_purchase_buy_click" in data.mark_types
        assert (
            today.metrics["web_credit_purchase_modal_open"].event_count
            == baseline_today.metrics["web_credit_purchase_modal_open"].event_count + 1
        )
        assert (
            today.metrics["web_credit_purchase_buy_click"].event_count
            == baseline_today.metrics["web_credit_purchase_buy_click"].event_count + 1
        )
        assert (
            yesterday.metrics["web_download_start"].event_count
            == baseline_yesterday.metrics["web_download_start"].event_count + 1
        )

        response = await async_client.get(
            f"/api/system/dashboard?password={PASSWORD_HASH}"
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")

        body = response.text
        assert (
            f"当前用户数量 {data.summary.total_users}"
            f"（新增 {data.summary.new_users}）"
        ) in body
        assert f"24H 活跃 {data.summary.active_users_24h}" in body
        assert f"7D 活跃 {data.summary.active_users_7d}" in body
        assert "日期（Y-m-d）" in body
        assert "注册人数" in body
        assert "web_parse_success" in body
        assert "web_first_opened" in body
        assert MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value in body
        assert MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value in body
        assert "web_parse_failed" in body
        assert "web_download_start" in body
        assert "web_credit_purchase_modal_open" in body
        assert "web_credit_purchase_buy_click" in body
        assert "2026-03-28" in body
        assert "2026-03-27" in body
        assert body.find("2026-03-28") < body.find("2026-03-27")
        assert old_local_day.strftime("%Y-%m-%d") not in body
