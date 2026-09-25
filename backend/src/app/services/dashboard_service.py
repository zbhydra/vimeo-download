"""系统 dashboard 聚合服务。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import time
from zoneinfo import ZoneInfo

from sqlalchemy import BigInteger, case, cast, func, select

from app.constants.mark import MarkType
from app.core.database import get_async_session
from app.models.mark_log_model import MarkLogModel
from app.models.user_model import UserModel
from app.utils.logger import logger

UTC_PLUS_8 = ZoneInfo("Asia/Shanghai")
MILLISECONDS_PER_DAY = 86_400_000
UTC_PLUS_8_OFFSET_MS = 8 * 60 * 60 * 1000
DEFAULT_DASHBOARD_DAYS = 60
DASHBOARD_MARK_TYPE_ORDER = [
    MarkType.WEB_FIRST_OPENED.value,
    MarkType.WEB_PRICING_OPEN_FROM_EXTENSION.value,
    MarkType.WEB_EXTENSION_STORE_REVIEW_CLICK.value,
    MarkType.WEB_PARSE_CLICK.value,
    MarkType.WEB_PARSE_SUCCESS.value,
    MarkType.WEB_PARSE_FAILED.value,
    MarkType.WEB_DOWNLOAD_START.value,
    MarkType.WEB_DOWNLOAD_SUCCESS.value,
    MarkType.WEB_DOWNLOAD_FAILED.value,
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value,
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_FALLBACK.value,
    MarkType.WEB_EXTENSION_INSTALL_CLICK.value,
    MarkType.WEB_CREDIT_PURCHASE_MODAL_OPEN.value,
    MarkType.WEB_CREDIT_PURCHASE_BUY_CLICK.value,
]


@dataclass(frozen=True)
class DashboardSummary:
    """Dashboard 顶部摘要数据。"""

    total_users: int
    new_users: int
    new_users_yesterday_same_period: int
    new_users_yesterday_same_period_change_percent: float | None
    active_users_24h: int
    active_users_7d: int


@dataclass(frozen=True)
class DashboardCell:
    """单元格统计值。"""

    event_count: int
    device_count: int


@dataclass(frozen=True)
class DashboardRow:
    """按天统计的一行数据。"""

    date_label: str
    registered_count: int
    metrics: dict[str, DashboardCell]


@dataclass(frozen=True)
class DashboardData:
    """完整 dashboard 数据。"""

    summary: DashboardSummary
    mark_types: list[str]
    rows: list[DashboardRow]


class DashboardService:
    """系统 dashboard 服务。"""

    def _now_local(self) -> datetime:
        """返回当前 +8 时区时间，方便测试时覆盖。"""
        return datetime.now(UTC_PLUS_8)

    def _get_mark_types(self) -> list[str]:
        """返回 dashboard 使用的打点类型顺序。"""
        remaining_mark_types = [
            mark_type.value
            for mark_type in MarkType
            if mark_type.value not in DASHBOARD_MARK_TYPE_ORDER
        ]
        return DASHBOARD_MARK_TYPE_ORDER + remaining_mark_types

    def _to_timestamp_ms(self, dt: datetime) -> int:
        """将带时区的 datetime 转为毫秒时间戳。"""
        return int(dt.timestamp() * 1000)

    def _date_to_label(self, value: date) -> str:
        """将日期格式化为 dashboard 展示格式。"""
        return value.strftime("%Y-%m-%d")

    def _bucket_to_date_label(self, bucket: int) -> str:
        """将本地日桶转换为日期字符串。"""
        dt = datetime.fromtimestamp(
            (bucket * MILLISECONDS_PER_DAY) / 1000,
            tz=timezone.utc,
        )
        return dt.strftime("%Y-%m-%d")

    def _change_percent(self, current_count: int, baseline_count: int) -> float | None:
        """计算同环比百分比；基准为 0 且当前非 0 时没有可除的百分比。"""
        if baseline_count == 0:
            if current_count == 0:
                return 0.0
            return None

        return ((current_count - baseline_count) / baseline_count) * 100

    async def get_dashboard_data(
        self, days: int = DEFAULT_DASHBOARD_DAYS
    ) -> DashboardData:
        """获取 dashboard 页面需要的完整数据。"""
        total_started_at = time.perf_counter()
        if days <= 0:
            raise ValueError("days must be greater than 0")

        mark_types = self._get_mark_types()
        now_local = self._now_local()
        today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)
        yesterday_same_period_start = today_start - timedelta(days=1)
        yesterday_same_period_end = now_local - timedelta(days=1)
        range_start = today_start - timedelta(days=days - 1)
        range_end = tomorrow_start

        today_start_ms = self._to_timestamp_ms(today_start)
        tomorrow_start_ms = self._to_timestamp_ms(tomorrow_start)
        yesterday_same_period_start_ms = self._to_timestamp_ms(
            yesterday_same_period_start
        )
        yesterday_same_period_end_ms = self._to_timestamp_ms(yesterday_same_period_end)
        range_start_ms = self._to_timestamp_ms(range_start)
        range_end_ms = self._to_timestamp_ms(range_end)
        active_24h_start_ms = self._to_timestamp_ms(now_local - timedelta(hours=24))
        active_7d_start_ms = self._to_timestamp_ms(now_local - timedelta(days=7))

        rows: list[DashboardRow] = []
        row_map: dict[str, DashboardRow] = {}
        for offset in range(days):
            local_date = today_start.date() - timedelta(days=offset)
            date_label = self._date_to_label(local_date)
            dashboard_row = DashboardRow(
                date_label=date_label,
                registered_count=0,
                metrics={
                    mark_type: DashboardCell(event_count=0, device_count=0)
                    for mark_type in mark_types
                },
            )
            rows.append(dashboard_row)
            row_map[date_label] = dashboard_row

        async with get_async_session() as db:
            user_summary_stmt = select(
                func.count().label("total_users"),
                func.sum(
                    case(
                        (
                            (UserModel.created_at >= today_start_ms)
                            & (UserModel.created_at < tomorrow_start_ms),
                            1,
                        ),
                        else_=0,
                    )
                ).label("new_users"),
                func.sum(
                    case(
                        (
                            (UserModel.created_at >= yesterday_same_period_start_ms)
                            & (UserModel.created_at < yesterday_same_period_end_ms),
                            1,
                        ),
                        else_=0,
                    )
                ).label("new_users_yesterday_same_period"),
                func.sum(
                    case((UserModel.updated_at >= active_24h_start_ms, 1), else_=0)
                ).label("active_users_24h"),
                func.sum(
                    case((UserModel.updated_at >= active_7d_start_ms, 1), else_=0)
                ).label("active_users_7d"),
            ).where(
                UserModel.is_del.is_(False),
            )

            stage_started_at = time.perf_counter()
            user_summary = (await db.execute(user_summary_stmt)).one()
            logger.warning(
                "admin_dashboard_stage_timing: stage=user_summary "
                f"duration_ms={(time.perf_counter() - stage_started_at) * 1000:.2f}"
            )
            total_users = int(user_summary.total_users or 0)
            new_users = int(user_summary.new_users or 0)
            new_users_yesterday_same_period = int(
                user_summary.new_users_yesterday_same_period or 0
            )
            active_users_24h = int(user_summary.active_users_24h or 0)
            active_users_7d = int(user_summary.active_users_7d or 0)

            local_day_bucket = cast(
                func.floor(
                    (MarkLogModel.mark_time + UTC_PLUS_8_OFFSET_MS)
                    / MILLISECONDS_PER_DAY
                ),
                BigInteger,
            )
            normalized_device_id = func.nullif(MarkLogModel.device_id, "")

            mark_stats_stmt = (
                select(
                    local_day_bucket.label("date_bucket"),
                    MarkLogModel.mark_type.label("mark_type"),
                    func.count().label("event_count"),
                    func.count(func.distinct(normalized_device_id)).label(
                        "device_count"
                    ),
                )
                .where(
                    MarkLogModel.mark_time >= range_start_ms,
                    MarkLogModel.mark_time < range_end_ms,
                )
                .group_by(local_day_bucket, MarkLogModel.mark_type)
            )

            stage_started_at = time.perf_counter()
            mark_stats_result = (await db.execute(mark_stats_stmt)).all()
            logger.warning(
                "admin_dashboard_stage_timing: stage=mark_stats "
                f"duration_ms={(time.perf_counter() - stage_started_at) * 1000:.2f}"
            )

            user_day_bucket = cast(
                func.floor(
                    (UserModel.created_at + UTC_PLUS_8_OFFSET_MS) / MILLISECONDS_PER_DAY
                ),
                BigInteger,
            )
            daily_reg_stmt = (
                select(
                    user_day_bucket.label("date_bucket"),
                    func.count().label("reg_count"),
                )
                .where(
                    UserModel.is_del.is_(False),
                    UserModel.created_at >= range_start_ms,
                    UserModel.created_at < range_end_ms,
                )
                .group_by(user_day_bucket)
            )
            stage_started_at = time.perf_counter()
            daily_reg_result = (await db.execute(daily_reg_stmt)).all()
            logger.warning(
                "admin_dashboard_stage_timing: stage=daily_registrations "
                f"duration_ms={(time.perf_counter() - stage_started_at) * 1000:.2f}"
            )

        for reg_row in daily_reg_result:
            date_label = self._bucket_to_date_label(int(reg_row.date_bucket))
            reg_dashboard_row = row_map.get(date_label)
            if reg_dashboard_row is not None:
                object.__setattr__(
                    reg_dashboard_row, "registered_count", int(reg_row.reg_count or 0)
                )

        for row in mark_stats_result:
            date_label = self._bucket_to_date_label(int(row.date_bucket))
            metric_dashboard_row = row_map.get(date_label)
            if (
                metric_dashboard_row is None
                or row.mark_type not in metric_dashboard_row.metrics
            ):
                continue

            metric_dashboard_row.metrics[row.mark_type] = DashboardCell(
                event_count=int(row.event_count or 0),
                device_count=int(row.device_count or 0),
            )

        result = DashboardData(
            summary=DashboardSummary(
                total_users=total_users,
                new_users=new_users,
                new_users_yesterday_same_period=new_users_yesterday_same_period,
                new_users_yesterday_same_period_change_percent=self._change_percent(
                    new_users,
                    new_users_yesterday_same_period,
                ),
                active_users_24h=active_users_24h,
                active_users_7d=active_users_7d,
            ),
            mark_types=mark_types,
            rows=rows,
        )
        logger.warning(
            "admin_dashboard_stage_timing: stage=service_total "
            f"duration_ms={(time.perf_counter() - total_started_at) * 1000:.2f}"
        )
        return result


dashboard_service = DashboardService()
