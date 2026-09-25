"""Admin 订单统计聚合服务。

为管理后台「数据分析」补充订单维度的每日充值和商品统计。两个聚合都按
Asia/Shanghai 自然日分桶，成功口径为 ``orders.order_status == 2``，全部口径为
时间范围内所有订单。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import BigInteger, case, cast, func, select

from app.constants.order import OrderStatus
from app.core.database import get_async_session
from app.models.order_model import OrderModel
from app.utils.money import format_normalized_amount

#: 一天的毫秒数，用于把时间戳映射到自然日桶。
MILLISECONDS_PER_DAY = 86_400_000
#: UTC+8 偏移毫秒数；订单统计明确按 Asia/Shanghai 自然日看。
UTC_PLUS_8_OFFSET_MS = 8 * 60 * 60 * 1000


@dataclass(frozen=True, slots=True)
class AdminOrderCurrencyAmount:
    """单个币种的订单金额聚合。"""

    #: 币种，如 XTR / USD。
    currency: str
    #: 6 位精度整数金额。
    amount: int
    #: 十进制展示金额字符串。
    display_amount: str


@dataclass(frozen=True, slots=True)
class AdminOrderDailyRechargeRow:
    """每日充值统计行。"""

    #: UTC+8 日期，格式 YYYY-MM-DD。
    date: str
    #: 成功订单笔数，成功口径为 order_status=2。
    success_count: int
    #: 成功订单去重用户数，成功口径为 order_status=2。
    success_user_count: int
    #: 成功订单金额，按币种拆分。
    success_amounts: list[AdminOrderCurrencyAmount]
    #: 全部订单笔数，不筛订单状态。
    total_count: int
    #: 全部订单去重用户数，不筛订单状态。
    total_user_count: int
    #: 全部订单金额，按币种拆分。
    total_amounts: list[AdminOrderCurrencyAmount]


@dataclass(frozen=True, slots=True)
class AdminOrderProductStatsRow:
    """商品统计行。"""

    #: UTC+8 日期，格式 YYYY-MM-DD。
    date: str
    #: 商品 ID。
    product_id: str
    #: 成功订单笔数，成功口径为 order_status=2。
    success_count: int
    #: 成功订单去重用户数，成功口径为 order_status=2。
    success_user_count: int
    #: 成功订单金额，按币种拆分。
    success_amounts: list[AdminOrderCurrencyAmount]
    #: 全部订单笔数，不筛订单状态。
    total_count: int
    #: 全部订单去重用户数，不筛订单状态。
    total_user_count: int
    #: 全部订单金额，按币种拆分。
    total_amounts: list[AdminOrderCurrencyAmount]


@dataclass(slots=True)
class _MutableOrderStats:
    """组装多币种金额时使用的内部可变行。"""

    #: UTC+8 日期，格式 YYYY-MM-DD。
    date: str
    #: 成功订单笔数累计值。
    success_count: int = 0
    #: 成功订单去重用户数。
    success_user_count: int = 0
    #: 全部订单笔数累计值。
    total_count: int = 0
    #: 全部订单去重用户数。
    total_user_count: int = 0
    #: 成功订单金额累计值，按币种拆分。
    success_amounts: list[AdminOrderCurrencyAmount] = field(default_factory=list)
    #: 全部订单金额累计值，按币种拆分。
    total_amounts: list[AdminOrderCurrencyAmount] = field(default_factory=list)


class AdminOrderAnalyticsService:
    """Admin 订单统计聚合服务。"""

    async def get_daily_recharge(
        self,
        from_ms: int,
        to_ms: int,
    ) -> list[AdminOrderDailyRechargeRow]:
        """按 +8 日期统计订单成功和全部口径的笔数、人数、金额。"""
        day_bucket = self._local_day_bucket()
        success_count_expr = self._success_count_expr()
        success_amount_expr = self._success_amount_expr()
        success_user_expr = self._success_user_expr()
        count_stmt = (
            select(
                day_bucket.label("date_bucket"),
                func.count().label("total_count"),
                func.coalesce(func.sum(success_count_expr), 0).label("success_count"),
                func.count(func.distinct(OrderModel.user_id)).label("total_user_count"),
                func.count(func.distinct(success_user_expr)).label(
                    "success_user_count"
                ),
            )
            .where(
                OrderModel.created_at >= from_ms,
                OrderModel.created_at <= to_ms,
            )
            .group_by(day_bucket)
            .order_by(day_bucket.desc())
        )
        amount_stmt = (
            select(
                day_bucket.label("date_bucket"),
                OrderModel.currency.label("currency"),
                func.count().label("total_count"),
                func.coalesce(func.sum(success_count_expr), 0).label("success_count"),
                func.coalesce(func.sum(OrderModel.amount), 0).label("total_amount"),
                func.coalesce(func.sum(success_amount_expr), 0).label("success_amount"),
            )
            .where(
                OrderModel.created_at >= from_ms,
                OrderModel.created_at <= to_ms,
            )
            .group_by(day_bucket, OrderModel.currency)
            .order_by(day_bucket.desc(), OrderModel.currency.asc())
        )

        row_map: dict[str, _MutableOrderStats] = {}
        async with get_async_session() as db:
            count_rows = (await db.execute(count_stmt)).all()
            amount_rows = (await db.execute(amount_stmt)).all()

        for row in count_rows:
            date_label = self._bucket_to_date_label(int(row.date_bucket))
            stats = row_map.setdefault(date_label, _MutableOrderStats(date=date_label))
            stats.success_count = int(row.success_count or 0)
            stats.success_user_count = int(row.success_user_count or 0)
            stats.total_count = int(row.total_count or 0)
            stats.total_user_count = int(row.total_user_count or 0)

        for row in amount_rows:
            date_label = self._bucket_to_date_label(int(row.date_bucket))
            stats = row_map.setdefault(date_label, _MutableOrderStats(date=date_label))
            self._merge_currency_row(
                stats,
                currency=str(row.currency),
                success_count=int(row.success_count or 0),
                success_amount=int(row.success_amount or 0),
                total_count=int(row.total_count or 0),
                total_amount=int(row.total_amount or 0),
            )

        return [
            AdminOrderDailyRechargeRow(
                date=stats.date,
                success_count=stats.success_count,
                success_user_count=stats.success_user_count,
                success_amounts=stats.success_amounts,
                total_count=stats.total_count,
                total_user_count=stats.total_user_count,
                total_amounts=stats.total_amounts,
            )
            for stats in row_map.values()
        ]

    async def get_product_statistics(
        self,
        from_ms: int,
        to_ms: int,
    ) -> list[AdminOrderProductStatsRow]:
        """按 +8 日期和商品 ID 统计订单成功和全部口径的笔数、人数、金额。"""
        day_bucket = self._local_day_bucket()
        success_count_expr = self._success_count_expr()
        success_amount_expr = self._success_amount_expr()
        success_user_expr = self._success_user_expr()
        count_stmt = (
            select(
                day_bucket.label("date_bucket"),
                OrderModel.product_id.label("product_id"),
                func.count().label("total_count"),
                func.coalesce(func.sum(success_count_expr), 0).label("success_count"),
                func.count(func.distinct(OrderModel.user_id)).label("total_user_count"),
                func.count(func.distinct(success_user_expr)).label(
                    "success_user_count"
                ),
            )
            .where(
                OrderModel.created_at >= from_ms,
                OrderModel.created_at <= to_ms,
            )
            .group_by(day_bucket, OrderModel.product_id)
            .order_by(day_bucket.desc(), OrderModel.product_id.asc())
        )
        amount_stmt = (
            select(
                day_bucket.label("date_bucket"),
                OrderModel.product_id.label("product_id"),
                OrderModel.currency.label("currency"),
                func.count().label("total_count"),
                func.coalesce(func.sum(success_count_expr), 0).label("success_count"),
                func.coalesce(func.sum(OrderModel.amount), 0).label("total_amount"),
                func.coalesce(func.sum(success_amount_expr), 0).label("success_amount"),
            )
            .where(
                OrderModel.created_at >= from_ms,
                OrderModel.created_at <= to_ms,
            )
            .group_by(day_bucket, OrderModel.product_id, OrderModel.currency)
            .order_by(
                day_bucket.desc(),
                OrderModel.product_id.asc(),
                OrderModel.currency.asc(),
            )
        )

        row_map: dict[tuple[str, str], _MutableOrderStats] = {}
        async with get_async_session() as db:
            count_rows = (await db.execute(count_stmt)).all()
            amount_rows = (await db.execute(amount_stmt)).all()

        for row in count_rows:
            date_label = self._bucket_to_date_label(int(row.date_bucket))
            product_id = str(row.product_id)
            key = (date_label, product_id)
            stats = row_map.setdefault(key, _MutableOrderStats(date=date_label))
            stats.success_count = int(row.success_count or 0)
            stats.success_user_count = int(row.success_user_count or 0)
            stats.total_count = int(row.total_count or 0)
            stats.total_user_count = int(row.total_user_count or 0)

        for row in amount_rows:
            date_label = self._bucket_to_date_label(int(row.date_bucket))
            product_id = str(row.product_id)
            key = (date_label, product_id)
            stats = row_map.setdefault(key, _MutableOrderStats(date=date_label))
            self._merge_currency_row(
                stats,
                currency=str(row.currency),
                success_count=int(row.success_count or 0),
                success_amount=int(row.success_amount or 0),
                total_count=int(row.total_count or 0),
                total_amount=int(row.total_amount or 0),
            )

        return [
            AdminOrderProductStatsRow(
                date=date_label,
                product_id=product_id,
                success_count=stats.success_count,
                success_user_count=stats.success_user_count,
                success_amounts=stats.success_amounts,
                total_count=stats.total_count,
                total_user_count=stats.total_user_count,
                total_amounts=stats.total_amounts,
            )
            for (date_label, product_id), stats in row_map.items()
        ]

    def _local_day_bucket(self):
        """把毫秒时间戳转换为 +8 自然日整数桶。"""
        return cast(
            func.floor(
                (OrderModel.created_at + UTC_PLUS_8_OFFSET_MS) / MILLISECONDS_PER_DAY
            ),
            BigInteger,
        )

    def _success_count_expr(self):
        """订单成功笔数条件聚合表达式。"""
        return case((OrderModel.order_status == OrderStatus.PAID.value, 1), else_=0)

    def _success_amount_expr(self):
        """订单成功金额条件聚合表达式。"""
        return case(
            (OrderModel.order_status == OrderStatus.PAID.value, OrderModel.amount),
            else_=0,
        )

    def _success_user_expr(self):
        """订单成功去重人数条件聚合表达式。"""
        return case(
            (OrderModel.order_status == OrderStatus.PAID.value, OrderModel.user_id),
            else_=None,
        )

    def _bucket_to_date_label(self, bucket: int) -> str:
        """把 +8 日桶转换为 YYYY-MM-DD。"""
        dt = datetime.fromtimestamp(
            (bucket * MILLISECONDS_PER_DAY) / 1000,
            tz=timezone.utc,
        )
        return dt.strftime("%Y-%m-%d")

    def _merge_currency_row(
        self,
        stats: _MutableOrderStats,
        *,
        currency: str,
        success_count: int,
        success_amount: int,
        total_count: int,
        total_amount: int,
    ) -> None:
        """把一个币种的金额分组并入展示行。"""
        if success_count > 0 or success_amount > 0:
            stats.success_amounts.append(
                self._currency_amount(currency, success_amount)
            )
        if total_count > 0 or total_amount > 0:
            stats.total_amounts.append(self._currency_amount(currency, total_amount))

    def _currency_amount(
        self,
        currency: str,
        amount: int,
    ) -> AdminOrderCurrencyAmount:
        """构造管理后台展示金额对象。"""
        return AdminOrderCurrencyAmount(
            currency=currency,
            amount=amount,
            display_amount=format_normalized_amount(amount),
        )


admin_order_analytics_service = AdminOrderAnalyticsService()
