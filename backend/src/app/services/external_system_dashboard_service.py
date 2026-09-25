"""外部系统统计大盘服务。

服务聚合业务数据库统计和各服务节点内部快照。API Key 只在业务服务器鉴权，
节点快照走 `/internal` 内网接口，避免把外部 API Key 透传给下载节点。
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta
import time
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import case, func, select

from app.constants.order import CallbackStatus, OrderStatus
from app.core.database import get_async_session
from app.models.order_model import OrderModel
from app.models.service_node_model import ServiceNodeModel
from app.models.user_model import UserModel
from app.utils.logger import logger
from app.utils.money import format_normalized_amount
from app.utils.service_node_internal_auth import (
    SERVICE_NODE_INTERNAL_AUTH_HEADER_NAME,
    service_node_internal_auth_token,
)
from app.utils.service_node_url import build_service_node_api_url

_DASHBOARD_SNAPSHOT_PATH = "/internal/service-node/dashboard-snapshot"
_NODE_SNAPSHOT_TIMEOUT_SECONDS = 8.0
_ERROR_SUMMARY_MAX_LENGTH = 240
_ADMIN_OPERATION_TIMEZONE = ZoneInfo("Asia/Shanghai")


@dataclass(frozen=True, slots=True)
class ExternalCurrencyAmount:
    """外部大盘按币种聚合的金额。"""

    #: 币种。
    currency: str
    #: 6 位精度整数金额。
    amount: int
    #: 十进制展示金额字符串。
    display_amount: str


@dataclass(frozen=True, slots=True)
class ExternalPaidOrderStats:
    """外部大盘今日付费订单统计。"""

    #: 今日付费订单总额，按币种分组。
    amounts: list[ExternalCurrencyAmount]
    #: 今日履约失败订单数。
    fulfillment_failed_count: int
    #: 今日履约失败订单金额，按币种分组。
    fulfillment_failed_amounts: list[ExternalCurrencyAmount]


@dataclass(frozen=True, slots=True)
class ExternalDashboardNode:
    """外部大盘节点快照。"""

    #: 节点 ID。
    node_id: int
    #: 节点展示名。
    name: str
    #: 网络速率快照。
    network_rate: dict[str, int] | None
    #: 单节点错误摘要；成功时为空字符串。
    error: str


@dataclass(frozen=True, slots=True)
class ExternalSystemDashboard:
    """外部系统统计大盘。"""

    #: 今日注册人数。
    today_registered_count: int
    #: 今日付费订单总额，按币种分组；包含所有商品类别，包含履约成功与失败。
    today_paid_order_amounts: list[ExternalCurrencyAmount]
    #: 兼容旧调用方的字段，值同 today_paid_order_amounts。
    today_recharge_amounts: list[ExternalCurrencyAmount]
    #: 今日履约失败订单数。
    today_fulfillment_failed_count: int
    #: 今日履约失败订单金额，按币种分组。
    today_fulfillment_failed_amounts: list[ExternalCurrencyAmount]
    #: 当前 service_nodes 节点列表。
    nodes: list[ExternalDashboardNode]


class ExternalSystemDashboardService:
    """外部系统统计大盘服务。"""

    async def get_dashboard(self) -> ExternalSystemDashboard:
        """获取外部系统统计大盘。"""
        total_started_at = time.perf_counter()
        today_start_ms, tomorrow_start_ms = self._today_range_ms()

        stage_started_at = time.perf_counter()
        today_registered_count = await self._count_today_registered_users(
            today_start_ms=today_start_ms,
            tomorrow_start_ms=tomorrow_start_ms,
        )
        logger.warning(
            "external_dashboard_stage_timing: stage=today_registered "
            f"duration_ms={(time.perf_counter() - stage_started_at) * 1000:.2f}"
        )

        stage_started_at = time.perf_counter()
        paid_order_stats = await self._load_today_paid_order_stats(
            today_start_ms=today_start_ms,
            tomorrow_start_ms=tomorrow_start_ms,
        )
        logger.warning(
            "external_dashboard_stage_timing: stage=today_paid_orders "
            f"duration_ms={(time.perf_counter() - stage_started_at) * 1000:.2f}"
        )

        stage_started_at = time.perf_counter()
        nodes = await self._load_dashboard_nodes()
        logger.warning(
            "external_dashboard_stage_timing: stage=nodes "
            f"duration_ms={(time.perf_counter() - stage_started_at) * 1000:.2f}"
        )

        result = ExternalSystemDashboard(
            today_registered_count=today_registered_count,
            today_paid_order_amounts=paid_order_stats.amounts,
            today_recharge_amounts=paid_order_stats.amounts,
            today_fulfillment_failed_count=paid_order_stats.fulfillment_failed_count,
            today_fulfillment_failed_amounts=(
                paid_order_stats.fulfillment_failed_amounts
            ),
            nodes=nodes,
        )
        logger.warning(
            "external_dashboard_stage_timing: stage=service_total "
            f"duration_ms={(time.perf_counter() - total_started_at) * 1000:.2f}"
        )
        return result

    def _now_admin_operation(self) -> datetime:
        """返回运营统计使用的当前 +8 时区时间，方便测试覆盖。"""
        return datetime.now(_ADMIN_OPERATION_TIMEZONE)

    def _today_range_ms(self) -> tuple[int, int]:
        """返回运营统计 UTC+8 今日起止毫秒时间戳。"""
        today_start = self._now_admin_operation().replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        tomorrow_start = today_start + timedelta(days=1)
        return int(today_start.timestamp() * 1000), int(
            tomorrow_start.timestamp() * 1000
        )

    async def _count_today_registered_users(
        self,
        *,
        today_start_ms: int,
        tomorrow_start_ms: int,
    ) -> int:
        """统计运营时区今日未注销注册用户数。"""
        async with get_async_session() as db:
            result = await db.execute(
                select(func.count())
                .select_from(UserModel)
                .where(
                    UserModel.is_del.is_(False),
                    UserModel.created_at >= today_start_ms,
                    UserModel.created_at < tomorrow_start_ms,
                )
            )
            return int(result.scalar_one())

    async def _load_today_paid_order_stats(
        self,
        *,
        today_start_ms: int,
        tomorrow_start_ms: int,
    ) -> ExternalPaidOrderStats:
        """按运营时区今日统计所有已支付订单金额及履约失败情况。"""
        failed_amount_expr = case(
            (
                OrderModel.callback_status == CallbackStatus.FAILED.value,
                OrderModel.amount,
            ),
            else_=0,
        )
        failed_count_expr = case(
            (
                OrderModel.callback_status == CallbackStatus.FAILED.value,
                1,
            ),
            else_=0,
        )
        async with get_async_session() as db:
            result = await db.execute(
                select(
                    OrderModel.currency,
                    func.coalesce(func.sum(OrderModel.amount), 0),
                    func.coalesce(func.sum(failed_count_expr), 0),
                    func.coalesce(func.sum(failed_amount_expr), 0),
                )
                .where(
                    OrderModel.order_status == OrderStatus.PAID.value,
                    OrderModel.callback_status.in_(
                        [
                            CallbackStatus.SUCCESS.value,
                            CallbackStatus.FAILED.value,
                        ]
                    ),
                    OrderModel.paid_at >= today_start_ms,
                    OrderModel.paid_at < tomorrow_start_ms,
                )
                .group_by(OrderModel.currency)
                .order_by(OrderModel.currency.asc())
            )
            rows = list(result.all())

        amounts: list[ExternalCurrencyAmount] = []
        failed_amounts: list[ExternalCurrencyAmount] = []
        failed_count_total = 0
        for currency, amount, failed_count, failed_amount in rows:
            amount_int = int(amount or 0)
            failed_count_int = int(failed_count or 0)
            failed_amount_int = int(failed_amount or 0)
            currency_code = str(currency)
            amounts.append(self._currency_amount(currency_code, amount_int))
            failed_count_total += failed_count_int
            if failed_count_int > 0:
                failed_amounts.append(
                    self._currency_amount(currency_code, failed_amount_int)
                )
        return ExternalPaidOrderStats(
            amounts=amounts,
            fulfillment_failed_count=failed_count_total,
            fulfillment_failed_amounts=failed_amounts,
        )

    async def _load_dashboard_nodes(self) -> list[ExternalDashboardNode]:
        """读取 service_nodes 并聚合各节点内部快照。"""
        list_started_at = time.perf_counter()
        nodes = await self._list_service_nodes()
        logger.warning(
            "external_dashboard_stage_timing: stage=node_list "
            f"node_count={len(nodes)} "
            f"duration_ms={(time.perf_counter() - list_started_at) * 1000:.2f}"
        )
        async with httpx.AsyncClient(timeout=_NODE_SNAPSHOT_TIMEOUT_SECONDS) as client:
            return list(
                await asyncio.gather(
                    *[
                        self._load_one_node_snapshot(client=client, node=node)
                        for node in nodes
                    ]
                )
            )

    async def _list_service_nodes(self) -> list[ServiceNodeModel]:
        """按 node_id 正序读取全部服务节点。"""
        async with get_async_session() as db:
            result = await db.execute(
                select(ServiceNodeModel).order_by(ServiceNodeModel.node_id.asc())
            )
            return list(result.scalars().all())

    async def _load_one_node_snapshot(
        self,
        *,
        client: httpx.AsyncClient,
        node: ServiceNodeModel,
    ) -> ExternalDashboardNode:
        """读取单节点内部快照；失败时保留节点并写 error。"""
        started_at = time.perf_counter()
        outcome = "request_failed"
        http_status: int | None = None
        try:
            url = build_service_node_api_url(
                node.internal_base_url,
                _DASHBOARD_SNAPSHOT_PATH,
            )
            response = await client.get(url, headers=self._internal_auth_headers())
            http_status = response.status_code
            if response.status_code != 200:
                outcome = "http_status_error"
                return self._node_with_error(
                    node,
                    (
                        "dashboard_snapshot_http_status_error: "
                        f"url={url}, status={response.status_code}, "
                        f"body={response.text[:120]}"
                    ),
                )

            payload = response.json()
            if not isinstance(payload, dict):
                outcome = "payload_invalid"
                return self._node_with_error(
                    node,
                    f"dashboard_snapshot_payload_invalid: url={url}, payload_type=list",
                )

            result = ExternalDashboardNode(
                node_id=int(node.node_id),
                name=str(node.name),
                network_rate=self._parse_network_rate(payload.get("network_rate")),
                error="",
            )
            outcome = "success"
            return result
        except Exception as exc:
            logger.error(
                "external_dashboard_node_snapshot_failed: "
                f"node_id={node.node_id}, error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            return self._node_with_error(
                node,
                f"dashboard_snapshot_request_failed: {type(exc).__name__}: {exc}",
            )
        finally:
            status_text = str(http_status) if http_status is not None else "-"
            logger.warning(
                "external_dashboard_node_timing: "
                f"node_id={node.node_id} enabled={node.enabled} "
                f"outcome={outcome} http_status={status_text} "
                f"duration_ms={(time.perf_counter() - started_at) * 1000:.2f}"
            )

    def _node_with_error(
        self,
        node: ServiceNodeModel,
        error: str,
    ) -> ExternalDashboardNode:
        """生成单节点失败响应。"""
        return ExternalDashboardNode(
            node_id=int(node.node_id),
            name=str(node.name),
            network_rate=None,
            error=error[:_ERROR_SUMMARY_MAX_LENGTH],
        )

    def _parse_network_rate(self, value: object) -> dict[str, int] | None:
        """把节点快照中的网络速率规范化为外部响应字段。"""
        if not isinstance(value, dict):
            return None
        return {
            "rx_bytes_per_second": self._safe_int(value.get("rx_bytes_per_second")),
            "tx_bytes_per_second": self._safe_int(value.get("tx_bytes_per_second")),
            "sampled_at": self._safe_int(value.get("sampled_at")),
        }

    def _format_normalized_amount(self, amount: int) -> str:
        """把 6 位精度整数金额格式化为十进制字符串。"""
        return format_normalized_amount(amount)

    def _currency_amount(self, currency: str, amount: int) -> ExternalCurrencyAmount:
        """构造外部响应用金额对象。"""
        return ExternalCurrencyAmount(
            currency=currency,
            amount=amount,
            display_amount=self._format_normalized_amount(amount),
        )

    def _safe_int(self, value: object) -> int:
        """把数值字段转为非负整数，非法值按 0 处理。"""
        if isinstance(value, int) and not isinstance(value, bool):
            return max(0, value)
        if isinstance(value, str):
            try:
                return max(0, int(value))
            except ValueError:
                return 0
        if isinstance(value, float):
            return max(0, int(value))
        return 0

    def _internal_auth_headers(self) -> dict[str, str]:
        """构造访问节点敏感 internal API 的认证头。"""
        token = service_node_internal_auth_token()
        if not token:
            return {}
        return {SERVICE_NODE_INTERNAL_AUTH_HEADER_NAME: token}


external_system_dashboard_service = ExternalSystemDashboardService()
