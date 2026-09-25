"""服务节点内部接口共享鉴权工具。

该模块只读取本地配置，不访问业务数据库，供 business 聚合调用和 download
内部路由校验复用。
"""

import secrets

from app.core.config import settings

SERVICE_NODE_INTERNAL_AUTH_HEADER_NAME = "X-Service-Node-Internal-Token"


def service_node_internal_auth_token() -> str:
    """读取服务节点敏感 internal API 共享凭证。"""
    return str(getattr(settings.service_node, "internal_auth_token", "") or "").strip()


def verify_service_node_internal_auth_token(provided_token: object) -> bool:
    """校验服务节点敏感 internal API 共享凭证。"""
    expected_token = service_node_internal_auth_token()
    if not expected_token or not isinstance(provided_token, str):
        return False
    return secrets.compare_digest(provided_token, expected_token)
