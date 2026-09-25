"""Admin 数据分析聚合服务。

为管理后台「数据分析」菜单提供 4 个只读聚合能力（下载资源分布 / 下载排名 /
下载统计 / 用户地理分析），对应 4 个 GET 接口。

口径要点（详见 docs/feat/008.管理后台/tech-数据分析.md）：
- 下载维度（前三个方法）基于 ``user_download_records`` 单表，**含历史已注销用户**
  （该表无软删标记，下载真实发生过、消耗过资源）。不 join ``users``，保持单表聚合的简单与高性能。
- 地理维度基于 ``users`` 表，排除已注销用户（``is_del == 0``），统计**当前注册用户分布**。
- 「按消耗积分」= ``credits_cost > 0``（实际扣费，排除 6 小时内免扣重复）；
  「总和」= 全部记录（含 ``credits_cost = 0`` 的免扣重复）。
- 时间过滤为闭区间 ``created_at >= from_ms AND created_at <= to_ms``（区间汇总，非自然日分桶）。
- 单位约定：``1 MB := 1 MiB``、``1 GB := 1 GiB``，与扣费阶梯一致。
"""

from __future__ import annotations

from sqlalchemy import case, func, select

from app.core.database import get_async_session
from app.models.user_download_record_model import UserDownloadRecordModel
from app.models.user_model import UserModel

# === 单位常量 ===
#: 1 MB := 1 MiB（与 media_service 的 _MIB / 扣费阶梯一致）
_MIB: int = 1024 * 1024
#: 1 GB := 1 GiB
_GIB: int = 1024 * _MIB

# === 资源大小分桶定义 ===
#: 单桶定义：(key, label, 该档 size_bytes 上界)。区间语义为左开右闭 ``(prev_upper, upper]``，
#: 由 CASE 链式 ``<=`` 天然实现。``unknown`` 档匹配 ``size_bytes IS NULL`` 或 ``== 0``，
#: 放在 CASE 第一个 WHEN（见 get_resource_distribution）。
SIZE_BUCKETS: list[tuple[str, str, int]] = [
    ("le_1m", "≤ 1 MB", 1 * _MIB),
    ("le_5m", "1–5 MB", 5 * _MIB),
    ("le_10m", "5–10 MB", 10 * _MIB),
    ("le_50m", "10–50 MB", 50 * _MIB),
    ("le_100m", "50–100 MB", 100 * _MIB),
    ("le_200m", "100–200 MB", 200 * _MIB),
    ("le_500m", "200–500 MB", 500 * _MIB),
    ("le_1g", "500 MB–1 GB", 1 * _GIB),
    ("le_2g", "1–2 GB", 2 * _GIB),
    ("le_4g", "2–4 GB", 4 * _GIB),
    ("gt_4g", "> 4 GB", 0),  # 上界占位 0，不参与 CASE（else_ 兜底）
    ("unknown", "未知大小", 0),  # 占位，由 CASE 第一档 IS NULL / == 0 命中
]

#: 固定展示顺序（11 个大小档 + unknown），后端按此顺序补齐空桶为 0。
BUCKET_ORDER: list[str] = [item[0] for item in SIZE_BUCKETS]

#: key -> label 映射，供结果补齐时填充档位标签。
_BUCKET_LABEL: dict[str, str] = {key: label for key, label, _ in SIZE_BUCKETS}


class AdminDownloadAnalyticsService:
    """Admin 数据分析聚合服务。

    4 个 async 方法分别支撑 4 个 GET 接口。聚合 SQL 全部为单表 GROUP BY，
    无 join / 子查询 / 窗口函数。仅借鉴 ``dashboard_service`` 的
    ``func.count`` / ``func.sum`` / ``case`` / ``func.coalesce`` 写法，
    **不抄其 @singleton**（@singleton 已废弃，见 spec-python.md §9）。
    """

    async def get_resource_distribution(
        self,
        from_ms: int,
        to_ms: int,
    ) -> list[dict]:
        """下载资源分布：12 桶 ``{key, label, paid_count, total_count}``。

        - ``paid_count`` = 该档 ``credits_cost > 0`` 次数。
        - ``total_count`` = 该档全部次数（含免扣重复）。
        - 按 ``BUCKET_ORDER`` 固定顺序返回，缺失桶补 ``{paid_count: 0, total_count: 0}``。

        Args:
            from_ms: 区间起点（毫秒时间戳，闭区间）。
            to_ms: 区间终点（毫秒时间戳，闭区间）。

        Returns:
            长度恒为 12 的桶列表，顺序与 ``SIZE_BUCKETS`` 一致。
        """
        # CASE 链式 <= 实现左开右闭 (prev_upper, upper]。
        # 第一个 WHEN 同时匹配 size_bytes IS NULL 与 == 0，归 unknown 档。
        bucket = case(
            (
                (UserDownloadRecordModel.size_bytes.is_(None))
                | (UserDownloadRecordModel.size_bytes == 0),
                "unknown",
            ),
            (UserDownloadRecordModel.size_bytes <= 1 * _MIB, "le_1m"),
            (UserDownloadRecordModel.size_bytes <= 5 * _MIB, "le_5m"),
            (UserDownloadRecordModel.size_bytes <= 10 * _MIB, "le_10m"),
            (UserDownloadRecordModel.size_bytes <= 50 * _MIB, "le_50m"),
            (UserDownloadRecordModel.size_bytes <= 100 * _MIB, "le_100m"),
            (UserDownloadRecordModel.size_bytes <= 200 * _MIB, "le_200m"),
            (UserDownloadRecordModel.size_bytes <= 500 * _MIB, "le_500m"),
            (UserDownloadRecordModel.size_bytes <= 1 * _GIB, "le_1g"),
            (UserDownloadRecordModel.size_bytes <= 2 * _GIB, "le_2g"),
            (UserDownloadRecordModel.size_bytes <= 4 * _GIB, "le_4g"),
            else_="gt_4g",
        ).label("bucket")

        stmt = (
            select(
                bucket,
                func.count().label("total_count"),
                func.sum(
                    case(
                        (UserDownloadRecordModel.credits_cost > 0, 1),
                        else_=0,
                    )
                ).label("paid_count"),
            )
            .where(
                UserDownloadRecordModel.created_at >= from_ms,
                UserDownloadRecordModel.created_at <= to_ms,
            )
            .group_by(bucket)
        )

        # 按定义顺序初始化全部桶为 0，再用查询结果覆盖。
        result_map: dict[str, dict] = {
            key: {
                "key": key,
                "label": _BUCKET_LABEL[key],
                "paid_count": 0,
                "total_count": 0,
            }
            for key in BUCKET_ORDER
        }

        async with get_async_session() as db:
            rows = (await db.execute(stmt)).all()
            for row in rows:
                key = str(row.bucket)
                if key in result_map:  # 正常都在；防御异常脏数据产生未知 key
                    result_map[key]["paid_count"] = int(row.paid_count or 0)
                    result_map[key]["total_count"] = int(row.total_count or 0)

        return [result_map[key] for key in BUCKET_ORDER]

    async def get_top_users(
        self,
        from_ms: int,
        to_ms: int,
    ) -> list[dict]:
        """下载排名：至多 20 条 ``{user_id, paid_count, total_count}``。

        按 ``total_count``（总和次数，含免扣重复）降序取前 20；``user_id`` 升序作同分
        兜底，保证结果稳定。区间无数据返回空数组。

        Args:
            from_ms: 区间起点（毫秒时间戳，闭区间）。
            to_ms: 区间终点（毫秒时间戳，闭区间）。

        Returns:
            至多 20 条排名记录。
        """
        total_count = func.count().label("total_count")
        stmt = (
            select(
                UserDownloadRecordModel.user_id,
                total_count,
                func.sum(
                    case(
                        (UserDownloadRecordModel.credits_cost > 0, 1),
                        else_=0,
                    )
                ).label("paid_count"),
            )
            .where(
                UserDownloadRecordModel.created_at >= from_ms,
                UserDownloadRecordModel.created_at <= to_ms,
            )
            .group_by(UserDownloadRecordModel.user_id)
            .order_by(total_count.desc(), UserDownloadRecordModel.user_id.asc())
            .limit(20)
        )

        async with get_async_session() as db:
            rows = (await db.execute(stmt)).all()
            return [
                {
                    "user_id": int(row.user_id),
                    "paid_count": int(row.paid_count or 0),
                    "total_count": int(row.total_count or 0),
                }
                for row in rows
            ]

    async def get_summary(
        self,
        from_ms: int,
        to_ms: int,
    ) -> dict:
        """下载统计：一次查询返回 6 个标量。

        - ``paid_user_count`` / ``total_user_count``：下载人数（按消耗积分 / 总和），去重 user_id。
        - ``paid_download_count`` / ``total_download_count``：下载次数（按消耗积分 / 总和）。
        - ``paid_size_bytes`` / ``total_size_bytes``：资源大小总和（字节，按消耗积分 / 总和）。

        要点：``COUNT(DISTINCT CASE WHEN credits_cost>0 THEN user_id END)`` 中 DISTINCT
        自动忽略 NULL；``SUM(CASE WHEN ... THEN size_bytes END)`` 自动跳过 NULL size，
        空集经 ``coalesce`` 归 0。区间无数据时 6 个标量全为 0。

        Args:
            from_ms: 区间起点（毫秒时间戳，闭区间）。
            to_ms: 区间终点（毫秒时间戳，闭区间）。

        Returns:
            含 6 个标量的 dict。
        """
        m = UserDownloadRecordModel
        stmt = select(
            func.count().label("total_download_count"),
            func.sum(case((m.credits_cost > 0, 1), else_=0)).label(
                "paid_download_count"
            ),
            func.count(func.distinct(m.user_id)).label("total_user_count"),
            func.count(
                func.distinct(case((m.credits_cost > 0, m.user_id), else_=None))
            ).label("paid_user_count"),
            func.coalesce(func.sum(m.size_bytes), 0).label("total_size_bytes"),
            func.coalesce(
                func.sum(case((m.credits_cost > 0, m.size_bytes), else_=None)),
                0,
            ).label("paid_size_bytes"),
        ).where(
            m.created_at >= from_ms,
            m.created_at <= to_ms,
        )

        async with get_async_session() as db:
            row = (await db.execute(stmt)).one()
            return {
                "paid_user_count": int(row.paid_user_count or 0),
                "total_user_count": int(row.total_user_count or 0),
                "paid_download_count": int(row.paid_download_count or 0),
                "total_download_count": int(row.total_download_count or 0),
                "paid_size_bytes": int(row.paid_size_bytes or 0),
                "total_size_bytes": int(row.total_size_bytes or 0),
            }

    async def get_user_geo(
        self,
        from_ms: int,
        to_ms: int,
    ) -> list[dict]:
        """用户地理分析：``{country, count}`` 列表，按 count 降序。

        基于 ``users`` 表 ``register_country``（注册时国家码）。``register_country`` 为空
        归 ``"unknown"``。排除已注销用户（``is_del == 0``，与 dashboard_service 一致）。
        按注册时间 ``created_at`` 区间过滤。不限制条数（国家数量有限）。区间无数据返回空数组。

        Args:
            from_ms: 区间起点（毫秒时间戳，闭区间）。
            to_ms: 区间终点（毫秒时间戳，闭区间）。

        Returns:
            ``{country, count}`` 列表，按 count 降序。
        """
        country = func.coalesce(UserModel.register_country, "unknown").label("country")
        # 标签命名为 cnt 而非 count：row.count 会与 sqlalchemy 的 func.count 同名导致
        # mypy 把 row.count 解析成可调用对象；用 cnt 避开遮蔽，响应字段名仍为 count。
        cnt_col = func.count().label("cnt")
        stmt = (
            select(country, cnt_col)
            .where(
                UserModel.is_del == 0,  # 排除已注销用户
                UserModel.created_at >= from_ms,  # 按注册时间过滤
                UserModel.created_at <= to_ms,
            )
            .group_by(country)
            .order_by(cnt_col.desc())
        )

        async with get_async_session() as db:
            rows = (await db.execute(stmt)).all()
            return [
                {"country": str(row.country), "count": int(row.cnt or 0)}
                for row in rows
            ]


#: 模块级实例，供 API 层直接引用。不用 @singleton（已废弃）。
admin_download_analytics_service = AdminDownloadAnalyticsService()
