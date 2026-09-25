"""服务节点选择服务。

流程：
1. 从业务数据库读取健康、启用且权重大于 0 的节点。
2. 业务节点和下载节点进入同一个候选池，不按 node_type 分层。
3. `preferred_node_id` 命中候选池时固定首位，剩余节点按 weight 加权随机不放回。
"""

from __future__ import annotations

from dataclasses import dataclass
import random

from sqlalchemy import select

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.service_node_model import ServiceNodeModel
from app.utils.logger import logger
from app.utils.service_node_url import (
    build_service_node_api_url,
    normalize_service_node_base_url,
)

# 节点类型：业务节点保留完整 API 和数据库能力。
SERVICE_NODE_TYPE_BUSINESS = 1
# 节点类型：下载节点只承载 parse-v2/download-v2 数据面。
SERVICE_NODE_TYPE_DOWNLOAD = 2
# 旧调度状态字段保留给历史数据和 API 响应；新逻辑只看 enabled。
SERVICE_NODE_STATUS_ACTIVE = 1
# 健康状态：unknown 表示尚未完成首轮健康检查。
SERVICE_NODE_HEALTH_UNKNOWN = 0
# 健康状态：healthy 表示最近一次 /internal/service-node/health 成功。
SERVICE_NODE_HEALTH_HEALTHY = 1
# 健康状态：unhealthy 表示最近一次健康检查失败或响应非法。
SERVICE_NODE_HEALTH_UNHEALTHY = 2
# Pre 接口最多返回 3 个可尝试节点，由 weight 统一控制候选池。
_MAX_SELECTED_NODE_COUNT = 3


@dataclass(frozen=True, slots=True)
class ServiceNodeEndpoint:
    """
    可返回给客户端的服务节点入口。

    Attributes:
        node_id: 业务数据库自增节点 ID。
        node_type: 1=business，2=download。
        public_base_url: 客户端访问该节点的基础 URL。
    """

    node_id: int
    node_type: int
    public_base_url: str

    def api_url(self, path: str) -> str:
        """
        拼接节点上的 V2 API 地址。

        Args:
            path: 以 `/` 开头的 API path。

        Returns:
            完整 URL。
        """
        return build_service_node_api_url(self.public_base_url, path)


class ServiceNodeService:
    """服务节点选择领域服务。"""

    async def select_parse_nodes(self) -> list[ServiceNodeEndpoint]:
        """
        选择 parse-pre-v2 返回的节点。

        Returns:
            最多 3 个健康可用节点。
        """
        return await self._select_nodes(preferred_node_id=None)

    async def select_download_nodes(
        self, preferred_node_id: int | None
    ) -> list[ServiceNodeEndpoint]:
        """
        选择 download-pre-v2 返回的节点。

        Args:
            preferred_node_id: 解析成功节点的亲和提示，只对可用候选节点生效。

        Returns:
            最多 3 个健康可用节点。
        """
        return await self._select_nodes(preferred_node_id=preferred_node_id)

    async def list_nodes_for_health_check(self) -> list[ServiceNodeModel]:
        """
        读取所有节点供健康检查调度使用。

        Returns:
            service_nodes 当前全部记录；禁用节点也保留健康检查写回。
        """
        async with get_async_session() as session:
            result = await session.execute(
                select(ServiceNodeModel).order_by(ServiceNodeModel.node_id)
            )
            return list(result.scalars().all())

    async def _select_nodes(
        self, preferred_node_id: int | None
    ) -> list[ServiceNodeEndpoint]:
        """
        执行节点选择。

        Args:
            preferred_node_id: 可选服务节点首位亲和提示。

        Raises:
            AppCommonException: 节点读取或选择异常。
        """
        try:
            candidates = [
                node
                for node in await self._list_assignable_nodes()
                if self._is_assignable_node(node)
            ]
            selected_nodes = self._select_weighted_nodes(
                candidates,
                preferred_node_id=preferred_node_id,
            )
            return [self._to_endpoint(node) for node in selected_nodes]
        except AppCommonException:
            raise
        except Exception as exc:
            logger.error(
                f"service_node_select_failed: preferred_node_id={preferred_node_id}, "
                f"error={type(exc).__name__}: {exc}",
                exc_info=True,
            )
            raise AppCommonException(
                CommonCode.MEDIA_SERVICE_NODE_SELECT_FAILED,
                ext_msg=(
                    "service_node_service._select_nodes: unexpected selection failure, "
                    f"preferred_node_id={preferred_node_id}, "
                    f"error={type(exc).__name__}: {exc}"
                ),
            ) from exc

    async def _list_assignable_nodes(self) -> list[ServiceNodeModel]:
        """
        读取可参与分配的节点候选。

        当前查询证据：Pre 控制面只需要候选全集，WHERE 固定为
        enabled/last_health_status/weight。按 docs/index-rule.md，首版不为这些
        低基数字段添加普通索引，节点数量预期由 Admin 控制在小规模。
        """
        async with get_async_session() as session:
            result = await session.execute(
                select(ServiceNodeModel)
                .where(
                    ServiceNodeModel.enabled.is_(True),
                    ServiceNodeModel.last_health_status == SERVICE_NODE_HEALTH_HEALTHY,
                    ServiceNodeModel.weight > 0,
                )
                .order_by(ServiceNodeModel.node_id)
            )
            return list(result.scalars().all())

    def _select_weighted_nodes(
        self,
        nodes: list[ServiceNodeModel],
        *,
        preferred_node_id: int | None,
    ) -> list[ServiceNodeModel]:
        """
        选择最多 3 个服务节点。

        Args:
            nodes: 已过滤健康可用的统一候选池。
            preferred_node_id: 可用候选节点首位亲和提示。

        Returns:
            不重复的节点列表。
        """
        selected: list[ServiceNodeModel] = []
        remaining = list(nodes)

        if preferred_node_id is not None:
            preferred = next(
                (node for node in remaining if node.node_id == preferred_node_id),
                None,
            )
            if preferred is not None:
                selected.append(preferred)
                remaining = [
                    node for node in remaining if node.node_id != preferred.node_id
                ]

        selected.extend(
            self._weighted_sample_without_replacement(
                remaining,
                count=_MAX_SELECTED_NODE_COUNT - len(selected),
            )
        )
        return selected[:_MAX_SELECTED_NODE_COUNT]

    def _weighted_sample_without_replacement(
        self,
        nodes: list[ServiceNodeModel],
        *,
        count: int,
    ) -> list[ServiceNodeModel]:
        """
        按 `weight` 加权随机不放回抽样。

        Args:
            nodes: 候选节点，必须已经保证 weight > 0。
            count: 需要抽取的最大数量。

        Returns:
            不重复节点列表。
        """
        if count <= 0 or not nodes:
            return []

        pool = list(nodes)
        selected: list[ServiceNodeModel] = []
        while pool and len(selected) < count:
            total_weight = sum(max(0, int(node.weight)) for node in pool)
            if total_weight <= 0:
                break
            marker = random.uniform(0, total_weight)
            cursor = 0.0
            chosen_index = 0
            for index, node in enumerate(pool):
                cursor += max(0, int(node.weight))
                if marker <= cursor:
                    chosen_index = index
                    break
            selected.append(pool.pop(chosen_index))
        return selected

    @staticmethod
    def _to_endpoint(node: ServiceNodeModel) -> ServiceNodeEndpoint:
        """
        转换为可序列化的客户端节点入口。

        Args:
            node: SQLAlchemy 节点模型。

        Returns:
            ServiceNodeEndpoint。
        """
        return ServiceNodeEndpoint(
            node_id=int(node.node_id),
            node_type=int(node.node_type),
            public_base_url=str(node.public_base_url),
        )

    @staticmethod
    def _is_assignable_node(node: ServiceNodeModel) -> bool:
        """
        判断节点是否可参与 Pre 分配。

        Args:
            node: service_nodes 记录。

        Returns:
            True 表示可参与分配。
        """
        if not (
            bool(node.enabled)
            and int(node.last_health_status) == SERVICE_NODE_HEALTH_HEALTHY
            and int(node.weight) > 0
        ):
            return False
        try:
            normalize_service_node_base_url(str(node.public_base_url))
        except ValueError:
            return False
        return True


service_node_service = ServiceNodeService()
