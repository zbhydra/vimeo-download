"""业务服务器服务节点健康检查调度。

business role 在 FastAPI lifespan 中启动后台 task，定期检查 `service_nodes`
每条记录的 `/internal/service-node/health`，并只写回当前被检查记录。download
role 不导入本模块，不启动调度。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import time
from typing import Any

import httpx
from sqlalchemy import update

from app.core.config import settings
from app.core.database import get_async_session
from app.models.service_node_model import ServiceNodeModel
from app.services.service_node_service import (
    SERVICE_NODE_HEALTH_HEALTHY,
    SERVICE_NODE_HEALTH_UNHEALTHY,
    service_node_service,
)
from app.utils.logger import logger
from app.utils.service_node_url import build_service_node_api_url

# 下载节点本地只暴露给业务服务器健康检查的轻量探活路径。
_HEALTH_PATH = "/internal/service-node/health"
# 单节点健康检查超时；超过该时间直接标记 unhealthy，避免整轮检查卡死。
_HEALTH_TIMEOUT_SECONDS = 8.0


@dataclass(frozen=True, slots=True)
class ServiceNodeHealthCheckResult:
    """单次节点健康检查诊断结果。"""

    #: 被检查的 service_nodes.node_id。
    node_id: int
    #: 本次检查开始时间，Unix 秒。
    checked_at: int
    #: 实际请求的健康检查 URL。
    url: str
    #: True 表示 HTTP 200 且 payload.status == ok。
    healthy: bool
    #: 节点 HTTP 状态码；连接失败或 URL 非法时为 None。
    http_status: int | None
    #: 节点返回的 JSON payload；非 JSON、非法或连接失败时为 None。
    payload: dict[str, Any] | None
    #: 不健康原因；健康时为 None。
    error: str | None


class ServiceNodeHealthService:
    """服务节点健康检查后台调度服务。"""

    async def run_forever(self) -> None:
        """按配置间隔持续执行健康检查，直到 task 被取消。"""
        interval = settings.service_node.health_check_interval_seconds
        logger.info(f"service_node_health_loop_start: interval={interval}")
        try:
            while True:
                await self.check_all_once()
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("service_node_health_loop_cancelled")
            raise

    async def check_all_once(self) -> None:
        """
        检查当前 service_nodes 全部记录。

        单个节点失败只写回该节点，不中断其他节点。
        """
        try:
            nodes = await service_node_service.list_nodes_for_health_check()
        except Exception as exc:
            logger.error(
                f"service_node_health_list_failed: error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            return

        async with httpx.AsyncClient(timeout=_HEALTH_TIMEOUT_SECONDS) as client:
            for node in nodes:
                try:
                    await self.check_one(client=client, node=node)
                except Exception as exc:
                    logger.error(
                        "service_node_health_one_unexpected: "
                        f"node_id={node.node_id}, error={type(exc).__name__}: {exc}",
                        exc_info=True,
                    )

    async def check_one(
        self,
        *,
        client: httpx.AsyncClient,
        node: ServiceNodeModel,
    ) -> ServiceNodeHealthCheckResult:
        """
        检查并写回单个节点。

        Args:
            client: 复用的 HTTP client。
            node: 当前被检查的 service_nodes 记录。

        Returns:
            本地诊断结果，供 admin 手动健康检查展示。
        """
        checked_at = int(time.time())
        try:
            url = build_service_node_api_url(node.internal_base_url, _HEALTH_PATH)
        except ValueError as exc:
            url = str(node.internal_base_url)
            error = (
                "health_base_url_invalid: "
                f"node_id={node.node_id}, internal_base_url={url!r}, error={exc}"
            )
            await self._mark_unhealthy(
                node_id=node.node_id,
                checked_at=checked_at,
                error=error,
            )
            return ServiceNodeHealthCheckResult(
                node_id=int(node.node_id),
                checked_at=checked_at,
                url=url,
                healthy=False,
                http_status=None,
                payload=None,
                error=error,
            )
        try:
            response = await client.get(url)
            if response.status_code != 200:
                error = (
                    "health_http_status_error: "
                    f"url={url}, status={response.status_code}, "
                    f"body={response.text[:200]}"
                )
                await self._mark_unhealthy(
                    node_id=node.node_id,
                    checked_at=checked_at,
                    error=error,
                )
                return ServiceNodeHealthCheckResult(
                    node_id=int(node.node_id),
                    checked_at=checked_at,
                    url=url,
                    healthy=False,
                    http_status=response.status_code,
                    payload=None,
                    error=error,
                )
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("status") != "ok":
                error = f"health_payload_invalid: url={url}, payload={payload!r}"
                await self._mark_unhealthy(
                    node_id=node.node_id,
                    checked_at=checked_at,
                    error=error,
                )
                return ServiceNodeHealthCheckResult(
                    node_id=int(node.node_id),
                    checked_at=checked_at,
                    url=url,
                    healthy=False,
                    http_status=response.status_code,
                    payload=payload if isinstance(payload, dict) else None,
                    error=error,
                )
            await self._mark_healthy(
                node_id=node.node_id,
                checked_at=checked_at,
                payload=payload,
            )
            return ServiceNodeHealthCheckResult(
                node_id=int(node.node_id),
                checked_at=checked_at,
                url=url,
                healthy=True,
                http_status=response.status_code,
                payload=payload,
                error=None,
            )
        except Exception as exc:
            error = (
                "health_request_failed: "
                f"url={url}, error={type(exc).__name__}: {exc}"
            )
            await self._mark_unhealthy(
                node_id=node.node_id,
                checked_at=checked_at,
                error=error,
            )
            return ServiceNodeHealthCheckResult(
                node_id=int(node.node_id),
                checked_at=checked_at,
                url=url,
                healthy=False,
                http_status=None,
                payload=None,
                error=error,
            )

    async def _mark_healthy(
        self,
        *,
        node_id: int,
        checked_at: int,
        payload: dict[str, Any],
    ) -> None:
        """写回健康节点状态。"""
        await self._update_node_health(
            node_id=node_id,
            values={
                "last_health_status": SERVICE_NODE_HEALTH_HEALTHY,
                "last_health_at": checked_at,
                "last_error": None,
                "version": _safe_optional_string(payload.get("version"), 64),
                "updated_at": checked_at,
            },
        )

    async def _mark_unhealthy(
        self,
        *,
        node_id: int,
        checked_at: int,
        error: str,
    ) -> None:
        """写回不健康节点状态。"""
        await self._update_node_health(
            node_id=node_id,
            values={
                "last_health_status": SERVICE_NODE_HEALTH_UNHEALTHY,
                "last_health_at": checked_at,
                "last_error": error[:512],
                "version": None,
                "updated_at": checked_at,
            },
        )

    async def _update_node_health(
        self,
        *,
        node_id: int,
        values: dict[str, Any],
    ) -> None:
        """按主键更新当前节点健康字段。"""
        async with get_async_session() as session:
            await session.execute(
                update(ServiceNodeModel)
                .where(ServiceNodeModel.node_id == node_id)
                .values(**values)
            )
            await session.commit()


def _safe_optional_string(value: object, max_length: int) -> str | None:
    """把健康响应字符串字段截断到数据库长度。"""
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized[:max_length] if normalized else None


service_node_health_service = ServiceNodeHealthService()
